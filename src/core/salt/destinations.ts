// Screen addressing and move destinations (section 3.2, R-7, contracts/core-api.md §3).
//
// Paths. A path is a list of child indexes from the root grid ([]): a row index, then a cell index, then (when the
// cell holds a grid or a scroll area) the next row and cell, and so on. A path of odd length names a row: a row of
// cells, or a separator row, which is an element in its own right. So [1, 0] is the first cell of the root grid's
// second row, and [1, 0, 0, 2] the third cell of the first row of the grid in that cell.
//
// Destinations are shared by drag and drop and "Move to…": for each valid container its empty cells and "at the
// end", and for single-row or single-column containers "before" or "after" each element.
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { Path } from '../types.ts';
import type { Cell, CellContent, CellsRow, Container, Row, SaltScreen, SeparatorRow } from './model.ts';
import { parseSalt } from './parser.ts';

/** A Salt block's text (block-relative offsets) and its screen model. Operations return block-relative edits. */
export interface ScreenDoc {
  readonly text: string;
  readonly model: SaltScreen;
}

/** The document of a block's text, or `null` when it is not a visually editable screen. */
export function screenDoc(text: string): ScreenDoc | null {
  const model = parseSalt(text).model;
  return model ? { text, model } : null;
}

export type Located =
  | { readonly kind: 'container'; readonly path: Path; readonly container: Container }
  | {
      readonly kind: 'row';
      readonly path: Path;
      readonly row: CellsRow;
      readonly container: Container;
      readonly containerPath: Path;
      readonly rowIndex: number;
    }
  | {
      readonly kind: 'separator';
      readonly path: Path;
      readonly row: SeparatorRow;
      readonly container: Container;
      readonly containerPath: Path;
      readonly rowIndex: number;
    }
  | {
      readonly kind: 'cell';
      readonly path: Path;
      readonly cell: Cell;
      readonly row: CellsRow;
      readonly container: Container;
      readonly containerPath: Path;
      readonly rowIndex: number;
      readonly cellIndex: number;
    };

export const isContainer = (c: CellContent | null | undefined): c is Container => c?.type === 'grid' || c?.type === 'scrollArea';

/** What `path` points at, or `null` when it does not exist. The root grid is a container at []. */
export function locate(model: SaltScreen, path: Path): Located | null {
  let container: Container = model.root;
  let containerPath: Path = [];
  let i = 0;
  if (path.length === 0) return { kind: 'container', path, container };
  for (;;) {
    const rowIndex = path[i]!;
    const row: Row | undefined = container.rows[rowIndex];
    if (!row) return null;
    if (i + 1 === path.length) {
      return row.type === 'separator'
        ? { kind: 'separator', path, row, container, containerPath, rowIndex }
        : { kind: 'row', path, row, container, containerPath, rowIndex };
    }
    if (row.type !== 'cells') return null;
    const cellIndex = path[i + 1]!;
    const cell: Cell | undefined = row.cells[cellIndex];
    if (!cell) return null;
    if (i + 2 === path.length) return { kind: 'cell', path, cell, row, container, containerPath, rowIndex, cellIndex };
    if (!isContainer(cell.content)) return null;
    container = cell.content;
    containerPath = path.slice(0, i + 2);
    i += 2;
  }
}

/** The container at `path` ([] for the root grid, or a cell holding a grid or scroll area). */
export function containerAt(model: SaltScreen, path: Path): Container | null {
  const at = locate(model, path);
  if (!at) return null;
  if (at.kind === 'container') return at.container;
  return at.kind === 'cell' && isContainer(at.cell.content) ? at.cell.content : null;
}

/**
 * The axis along which a container grows: `row` for a single-row grid (1 × N), `column` for a single-column grid
 * (N × 1) or an empty one, `null` for a multi-row multi-column grid. A 1 × 1 grid grows down, except one whose only
 * element is a button, which grows across (EC-04).
 */
export function axisOf(c: Container): 'row' | 'column' | null {
  const rows = c.rows;
  if (rows.length === 0) return 'column';
  const first = rows[0]!;
  if (rows.length === 1 && first.type === 'cells' && first.cells.length > 1) return 'row';
  if (rows.length === 1 && first.type === 'cells' && first.cells.length === 1) {
    return first.cells[0]!.content.type === 'button' ? 'row' : 'column';
  }
  return rows.every((r) => r.type === 'separator' || r.cells.length <= 1) ? 'column' : null;
}

/** Every container in the screen, outermost first, in source order. */
export function containers(model: SaltScreen): { path: Path; container: Container }[] {
  const out: { path: Path; container: Container }[] = [];
  const walk = (container: Container, path: Path): void => {
    out.push({ path, container });
    container.rows.forEach((row, r) => {
      if (row.type !== 'cells') return;
      row.cells.forEach((cell, c) => {
        if (isContainer(cell.content)) walk(cell.content, [...path, r, c]);
      });
    });
  };
  walk(model.root, []);
  return out;
}

/** The element positions of a single-axis container: cell indexes along a row, row indexes down a column. */
export function axisElements(c: Container): number[] {
  const axis = axisOf(c);
  if (axis === 'row') return (c.rows[0] as CellsRow).cells.map((_, i) => i);
  if (axis === 'column') return c.rows.map((_, i) => i);
  return [];
}

/** The path of the element at an axis position of the container at `containerPath`. */
export function axisPath(c: Container, containerPath: Path, index: number): Path {
  if (axisOf(c) === 'row') return [...containerPath, 0, index];
  const row = c.rows[index];
  return row?.type === 'separator' ? [...containerPath, index] : [...containerPath, index, 0];
}

export type Destination =
  | { readonly kind: 'cell'; readonly container: Path; readonly row: number; readonly cell: number }
  | { readonly kind: 'end'; readonly container: Path }
  | { readonly kind: 'before' | 'after'; readonly container: Path; readonly index: number };

export function destinationKey(d: Destination): string {
  const c = d.container.join('.');
  switch (d.kind) {
    case 'cell':
      return `cell:${c}:${d.row}.${d.cell}`;
    case 'end':
      return `end:${c}`;
    default:
      return `${d.kind}:${c}:${d.index}`;
  }
}

const startsWith = (path: Path, prefix: Path): boolean => prefix.length <= path.length && prefix.every((v, i) => path[i] === v);
export const samePath = (a: Path, b: Path): boolean => a.length === b.length && startsWith(a, b);

/**
 * Every valid destination for moving the element at `target` (section 3.2). Containers inside the moved element
 * and the element's own place are never offered. A separator fills a whole row, so it goes only before or after
 * the elements of single-column containers, or at the end of a container that grows by rows.
 */
export function validDestinations(model: SaltScreen, target: Path): Destination[] {
  const at = locate(model, target);
  if (!at || (at.kind !== 'cell' && at.kind !== 'separator')) return [];
  const separator = at.kind === 'separator';
  const out: Destination[] = [];
  for (const { path, container } of containers(model)) {
    if (startsWith(path, target)) continue;
    const axis = axisOf(container);
    if (separator && axis === 'row') continue;
    if (!separator) {
      container.rows.forEach((row, r) => {
        if (row.type !== 'cells') return;
        row.cells.forEach((cell, c) => {
          if (cell.content.type === 'empty') out.push({ kind: 'cell', container: path, row: r, cell: c });
        });
      });
    }
    if (axis !== null) {
      for (const index of axisElements(container)) {
        const p = axisPath(container, path, index);
        if (samePath(p, target)) continue;
        const el = locate(model, p);
        if (el?.kind === 'cell' && el.cell.content.type === 'empty') continue;
        out.push({ kind: 'before', container: path, index }, { kind: 'after', container: path, index });
      }
    }
    out.push({ kind: 'end', container: path });
  }
  return out;
}

/** Whether `d` is one of the valid destinations for `target`. */
export function isValidDestination(model: SaltScreen, target: Path, d: Destination): boolean {
  const key = destinationKey(d);
  return validDestinations(model, target).some((v) => destinationKey(v) === key);
}
