import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type Store } from '../../../src/ui/app/store.ts';
import { createSlots } from '../../../src/ui/app/slots.ts';
import type { ProjectRecord } from '../../../src/services/storage/db.ts';
import type { RenderQueue } from '../../../src/services/render/render-queue.ts';
import type { OpResult, RenderStatus } from '../../../src/core/types.ts';

const screen = (name: string, body = '  [OK]') => `@startsalt ${name}\n{\n${body}\n}\n@endsalt\n`;
const record = (source: string, over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: 'p1', name: 'Project', source, flowIndex: null, lastWorking: [],
  createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
  downloadedAt: null, downloadedRevision: null, ...over,
});

/** An edit that appends `text` inside the root grid of the block at `index`. */
function appendRow(store: Store, index: number, text: string): OpResult {
  const b = store.getSnapshot().blocks[index]!;
  const source = store.getState()!.source;
  const at = source.lastIndexOf('}', b.end);
  return { ok: true, edits: [{ start: at, end: at, text: `  ${text}\n` }], select: [1], announceKey: 'test.inserted', historyName: 'history.propertyTyping' };
}

let stores: Store[] = [];
function make(source: string, over: Partial<ProjectRecord> = {}, extra: Partial<Parameters<typeof createStore>[0]> = {}) {
  const writes: ProjectRecord[] = [];
  const announce = vi.fn();
  const slots = createSlots();
  const store = createStore({ write: async (r) => { writes.push(r); }, announce, slots, now: () => '2026-02-02T00:00:00.000Z', ...extra });
  stores.push(store);
  store.load(record(source, over));
  return { store, writes, announce, slots };
}

afterEach(() => {
  stores.forEach((s) => s.dispose());
  stores = [];
  vi.useRealTimers();
});

describe('store: loading', () => {
  it('derives the blocks, opens the first block and starts with an empty history', () => {
    const { store } = make(screen('A') + screen('B'));
    const s = store.getSnapshot();
    expect(s.projectId).toBe('p1');
    expect(s.blocks.map((b) => b.name)).toEqual(['A', 'B']);
    expect(s.openBlockKey).toBe(s.blocks[0]!.key);
    expect(s.undoName).toBeNull();
    expect(s.save.status).toBe('saved');
  });
});

describe('store: operations', () => {
  it('applies an operation: text, selection, focus, announcement, history and autosave', async () => {
    vi.useFakeTimers();
    const { store, writes, announce } = make(screen('A'));
    const key = store.getSnapshot().openBlockKey!;
    expect(store.applyOp(appendRow(store, 0, '[Cancel]'))).toBe(true);
    const s = store.getSnapshot();
    expect(store.getState()!.source).toBe(screen('A', '  [OK]\n  [Cancel]'));
    expect(s.selection).toEqual({ blockKey: key, path: [1] });
    expect(s.focus).toMatchObject({ blockKey: key, path: [1] });
    expect(announce).toHaveBeenCalledWith('test.inserted', undefined);
    expect(s.undoName).toEqual({ nameKey: 'history.propertyTyping' });
    expect(s.save.status).toBe('pending');
    await vi.runAllTimersAsync();
    expect(writes.at(-1)).toMatchObject({ source: screen('A', '  [OK]\n  [Cancel]'), revision: 2, modifiedAt: '2026-02-02T00:00:00.000Z' });
  });

  it('a refused operation changes nothing and says why (FR-008/AC3)', () => {
    const { store, announce } = make(screen('A'));
    const before = store.getSnapshot();
    expect(store.applyOp({ ok: false, messageKey: 'test.refused', params: { n: 1 } })).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(announce).toHaveBeenCalledWith('test.refused', { n: 1 });
  });

  it('keeps block keys when a block is inserted before another, and gives the new block a new key', () => {
    const { store } = make(screen('A') + screen('B'));
    const [a, b] = store.getSnapshot().blocks.map((x) => x.key);
    const start = store.getSnapshot().blocks[1]!.start;
    store.applyEdits([{ start, end: start, text: screen('New') }], { nameKey: 'test.add', blockKey: b! });
    const keys = store.getSnapshot().blocks.map((x) => x.key);
    expect(keys[0]).toBe(a);
    expect(keys[2]).toBe(b);
    expect([a, b]).not.toContain(keys[1]);
  });

  it('records the last working version when an edit makes a screen invalid, and undo restores the metadata', () => {
    const { store } = make(screen('A'));
    const b = store.getSnapshot().blocks[0]!;
    const at = store.getState()!.source.indexOf('[OK]');
    store.applyEdits([{ start: at, end: at, text: '{ ' }], { nameKey: 'history.propertyTyping', blockKey: b.key });
    expect(store.getSnapshot().blocks[0]).toMatchObject({ status: 'Error', hasLastWorking: true });
    expect(store.getState()!.lastWorking).toEqual([{ blockIndex: 0, text: screen('A') }]);
    store.undo();
    expect(store.getState()!.lastWorking).toEqual([]);
    expect(store.getSnapshot().blocks[0]!.status).toBe('Editable');
  });

  it('takes the flow from the operation when it chooses one, and undo restores the previous choice', () => {
    const flow = '@startuml F\nstart\nstop\n@enduml\n';
    const { store } = make(screen('A') + flow);
    expect(store.getState()!.flowIndex).toBeNull();
    const key = store.getSnapshot().blocks[1]!.key;
    store.applyEdits([], { nameKey: 'history.propertyTyping', blockKey: key, flowIndex: 1 });
    expect(store.getSnapshot().blocks[1]!.kind).toBe('flow');
    store.undo();
    expect(store.getState()!.flowIndex).toBeNull();
  });

  it('moves the selection to the nearest surviving path after a re-parse (FR-004/AC9)', () => {
    const { store, slots } = make(screen('A'));
    slots.blockEditors.register('screen', {
      Canvas: () => null, Outline: () => null, Palette: () => null, Properties: () => null, commands: [],
      pathLabels: () => [], destinations: () => [], hasPath: (_m, path) => path.length <= 1,
    });
    store.select([0, 2, 1]);
    const b = store.getSnapshot().blocks[0]!;
    const at = store.getState()!.source.indexOf('[OK]');
    store.applyEdits([{ start: at, end: at + 4, text: '[Go]' }], { nameKey: 'test.edit', blockKey: b.key });
    expect(store.getSnapshot().selection).toEqual({ blockKey: b.key, path: [0] });
  });
});

describe('store: undo and redo', () => {
  it('VO-090: undoing an edit made in another screen opens it, selects the element and announces the change', () => {
    const { store, announce } = make(screen('A') + screen('B'));
    const [a, b] = store.getSnapshot().blocks.map((x) => x.key);
    store.openBlock(b!);
    store.select([0]);
    store.applyOp(appendRow(store, 1, '[Cancel]'));
    store.openBlock(a!);
    expect(store.getSnapshot().openBlockKey).toBe(a);
    store.undo();
    const s = store.getSnapshot();
    expect(s.openBlockKey).toBe(b);
    expect(s.selection).toEqual({ blockKey: b, path: [0] });
    expect(s.focus).toMatchObject({ blockKey: b, path: [0] });
    expect(announce).toHaveBeenLastCalledWith('history.undone', { action: 'typing in a property' });
    expect(store.getState()!.source).toBe(screen('A') + screen('B'));
    store.redo();
    expect(store.getSnapshot().selection).toEqual({ blockKey: b, path: [1] });
    expect(announce).toHaveBeenLastCalledWith('history.redone', { action: 'typing in a property' });
  });

  it('VO-091: undoing back to invalid source shows the block as invalid', () => {
    const broken = screen('A', '  {');
    const { store } = make(broken);
    const key = store.getSnapshot().blocks[0]!.key;
    expect(store.getSnapshot().blocks[0]!.status).toBe('Error');
    store.replaceBlockText(key, screen('A'));
    store.endSourceEdit();
    expect(store.getSnapshot().blocks[0]!.status).toBe('Editable');
    store.undo();
    expect(store.getState()!.source).toBe(broken);
    expect(store.getSnapshot().blocks[0]!.status).toBe('Error');
  });

  it('merges typing in the source into one entry until a pause, and keeps the block read-only meanwhile', () => {
    vi.useFakeTimers();
    const { store } = make(screen('A'));
    const key = store.getSnapshot().blocks[0]!.key;
    store.beginSourceEdit(key);
    expect(store.getSnapshot().sourceEditKey).toBe(key);
    store.replaceBlockText(key, screen('A', '  [O]'));
    store.replaceBlockText(key, screen('A', '  [Ok]'));
    vi.advanceTimersByTime(300);
    store.replaceBlockText(key, screen('A', '  [Okay]'));
    store.endSourceEdit();
    expect(store.getSnapshot().sourceEditKey).toBeNull();
    store.undo();
    expect(store.getState()!.source).toBe(screen('A', '  [Ok]'));
    store.undo();
    expect(store.getState()!.source).toBe(screen('A'));
    expect(store.getSnapshot().undoName).toBeNull();
  });
});

describe('store: renders', () => {
  it('requests a render of every block, the open one first, and shows render status from the queue', () => {
    const statuses = new Map<string, RenderStatus>();
    const listeners = new Set<(key: string | null) => void>();
    const queue = {
      request: vi.fn(), remove: vi.fn(), clear: vi.fn(), setOpenBlock: vi.fn(),
      get: (key: string) => (statuses.has(key) ? { status: statuses.get(key)! } : null),
      subscribe: (l: (key: string | null) => void) => (listeners.add(l), () => listeners.delete(l)),
    } as unknown as RenderQueue;
    const { store } = make(screen('A') + '@startuml\nAlice -> Bob\n@enduml\n', {}, { renderQueue: queue });
    const [a, other] = store.getSnapshot().blocks.map((x) => x.key);
    expect(queue.setOpenBlock).toHaveBeenCalledWith(a);
    expect(queue.request).toHaveBeenCalledWith(expect.objectContaining({ key: other, category: null, dependsOnExternal: false }));
    statuses.set(other!, 'failed');
    listeners.forEach((l) => l(other!));
    expect(store.getSnapshot().blocks[1]).toMatchObject({ renderStatus: 'failed', status: 'Cannot be rendered' });
  });
});
