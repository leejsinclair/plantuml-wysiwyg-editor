// Flow notes (section 3.7, clarifications, data-model §5.3 Note, contracts/project-file.md §4).
//
// A note is written directly after the element it is attached to (after that element's earlier notes), or first
// in a branch or loop body. One line of text is written `note left: text`; several lines as a block ending with
// `end note`. PlantUML draws every note beside the statement before it, so an owner can carry several notes, in
// order. Block bodies are indented one level deeper than the `note` line; the text shown to the user has that
// common indentation removed, so what the user typed comes back unchanged.
import type { Path } from '../types.ts';
import { INDENT, type LineEnding } from '../project/house-style.ts';
import { escapeStepLabel } from './escape.ts';
import type { Note, ScreenFlow } from './model.ts';
import { lineEnd, indentAt, resolve, type FlowDoc } from './destinations.ts';

/** Escapes one line of note text; a line reading `end note` would end the note, so its first letter is escaped. */
function escapeLine(line: string): string {
  const escaped = escapeStepLabel(line, false);
  return /^\s*end\s*note\s*$/i.test(escaped) ? escaped.replace(/[eE]/, (c) => `<U+00${c.charCodeAt(0).toString(16).toUpperCase()}>`) : escaped;
}

/** The source of a note at `indent`: single-line for one line of text, a block otherwise. No final line ending. */
export function writeNote(side: 'left' | 'right', text: string, indent: string, eol: LineEnding): string {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length === 1) return `${indent}note ${side}: ${escapeLine(lines[0]!)}`;
  return [`${indent}note ${side}`, ...lines.map((l) => (l === '' ? '' : `${indent}${INDENT}${escapeLine(l)}`)), `${indent}end note`].join(eol);
}

/** The text of a note as the user sees it: line endings as `\n`, a block body's common indentation removed. */
export function noteText(_blockText: string, note: Note): string {
  const lines = note.text.text.split(/\r\n|\r|\n/);
  if (note.form === 'singleLine') return lines.join('\n');
  const indents = lines.filter((l) => l.trim() !== '').map((l) => /^[ \t]*/.exec(l)![0].length);
  const cut = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(Math.min(cut, /^[ \t]*/.exec(l)![0].length))).join('\n');
}

/** The notes attached at `path`: an element's notes, or the notes at the start of a branch or loop body. */
export function notesOf(model: ScreenFlow, path: Path): readonly Note[] {
  const r = resolve(model, path);
  if (!r) return [];
  return r.type === 'element' ? r.element.notes : r.container.path.leadingNotes;
}

/** Whether notes can be attached at `path` (a step, decision, loop, start, branch or loop body). */
export function canHaveNotes(model: ScreenFlow, path: Path): boolean {
  const r = resolve(model, path);
  if (!r) return false;
  if (r.type === 'slot') return true;
  return ['step', 'decision', 'loop', 'start'].includes(r.element.kind);
}

/** Where a new note goes at `path` (after the owner's last note) and its indentation; `null` if none can. */
export function noteInsertion(doc: FlowDoc, path: Path): { pos: number; indent: string } | null {
  if (!canHaveNotes(doc.model, path)) return null;
  const r = resolve(doc.model, path)!;
  const { text } = doc;
  if (r.type === 'element') {
    const last = r.element.notes[r.element.notes.length - 1];
    const end = last ? last.range.end : r.element.range.end;
    return { pos: lineEnd(text, end - 1), indent: indentAt(text, r.element.range.start) };
  }
  const header = r.container.branch?.header ?? (r.container.owner as { header: { start: number; end: number } }).header;
  const notes = r.container.path.leadingNotes;
  const end = notes.length > 0 ? notes[notes.length - 1]!.range.end : header.end;
  return { pos: lineEnd(text, end - 1), indent: indentAt(text, header.start) + INDENT };
}
