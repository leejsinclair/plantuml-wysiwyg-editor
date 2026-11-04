// The session store (data-model §6.1): the open project, its blocks, the open block and selection, history,
// autosave and render requests. Components read it with `useSession`; every change goes through `applyOp`,
// `applyEdits` or `replaceBlockText`, which apply text edits, re-parse and record one history entry.

import { createContext, useContext, useSyncExternalStore } from 'react';
import type { MessageParams, OpResult, Path, RenderStatus, Selection, TextEdit } from '../../core/types.ts';
import { applyEdits as apply, invertEdits } from '../../core/source/edits.ts';
import { split } from '../../core/blocks/split.ts';
import { createHistory, type ActionName, type HistoryEntry, type HistoryGroup } from '../../core/history/history.ts';
import { blocks, nextLastWorking, remap, withKeys, type BlockView, type KeyedState, type LastWorking } from '../../core/project/project.ts';
import type { ProjectRecord } from '../../services/storage/db.ts';
import { createAutosave, type Autosave, type SaveState } from '../../services/storage/autosave.ts';
import type { RenderQueue } from '../../services/render/render-queue.ts';
import { announce as defaultAnnounce } from '../announcer/Announcer.tsx';
import { t } from '../messages/en.ts';
import { slots as defaultSlots, type Slots } from './slots.ts';

/** Restored with the text on undo and redo, so the flow choice, revert targets and block keys follow it. */
export interface Meta {
  readonly flowIndex: number | null;
  readonly lastWorking: readonly LastWorking[];
  readonly keys: readonly string[];
}

export interface Session {
  readonly projectId: string | null;
  /** The stored record as last scheduled for saving. */
  readonly record: ProjectRecord | null;
  readonly blocks: readonly BlockView[];
  readonly openBlockKey: string | null;
  readonly selection: Selection | null;
  /** The block whose source view is being typed in; its canvas is read-only (FR-004/AC8). */
  readonly sourceEditKey: string | null;
  /** Set by "Open screen", used by "Back to flow" (FR-013/AC3). */
  readonly returnToFlow: { readonly stepPath: Path } | null;
  readonly save: SaveState;
  readonly undoName: ActionName | null;
  readonly redoName: ActionName | null;
  /** Where focus goes after an operation (FR-009/AC8); `seq` changes on every request. */
  readonly focus: { readonly blockKey: string; readonly path: Path; readonly seq: number } | null;
}

export interface EditOptions {
  /** A message key naming the action on the undo and redo controls (FR-007/AC9). */
  readonly nameKey: string;
  readonly params?: MessageParams;
  readonly blockKey: string;
  /** The selection afterwards, in `blockKey`. */
  readonly select?: Path;
  readonly group?: HistoryGroup;
  readonly announceKey?: string;
  readonly announceParams?: MessageParams;
  /** For reorders: `order[newIndex]` is the block's old index, `null` for a new block. Derived from the edits otherwise. */
  readonly order?: readonly (number | null)[];
  /** The flow afterwards, when the operation chooses it (re-division with no flow, FR-006/AC14). Follows `order` otherwise. */
  readonly flowIndex?: number | null;
}

export interface StoreOptions {
  /** Writes the whole record in one transaction (db.putProject). */
  readonly write: (record: ProjectRecord) => Promise<void>;
  readonly renderQueue?: RenderQueue;
  readonly announce?: (key: string, params?: MessageParams) => void;
  readonly newKey?: () => string;
  readonly now?: () => string;
  readonly slots?: Slots;
  /** Wait before a typing run is sealed into one history entry (FR-007/AC4). */
  readonly typingPauseMs?: number;
  readonly createAutosave?: typeof createAutosave;
}

const TYPING_PAUSE_MS = 300;
const INITIAL_SAVE: SaveState = { status: 'saved', attempt: 0, lastError: null };

type BlockSegment = { readonly start: number };
const blockStarts = (source: string): BlockSegment[] => split(source).filter((s) => s.type === 'block');

/** Where `offset` lands after `edits`, or `null` when the edits removed it. An insertion at `offset` comes before it. */
function mapOffset(offset: number, edits: readonly TextEdit[]): number | null {
  let delta = 0;
  for (const e of [...edits].sort((a, b) => a.start - b.start)) {
    if (e.end <= offset) delta += e.text.length - (e.end - e.start);
    else if (e.start < offset) return null;
    else break;
  }
  return offset + delta;
}

/** `order[newIndex]` = old index, matching blocks by where their start line moved; the later of two wins. */
function orderAfterEdits(before: readonly BlockSegment[], after: readonly BlockSegment[], edits: readonly TextEdit[]): (number | null)[] {
  const byStart = new Map<number, number>();
  before.forEach((b, i) => {
    const moved = mapOffset(b.start, edits);
    if (moved !== null) byStart.set(moved, i);
  });
  return after.map((b) => byStart.get(b.start) ?? null);
}

export function createStore(options: StoreOptions) {
  const announce = options.announce ?? defaultAnnounce;
  const now = options.now ?? (() => new Date().toISOString());
  let keySeq = 0;
  const newKey = options.newKey ?? (() => `b${++keySeq}`);
  const registry = options.slots ?? defaultSlots;
  const queue = options.renderQueue ?? null;
  const pauseMs = options.typingPauseMs ?? TYPING_PAUSE_MS;
  const history = createHistory<Meta>();
  const listeners = new Set<() => void>();

  let state: KeyedState | null = null;
  let record: ProjectRecord | null = null;
  let autosave: Autosave | null = null;
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let focusSeq = 0;
  // Render statuses change the block views without changing the source.
  const stopRenders = queue?.subscribe(() => {
    if (state) update({ blocks: blocks(state, renderStatuses()) });
  });
  let session: Session = {
    projectId: null, record: null, blocks: [], openBlockKey: null, selection: null, sourceEditKey: null,
    returnToFlow: null, save: INITIAL_SAVE, undoName: null, redoName: null, focus: null,
  };

  const renderStatuses = (): ReadonlyMap<string, RenderStatus> => {
    const map = new Map<string, RenderStatus>();
    if (queue && state) for (const key of state.keys) map.set(key, queue.get(key)?.status ?? 'Not yet checked');
    return map;
  };

  function update(patch: Partial<Session>): void {
    session = { ...session, ...patch, undoName: history.undoName(), redoName: history.redoName() };
    listeners.forEach((l) => l());
  }

  /** The nearest surviving path: trimmed from the end until the block's editor recognises it. */
  function survivingSelection(views: readonly BlockView[], selection: Selection | null): Selection | null {
    if (!selection) return null;
    const view = views.find((b) => b.key === selection.blockKey);
    if (!view) return null;
    const model = view.classification.salt?.model ?? view.classification.activity?.model ?? null;
    const editor = view.kind === 'other' ? null : registry.blockEditors.get(view.kind);
    if (!model || !editor) return selection;
    let path = selection.path;
    while (path.length > 0 && !editor.hasPath(model, path)) path = path.slice(0, -1);
    return { blockKey: selection.blockKey, path };
  }

  function requestRenders(views: readonly BlockView[], previousKeys: readonly string[]): void {
    if (!queue || !state) return;
    for (const b of views) {
      const c = b.classification;
      queue.request({ key: b.key, text: state.source.slice(b.start, b.end), category: c.category, dependsOnExternal: c.dependsOnExternal });
    }
    for (const key of previousKeys) if (!state.keys.includes(key)) queue.remove(key);
  }

  /** Installs a new state: re-derives blocks, renders, saves and keeps the selection on what survived. */
  function commit(next: KeyedState, patch: Partial<Session> = {}, save = true): void {
    const previousKeys = state?.keys ?? [];
    const sourceChanged = state?.source !== next.source;
    state = next;
    if (record && save) {
      record = {
        ...record,
        source: next.source,
        flowIndex: next.flowIndex,
        lastWorking: next.lastWorking.map((e) => ({ ...e })),
        ...(sourceChanged ? { modifiedAt: now(), revision: record.revision + 1 } : {}),
      };
      autosave?.schedule(record);
    }
    const views = blocks(next, renderStatuses());
    const openBlockKey = patch.openBlockKey !== undefined ? patch.openBlockKey : session.openBlockKey;
    const stillOpen = openBlockKey !== null && next.keys.includes(openBlockKey) ? openBlockKey : (next.keys[0] ?? null);
    const selection = survivingSelection(views, patch.selection !== undefined ? patch.selection : session.selection);
    const sourceEditKey = session.sourceEditKey !== null && next.keys.includes(session.sourceEditKey) ? session.sourceEditKey : null;
    queue?.setOpenBlock(stillOpen);
    requestRenders(views, previousKeys);
    update({ ...patch, record, blocks: views, openBlockKey: stillOpen, selection, sourceEditKey });
  }

  const meta = (s: KeyedState): Meta => ({ flowIndex: s.flowIndex, lastWorking: s.lastWorking, keys: s.keys });

  function focusOn(selection: Selection | null): Session['focus'] {
    return selection ? { blockKey: selection.blockKey, path: selection.path, seq: ++focusSeq } : session.focus;
  }

  /** Applies edits as one history entry (merged into an open typing run of the same group and block). */
  function applyEdits(edits: readonly TextEdit[], opts: EditOptions): void {
    if (!state) return;
    const prev = state;
    const source = apply(prev.source, edits);
    const inverse = invertEdits(prev.source, edits);
    const before = blockStarts(prev.source);
    const after = blockStarts(source);
    const order = opts.order ?? orderAfterEdits(before, after, edits);
    const remapped = remap(prev, source, order, newKey);
    const identity = order.length === before.length && order.every((old, i) => old === i);
    const carried: KeyedState = opts.flowIndex === undefined ? remapped : { ...remapped, flowIndex: opts.flowIndex };
    const next: KeyedState = identity ? { ...carried, lastWorking: nextLastWorking(prev.source, source, carried.flowIndex, prev.lastWorking) } : carried;
    const group = opts.group ?? 'visual';
    const selectionAfter: Selection | null = opts.select ? { blockKey: opts.blockKey, path: opts.select } : session.selection;
    history.push({
      nameKey: opts.nameKey,
      ...(opts.params ? { params: opts.params } : {}),
      group,
      blockKeys: [opts.blockKey],
      change: { edits, inverse },
      selectionBefore: session.selection,
      selectionAfter,
      metaBefore: meta(prev),
      metaAfter: meta(next),
    });
    if (group !== 'visual') {
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => history.seal(), pauseMs);
    }
    commit(next, { selection: selectionAfter, ...(opts.select ? { focus: focusOn(selectionAfter) } : {}) });
    if (opts.announceKey) announce(opts.announceKey, opts.announceParams);
  }

  function step(direction: 'undo' | 'redo'): void {
    if (!state) return;
    if (typingTimer) clearTimeout(typingTimer);
    const entry: HistoryEntry<Meta> | null = direction === 'undo' ? history.undo() : history.redo();
    if (!entry) return;
    let source = state.source;
    if (direction === 'undo') for (const c of [...entry.changes].reverse()) source = apply(source, c.inverse);
    else for (const c of entry.changes) source = apply(source, c.edits);
    const m = direction === 'undo' ? entry.metaBefore : entry.metaAfter;
    const selection = direction === 'undo' ? entry.selectionBefore : entry.selectionAfter;
    const blockKey = entry.blockKeys.find((k) => m.keys.includes(k)) ?? selection?.blockKey ?? null;
    commit({ source, flowIndex: m.flowIndex, lastWorking: m.lastWorking, keys: m.keys }, {
      ...(blockKey ? { openBlockKey: blockKey } : {}),
      selection,
      focus: focusOn(selection),
    });
    const action = t(entry.nameKey, entry.params);
    announce(direction === 'undo' ? 'history.undone' : 'history.redone', { action });
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: (): Session => session,
    /** The current source and metadata, for operations that compute edits. */
    getState: (): KeyedState | null => state,

    /** Opens a stored project with an empty history. */
    load(loaded: ProjectRecord): void {
      autosave?.dispose();
      queue?.clear();
      history.clear();
      record = loaded;
      autosave = (options.createAutosave ?? createAutosave)({ write: options.write, onChange: () => update({ save: autosave!.getState() }) });
      state = null;
      session = { ...session, projectId: loaded.id, selection: null, sourceEditKey: null, returnToFlow: null, focus: null, openBlockKey: null };
      const keyed = withKeys({ source: loaded.source, flowIndex: loaded.flowIndex, lastWorking: loaded.lastWorking }, newKey);
      commit(keyed, { save: autosave.getState() }, false);
    },

    /** Writes any pending change now (before leaving the project or handing over the edit lock). */
    flush: (): Promise<SaveState> => autosave?.flush() ?? Promise.resolve(session.save),

    /** Closes the project: pending changes are written first. */
    async close(): Promise<void> {
      await autosave?.flush();
      autosave?.dispose();
      autosave = null;
      queue?.clear();
      history.clear();
      state = null;
      record = null;
      session = { ...session, projectId: null, record: null, blocks: [], openBlockKey: null, selection: null, sourceEditKey: null, returnToFlow: null, focus: null, save: INITIAL_SAVE };
      update({});
    },

    /** Replaces the record's own fields (name, download state) without touching the source or history. */
    updateRecord(patch: Partial<Omit<ProjectRecord, 'id' | 'source' | 'flowIndex' | 'lastWorking'>>): void {
      if (!record) return;
      record = { ...record, ...patch };
      autosave?.schedule(record);
      update({ record });
    },

    openBlock(key: string): void {
      if (!state?.keys.includes(key) || key === session.openBlockKey) return;
      queue?.setOpenBlock(key);
      update({ openBlockKey: key, selection: null });
    },

    select(path: Path | null): void {
      const key = session.openBlockKey;
      update({ selection: key && path ? { blockKey: key, path } : null });
    },

    /** Applies an operation's result, or announces why it was refused, changing nothing (FR-008/AC3). */
    applyOp(op: OpResult, opts: { readonly blockKey?: string; readonly group?: HistoryGroup } = {}): boolean {
      if (!op.ok) {
        announce(op.messageKey, op.params);
        return false;
      }
      const blockKey = opts.blockKey ?? session.openBlockKey;
      if (!blockKey) return false;
      applyEdits(op.edits, {
        nameKey: op.historyName,
        ...(op.announceParams ? { params: op.announceParams } : {}),
        blockKey,
        select: op.select,
        ...(opts.group ? { group: opts.group } : {}),
        announceKey: op.announceKey,
        ...(op.announceParams ? { announceParams: op.announceParams } : {}),
      });
      return true;
    },

    applyEdits,

    /** Replaces one block's whole text, as typed in its source view: one `sourceTyping` entry per typing run. */
    replaceBlockText(key: string, text: string): void {
      const view = session.blocks.find((b) => b.key === key);
      if (!view || !state || state.source.slice(view.start, view.end) === text) return;
      applyEdits([{ start: view.start, end: view.end, text }], { nameKey: 'history.sourceTyping', blockKey: key, group: 'sourceTyping' });
    },

    /** Ends an open typing run (blur or Enter in a property field, leaving the source view). */
    seal(): void {
      if (typingTimer) clearTimeout(typingTimer);
      history.seal();
    },

    undo: () => step('undo'),
    redo: () => step('redo'),

    beginSourceEdit(key: string): void {
      if (session.sourceEditKey !== key) update({ sourceEditKey: key });
    },
    endSourceEdit(): void {
      if (typingTimer) clearTimeout(typingTimer);
      history.seal();
      if (session.sourceEditKey !== null) update({ sourceEditKey: null });
    },

    setReturnToFlow(value: Session['returnToFlow']): void {
      update({ returnToFlow: value });
    },

    /** Empties the history (handover to another tab, FR-007/AC7). */
    clearHistory(): void {
      history.clear();
      update({});
    },

    dispose(): void {
      if (typingTimer) clearTimeout(typingTimer);
      stopRenders?.();
      autosave?.dispose();
      listeners.clear();
    },
  };
}

export type Store = ReturnType<typeof createStore>;

export const StoreContext = createContext<Store | null>(null);

/** The session, re-read whenever it changes. */
export function useSession(): Session {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useSession needs a StoreContext provider');
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** The store itself, for running operations. */
export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore needs a StoreContext provider');
  return store;
}
