// T167: image export and copying source (FR-014/AC2–AC5, US8; VO-044, with VO-043 and VO-045 checked in
// tests/e2e/us8-export.spec.ts against the real renderer and clipboard).
//
// Image export is refused with an explanation for an invalid block, a block in the older format and a block
// that depends on `!include`, while copying the block's source and the whole project's source still works.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importSource } from '../../../src/core/project/project.ts';
import { RenderQueue, type EngineFactory } from '../../../src/services/render/render-queue.ts';
import type { ToWorker } from '../../../src/services/render/render.worker.ts';
import {
  imageFileName,
  PNG_SCALE,
  standaloneSvg,
  svgSize,
  svgToPng,
  type PngDeps,
} from '../../../src/services/render/export-image.ts';
import { copyText } from '../../../src/services/files/clipboard.ts';
import type { ProjectRecord } from '../../../src/services/storage/db.ts';
import { createSlots, slots as appSlots, type SlotContext } from '../../../src/ui/app/slots.ts';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import { bindExportRenders, ExportCommands, exportRefusal, type ExportServices } from '../../../src/ui/export/ExportCommands.tsx';
import { t } from '../../../src/ui/messages/en.ts';
import { slotContextOf } from '../../../src/ui/project-panel/ProjectPanel.tsx';

const salt = (name: string, body = '  [OK]') => `@startsalt ${name}\n{\n${body}\n}\n@endsalt\n`;

const GOOD = salt('Sign-in', '  Email | "      "\n  [Sign in] | .');
const INVALID = '@startsalt Broken\n{\n  Name | "     "\n  [Save]\n@endsalt\n';
const OLDER = '@startuml Login\nsalt\n{\n  Login | "MyName  "\n  [OK]\n}\n@enduml\n';
const INCLUDE = '@startsalt Header\n!include common.puml\n{\n  Welcome\n}\n@endsalt\n';
const SOURCE = [GOOD, INVALID, OLDER, INCLUDE].join('\n');

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="150px" height="58px" viewBox="0 0 150 58">' +
  '<g><text x="6" y="18">My Name &amp; more</text></g></svg>';

const record = (source: string): ProjectRecord => {
  const state = importSource(source);
  return {
    id: 'p1', name: 'Shop: checkout', source: state.source, flowIndex: state.flowIndex, lastWorking: [],
    createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
    downloadedAt: null, downloadedRevision: null,
  };
};

type Reply = 'svg' | 'error' | 'hold';

/** A renderer that answers at once: an SVG, an error, or nothing (the block stays "Not yet checked"). */
function engine(replyFor: (lines: string) => Reply): EngineFactory {
  return (onMessage) => {
    queueMicrotask(() => onMessage({ type: 'ready' }));
    return {
      post(message: ToWorker) {
        if (message.type !== 'render') return;
        const reply = replyFor(message.lines);
        if (reply === 'svg') queueMicrotask(() => onMessage({ type: 'svg', id: message.id, svg: SVG }));
        if (reply === 'error') queueMicrotask(() => onMessage({ type: 'error', id: message.id, message: 'Syntax Error?' }));
      },
      terminate() {},
    };
  };
}

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
});

function services(): ExportServices & { [K in keyof ExportServices]: ReturnType<typeof vi.fn> } {
  return {
    exportSvg: vi.fn(),
    exportPng: vi.fn(async () => {}),
    copy: vi.fn(async () => ({ ok: true as const })),
  } as never;
}

function Harness({ store, queue, svc }: { store: Store; queue: RenderQueue; svc: ExportServices }) {
  return (
    <StoreContext.Provider value={store}>
      <Bound store={store} queue={queue} svc={svc} />
    </StoreContext.Provider>
  );
}

function Bound({ store, queue, svc }: { store: Store; queue: RenderQueue; svc: ExportServices }) {
  // The toolbar passes the workspace's context; the project panel's helper builds the same one from the session.
  const ctx: SlotContext = slotContextOf(store.getSnapshot());
  return <ExportCommands ctx={ctx} renders={queue} services={svc} />;
}

async function setup(options: { source?: string; reply?: (lines: string) => Reply; open?: string } = {}) {
  const queue = new RenderQueue({ createEngine: engine(options.reply ?? (() => 'svg')) });
  const store = createStore({ write: async () => {}, announce: vi.fn(), slots: createSlots(), renderQueue: queue, typingPauseMs: 0 });
  cleanups.push(() => store.dispose(), () => queue.dispose());
  act(() => store.load(record(options.source ?? SOURCE)));
  const svc = services();
  const open = (name: string) => {
    const view = store.getSnapshot().blocks.find((b) => b.name === name);
    if (!view) throw new Error(`no block ${name}`);
    act(() => store.openBlock(view.key));
  };
  open(options.open ?? 'Sign-in');
  const view = render(<Harness store={store} queue={queue} svc={svc} />);
  // Let the renderer answer every request.
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  const rerender = () => view.rerender(<Harness store={store} queue={queue} svc={svc} />);
  return { store, queue, svc, open: (name: string) => { open(name); rerender(); }, rerender };
}

const button = (name: string) => screen.getByRole('button', { name });
const status = () => within(screen.getByRole('group', { name: t('export.group') })).getByRole('status');

describe('Export commands are offered for the open block and the project (FR-014/AC2, AC4)', () => {
  it('shows Export SVG, Export PNG, Copy source and Copy project source', async () => {
    await setup();
    for (const key of ['export.svg', 'export.png', 'export.copySource', 'export.copyProjectSource']) {
      expect(button(t(key))).toBeInTheDocument();
    }
  });

  it('exports the preview SVG of a block that renders, named after the project and block', async () => {
    const user = userEvent.setup();
    const { svc } = await setup();
    expect(button(t('export.svg'))).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(button(t('export.svg')));
    expect(svc.exportSvg).toHaveBeenCalledTimes(1);
    const [svg, fileName] = svc.exportSvg.mock.calls[0]!;
    expect(svg).toContain('My&#160;Name &amp; more');
    expect(svg).not.toContain('&nbsp;');
    expect(fileName).toBe('Shop- checkout - Sign-in.svg');

    await user.click(button(t('export.png')));
    expect(svc.exportPng).toHaveBeenCalledTimes(1);
    expect(svc.exportPng.mock.calls[0]![0]).toBe(svg);
    expect(svc.exportPng.mock.calls[0]![1]).toBe('Shop- checkout - Sign-in.png');
  });
});

describe('Image export of an unrenderable block is refused with an explanation (FR-014/AC5, VO-044)', () => {
  const cases = [
    { name: 'Broken', reason: 'export.refused.invalid', label: 'an invalid block' },
    { name: 'Login', reason: 'export.refused.olderFormat', label: 'a block in the older format' },
    { name: 'Header', reason: 'export.refused.include', label: 'a block that depends on !include' },
  ];

  for (const { name, reason, label } of cases) {
    it(`refuses SVG and PNG export of ${label}, while copy stays available`, async () => {
      const user = userEvent.setup();
      // The renderer would even draw it: refusal comes from what the editor knows about the block.
      const { svc, store } = await setup({ open: name });
      const explanation = t(reason, { block: name });

      for (const key of ['export.svg', 'export.png']) {
        const control = button(t(key));
        expect(control).toHaveAttribute('aria-disabled', 'true');
        expect(control).toHaveAccessibleDescription(explanation);
        await user.click(control);
        expect(status()).toHaveTextContent(explanation);
      }
      expect(svc.exportSvg).not.toHaveBeenCalled();
      expect(svc.exportPng).not.toHaveBeenCalled();

      const copySource = button(t('export.copySource'));
      expect(copySource).toBeEnabled();
      expect(copySource).not.toHaveAttribute('aria-disabled');
      await user.click(copySource);
      const view = store.getSnapshot().blocks.find((b) => b.name === name)!;
      expect(svc.copy).toHaveBeenLastCalledWith(store.getState()!.source.slice(view.start, view.end));
      await waitFor(() => expect(status()).toHaveTextContent(t('export.copied', { block: name })));

      await user.click(button(t('export.copyProjectSource')));
      expect(svc.copy).toHaveBeenLastCalledWith(store.getState()!.source);
      await waitFor(() => expect(status()).toHaveTextContent(t('export.projectCopied')));
    });
  }

  it('refuses export when the renderer reported a problem with the current text', async () => {
    const user = userEvent.setup();
    const { svc } = await setup({ reply: () => 'error' });
    const explanation = t('export.refused.renderProblem', { block: 'Sign-in' });
    expect(button(t('export.svg'))).toHaveAccessibleDescription(explanation);
    await user.click(button(t('export.png')));
    expect(status()).toHaveTextContent(explanation);
    expect(svc.exportPng).not.toHaveBeenCalled();
  });

  it('refuses export until the current text has rendered, rather than exporting an out-of-date image', async () => {
    const user = userEvent.setup();
    const { svc } = await setup({ reply: () => 'hold' });
    const explanation = t('export.refused.notRendered', { block: 'Sign-in' });
    expect(button(t('export.svg'))).toHaveAccessibleDescription(explanation);
    await user.click(button(t('export.svg')));
    expect(status()).toHaveTextContent(explanation);
    expect(svc.exportSvg).not.toHaveBeenCalled();
  });

  it('exportRefusal checks the block before its render', async () => {
    const { store, queue } = await setup();
    const views = store.getSnapshot().blocks;
    const byName = (n: string) => views.find((b) => b.name === n)!;
    expect(exportRefusal(byName('Sign-in'), queue.get(byName('Sign-in').key))).toBeNull();
    expect(exportRefusal(byName('Broken'), queue.get(byName('Broken').key))?.key).toBe('export.refused.invalid');
    expect(exportRefusal(byName('Login'), queue.get(byName('Login').key))?.key).toBe('export.refused.olderFormat');
    expect(exportRefusal(byName('Header'), null)?.key).toBe('export.refused.include');
    expect(exportRefusal(byName('Sign-in'), null)?.key).toBe('export.refused.notRendered');
  });
});

describe('Copying source confirms it was copied (FR-014/AC4)', () => {
  it('copies the open block and confirms', async () => {
    const user = userEvent.setup();
    const { svc } = await setup();
    await user.click(button(t('export.copySource')));
    expect(svc.copy).toHaveBeenCalledWith(GOOD);
    await waitFor(() => expect(status()).toHaveTextContent(t('export.copied', { block: 'Sign-in' })));
  });

  it('says so when the browser refuses the clipboard', async () => {
    const user = userEvent.setup();
    const { svc } = await setup();
    svc.copy.mockResolvedValueOnce({ ok: false, reason: 'denied' });
    await user.click(button(t('export.copyProjectSource')));
    await waitFor(() => expect(status()).toHaveTextContent(t('export.copyFailed')));
  });

  it('clears an earlier message when another block opens', async () => {
    const user = userEvent.setup();
    const { open } = await setup();
    await user.click(button(t('export.copySource')));
    await waitFor(() => expect(status()).toHaveTextContent(t('export.copied', { block: 'Sign-in' })));
    open('Broken');
    expect(status()).toHaveTextContent('');
  });
});

describe('Registration (T173)', () => {
  it('adds the export and copy commands to the toolbar slot, reading renders bound by the application', async () => {
    await import('../../../src/ui/export/register.tsx');
    expect(appSlots.toolbar.list().map((c) => c.id)).toContain('export');

    const queue = new RenderQueue({ createEngine: engine(() => 'svg') });
    const store = createStore({ write: async () => {}, announce: vi.fn(), slots: createSlots(), renderQueue: queue });
    const unbind = bindExportRenders(queue);
    cleanups.push(unbind, () => store.dispose(), () => queue.dispose());
    act(() => store.load(record(GOOD)));
    await act(async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
    const Contribution = appSlots.toolbar.list().find((c) => c.id === 'export')!.Component;
    render(
      <StoreContext.Provider value={store}>
        <Contribution ctx={slotContextOf(store.getSnapshot())} />
      </StoreContext.Provider>,
    );
    expect(button(t('export.svg'))).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('renders nothing outside a project', () => {
    const store = createStore({ write: async () => {}, announce: vi.fn(), slots: createSlots() });
    cleanups.push(() => store.dispose());
    const { container } = render(
      <StoreContext.Provider value={store}>
        <ExportCommands ctx={{ projectId: null, block: null, selection: null }} />
      </StoreContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Image export service (FR-014/AC3, R-9)', () => {
  it('reads the natural size from the root width and height, or the viewBox', () => {
    expect(svgSize(SVG)).toEqual({ width: 150, height: 58 });
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40.5 20"></svg>')).toEqual({ width: 41, height: 20 });
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" style="width:12px;height:7px;"></svg>')).toEqual({ width: 12, height: 7 });
    expect(svgSize('<svg></svg>')).toBeNull();
  });

  it('makes the preview markup a standalone SVG file', () => {
    const preview = '<svg width="10px" height="5px"><text>a&nbsp;b</text></svg>';
    const out = standaloneSvg(preview);
    expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(out).toContain('a&#160;b');
    expect(standaloneSvg(SVG)).toBe(SVG);
  });

  it('names files after the project and block, replacing characters a file name cannot hold', () => {
    expect(imageFileName('Shop: checkout', 'Sign-in', 'svg')).toBe('Shop- checkout - Sign-in.svg');
    expect(imageFileName('A/B', 'x*y?', 'png')).toBe('A-B - x-y-.png');
  });

  it('draws the SVG into a canvas at exactly 2× its natural size and saves it as PNG', async () => {
    expect(PNG_SCALE).toBe(2);
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((done: (b: Blob | null) => void, type: string) => done(new Blob(['png'], { type }))),
    };
    const image = { naturalWidth: 150, naturalHeight: 58 };
    const deps: PngDeps = {
      loadImage: vi.fn(async (url: string) => {
        expect(url.startsWith('data:image/svg+xml')).toBe(true);
        return image as unknown as HTMLImageElement;
      }),
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
    };
    const png = await svgToPng(SVG, deps);
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(116);
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 300, 116);
    expect(canvas.toBlob.mock.calls[0]![1]).toBe('image/png');
    expect(png.type).toBe('image/png');
  });
});

describe('Clipboard service (FR-014/AC4)', () => {
  it('writes text and reports success', async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyText('abc', { writeText })).toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith('abc');
  });

  it('reports a refusal or a missing clipboard without throwing', async () => {
    const denied = await copyText('abc', { writeText: async () => { throw new DOMException('no', 'NotAllowedError'); } });
    expect(denied).toEqual({ ok: false, reason: 'denied' });
    expect(await copyText('abc', null)).toEqual({ ok: false, reason: 'unavailable' });
  });
});
