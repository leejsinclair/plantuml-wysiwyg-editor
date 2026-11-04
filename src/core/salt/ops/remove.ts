// Removing an element (FR-002/AC8, FR-020/AC4, section 3.2 "Removal").
//
// - In a single-row or single-column grid the gap closes; in a multi-row multi-column grid the element leaves an
//   empty cell (`.`), and a span it had becomes empty cells. Other rows are never touched.
// - A full-line comment directly above a removed row goes with it, and the announcement says so.
// - Focus afterwards (FR-009/AC8): the empty cell left behind; otherwise the next element, else the previous one,
//   else the container.
//
// The row and cell removal primitives are shared with move and the row and column operations.
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { OpResult, Path, TextEdit, TextRange } from '../../types.ts';
import { escapeSaltText } from '../escape.ts';
import type { Cell, CellsRow, Container, Row } from '../model.ts';
import { axisOf, locate, type ScreenDoc } from '../destinations.ts';
import { endsLine, lineEndWithEol, lineStart, startsLine } from './presets.ts';

/** Where a row's own text starts: its first leading comment, else the row itself. */
export const rowStart = (row: Row): number => row.leadingComments[0]?.start ?? row.range.start;

/**
 * The edit deleting a row with its leading comments: whole lines when the row has its lines to itself, otherwise
 * just its text and the spaces after it (a row on the same line as a brace).
 */
export function rowRemovalEdit(text: string, row: Row): TextEdit {
  const start = rowStart(row);
  const end = row.range.end;
  if (startsLine(text, start) && endsLine(text, end)) {
    return { start: lineStart(text, start), end: lineEndWithEol(text, end), text: '' };
  }
  let e = end;
  while (text[e] === ' ' || text[e] === '\t') e++;
  return { start, end: e, text: '' };
}

/** Re-escapes a plain text cell whose position as first cell of its row changes (section 3.4 command words). */
export function refirstEdit(cell: Cell | undefined, nowFirst: boolean): TextEdit | null {
  const content = cell?.content;
  if (!content || content.type !== 'text' || content.text.formatted) return null;
  const written = escapeSaltText(content.text.text, { firstCellOfRow: nowFirst });
  const raw = content.text.raw;
  // The raw text is what the editor would write for the old position; compare with the new one.
  const old = escapeSaltText(content.text.text, { firstCellOfRow: !nowFirst });
  if (written === old) return null;
  return { start: raw.start, end: raw.end, text: written };
}

/** The edits removing cell `c` from a row with other cells, closing the gap. */
export function cellRemovalEdits(row: CellsRow, c: number): TextEdit[] {
  const cell = row.cells[c]!;
  if (c > 0) return [{ start: row.cells[c - 1]!.range.end, end: cell.range.end, text: '' }];
  const next = row.cells[1]!;
  const edits: TextEdit[] = [{ start: cell.range.start, end: next.range.start, text: '' }];
  const re = refirstEdit(next, true);
  if (re) edits.push(re);
  // No span may start the row (EC-03): the next cell's continuation cells become empty cells.
  for (const s of next.spanRanges) edits.push({ start: s.start, end: s.end, text: '.' });
  return edits;
}

/** The edits that empty a cell: `.` for its content and each continuation cell of its span. */
export function emptyCellEdits(cell: Cell): TextEdit[] {
  return [{ start: cell.content.range.start, end: cell.content.range.end, text: '.' }, ...cell.spanRanges.map((s) => ({ ...s, text: '.' }))];
}

export interface Removal {
  readonly edits: TextEdit[];
  /** `emptied`: a `.` is left; `cell`: the cell is gone from its row; `row`: the whole row is gone. */
  readonly mode: 'emptied' | 'cell' | 'row';
  readonly containerPath: Path;
  readonly container: Container;
  readonly rowIndex: number;
  readonly cellIndex: number | null;
  /** Leading comments removed with the row. */
  readonly comments: readonly TextRange[];
  /** The selection afterwards, in the edited text. */
  readonly select: Path;
}

/** The selection after a row at `r` of the container at `k` is gone: the next row's element, else the previous. */
export function afterRowRemoval(container: Container, k: Path, r: number): Path {
  const pick = (old: number, now: number): Path => (container.rows[old]!.type === 'separator' ? [...k, now] : [...k, now, 0]);
  if (r + 1 < container.rows.length) return pick(r + 1, r);
  if (r > 0) return pick(r - 1, r - 1);
  return k;
}

/** How removing the element at `target` changes the text, or a refusal. */
export function planRemoval(doc: ScreenDoc, target: Path): Removal | { refused: string } {
  const at = locate(doc.model, target);
  if (!at || at.kind === 'container') return { refused: 'screen.refuse.deleteRoot' };
  const k = at.containerPath;
  const container = at.container;
  const r = at.rowIndex;
  const removeRow = (): Removal => ({
    edits: [rowRemovalEdit(doc.text, at.row)],
    mode: 'row',
    containerPath: k,
    container,
    rowIndex: r,
    cellIndex: at.kind === 'cell' ? at.cellIndex : null,
    comments: at.row.leadingComments,
    select: afterRowRemoval(container, k, r),
  });
  if (at.kind !== 'cell') return removeRow();

  const axis = axisOf(container);
  const c = at.cellIndex;
  if (axis === null) {
    if (at.cell.content.type === 'empty' && at.cell.span === 1) return { refused: 'screen.refuse.alreadyEmpty' };
    return { edits: emptyCellEdits(at.cell), mode: 'emptied', containerPath: k, container, rowIndex: r, cellIndex: c, comments: [], select: target };
  }
  if (axis === 'column' || at.row.cells.length === 1) return removeRow();
  const n = at.row.cells.length;
  const select = c + 1 < n ? [...k, r, c] : [...k, r, c - 1];
  return { edits: cellRemovalEdits(at.row, c), mode: 'cell', containerPath: k, container, rowIndex: r, cellIndex: c, comments: [], select };
}

/** Removes the element at `target` (FR-002/AC8). */
export function remove(doc: ScreenDoc, target: Path): OpResult {
  const plan = planRemoval(doc, target);
  if ('refused' in plan) return { ok: false, messageKey: plan.refused };
  const comments = plan.comments.length;
  return {
    ok: true,
    edits: plan.edits,
    select: plan.select,
    announceKey: comments > 0 ? 'screen.announce.deletedWithComments' : 'screen.announce.deleted',
    announceParams: { comments, count: comments },
    historyName: 'screen.history.delete',
  };
}
