// Rows and columns (FR-002/AC9, section 3.2 "Rows and columns", "Spans", "Ragged rows", section 4.1).
//
// Inserting a row or column adds it across the grid; deleting one with content is allowed (undoable, announced).
// Inserting or deleting a column changes only the affected cell in each row and the continuation cells of an
// affected span: a column inserted inside a span extends it; deleting the column a span starts from turns the rest
// of the span into empty cells; no span is ever left in the first column. Rows that do not reach the column
// (ragged rows) are left untouched (EC-02, EC-03).
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { OpResult, Path, TextEdit } from '../../types.ts';
import { columnCount, type CellsRow, type Container } from '../model.ts';
import { locate, type ScreenDoc } from '../destinations.ts';
import { placementEdits } from './insert.ts';
import { afterRowRemoval, cellRemovalEdits, refirstEdit, rowRemovalEdit } from './remove.ts';

const result = (edits: TextEdit[], select: Path, what: 'rowInserted' | 'rowDeleted' | 'columnInserted' | 'columnDeleted'): OpResult => ({
  ok: true,
  edits,
  select,
  announceKey: `screen.announce.${what}`,
  historyName: `screen.history.${what}`,
});

/** The container and row a selection is in; for nothing or a container, that container and no row. */
function context(doc: ScreenDoc, target: Path | null): { k: Path; container: Container; row: number | null; cell: number | null } | null {
  const at = locate(doc.model, target ?? []);
  if (!at) return null;
  if (at.kind === 'container') return { k: [], container: at.container, row: null, cell: null };
  return { k: at.containerPath, container: at.container, row: at.rowIndex, cell: at.kind === 'cell' ? at.cellIndex : null };
}

const widthOf = (row: CellsRow): number => row.cells.reduce((w, c) => Math.max(w, c.column + c.span), 0);

/** Inserts an empty full-width row below the selection's row, or at the end of the root grid. */
export function insertRow(doc: ScreenDoc, target: Path | null): OpResult {
  const ctx = context(doc, target);
  if (!ctx) return { ok: false, messageKey: 'screen.refuse.notFound' };
  const width = Math.max(columnCount(ctx.container), 1);
  const index = ctx.row === null ? ctx.container.rows.length : ctx.row + 1;
  const rowText = Array.from({ length: width }, () => '.').join(' | ');
  const placed = placementEdits(doc, { kind: 'rowAt', container: ctx.k, index, column: 0 }, { content: () => rowText, span: 1, comments: [], rowOnly: true });
  if ('refused' in placed) return { ok: false, messageKey: placed.refused };
  const column = Math.min(ctx.cell ?? 0, width - 1);
  return result(placed.edits, [...ctx.k, index, column], 'rowInserted');
}

/** Deletes the selection's row, with its content and the comment directly above it. */
export function deleteRow(doc: ScreenDoc, target: Path | null): OpResult {
  const ctx = context(doc, target);
  if (!ctx || ctx.row === null) return { ok: false, messageKey: 'screen.refuse.noRow' };
  if (ctx.container.rows.filter((r) => r.type === 'cells').length <= 1) {
    return { ok: false, messageKey: 'screen.refuse.lastRow' };
  }
  const row = ctx.container.rows[ctx.row]!;
  return result([rowRemovalEdit(doc.text, row)], afterRowRemoval(ctx.container, ctx.k, ctx.row), 'rowDeleted');
}

/** Inserts an empty column right of the selected cell (or at the right edge of the grid). */
export function insertColumn(doc: ScreenDoc, target: Path | null): OpResult {
  const ctx = context(doc, target);
  if (!ctx) return { ok: false, messageKey: 'screen.refuse.notFound' };
  const { container } = ctx;
  const total = columnCount(container);
  if (total === 0) return { ok: false, messageKey: 'screen.refuse.noColumns' };
  const selected = ctx.row !== null && ctx.cell !== null ? (container.rows[ctx.row] as CellsRow).cells[ctx.cell]! : null;
  const k = selected ? selected.column + selected.span : total;
  const edits: TextEdit[] = [];
  for (const row of container.rows) {
    if (row.type !== 'cells') continue;
    const crossing = row.cells.find((c) => c.column < k && c.column + c.span > k);
    const starting = row.cells.find((c) => c.column === k);
    if (crossing) edits.push({ start: crossing.range.end, end: crossing.range.end, text: ' | *' });
    else if (starting) {
      edits.push({ start: starting.range.start, end: starting.range.start, text: '. | ' });
      if (k === 0) {
        const re = refirstEdit(starting, false);
        if (re) edits.push(re);
      }
    } else if (widthOf(row) === k && k === total) {
      const last = row.cells.at(-1)!;
      edits.push({ start: last.range.end, end: last.range.end, text: ' | .' });
    }
  }
  const select = ctx.row !== null && ctx.cell !== null ? [...ctx.k, ctx.row, ctx.cell + 1] : target ?? [];
  return result(edits, select, 'columnInserted');
}

/** Deletes the selected cell's column across the grid. */
export function deleteColumn(doc: ScreenDoc, target: Path | null): OpResult {
  const ctx = context(doc, target);
  if (!ctx || ctx.row === null || ctx.cell === null) return { ok: false, messageKey: 'screen.refuse.noColumn' };
  const { container } = ctx;
  if (columnCount(container) <= 1) return { ok: false, messageKey: 'screen.refuse.lastColumn' };
  const selectedRow = container.rows[ctx.row] as CellsRow;
  const k = selectedRow.cells[ctx.cell]!.column;
  const edits: TextEdit[] = [];
  let selectedRowGone = false;
  for (const row of container.rows) {
    if (row.type !== 'cells') continue;
    const index = row.cells.findIndex((c) => c.column === k);
    const cell = row.cells[index];
    if (cell && cell.span === 1) {
      if (row.cells.length === 1) {
        edits.push(rowRemovalEdit(doc.text, row));
        if (row === selectedRow) selectedRowGone = true;
      } else edits.push(...cellRemovalEdits(row, index));
      continue;
    }
    if (cell) {
      // The column a span starts from: the rest of the span becomes empty cells.
      edits.push({ start: cell.content.range.start, end: cell.spanRanges[0]!.start, text: '' });
      for (const s of cell.spanRanges) edits.push({ start: s.start, end: s.end, text: '.' });
      continue;
    }
    const crossing = row.cells.find((c) => c.column < k && c.column + c.span > k);
    if (crossing) {
      const i = k - crossing.column - 1;
      const star = crossing.spanRanges[i]!;
      const from = i === 0 ? crossing.content.range.end : crossing.spanRanges[i - 1]!.end;
      edits.push({ start: from, end: star.end, text: '' });
    }
  }
  let select: Path;
  if (selectedRowGone) select = afterRowRemoval(container, ctx.k, ctx.row);
  else {
    const remaining = selectedRow.cells.length - (selectedRow.cells[ctx.cell]!.span === 1 ? 1 : 0);
    select = [...ctx.k, ctx.row, Math.min(ctx.cell, remaining - 1)];
  }
  return result(edits, select, 'columnDeleted');
}
