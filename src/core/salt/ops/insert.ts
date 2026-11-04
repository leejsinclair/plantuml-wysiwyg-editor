// Inserting from the palette (FR-002/AC2, section 3.2 "Insertion point", EC-04, FR-020/AC5).
//
// Choosing a palette item inserts:
// - after the selected element, in the same container: along the axis in a single-row or single-column grid (a 1 × 1
//   grid grows down, except one whose only element is a button, which grows across); in a multi-row multi-column
//   grid, as a new full-width row below with the new element in the selected element's column;
// - into the selected cell, if an empty cell is selected;
// - as the last child of a selected container (in a multi-row multi-column grid, a new full-width row at the bottom
//   with the new element in the first column);
// - at the end of the root grid when nothing is selected.
// An occupied cell is never a target. The new element is selected. A separator always takes a row of its own.
//
// The placement primitives here are shared with move.
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { OpResult, Path, TextEdit } from '../../types.ts';
import { INDENT } from '../../project/house-style.ts';
import { columnCount, type Container, type Row } from '../model.ts';
import { axisOf, containerAt, isContainer, locate, type ScreenDoc } from '../destinations.ts';
import { elementSource, endsLine, eolOf, indentAt, isRowItem, lineEnd, lineStart, startsLine, type PaletteChoice, type WriteContext } from './presets.ts';
import { refirstEdit, rowStart } from './remove.ts';

/** Where a new or moved element goes. */
export type Placement =
  /** Into an empty cell. */
  | { readonly kind: 'cell'; readonly container: Path; readonly row: number; readonly cell: number }
  /** A new cell at `index` of a row (`index` = the row's length appends). */
  | { readonly kind: 'cellAt'; readonly container: Path; readonly row: number; readonly index: number }
  /** A new row at `index` (`index` = the number of rows appends), the element in `column`. */
  | { readonly kind: 'rowAt'; readonly container: Path; readonly index: number; readonly column: number };

/** What is placed: a cell's content (or a whole row), its span and the comment lines that go above its row. */
export interface Payload {
  content(ctx: WriteContext): string;
  readonly span: number;
  readonly comments: readonly string[];
  /** A separator: written as a whole row. */
  readonly rowOnly: boolean;
}

const stars = (n: number): string => ' | *'.repeat(Math.max(0, n - 1));

/** The indentation for rows of `c`: an existing row's line, else one level inside the container's line. */
function rowIndentOf(text: string, c: Container): string {
  const row = c.rows.find((r) => startsLine(text, rowStart(r)));
  return row ? indentAt(text, rowStart(row)) : indentAt(text, c.range.start) + INDENT;
}

/** The comment lines for a payload, each written at `indent`. */
const commentLines = (payload: Payload, indent: string): string[] => payload.comments.map((c) => indent + c);

/** Where the opener (and a group box title) of a container ends. */
function headEnd(text: string, c: Container): number {
  if (c.type === 'grid' && c.title) return c.title.raw.end + (text[c.title.raw.end] === '"' ? 1 : 0);
  return c.open.end;
}

/** The comment lines inserted directly above an existing row. */
function commentsAbove(text: string, row: Row, payload: Payload, eol: string): TextEdit[] {
  if (payload.comments.length === 0) return [];
  const indent = indentAt(text, row.range.start);
  return [{ start: lineStart(text, row.range.start), end: lineStart(text, row.range.start), text: commentLines(payload, indent).join(eol) + eol }];
}

/** The edits that put `payload` at `place`, and the new element's path; or a refusal. */
export function placementEdits(doc: ScreenDoc, place: Placement, payload: Payload): { edits: TextEdit[]; select: Path } | { refused: string } {
  const { text, model } = doc;
  const eol = eolOf(text);
  const container = containerAt(model, place.container);
  if (!container) return { refused: 'screen.refuse.notFound' };
  const k = place.container;

  if (place.kind === 'cell') {
    const row = container.rows[place.row];
    const cell = row?.type === 'cells' ? row.cells[place.cell] : undefined;
    if (!row || row.type !== 'cells' || !cell) return { refused: 'screen.refuse.notFound' };
    if (cell.content.type !== 'empty') return { refused: 'screen.refuse.occupied' };
    if (payload.rowOnly) return { refused: 'screen.refuse.separatorCell' };
    const first = place.cell === 0;
    const content = payload.content({ indent: indentAt(text, cell.range.start), eol, firstCellOfRow: first });
    const edits: TextEdit[] = [{ start: cell.content.range.start, end: cell.content.range.end, text: content }];
    // The span grows over the empty cells that follow, reduced to fit (EC-03); never in the first column.
    let span = cell.span;
    for (let i = place.cell + 1; !first && span < payload.span && i < row.cells.length; i++) {
      const next = row.cells[i]!;
      if (next.content.type !== 'empty' || next.span !== 1) break;
      edits.push({ start: next.content.range.start, end: next.content.range.end, text: '*' });
      span++;
    }
    edits.push(...commentsAbove(text, row, payload, eol));
    return { edits, select: [...k, place.row, place.cell] };
  }

  if (place.kind === 'cellAt') {
    const row = container.rows[place.row];
    if (!row || row.type !== 'cells' || row.cells.length === 0) return { refused: 'screen.refuse.notFound' };
    if (payload.rowOnly) return { refused: 'screen.refuse.separatorCell' };
    const i = Math.min(place.index, row.cells.length);
    const first = i === 0;
    const content = payload.content({ indent: indentAt(text, row.range.start), eol, firstCellOfRow: first });
    const span = first ? 1 : payload.span;
    const edits: TextEdit[] = [];
    if (i < row.cells.length) {
      const before = row.cells[i]!;
      edits.push({ start: before.range.start, end: before.range.start, text: `${content}${stars(span)} | ` });
      if (first) {
        const re = refirstEdit(before, false);
        if (re) edits.push(re);
      }
    } else {
      const last = row.cells.at(-1)!;
      edits.push({ start: last.range.end, end: last.range.end, text: ` | ${content}${stars(span)}` });
    }
    edits.push(...commentsAbove(text, row, payload, eol));
    return { edits, select: [...k, place.row, i] };
  }

  // A new row.
  const rows = container.rows;
  const i = Math.min(place.index, rows.length);
  const indent = rowIndentOf(text, container);
  const ctx: WriteContext = { indent, eol, firstCellOfRow: true };
  let rowText: string;
  let select: Path;
  if (payload.rowOnly) {
    rowText = payload.content(ctx);
    select = [...k, i];
  } else if (axisOf(container) === null) {
    const width = Math.max(columnCount(container), 1);
    const col = Math.min(Math.max(place.column, 0), width - 1);
    const span = col === 0 ? 1 : Math.min(payload.span, width - col);
    const cells: string[] = [];
    for (let c = 0; c < width; c++) {
      if (c === col) cells.push(payload.content({ ...ctx, firstCellOfRow: c === 0 }));
      else if (c > col && c < col + span) cells.push('*');
      else cells.push('.');
    }
    rowText = cells.join(' | ');
    select = [...k, i, col];
  } else {
    rowText = payload.content(ctx);
    select = [...k, i, 0];
  }
  const lines = [...commentLines(payload, indent), indent + rowText];

  // A container written on one line becomes a multi-line one in the house style.
  if (!/[\r\n]/.test(text.slice(container.open.start, container.close.end))) {
    const base = indentAt(text, container.range.start);
    const head = text.slice(container.range.start, headEnd(text, container));
    const inner = indentAt(text, container.range.start) + INDENT;
    const existing = rows.map((r) => inner + text.slice(rowStart(r), r.range.end));
    const newLines = [...commentLines(payload, inner), inner + rowText];
    const all = [...existing.slice(0, i), ...newLines, ...existing.slice(i)];
    return {
      edits: [{ start: container.range.start, end: container.range.end, text: [head, ...all, `${base}}`].join(eol) }],
      select,
    };
  }

  if (rows.length === 0) {
    const at = lineEnd(text, headEnd(text, container));
    return { edits: [{ start: at, end: at, text: eol + lines.join(eol) }], select };
  }
  if (i > 0) {
    const prev = rows[i - 1]!;
    if (endsLine(text, prev.range.end)) {
      const at = lineEnd(text, prev.range.end);
      return { edits: [{ start: at, end: at, text: eol + lines.join(eol) }], select };
    }
    // The previous row shares its line with the closing brace: break the line before the brace.
    const at = prev.range.end;
    return { edits: [{ start: at, end: at, text: eol + lines.join(eol) + eol + indentAt(text, container.range.start) }], select };
  }
  const next = rows[0]!;
  const at = lineStart(text, rowStart(next));
  if (startsLine(text, rowStart(next))) return { edits: [{ start: at, end: at, text: lines.join(eol) + eol }], select };
  const after = headEnd(text, container);
  return { edits: [{ start: after, end: after, text: eol + lines.join(eol) + eol + indentAt(text, rowStart(next)) }], select };
}

/** Where a choice lands for a selection (section 3.2), or a refusal. */
export function insertionPoint(doc: ScreenDoc, selection: Path | null, rowOnly: boolean): Placement | { refused: string } {
  const sel = selection ?? [];
  const at = locate(doc.model, sel);
  if (!at) return { refused: 'screen.refuse.notFound' };

  const intoContainer = (k: Path, c: Container): Placement => {
    const axis = axisOf(c);
    if (!rowOnly && axis === 'row') return { kind: 'cellAt', container: k, row: 0, index: (c.rows[0] as { cells: readonly unknown[] }).cells.length };
    return { kind: 'rowAt', container: k, index: c.rows.length, column: 0 };
  };

  if (at.kind === 'container') return intoContainer(sel, at.container);
  if (at.kind === 'row') return intoContainer(at.containerPath, at.container);
  if (at.kind === 'separator') return { kind: 'rowAt', container: at.containerPath, index: at.rowIndex + 1, column: 0 };
  const content = at.cell.content;
  if (isContainer(content)) return intoContainer(sel, content);
  if (content.type === 'empty' && !rowOnly) return { kind: 'cell', container: at.containerPath, row: at.rowIndex, cell: at.cellIndex };
  const axis = axisOf(at.container);
  if (rowOnly || axis === 'column') return { kind: 'rowAt', container: at.containerPath, index: at.rowIndex + 1, column: 0 };
  if (axis === 'row') return { kind: 'cellAt', container: at.containerPath, row: at.rowIndex, index: at.cellIndex + 1 };
  return { kind: 'rowAt', container: at.containerPath, index: at.rowIndex + 1, column: at.cell.column };
}

/** Inserts a palette choice at the insertion point for `selection` and selects it (FR-002/AC2). */
export function insert(doc: ScreenDoc, selection: Path | null, choice: PaletteChoice): OpResult {
  const rowOnly = isRowItem(choice.item);
  const place = insertionPoint(doc, selection, rowOnly);
  if ('refused' in place) return { ok: false, messageKey: place.refused };
  const payload: Payload = { content: (ctx) => elementSource(choice, ctx), span: 1, comments: [], rowOnly };
  const result = placementEdits(doc, place, payload);
  if ('refused' in result) return { ok: false, messageKey: result.refused };
  return {
    ok: true,
    edits: result.edits,
    select: result.select,
    announceKey: 'screen.announce.inserted',
    historyName: 'screen.history.insert',
  };
}
