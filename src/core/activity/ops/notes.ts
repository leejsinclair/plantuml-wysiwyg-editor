// Note operations (FR-012/AC1, section 3.7, clarifications; VO-122): add a note to a step, decision, loop, start
// or the beginning of a branch or loop body; edit its text and side; delete it. Notes move and are deleted with
// their owner through the element operations (their lines belong to the owner's span).
import type { OpResult, Path, TextEdit } from '../../types.ts';
import { flow } from '../../project/house-style.ts';
import type { Note } from '../model.ts';
import { diffEdits, eolOf, indentAt, lineEnd, lineStart, type FlowDoc } from '../destinations.ts';
import { rewrite } from '../lanes.ts';
import { noteInsertion, notesOf, writeNote } from '../notes.ts';

const finish = (doc: FlowDoc, edit: TextEdit, path: Path, key: string): OpResult => {
  const next = rewrite(doc, [edit], {});
  return next === null
    ? { ok: false, messageKey: 'flow.refused.position' }
    : { ok: true, edits: diffEdits(doc.text, next, doc.offset), select: path, announceKey: `flow.note.${key}`, historyName: `flow.history.note.${key}` };
};

/** Adds a note after the owner's existing notes ("Add note"). */
export function addNote(doc: FlowDoc, path: Path, side: 'left' | 'right' = 'right', text: string = flow.DEFAULTS.note): OpResult {
  const at = noteInsertion(doc, path);
  if (!at) return { ok: false, messageKey: 'flow.refused.noNotes' };
  const eol = eolOf(doc.text);
  const lead = at.pos > 0 && !/[\r\n]$/.test(doc.text.slice(0, at.pos)) ? eol : '';
  return finish(doc, { start: at.pos, end: at.pos, text: lead + writeNote(side, text, at.indent, eol) + eol }, path, 'added');
}

function noteAt(doc: FlowDoc, path: Path, index: number): Note | null {
  return notesOf(doc.model, path)[index] ?? null;
}

/** Replaces a whole note with a rewritten one at the same indentation. */
function rewriteNote(doc: FlowDoc, note: Note, side: 'left' | 'right', text: string): TextEdit {
  return { start: note.range.start, end: note.range.end, text: writeNote(side, text, '', eolOf(doc.text)).replace(/(\r\n|\r|\n)(?=.)/g, `$1${indentAt(doc.text, note.range.start)}`) };
}

/** Edits a note's text; a single-line note with several lines of text becomes a block. */
export function setNoteText(doc: FlowDoc, path: Path, index: number, text: string): OpResult {
  const note = noteAt(doc, path, index);
  if (!note) return { ok: false, messageKey: 'flow.refused.notFound' };
  return finish(doc, rewriteNote(doc, note, note.side, text), path, 'changed');
}

/** Changes a note's side, keeping its text as written. */
export function setNoteSide(doc: FlowDoc, path: Path, index: number, side: 'left' | 'right'): OpResult {
  const note = noteAt(doc, path, index);
  if (!note) return { ok: false, messageKey: 'flow.refused.notFound' };
  const source = doc.text.slice(note.range.start, note.range.end);
  const m = /^(note\s+)(left|right)/i.exec(source)!;
  const start = note.range.start + m[1]!.length;
  return finish(doc, { start, end: start + m[2]!.length, text: side }, path, 'side');
}

/** Deletes a note: its whole lines. */
export function removeNote(doc: FlowDoc, path: Path, index: number): OpResult {
  const note = noteAt(doc, path, index);
  if (!note) return { ok: false, messageKey: 'flow.refused.notFound' };
  const first = note.leadingComments[0]?.start ?? note.range.start;
  return finish(doc, { start: lineStart(doc.text, first), end: lineEnd(doc.text, note.range.end - 1), text: '' }, path, 'deleted');
}
