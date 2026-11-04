import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAutosave,
  retryDelay,
  type Autosave,
  type AutosaveOptions,
  type SaveState,
} from '../../../src/services/storage/autosave.ts';
import { getProject, openEditorDb, putProject, type EditorDatabase, type ProjectRecord } from '../../../src/services/storage/db.ts';

function record(source: string, revision = 1): ProjectRecord {
  return {
    id: 'p-1',
    name: 'Untitled project',
    source,
    flowIndex: null,
    lastWorking: [],
    createdAt: '2026-10-27T10:00:00.000Z',
    modifiedAt: '2026-10-27T10:00:00.000Z',
    revision,
    downloadedAt: null,
    downloadedRevision: null,
  };
}

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
}

let saver: Autosave | undefined;
let states: SaveState[];
let win: EventTarget;
let doc: FakeDocument;

function start(write: AutosaveOptions['write'], extra: Partial<AutosaveOptions> = {}): Autosave {
  saver = createAutosave({ write, window: win, document: doc, onChange: (s) => states.push(s), ...extra });
  return saver;
}

/** Lets settled promises run without moving the fake clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  states = [];
  win = new EventTarget();
  doc = new FakeDocument();
});

afterEach(() => {
  saver?.dispose();
  saver = undefined;
  vi.useRealTimers();
});

describe('retryDelay', () => {
  it('backs off 1 s, 2 s, 4 s, then every 10 s (R-5)', () => {
    expect([1, 2, 3, 4, 5, 12].map((a) => retryDelay(a))).toEqual([1000, 2000, 4000, 10_000, 10_000, 10_000]);
  });
});

describe('autosave (FR-006/AC1, AC7, data-model §7.3)', () => {
  it('starts saved', () => {
    const s = start(vi.fn(async () => {}));
    expect(s.getState()).toEqual({ status: 'saved', attempt: 0, lastError: null });
  });

  it('goes pending on an edit and writes at most 500 ms after the last change', async () => {
    const write = vi.fn(async (_r: ProjectRecord) => {});
    const s = start(write);
    s.schedule(record('a'));
    expect(s.getState().status).toBe('pending');
    await vi.advanceTimersByTimeAsync(300);
    s.schedule(record('ab'));
    await vi.advanceTimersByTimeAsync(499);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0].source).toBe('ab');
    expect(s.getState()).toEqual({ status: 'saved', attempt: 0, lastError: null });
    expect(states.map((x) => x.status)).toEqual(['pending', 'saving', 'saved']);
  });

  it('never debounces longer than 500 ms', async () => {
    const write = vi.fn(async (_r: ProjectRecord) => {});
    const s = start(write, { debounceMs: 2000 });
    s.schedule(record('a'));
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('flushes a pending edit on pagehide', async () => {
    const write = vi.fn(async (_r: ProjectRecord) => {});
    const s = start(write);
    s.schedule(record('a'));
    win.dispatchEvent(new Event('pagehide'));
    expect(write).toHaveBeenCalledTimes(1);
    await settle();
    expect(s.getState().status).toBe('saved');
  });

  it('flushes a pending edit when the page is hidden, not when it becomes visible', async () => {
    const write = vi.fn(async (_r: ProjectRecord) => {});
    const s = start(write);
    s.schedule(record('a'));
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(write).not.toHaveBeenCalled();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(write).toHaveBeenCalledTimes(1);
    await settle();
    expect(s.getState().status).toBe('saved');
  });

  it('flush() writes now and resolves once the latest text is stored', async () => {
    const write = vi.fn(async (_r: ProjectRecord) => {});
    const s = start(write);
    s.schedule(record('a'));
    const state = await s.flush();
    expect(state.status).toBe('saved');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('writes edits made during a write after it, keeping only the latest', async () => {
    let release: () => void = () => {};
    const write = vi.fn((_r: ProjectRecord) => new Promise<void>((r) => (release = r)));
    const s = start(write);
    s.schedule(record('a'));
    await vi.advanceTimersByTimeAsync(500);
    expect(s.getState().status).toBe('saving');
    s.schedule(record('ab'));
    s.schedule(record('abc'));
    expect(s.getState().status).toBe('saving');
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await settle();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]![0].source).toBe('abc');
    release();
    await settle();
    expect(s.getState().status).toBe('saved');
  });

  it('reports a failure within 1 s with a message key (FR-006/AC7)', async () => {
    const quota = new DOMException('full', 'QuotaExceededError');
    const write = vi.fn(async (_r: ProjectRecord) => {
      throw quota;
    });
    const s = start(write);
    s.schedule(record('a'));
    await vi.advanceTimersByTimeAsync(500);
    expect(s.getState()).toEqual({ status: 'failed', attempt: 1, lastError: 'storage.failed.quota' });
    expect(states.at(-1)?.status).toBe('failed');
  });

  it('uses the generic key for other failures', async () => {
    const s = start(async () => {
      throw new Error('boom');
    });
    s.schedule(record('a'));
    await s.flush();
    expect(s.getState().lastError).toBe('storage.failed');
  });

  it('retries after 1 s, 2 s, 4 s, then every 10 s, and returns to saved when a retry succeeds', async () => {
    let fail = true;
    const write = vi.fn(async (_r: ProjectRecord) => {
      if (fail) throw new Error('boom');
    });
    const s = start(write);
    s.schedule(record('a'));
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(1);

    const expectNextAttemptAfter = async (ms: number) => {
      const before = write.mock.calls.length;
      await vi.advanceTimersByTimeAsync(ms - 1);
      expect(write).toHaveBeenCalledTimes(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(write).toHaveBeenCalledTimes(before + 1);
    };
    await expectNextAttemptAfter(1000);
    expect(s.getState().attempt).toBe(2);
    await expectNextAttemptAfter(2000);
    await expectNextAttemptAfter(4000);
    await expectNextAttemptAfter(10_000);
    await expectNextAttemptAfter(10_000);
    expect(s.getState()).toMatchObject({ status: 'failed', attempt: 6 });

    fail = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.getState()).toEqual({ status: 'saved', attempt: 0, lastError: null });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(write).toHaveBeenCalledTimes(7);
  });

  it('stays failed through further edits and writes the latest text on the next retry', async () => {
    let fail = true;
    const write = vi.fn(async (_r: ProjectRecord) => {
      if (fail) throw new Error('boom');
    });
    const s = start(write);
    s.schedule(record('a'));
    await vi.advanceTimersByTimeAsync(500);
    s.schedule(record('ab'));
    s.schedule(record('abc'));
    expect(s.getState().status).toBe('failed');
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(1);
    fail = false;
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]![0].source).toBe('abc');
    expect(s.getState().status).toBe('saved');
  });

  it('notifies subscribers and stops after dispose', async () => {
    const write = vi.fn(async (_r: ProjectRecord) => {});
    const s = start(write);
    const seen: string[] = [];
    const off = s.subscribe((st) => seen.push(st.status));
    s.schedule(record('a'));
    off();
    s.schedule(record('ab'));
    expect(seen).toEqual(['pending']);
    s.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    win.dispatchEvent(new Event('pagehide'));
    expect(write).not.toHaveBeenCalled();
  });
});

describe('autosave with IndexedDB', () => {
  let db: EditorDatabase | undefined;
  let n = 0;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('keeps the previous record intact when a write fails, and stores the latest on retry', async () => {
    vi.useRealTimers();
    db = await openEditorDb(`autosave-db-${++n}`);
    const d = db;
    await putProject(d, record('v1'));
    let fail = true;
    // A record IndexedDB cannot clone makes the real transaction fail.
    const write = (r: ProjectRecord) =>
      putProject(d, fail ? { ...r, source: (() => r.source) as unknown as string } : r);
    const s = createAutosave({ write, window: win, document: doc, retryDelays: [20, 20, 20], debounceMs: 10 });
    saver = s;
    s.schedule(record('v2', 2));
    const failed = await s.flush();
    expect(failed.status).toBe('failed');
    expect((await getProject(d, 'p-1'))?.source).toBe('v1');

    s.schedule(record('v3', 3));
    fail = false;
    await vi.waitFor(() => expect(s.getState().status).toBe('saved'), { timeout: 1000 });
    expect(await getProject(d, 'p-1')).toEqual(record('v3', 3));
  });
});
