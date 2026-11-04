// Undo history (data-model §6.3, FR-007). Per project and per session; never persisted.
// Entries hold the edits as applied and their inverses; the store applies them and restores `meta`.

import type { MessageParams, Selection, TextEdit } from '../types.ts';

/** At least the 200 most recent entries are kept (FR-007/AC6, VO-087). */
export const HISTORY_LIMIT = 200;

/** Typing groups merge into one entry until `seal` is called (FR-007/AC4, AC13). */
export type HistoryGroup = 'visual' | 'sourceTyping' | 'propertyTyping';

/** One applied edit list and the list that restores the previous text exactly. */
export interface Change {
  readonly edits: readonly TextEdit[];
  readonly inverse: readonly TextEdit[];
}

/** `M` is the project metadata restored with the text, such as the flow choice and revert targets. */
export interface HistoryEntry<M> {
  readonly nameKey: string;
  readonly params?: MessageParams;
  readonly group: HistoryGroup;
  /** Blocks to open before applying (FR-007/AC11, EC-19). */
  readonly blockKeys: readonly string[];
  /** In the order applied: undo applies the inverses last to first, redo the edits first to last. */
  readonly changes: readonly Change[];
  readonly selectionBefore: Selection | null;
  readonly selectionAfter: Selection | null;
  readonly metaBefore: M;
  readonly metaAfter: M;
}

export type EntryInput<M> = Omit<HistoryEntry<M>, 'changes'> & { readonly change: Change };

export interface ActionName {
  readonly nameKey: string;
  readonly params?: MessageParams;
}

export interface History<M> {
  /** Records an applied edit. Clears redo. A typing edit joins the open run of the same group and blocks. */
  push(input: EntryInput<M>): void;
  /** Ends the open typing run: a 300 ms pause, leaving the source view, blur or Enter in a property field. */
  seal(): void;
  /** Moves the latest entry to redo and returns it for the caller to apply; `null` when empty. */
  undo(): HistoryEntry<M> | null;
  redo(): HistoryEntry<M> | null;
  undoName(): ActionName | null;
  redoName(): ActionName | null;
  /** Empties both stacks (reload, "Edit here instead"; FR-007/AC7). */
  clear(): void;
  subscribe(listener: () => void): () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Entries on the undo stack. */
  readonly size: number;
}

const sameKeys = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

const nameOf = <M>(e: HistoryEntry<M> | undefined): ActionName | null =>
  e ? { nameKey: e.nameKey, ...(e.params ? { params: e.params } : {}) } : null;

export function createHistory<M>(): History<M> {
  let undo: HistoryEntry<M>[] = [];
  let redo: HistoryEntry<M>[] = [];
  let open = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  return {
    push({ change, ...input }) {
      const last = undo.at(-1);
      if (open && last && input.group !== 'visual' && last.group === input.group && sameKeys(last.blockKeys, input.blockKeys)) {
        undo[undo.length - 1] = {
          ...last,
          changes: [...last.changes, change],
          selectionAfter: input.selectionAfter,
          metaAfter: input.metaAfter,
        };
      } else {
        undo.push({ ...input, changes: [change] });
        if (undo.length > HISTORY_LIMIT) undo = undo.slice(-HISTORY_LIMIT);
      }
      open = input.group !== 'visual';
      redo = [];
      notify();
    },
    seal() {
      open = false;
    },
    undo() {
      open = false;
      const e = undo.pop();
      if (!e) return null;
      redo.push(e);
      notify();
      return e;
    },
    redo() {
      open = false;
      const e = redo.pop();
      if (!e) return null;
      undo.push(e);
      notify();
      return e;
    },
    undoName: () => nameOf(undo.at(-1)),
    redoName: () => nameOf(redo.at(-1)),
    clear() {
      undo = [];
      redo = [];
      open = false;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get canUndo() {
      return undo.length > 0;
    },
    get canRedo() {
      return redo.length > 0;
    },
    get size() {
      return undo.length;
    },
  };
}
