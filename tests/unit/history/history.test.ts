import { describe, expect, it } from 'vitest';
import { createHistory, HISTORY_LIMIT, type EntryInput, type HistoryEntry } from '../../../src/core/history/history.ts';
import { applyEdits, invertEdits } from '../../../src/core/source/edits.ts';
import type { TextEdit } from '../../../src/core/types.ts';

type Meta = { flowIndex: number | null };
const sel = (blockKey: string, ...path: number[]) => ({ blockKey, path });

/** A tiny document that applies entries the way the store does. */
function doc(initial: string) {
  let text = initial;
  return {
    get text() { return text; },
    change(edits: TextEdit[]) {
      const inverse = invertEdits(text, edits);
      text = applyEdits(text, edits);
      return { edits, inverse };
    },
    undo(e: HistoryEntry<Meta>) { for (const c of [...e.changes].reverse()) text = applyEdits(text, c.inverse); },
    redo(e: HistoryEntry<Meta>) { for (const c of e.changes) text = applyEdits(text, c.edits); },
  };
}

function entry(d: ReturnType<typeof doc>, edits: TextEdit[], over: Partial<EntryInput<Meta>> = {}): EntryInput<Meta> {
  return {
    nameKey: 'history.insert', group: 'visual', blockKeys: ['b1'],
    selectionBefore: sel('b1', 0), selectionAfter: sel('b1', 1),
    metaBefore: { flowIndex: null }, metaAfter: { flowIndex: null },
    change: d.change(edits), ...over,
  };
}

describe('history', () => {
  it('undoes and redoes a visual edit, restoring the text exactly (FR-007/AC5)', () => {
    const d = doc('{\n  a\n}\n');
    const h = createHistory<Meta>();
    h.push(entry(d, [{ start: 5, end: 5, text: ' | [OK]' }]));
    expect(d.text).toBe('{\n  a | [OK]\n}\n');
    d.undo(h.undo()!);
    expect(d.text).toBe('{\n  a\n}\n');
    d.redo(h.redo()!);
    expect(d.text).toBe('{\n  a | [OK]\n}\n');
  });

  it('names the action that undo and redo will act on (FR-007/AC9)', () => {
    const d = doc('x');
    const h = createHistory<Meta>();
    expect(h.undoName()).toBeNull();
    h.push(entry(d, [{ start: 1, end: 1, text: 'y' }], { nameKey: 'history.delete', params: { what: 'Button' } }));
    expect(h.undoName()).toEqual({ nameKey: 'history.delete', params: { what: 'Button' } });
    h.undo();
    expect(h.undoName()).toBeNull();
    expect(h.redoName()).toEqual({ nameKey: 'history.delete', params: { what: 'Button' } });
  });

  it('a new edit clears redo', () => {
    const d = doc('a');
    const h = createHistory<Meta>();
    h.push(entry(d, [{ start: 1, end: 1, text: 'b' }]));
    d.undo(h.undo()!);
    h.push(entry(d, [{ start: 1, end: 1, text: 'c' }]));
    expect(h.redo()).toBeNull();
    expect(h.canRedo).toBe(false);
  });

  it('merges a typing run into one entry until it is sealed (FR-007/AC4, AC13)', () => {
    const d = doc('');
    const h = createHistory<Meta>();
    for (const [i, ch] of [...'abc'].entries())
      h.push(entry(d, [{ start: i, end: i, text: ch }], { group: 'sourceTyping', selectionBefore: sel('b1', i), selectionAfter: sel('b1', i + 1), metaAfter: { flowIndex: i } }));
    h.seal(); // a 300 ms pause or leaving the source view
    h.push(entry(d, [{ start: 3, end: 3, text: 'd' }], { group: 'sourceTyping' }));
    expect(d.text).toBe('abcd');
    expect(h.size).toBe(2);
    d.undo(h.undo()!);
    expect(d.text).toBe('abc');
    const typed = h.undo()!;
    expect(typed.changes).toHaveLength(3);
    expect(typed.selectionBefore).toEqual(sel('b1', 0));
    expect(typed.selectionAfter).toEqual(sel('b1', 3));
    expect(typed.metaBefore).toEqual({ flowIndex: null });
    expect(typed.metaAfter).toEqual({ flowIndex: 2 });
    d.undo(typed);
    expect(d.text).toBe('');
  });

  it('never merges visual edits, different groups or different blocks', () => {
    const d = doc('');
    const h = createHistory<Meta>();
    h.push(entry(d, [{ start: 0, end: 0, text: 'a' }]));
    h.push(entry(d, [{ start: 1, end: 1, text: 'b' }]));
    h.push(entry(d, [{ start: 2, end: 2, text: 'c' }], { group: 'propertyTyping' }));
    h.push(entry(d, [{ start: 3, end: 3, text: 'd' }], { group: 'sourceTyping' }));
    h.push(entry(d, [{ start: 4, end: 4, text: 'e' }], { group: 'sourceTyping', blockKeys: ['b2'] }));
    expect(h.size).toBe(5);
  });

  it('undo seals an open typing run, so typing after it starts a new entry', () => {
    const d = doc('');
    const h = createHistory<Meta>();
    h.push(entry(d, [{ start: 0, end: 0, text: 'a' }], { group: 'sourceTyping' }));
    h.push(entry(d, [{ start: 1, end: 1, text: 'b' }]));
    d.undo(h.undo()!);
    h.push(entry(d, [{ start: 1, end: 1, text: 'c' }], { group: 'sourceTyping' }));
    expect(h.size).toBe(2);
  });

  it(`keeps the ${HISTORY_LIMIT} most recent entries and drops the oldest (VO-087)`, () => {
    const d = doc('');
    const h = createHistory<Meta>();
    for (let i = 0; i < HISTORY_LIMIT + 1; i++) h.push(entry(d, [{ start: i, end: i, text: 'x' }], { nameKey: `op${i}` }));
    expect(h.size).toBe(HISTORY_LIMIT);
    let last: HistoryEntry<Meta> | null = null;
    for (let e = h.undo(); e; e = h.undo()) last = e;
    expect(last!.nameKey).toBe('op1');
  });

  it('clear empties both stacks (reload and "Edit here instead", FR-007/AC7)', () => {
    const d = doc('');
    const h = createHistory<Meta>();
    h.push(entry(d, [{ start: 0, end: 0, text: 'a' }]));
    h.push(entry(d, [{ start: 1, end: 1, text: 'b' }]));
    h.undo();
    h.clear();
    expect([h.canUndo, h.canRedo, h.size]).toEqual([false, false, 0]);
  });

  it('notifies subscribers when the stacks change', () => {
    const d = doc('');
    const h = createHistory<Meta>();
    let calls = 0;
    const off = h.subscribe(() => calls++);
    h.push(entry(d, [{ start: 0, end: 0, text: 'a' }]));
    h.undo();
    h.redo();
    h.clear();
    off();
    h.push(entry(d, [{ start: 1, end: 1, text: 'b' }]));
    expect(calls).toBe(4);
  });
});
