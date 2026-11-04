// Grid labels (FR-002/AC14, section 3.2 "Grid labels", data-model §5.2 Grid). A grid's label is derived from its
// style, shape and content with a fixed precedence, so a file reopens with the same labels without any stored
// metadata. The values are label identifiers; the interface shows them through the message catalogue.
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import { columnCount, type CellContent, type Container, type Grid } from './model.ts';

export type GridLabel = 'Table' | 'Button bar' | 'Form' | 'Row' | 'Column' | 'Grid';

const CONTROLS: ReadonlySet<CellContent['type']> = new Set(['textField', 'button', 'checkbox', 'radioButton', 'dropDown']);

/** (3) Two columns; at least one row of text then a control; no row breaks that pattern except with empty cells. */
function isForm(grid: Container): boolean {
  if (columnCount(grid) !== 2) return false;
  let matched = false;
  for (const row of grid.rows) {
    if (row.type !== 'cells') return false;
    const [first, second] = row.cells;
    if (row.cells.some((c) => c.span > 1)) return false;
    const a = first?.content.type ?? 'empty';
    const b = second?.content.type ?? 'empty';
    if (a !== 'text' && a !== 'empty') return false;
    if (b !== 'empty' && !CONTROLS.has(b)) return false;
    if (a === 'text' && b !== 'empty') matched = true;
  }
  return matched;
}

/** The label of a grid, by the fixed precedence of section 3.2. */
export function gridLabel(grid: Grid | Container): GridLabel {
  if (grid.type === 'grid' && grid.style === 'tableLines') return 'Table';
  const [only] = grid.rows;
  const oneRow = grid.rows.length === 1 && only?.type === 'cells';
  if (oneRow && only.cells.length > 0 && only.cells.every((c) => c.content.type === 'button')) return 'Button bar';
  if (isForm(grid)) return 'Form';
  if (oneRow) return 'Row';
  if (grid.rows.length > 0 && columnCount(grid) <= 1) return 'Column';
  return 'Grid';
}
