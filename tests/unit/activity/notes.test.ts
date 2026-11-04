// T135: flow notes (section 3.7, FR-012/AC1, clarifications; VO-122). A note is attached to the element it follows
// (a step, decision, loop or start) or to the beginning of a branch or loop body. An owner can carry several notes,
// kept in order with their sides; they move and are deleted with their owner.
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../src/core/source/edits.ts';
import { flowDoc, type FlowDoc } from '../../../src/core/activity/destinations.ts';
import { notesOf, noteText, writeNote } from '../../../src/core/activity/notes.ts';
import { addNote, removeNote, setNoteSide, setNoteText } from '../../../src/core/activity/ops/notes.ts';
import { remove } from '../../../src/core/activity/ops/remove.ts';
import { moveByKey } from '../../../src/core/activity/ops/move.ts';
import { parseActivity } from '../../../src/core/activity/parser.ts';
import type { OpResult } from '../../../src/core/types.ts';

const block = (...lines: string[]) => ['@startuml Screen-flow', ...lines, '@enduml', ''].join('\n');
const doc = (text: string): FlowDoc => flowDoc(text)!;
function run(text: string, op: OpResult): string {
  if (!op.ok) throw new Error(`refused: ${op.messageKey}`);
  const out = applyEdits(text, op.edits);
  expect(parseActivity(out).diagnostics).toEqual([]);
  return out;
}
const notes = (text: string, path: number[]) => notesOf(parseActivity(text).model!, path).map((n) => [n.side, noteText(text, n)]);

const FLOW = block('start', ':A;', 'if (Ok?) then (yes)', 'else (no)', 'endif', 'repeat', 'repeat while (More?)', 'stop');

describe('writing notes', () => {
  it('writes one line as a single-line note and several as a block', () => {
    expect(writeNote('left', 'Hello', '', '\n')).toBe('note left: Hello');
    expect(writeNote('right', 'One\nTwo', '  ', '\n')).toBe('  note right\n    One\n    Two\n  end note');
  });
});

describe('adding notes to every kind of owner', () => {
  it('adds a note after a step, a decision, a loop and start', () => {
    for (const path of [[0], [1], [2], [3]]) {
      const op = addNote(doc(FLOW), path, 'right', 'Remember');
      expect(op).toMatchObject({ ok: true, select: path });
      const out = run(FLOW, op);
      expect(notes(out, path)).toEqual([['right', 'Remember']]);
    }
    const afterDecision = run(FLOW, addNote(doc(FLOW), [2], 'right', 'Remember'));
    expect(afterDecision).toContain('endif\nnote right: Remember\nrepeat');
    const afterStart = run(FLOW, addNote(doc(FLOW), [0], 'left', 'Begin'));
    expect(afterStart).toContain('start\nnote left: Begin\n:A;');
  });

  it('adds a note at the beginning of a branch and of a loop body', () => {
    const branch = run(FLOW, addNote(doc(FLOW), [2, 1], 'left', 'Invalid'));
    expect(branch).toContain('else (no)\n  note left: Invalid\nendif');
    expect(notes(branch, [2, 1])).toEqual([['left', 'Invalid']]);
    const body = run(FLOW, addNote(doc(FLOW), [3, 0], 'right', 'Each time'));
    expect(notes(body, [3, 0])).toEqual([['right', 'Each time']]);
  });

  it('keeps several notes in order with their sides', () => {
    let text = run(FLOW, addNote(doc(FLOW), [1], 'left', 'First'));
    text = run(text, addNote(doc(text), [1], 'right', 'Second\nline'));
    text = run(text, addNote(doc(text), [1], 'left', 'Third'));
    expect(notes(text, [1])).toEqual([['left', 'First'], ['right', 'Second\nline'], ['left', 'Third']]);
  });
});

describe('editing and deleting notes', () => {
  const WITH = block('start', ':A;', 'note left: First', 'note right', '  Second', 'end note', ':B;', 'stop');

  it('edits text, turning a single-line note into a block when it gains a line', () => {
    const one = run(WITH, setNoteText(doc(WITH), [1], 0, 'Changed'));
    expect(one).toContain('note left: Changed\n');
    const two = run(WITH, setNoteText(doc(WITH), [1], 0, 'Line 1\nLine 2'));
    expect(notes(two, [1])).toEqual([['left', 'Line 1\nLine 2'], ['right', 'Second']]);
    const block2 = run(WITH, setNoteText(doc(WITH), [1], 1, 'New body'));
    expect(notes(block2, [1])).toEqual([['left', 'First'], ['right', 'New body']]);
  });

  it('changes a note side', () => {
    const out = run(WITH, setNoteSide(doc(WITH), [1], 1, 'left'));
    expect(notes(out, [1])).toEqual([['left', 'First'], ['left', 'Second']]);
  });

  it('deletes one note and keeps the others', () => {
    const out = run(WITH, removeNote(doc(WITH), [1], 0));
    expect(out).toBe(block('start', ':A;', 'note right', '  Second', 'end note', ':B;', 'stop'));
  });

  it('moves notes with their owner', () => {
    const out = run(WITH, moveByKey(doc(WITH), [1], 'down'));
    expect(notes(out, [2])).toEqual([['left', 'First'], ['right', 'Second']]);
    expect(notes(out, [1])).toEqual([]);
  });

  it('deletes notes with their owner, including a branch', () => {
    expect(run(WITH, remove(doc(WITH), [1]))).toBe(block('start', ':B;', 'stop'));
    const text = block('start', 'if (Ok?) then (yes)', '  note left: on yes', 'elseif (Maybe?) then (m)', 'else (no)', 'endif', 'stop');
    const op = remove(doc(text), [1, 0]);
    const out = run(text, op);
    expect(out).not.toContain('on yes');
  });
});
