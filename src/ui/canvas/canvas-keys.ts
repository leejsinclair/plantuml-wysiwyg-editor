// Canvas action layer (T077; FR-002/AC2–AC4, AC8, AC12–AC13, FR-009/AC3, AC10).
// Prepares operations from key events and selection, shifting block-relative TextEdits to file-absolute,
// enriching announce params with element description and type, and calling the store.
//
// All screen ops work on block-relative offsets; the UI shifts them by view.start before applying.

import type { Path, TextEdit } from '../../core/types.ts';
import type { BlockView } from '../../core/project/project.ts';
import type { Store } from '../app/store.ts';
import type { MoveToController } from '../workspace/MoveToDialog.tsx';
import { screenDoc } from '../../core/salt/destinations.ts';
import { destinationKey, validDestinations, type Destination } from '../../core/salt/destinations.ts';
import { locate } from '../../core/salt/destinations.ts';
import { gridLabel } from '../../core/salt/labels.ts';
import { remove } from '../../core/salt/ops/remove.ts';
import { move, moveByKey, type MoveDirection } from '../../core/salt/ops/move.ts';
import { wrap, unwrap } from '../../core/salt/ops/wrap.ts';
import { insert } from '../../core/salt/ops/insert.ts';
import { insertRow, deleteRow, insertColumn, deleteColumn } from '../../core/salt/ops/rows-columns.ts';
import { PALETTE_CATEGORIES, type PaletteChoice } from '../../core/salt/ops/presets.ts';
import { t } from '../messages/en.ts';
import type { OpResult } from '../../core/types.ts';

export interface CanvasContext {
  readonly blockKey: string;
  readonly view: BlockView;
  readonly store: Store;
  /** Only on the `moveTo` command. */
  readonly moveToController?: MoveToController;
}

/** Shift block-relative edits to file-absolute. */
export function shiftEdits(edits: readonly TextEdit[], offset: number): TextEdit[] {
  return edits.map((e) => ({ start: e.start + offset, end: e.end + offset, text: e.text }));
}

/** Apply a block-relative OpResult to the store, shifting edits to file offsets. */
export function applyOp(op: OpResult, ctx: CanvasContext): boolean {
  if (!op.ok) {
    ctx.store.applyOp(op); // Let the store announce the refusal.
    return false;
  }
  const shifted: OpResult = {
    ...op,
    edits: shiftEdits(op.edits, ctx.view.start),
  };
  return ctx.store.applyOp(shifted, { blockKey: ctx.blockKey });
}

/** Returns the block text and a ScreenDoc, or null if not parseable. */
export function docFor(ctx: CanvasContext): ReturnType<typeof screenDoc> {
  const state = ctx.store.getState();
  if (!state) return null;
  const text = state.source.slice(ctx.view.start, ctx.view.end);
  return screenDoc(text);
}

// ─── Commands ─────────────────────────────────────────────────────────────────────────────────────

export function cmdDelete(selection: Path | null, ctx: CanvasContext): boolean {
  if (selection === null) return false;
  const doc = docFor(ctx);
  if (!doc) return false;
  return applyOp(remove(doc, selection), ctx);
}

export function cmdMoveByKey(selection: Path | null, dir: MoveDirection, ctx: CanvasContext): boolean {
  if (selection === null) return false;
  const doc = docFor(ctx);
  if (!doc) return false;
  return applyOp(moveByKey(doc, selection, dir), ctx);
}

export function cmdMoveTo(selection: Path | null, ctx: CanvasContext): void {
  if (selection === null || !ctx.moveToController) return;
  const doc = docFor(ctx);
  if (!doc) return;
  const destinations = validDestinations(doc.model, selection);
  if (destinations.length === 0) return;

  // Group destinations by container for the tree.
  interface GroupedDest {
    containerPath: Path;
    label: string;
    items: Array<{ dest: Destination; label: string }>;
  }
  const groups = new Map<string, GroupedDest>();
  for (const dest of destinations) {
    const cKey = dest.container.join(',');
    if (!groups.has(cKey)) {
      const loc = locate(doc.model, dest.container);
      const container = loc?.kind === 'container' ? loc.container : null;
      const label = container
        ? (container.type === 'grid' ? t(`screen.label.${describeGrid(doc, dest.container)}`) : t('screen.type.scrollArea'))
        : t('screen.label.Grid');
      groups.set(cKey, { containerPath: dest.container, label, items: [] });
    }
    const group = groups.get(cKey)!;
    group.items.push({ dest, label: destLabel(dest) });
  }

  const nodes = [...groups.values()].map((g, gi) => ({
    id: `c-${gi}`,
    label: g.label,
    children: g.items.map((item) => ({
      id: destinationKey(item.dest),
      label: item.label,
      destination: item.dest,
    })),
  }));

  ctx.moveToController.open({
    nodes,
    onMove: (dest: Destination) => {
      const d2 = docFor(ctx);
      if (!d2 || !selection) return;
      applyOp(move(d2, selection, dest), ctx);
    },
  });
}

export function cmdWrap(selection: Path | null, ctx: CanvasContext, as: 'grid' | 'group box'): boolean {
  if (selection === null) return false;
  const doc = docFor(ctx);
  if (!doc) return false;
  return applyOp(wrap(doc, selection, as), ctx);
}

export function cmdUnwrap(selection: Path | null, ctx: CanvasContext): boolean {
  if (selection === null) return false;
  const doc = docFor(ctx);
  if (!doc) return false;
  return applyOp(unwrap(doc, selection), ctx);
}

export function cmdInsertRow(selection: Path | null, ctx: CanvasContext): boolean {
  const doc = docFor(ctx);
  if (!doc) return false;
  return applyOp(insertRow(doc, selection), ctx);
}

export function cmdDeleteRow(selection: Path | null, ctx: CanvasContext): boolean {
  const doc = docFor(ctx);
  if (!doc) return false;
  return applyOp(deleteRow(doc, selection), ctx);
}

export function cmdInsertColumn(selection: Path | null, ctx: CanvasContext): boolean {
  const doc = docFor(ctx);
  if (!doc) return false;
  return applyOp(insertColumn(doc, selection), ctx);
}

export function cmdDeleteColumn(selection: Path | null, ctx: CanvasContext): boolean {
  const doc = docFor(ctx);
  if (!doc) return false;
  return applyOp(deleteColumn(doc, selection), ctx);
}

export function cmdInsert(selection: Path | null, choice: PaletteChoice, ctx: CanvasContext): boolean {
  const doc = docFor(ctx);
  if (!doc) return false;
  return applyOp(insert(doc, selection, choice), ctx);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────────────

function describeGrid(doc: ReturnType<typeof screenDoc>, path: Path): string {
  if (!doc) return 'Grid';
  const loc = locate(doc.model, path);
  if (loc?.kind === 'container' && loc.container.type === 'grid') {
    return gridLabel(loc.container);
  }
  return 'Grid';
}

function destLabel(dest: Destination): string {
  switch (dest.kind) {
    case 'cell':
      return t('screen.describe.noText', { type: t('screen.type.empty'), row: dest.row + 1, column: dest.cell + 1, container: '' }).trim();
    case 'end':
      return 'At the end';
    case 'before':
      return `Before item ${dest.index + 1}`;
    case 'after':
      return `After item ${dest.index + 1}`;
  }
}

// ─── Navigation (arrow keys, no modifiers) ────────────────────────────────────────────────────────

import type { SaltScreen } from '../../core/salt/model.ts';

/**
 * The next cell in the given direction within the same container, or null if at the edge.
 * Direction is relative to row/column layout: up/down change rowIndex, left/right change colIndex.
 */
export function navigateCell(model: SaltScreen, path: Path, dir: 'up' | 'down' | 'left' | 'right'): Path | null {
  const at = locate(model, path);
  if (!at) return null;

  // For a cell at path [...containerPath, rowIndex, cellIndex]:
  if (at.kind !== 'cell') {
    // For a separator row at [...containerPath, rowIndex]:
    if (at.kind === 'separator' || at.kind === 'row') {
      const container = at.container;
      const ri = at.rowIndex;
      if (dir === 'up' && ri > 0) return [...at.containerPath, ri - 1];
      if (dir === 'down' && ri < container.rows.length - 1) return [...at.containerPath, ri + 1];
    }
    return null;
  }

  const container = at.container;
  const containerPath = at.containerPath;
  const ri = at.rowIndex;
  const ci = at.cellIndex;

  if (dir === 'left') {
    if (ci > 0) return [...containerPath, ri, ci - 1];
    return null;
  }
  if (dir === 'right') {
    const row = container.rows[ri];
    if (row && row.type === 'cells' && ci < row.cells.length - 1) return [...containerPath, ri, ci + 1];
    return null;
  }
  if (dir === 'up') {
    // Try to go to the same column in the previous row.
    for (let r = ri - 1; r >= 0; r--) {
      const row = container.rows[r];
      if (!row) continue;
      if (row.type === 'separator') return [...containerPath, r];
      if (row.type === 'cells' && ci < row.cells.length) return [...containerPath, r, ci];
      if (row.type === 'cells' && row.cells.length > 0) return [...containerPath, r, row.cells.length - 1];
    }
    return null;
  }
  if (dir === 'down') {
    for (let r = ri + 1; r < container.rows.length; r++) {
      const row = container.rows[r];
      if (!row) continue;
      if (row.type === 'separator') return [...containerPath, r];
      if (row.type === 'cells' && ci < row.cells.length) return [...containerPath, r, ci];
      if (row.type === 'cells' && row.cells.length > 0) return [...containerPath, r, row.cells.length - 1];
    }
    return null;
  }
  return null;
}

export { validDestinations, destinationKey, type Destination, type PaletteChoice, PALETTE_CATEGORIES };
