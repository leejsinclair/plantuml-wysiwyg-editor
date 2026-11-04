import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RENDER_TIMEOUT_MS,
  RenderQueue,
  readErrorImage,
  type RenderEngine,
  type RenderRequest,
} from '../../../src/services/render/render-queue.ts';
import type { FromWorker, ToWorker } from '../../../src/services/render/render.worker.ts';

/** A substitute renderer offering the worker's message interface (VO-072). */
class FakeEngine implements RenderEngine {
  readonly posted: ToWorker[] = [];
  terminated = false;
  constructor(private readonly deliver: (message: FromWorker) => void) {}
  post(message: ToWorker): void {
    if (this.terminated) throw new Error('posted to a terminated engine');
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  ready(): void {
    this.deliver({ type: 'ready' });
  }
  last(): ToWorker {
    const message = this.posted.at(-1);
    if (!message) throw new Error('nothing posted');
    return message;
  }
  svg(svg: string, id = this.last().id): void {
    this.deliver({ type: 'svg', id, svg });
  }
  error(message: string, id = this.last().id): void {
    this.deliver({ type: 'error', id, message });
  }
}

function setup() {
  const engines: FakeEngine[] = [];
  const queue = new RenderQueue({
    createEngine: (onMessage) => {
      const engine = new FakeEngine(onMessage);
      engines.push(engine);
      return engine;
    },
    sanitize: (svg) => `clean:${svg}`,
  });
  const engine = (): FakeEngine => {
    const current = engines.at(-1);
    if (!current) throw new Error('no engine started');
    return current;
  };
  return { queue, engines, engine };
}

const screen = (key: string, text: string, extra: Partial<RenderRequest> = {}): RenderRequest => ({
  key,
  text,
  category: 1,
  dependsOnExternal: false,
  ...extra,
});

const OK_SVG = '<svg><text x="1">Login</text></svg>';

const ERROR_IMAGE = [
  '<svg xmlns="http://www.w3.org/2000/svg"><g>',
  '<text x="5" y="17">PlantUML version $version$ / $git.commit.id$ [Unknown compile time]</text>',
  '<text x="5" y="34">[From textarea (line 2) ]</text>',
  '<text x="5" y="51"> </text>',
  '<text x="5" y="68">@startuml Old</text>',
  '<text x="5" y="85">salt</text>',
  '<text x="5" y="102" fill="#FF0000"> Syntax Error? (Assumed diagram type: sequence)</text>',
  '</g></svg>',
].join('');

const CRASH_IMAGE = [
  '<svg><g>',
  '<text x="5">An error has occurred : java.lang.IllegalArgumentException</text>',
  "<text x=\"5\">So I guess the fortune teller&apos;s right...</text>",
  '<text x="5">PlantUML (1.2026.9) has crashed.</text>',
  '</g></svg>',
].join('');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('readErrorImage (spike criterion 5)', () => {
  it('reads the in-browser error image: line from "(line N)", message from the last text', () => {
    expect(readErrorImage(ERROR_IMAGE)).toEqual({ line: 2, message: 'Syntax Error? (Assumed diagram type: sequence)' });
  });

  it('reads the crash image, with no line', () => {
    expect(readErrorImage(CRASH_IMAGE)).toEqual({
      line: null,
      message: 'An error has occurred : java.lang.IllegalArgumentException',
    });
  });

  it('decodes entities in the message', () => {
    const svg = ERROR_IMAGE.replace('Syntax Error? (Assumed diagram type: sequence)', 'cannot include &lt;a&amp;b&gt; &#233;');
    expect(readErrorImage(svg)?.message).toBe('cannot include <a&b> é');
  });

  it('is null for an ordinary diagram, even one whose labels mention errors or versions', () => {
    expect(readErrorImage(OK_SVG)).toBeNull();
    expect(readErrorImage('<svg><text>Login</text><text>An error has occurred</text></svg>')).toBeNull();
    expect(readErrorImage('<svg><text>PlantUML version</text><text>Help</text></svg>')).toBeNull();
    expect(readErrorImage('<svg></svg>')).toBeNull();
  });
});

describe('RenderQueue', () => {
  it('requesting never waits for a render, and nothing is rendered twice for the same text (VO-067)', () => {
    const { queue, engine } = setup();
    queue.request(screen('a', 'A1'));
    expect(engine().posted).toEqual([{ type: 'render', id: expect.any(Number), lines: 'A1' }]);
    expect(queue.get('a')).toMatchObject({ text: 'A1', status: 'Not yet checked', pending: true, latest: null });
    queue.request(screen('a', 'A1'));
    engine().svg(OK_SVG);
    queue.request(screen('a', 'A1'));
    expect(engine().posted).toHaveLength(1);
    expect(queue.get('a')).toMatchObject({ status: 'rendered', pending: false, outOfDate: false });
  });

  it('sends one request at a time and the open block first (VO-067)', () => {
    const { queue, engine } = setup();
    queue.request(screen('a', 'A'));
    queue.request(screen('b', 'B'));
    queue.request(screen('c', 'C'));
    queue.setOpenBlock('c');
    expect(engine().posted.map((m) => m.lines)).toEqual(['A']);
    engine().svg(OK_SVG);
    expect(engine().posted.map((m) => m.lines)).toEqual(['A', 'C']);
    engine().svg(OK_SVG);
    expect(engine().posted.map((m) => m.lines)).toEqual(['A', 'C', 'B']);
    engine().svg(OK_SVG);
    expect(engine().posted).toHaveLength(3);
    for (const key of ['a', 'b', 'c']) expect(queue.get(key)?.status).toBe('rendered');
  });

  it('keeps a waiting block in its place when its text changes, and renders only the latest text', () => {
    const { queue, engine } = setup();
    queue.request(screen('a', 'A'));
    queue.request(screen('b', 'B1'));
    queue.request(screen('c', 'C'));
    queue.request(screen('b', 'B2'));
    engine().svg(OK_SVG);
    engine().svg(OK_SVG);
    expect(engine().posted.map((m) => m.lines)).toEqual(['A', 'B2', 'C']);
  });

  it('renders newer text after the render in flight, keeping the older image out of date meanwhile', () => {
    const { queue, engine } = setup();
    queue.request(screen('a', 'A1'));
    engine().svg('<svg>one</svg>');
    queue.request(screen('a', 'A2'));
    expect(queue.get('a')).toMatchObject({ status: 'Not yet checked', outOfDate: true, pending: true });
    expect(queue.get('a')?.lastOk).toMatchObject({ text: 'A1', svg: 'clean:<svg>one</svg>' });
    queue.request(screen('a', 'A3'));
    engine().svg('<svg>two</svg>');
    expect(queue.get('a')).toMatchObject({ status: 'Not yet checked', outOfDate: true, pending: true });
    expect(queue.get('a')?.latest).toMatchObject({ text: 'A2', outcome: 'ok' });
    expect(engine().last().lines).toBe('A3');
    engine().svg('<svg>three</svg>');
    expect(queue.get('a')).toMatchObject({ status: 'rendered', outOfDate: false, pending: false });
    expect(queue.get('a')?.lastOk).toMatchObject({ text: 'A3', svg: 'clean:<svg>three</svg>' });
  });

  it('sanitises a successful image and keeps the latest and the last ok result', () => {
    const { queue, engine } = setup();
    queue.request(screen('a', 'A1'));
    engine().svg(OK_SVG);
    queue.request(screen('a', 'A2'));
    engine().error('java.lang.IndexOutOfBoundsException');
    const state = queue.get('a');
    expect(state?.status).toBe('failed');
    expect(state?.outOfDate).toBe(true);
    expect(state?.latest).toEqual({ blockKey: 'a', text: 'A2', outcome: 'failed', message: 'java.lang.IndexOutOfBoundsException', line: null });
    expect(state?.lastOk).toEqual({ blockKey: 'a', text: 'A1', outcome: 'ok', svg: `clean:${OK_SVG}` });
  });

  it('classifies an error image reply as a failure with its line and message (spike criterion 5)', () => {
    const { queue, engine } = setup();
    queue.request(screen('old', '@startuml Old\nsalt\n{\n}\n@enduml', { category: null }));
    engine().svg(ERROR_IMAGE);
    expect(queue.get('old')?.latest).toEqual({
      blockKey: 'old',
      text: '@startuml Old\nsalt\n{\n}\n@enduml',
      outcome: 'failed',
      message: 'Syntax Error? (Assumed diagram type: sequence)',
      line: 2,
    });
    expect(queue.get('old')?.lastOk).toBeNull();
    expect(queue.get('old')?.status).toBe('failed');
  });

  describe('blocks that are not sent (VO-068, VO-070)', () => {
    it('never sends a block that depends on !include, a URL or a local file; the last render stays, out of date', () => {
      const { queue, engines } = setup();
      for (const [key, line] of [['inc', '!include common.puml'], ['url', '!include https://example.com/x.puml'], ['file', '!includesub local.puml!PART']]) {
        queue.request(screen(key!, `@startuml\n${line}\n@enduml`, { category: null, dependsOnExternal: true }));
        expect(queue.get(key!)).toMatchObject({ skipped: true, pending: false, status: 'Not yet checked', latest: null, lastOk: null });
      }
      expect(engines.flatMap((e) => e.posted)).toEqual([]);
    });

    it('keeps the last render, marked out of date, when a block comes to depend on !include', () => {
      const { queue, engine } = setup();
      queue.request(screen('a', 'A1'));
      engine().svg(OK_SVG);
      queue.request(screen('a', 'A1\n!include x.puml', { dependsOnExternal: true }));
      expect(engine().posted).toHaveLength(1);
      expect(queue.get('a')).toMatchObject({ skipped: true, outOfDate: true, status: 'Not yet checked' });
      expect(queue.get('a')?.lastOk?.text).toBe('A1');
    });

    it('does not send an invalid block that has a previous render; the last render stays, out of date', () => {
      const { queue, engine } = setup();
      queue.request(screen('a', 'A1'));
      engine().svg(OK_SVG);
      queue.request(screen('a', 'A1 {', { category: 3 }));
      expect(engine().posted).toHaveLength(1);
      expect(queue.get('a')).toMatchObject({ skipped: true, outOfDate: true, pending: false, status: 'Not yet checked' });
      queue.request(screen('a', 'A1 fixed', { category: 1 }));
      expect(engine().last().lines).toBe('A1 fixed');
      expect(queue.get('a')?.skipped).toBe(false);
    });

    it('drops a waiting render when the block becomes invalid', () => {
      const { queue, engine } = setup();
      queue.request(screen('a', 'A1'));
      engine().svg(OK_SVG);
      queue.request(screen('b', 'B'));
      queue.request(screen('a', 'A2'));
      queue.request(screen('a', 'A2 {', { category: 3 }));
      engine().svg(OK_SVG);
      expect(engine().posted.map((m) => m.lines)).toEqual(['A1', 'B']);
    });

    it('may render an invalid block with no previous render (section 4.2)', () => {
      const { queue, engine } = setup();
      queue.request(screen('a', 'never valid {', { category: 3 }));
      expect(engine().last().lines).toBe('never valid {');
      engine().svg(OK_SVG);
      queue.request(screen('a', 'still invalid {', { category: 3 }));
      expect(engine().posted).toHaveLength(1);
      expect(queue.get('a')).toMatchObject({ skipped: true, outOfDate: true });
    });
  });

  describe('the 10 second limit (VO-069)', () => {
    it('terminates the renderer, reports Not yet checked, starts a new renderer and goes on', () => {
      const { queue, engines, engine } = setup();
      queue.request(screen('slow', 'S'));
      queue.request(screen('next', 'N'));
      const first = engine();
      vi.advanceTimersByTime(RENDER_TIMEOUT_MS - 1);
      expect(first.terminated).toBe(false);
      vi.advanceTimersByTime(1);
      expect(first.terminated).toBe(true);
      expect(engines).toHaveLength(2);
      expect(queue.get('slow')).toMatchObject({ status: 'Not yet checked', pending: false });
      expect(queue.get('slow')?.latest).toEqual({ blockKey: 'slow', text: 'S', outcome: 'timedOut' });
      expect(engine().posted.map((m) => m.lines)).toEqual(['N']);
      engine().svg(OK_SVG);
      expect(queue.get('next')?.status).toBe('rendered');
    });

    it('ignores a late reply from the terminated renderer', () => {
      const { queue, engines } = setup();
      queue.request(screen('slow', 'S'));
      const first = engines[0]!;
      const id = first.last().id;
      vi.advanceTimersByTime(RENDER_TIMEOUT_MS);
      first.svg(OK_SVG, id);
      expect(queue.get('slow')?.latest?.outcome).toBe('timedOut');
      expect(queue.get('slow')?.lastOk).toBeNull();
    });

    it('keeps the last good image, out of date, and retries the same text only when asked again', () => {
      const { queue, engine } = setup();
      queue.request(screen('a', 'A1'));
      engine().svg(OK_SVG);
      queue.request(screen('a', 'A2'));
      vi.advanceTimersByTime(RENDER_TIMEOUT_MS);
      expect(queue.get('a')).toMatchObject({ status: 'Not yet checked', outOfDate: true });
      expect(engine().posted).toEqual([]);
      queue.request(screen('a', 'A2'));
      expect(engine().last().lines).toBe('A2');
    });

    it('does not time out a render that replied in time', () => {
      const { queue, engines, engine } = setup();
      queue.request(screen('a', 'A'));
      vi.advanceTimersByTime(RENDER_TIMEOUT_MS - 1);
      engine().svg(OK_SVG);
      vi.advanceTimersByTime(RENDER_TIMEOUT_MS * 2);
      expect(engines).toHaveLength(1);
      expect(engines[0]!.terminated).toBe(false);
    });
  });

  it('reports readiness from the renderer, and a restarted renderer is not ready until it says so', () => {
    const { queue, engine } = setup();
    expect(queue.isReady()).toBe(false);
    queue.request(screen('a', 'A'));
    engine().ready();
    expect(queue.isReady()).toBe(true);
    vi.advanceTimersByTime(RENDER_TIMEOUT_MS);
    expect(queue.isReady()).toBe(false);
    engine().ready();
    expect(queue.isReady()).toBe(true);
  });

  it('starts no renderer until something needs rendering', () => {
    const { queue, engines } = setup();
    queue.request(screen('inc', 'x', { dependsOnExternal: true }));
    expect(engines).toHaveLength(0);
    queue.start();
    expect(engines).toHaveLength(1);
    queue.start();
    expect(engines).toHaveLength(1);
  });

  it('notifies subscribers with the changed block, and keeps snapshots stable between changes', () => {
    const { queue, engine } = setup();
    const seen: Array<string | null> = [];
    const unsubscribe = queue.subscribe((key) => seen.push(key));
    queue.request(screen('a', 'A'));
    const before = queue.get('a');
    expect(queue.get('a')).toBe(before);
    engine().ready();
    engine().svg(OK_SVG);
    expect(queue.get('a')).not.toBe(before);
    expect(seen).toEqual(['a', null, 'a']);
    unsubscribe();
    queue.request(screen('a', 'A2'));
    expect(seen).toHaveLength(3);
  });

  it('forgets a removed block, ignoring its render in flight', () => {
    const { queue, engine } = setup();
    queue.request(screen('a', 'A'));
    queue.request(screen('b', 'B'));
    queue.remove('a');
    queue.remove('b');
    expect(queue.get('a')).toBeNull();
    engine().svg(OK_SVG);
    expect(queue.get('a')).toBeNull();
    expect(engine().posted).toHaveLength(1);
  });

  it('clear() drops every block, and a stale reply does not reach a new block with the same key', () => {
    const { queue, engine } = setup();
    queue.request(screen('a', 'old project'));
    queue.clear();
    queue.request(screen('a', 'new project'));
    engine().svg('<svg>old</svg>', engine().posted[0]!.id);
    expect(queue.get('a')).toMatchObject({ latest: null, lastOk: null, pending: true });
    engine().svg('<svg>new</svg>');
    expect(queue.get('a')?.lastOk).toMatchObject({ text: 'new project', svg: 'clean:<svg>new</svg>' });
  });

  it('dispose() terminates the renderer and stops all work', () => {
    const { queue, engine, engines } = setup();
    queue.request(screen('a', 'A'));
    queue.dispose();
    expect(engine().terminated).toBe(true);
    vi.advanceTimersByTime(RENDER_TIMEOUT_MS * 2);
    queue.request(screen('b', 'B'));
    expect(engines).toHaveLength(1);
  });

  it('works the same with any substitute renderer that offers the interface (VO-072)', async () => {
    vi.useRealTimers();
    // An asynchronous substitute that "renders" by echoing the text.
    const queue = new RenderQueue({
      createEngine: (onMessage) => ({
        post: (message) => {
          setTimeout(() => onMessage({ type: 'svg', id: message.id, svg: `<svg><text>${message.lines}</text></svg>` }), 1);
        },
        terminate: () => undefined,
      }),
      sanitize: (svg) => svg,
    });
    queue.request(screen('a', 'A'));
    queue.request(screen('b', 'B'));
    await vi.waitFor(() => expect(queue.get('b')?.status).toBe('rendered'));
    expect(queue.get('a')?.lastOk?.svg).toBe('<svg><text>A</text></svg>');
    expect(queue.get('b')?.lastOk?.svg).toBe('<svg><text>B</text></svg>');
  });
});
