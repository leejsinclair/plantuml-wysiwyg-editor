// Moving an element (FR-002/AC3, AC4, AC13, section 3.2 "Keyboard move", FR-020/AC4).
//
// - `move` takes the element to one of its valid destinations (the same list drag and drop and "Move to…" offer).
//   The place it leaves follows the removal rule, it carries the comment directly above its row, and its span
//   is reduced to fit the destination.
// - `moveByKey` moves one position: along the axis of a single-row or single-column grid, or by swapping with the
//   neighbouring cell (empty or occupied) in a multi-row multi-column grid. At the container's edge nothing moves
//   and the refusal tells the user to use "Move to…".
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { OpResult, Path, TextEdit } from '../../types.ts';
import { applyEdits } from '../../source/edits.ts';
import { escapeSaltText } from '../escape.ts';
import { parseSalt } from '../parser.ts';
import { columnCount, type Cell, type CellContent } from '../model.ts';
import { axisOf, containerAt, isValidDestination, locate, type Destination, type ScreenDoc } from '../destinations.ts';
import { indentAt, reindent, type WriteContext } from './presets.ts';
import { insertionPoint, placementEdits, type Payload, type Placement } from './insert.ts';
import { planRemoval, rowStart, type Removal } from './remove.ts';

const moved = (edits: TextEdit[], select: Path): OpResult => ({
  ok: true,
  edits,
  select,
  announceKey: 'screen.announce.moved',
  historyName: 'screen.history.move',
});
const refuse = (messageKey: string): OpResult => ({ ok: false, messageKey });

/** A cell's content written for a position: plain text is re-escaped when its first-cell status changes. */
function contentFor(text: string, content: CellContent, ctx: Pick<WriteContext, 'indent' | 'firstCellOfRow'>): string {
  if (content.type === 'text' && !content.text.formatted) return escapeSaltText(content.text.text, { firstCellOfRow: ctx.firstCellOfRow });
  const from = indentAt(text, content.range.start);
  return reindent(text.slice(content.range.start, content.range.end), from, ctx.indent);
}

/** Maps a removal's offsets back from the edited text to the original; `null` when inside replaced text. */
function backMapper(removal: readonly TextEdit[]): (x: number) => number | null {
  const sorted = [...removal].sort((a, b) => a.start - b.start);
  return (x) => {
    let delta = 0;
    for (const e of sorted) {
      const s1 = e.start + delta;
      const e1 = s1 + e.text.length;
      if (x <= s1) return x - delta;
      if (x < e1) return null;
      delta += e.text.length - (e.end - e.start);
    }
    return x - delta;
  };
}

/** One edit from the common prefix and suffix of two texts. */
function diffEdit(before: string, after: string): TextEdit[] {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  return [{ start: p, end: before.length - s, text: after.slice(p, after.length - s) }];
}

/** Adjusts a path in the original screen for the removal, which closed a gap before it. */
function adjust(removal: Removal, path: Path): Path {
  const k = removal.containerPath;
  if (removal.mode === 'emptied' || path.length <= k.length || !k.every((v, i) => path[i] === v)) return path;
  const out = [...path];
  if (removal.mode === 'row') {
    if (out[k.length]! > removal.rowIndex) out[k.length]!--;
  } else if (out[k.length] === removal.rowIndex && out.length > k.length + 1 && out[k.length + 1]! > removal.cellIndex!) {
    out[k.length + 1]!--;
  }
  return out;
}

/** Moves the element at `target` to a valid destination. */
export function move(doc: ScreenDoc, target: Path, destination: Destination): OpResult {
  if (!isValidDestination(doc.model, target, destination)) return refuse('screen.refuse.invalidDestination');
  const at = locate(doc.model, target);
  if (!at || (at.kind !== 'cell' && at.kind !== 'separator')) return refuse('screen.refuse.invalidDestination');
  if (at.kind === 'cell' && at.cell.content.type === 'empty') return refuse('screen.refuse.moveEmpty');
  const removal = planRemoval(doc, target);
  if ('refused' in removal) return refuse(removal.refused);

  const { text } = doc;
  const comments = removal.mode === 'row' ? at.row.leadingComments.map((c) => text.slice(c.start, c.end)) : [];
  const payload: Payload =
    at.kind === 'separator'
      ? { content: () => text.slice(at.row.range.start, at.row.range.end), span: 1, comments, rowOnly: true }
      : { content: (ctx) => contentFor(text, at.cell.content, ctx), span: at.cell.span, comments, rowOnly: false };

  const text1 = applyEdits(text, removal.edits);
  const model1 = parseSalt(text1).model;
  if (!model1) return refuse('screen.refuse.invalidDestination');
  const doc1: ScreenDoc = { text: text1, model: model1 };

  // The destination in the text after removal.
  const original = containerAt(doc.model, destination.container)!;
  const k1 = adjust(removal, destination.container);
  const sameContainer = removal.mode !== 'emptied' && destination.container.join('.') === removal.containerPath.join('.');
  let place: Placement;
  if (destination.kind === 'cell') {
    let row = destination.row;
    let cell = destination.cell;
    if (sameContainer && removal.mode === 'row' && row > removal.rowIndex) row--;
    if (sameContainer && removal.mode === 'cell' && row === removal.rowIndex && cell > removal.cellIndex!) cell--;
    place = { kind: 'cell', container: k1, row, cell };
  } else if (destination.kind === 'end') {
    const p = insertionPoint(doc1, k1, payload.rowOnly);
    if ('refused' in p) return refuse(p.refused);
    place = p;
  } else {
    let index = destination.kind === 'before' ? destination.index : destination.index + 1;
    const axis = axisOf(original);
    if (sameContainer && removal.mode === 'row' && axis === 'column' && destination.index > removal.rowIndex) index--;
    if (sameContainer && removal.mode === 'cell' && axis === 'row' && destination.index > removal.cellIndex!) index--;
    place = axis === 'row' && !payload.rowOnly ? { kind: 'cellAt', container: k1, row: 0, index } : { kind: 'rowAt', container: k1, index, column: 0 };
  }
  const placed = placementEdits(doc1, place, payload);
  if ('refused' in placed) return refuse(placed.refused);

  // Both changes in the original text's offsets, or one edit when they touch.
  const back = backMapper(removal.edits);
  const mapped: TextEdit[] = [];
  for (const e of placed.edits) {
    const start = back(e.start);
    const end = back(e.end);
    if (start === null || end === null || end - start !== e.end - e.start) {
      return moved(diffEdit(text, applyEdits(text1, placed.edits)), placed.select);
    }
    mapped.push({ start, end, text: e.text });
  }
  const edits = [...removal.edits, ...mapped];
  try {
    if (applyEdits(text, edits) === applyEdits(text1, placed.edits)) return moved(edits, placed.select);
  } catch {
    // Overlapping edits: fall back to one edit.
  }
  return moved(diffEdit(text, applyEdits(text1, placed.edits)), placed.select);
}

// ------------------------------------------------------------------------------------------------ moveByKey

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

const EDGE = 'screen.refuse.moveEdge';

/** The source of a cell (content and span) written for a position as first cell or not. */
function cellSource(text: string, cell: Cell, first: boolean): string {
  const content = contentFor(text, cell.content, { indent: indentAt(text, cell.range.start), firstCellOfRow: first });
  return content + text.slice(cell.content.range.end, cell.range.end);
}

/** Swaps two cells' contents (equal spans), each re-escaped for its new position. */
function swapContents(text: string, a: Cell, aFirst: boolean, b: Cell, bFirst: boolean): TextEdit[] {
  return [
    { start: a.content.range.start, end: a.content.range.end, text: contentFor(text, b.content, { indent: indentAt(text, a.range.start), firstCellOfRow: aFirst }) },
    { start: b.content.range.start, end: b.content.range.end, text: contentFor(text, a.content, { indent: indentAt(text, b.range.start), firstCellOfRow: bFirst }) },
  ];
}

export function moveByKey(doc: ScreenDoc, target: Path, dir: MoveDirection): OpResult {
  const at = locate(doc.model, target);
  if (!at || (at.kind !== 'cell' && at.kind !== 'separator')) return refuse(EDGE);
  const { text } = doc;
  const k = at.containerPath;
  const container = at.container;
  const axis = axisOf(container);
  const r = at.rowIndex;

  // Rows swap whole, with their comments: down a single-column grid, or a separator in any grid.
  const swapRows = (other: number): OpResult => {
    const a = container.rows[Math.min(r, other)]!;
    const b = container.rows[Math.max(r, other)]!;
    const aText = text.slice(rowStart(a), a.range.end);
    const bText = text.slice(rowStart(b), b.range.end);
    const edits: TextEdit[] = [
      { start: rowStart(a), end: a.range.end, text: bText },
      { start: rowStart(b), end: b.range.end, text: aText },
    ];
    return moved(edits, at.kind === 'separator' ? [...k, other] : [...k, other, 0]);
  };

  if (at.kind === 'separator' || axis === 'column') {
    if (dir === 'left' || dir === 'right') return refuse(EDGE);
    const other = dir === 'up' ? r - 1 : r + 1;
    if (other < 0 || other >= container.rows.length) return refuse(EDGE);
    return swapRows(other);
  }

  const { row, cell, cellIndex: c } = at;
  if (axis === 'row') {
    if (dir === 'up' || dir === 'down') return refuse(EDGE);
    const o = dir === 'left' ? c - 1 : c + 1;
    if (o < 0 || o >= row.cells.length) return refuse(EDGE);
    const other = row.cells[o]!;
    const lo = Math.min(c, o);
    const [a, b] = lo === c ? [cell, other] : [other, cell];
    if (lo === 0 && b.span > 1) return refuse('screen.refuse.moveSpan');
    const edits: TextEdit[] = [
      { start: a.range.start, end: a.range.end, text: cellSource(text, b, lo === 0) },
      { start: b.range.start, end: b.range.end, text: cellSource(text, a, false) },
    ];
    return moved(edits, [...k, r, o]);
  }

  // A multi-row multi-column grid: swap with the neighbouring cell.
  if (dir === 'left' || dir === 'right') {
    const o = dir === 'left' ? c - 1 : c + 1;
    const other = row.cells[o];
    if (!other) {
      // Moving right past the end of a short row adds a cell to that row only (EC-02).
      if (dir === 'right' && cell.span === 1 && cell.column + 1 < columnCount(container)) {
        const edits: TextEdit[] = [
          { start: cell.content.range.start, end: cell.content.range.end, text: '.' },
          { start: cell.range.end, end: cell.range.end, text: ` | ${contentFor(text, cell.content, { indent: indentAt(text, cell.range.start), firstCellOfRow: false })}` },
        ];
        return moved(edits, [...k, r, c + 1]);
      }
      return refuse(EDGE);
    }
    if (other.span !== cell.span) return refuse('screen.refuse.moveSpan');
    if (cell.span > 1 && Math.min(c, o) === 0) return refuse('screen.refuse.moveSpan');
    return moved(swapContents(text, cell, c === 0, other, o === 0), [...k, r, o]);
  }
  const o = dir === 'up' ? r - 1 : r + 1;
  const targetRow = container.rows[o];
  if (!targetRow || targetRow.type !== 'cells') return refuse(EDGE);
  const other = targetRow.cells.find((x) => x.column === cell.column);
  if (!other) {
    const covering = targetRow.cells.find((x) => x.column < cell.column && x.column + x.span > cell.column);
    const width = targetRow.cells.reduce((w, x) => Math.max(w, x.column + x.span), 0);
    if (covering || cell.span !== 1) return refuse('screen.refuse.moveSpan');
    // A short row gets the cells it needs, and only that row changes (EC-02).
    const last = targetRow.cells.at(-1)!;
    const pad = ' | .'.repeat(cell.column - width);
    const content = contentFor(text, cell.content, { indent: indentAt(text, last.range.start), firstCellOfRow: false });
    return moved(
      [
        { start: cell.content.range.start, end: cell.content.range.end, text: '.' },
        { start: last.range.end, end: last.range.end, text: `${pad} | ${content}` },
      ],
      [...k, o, targetRow.cells.length + (cell.column - width)],
    );
  }
  if (other.span !== cell.span) return refuse('screen.refuse.moveSpan');
  const oIndex = targetRow.cells.indexOf(other);
  return moved(swapContents(text, cell, c === 0, other, oIndex === 0), [...k, o, oIndex]);
}
