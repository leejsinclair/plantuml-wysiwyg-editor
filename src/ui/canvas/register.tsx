// Registers the screen block editor (T081; FR-002/AC12, FR-009/AC3, FR-016/AC5–AC6, contracts/ui.md §5–§8).
//
// - blockEditors 'screen': Canvas, Outline, Palette, Properties, commands, pathLabels, destinations, hasPath.
// - Commands: Select parent (Esc), Move to… (F8), Wrap, Wrap in group box, Unwrap, Delete (Delete),
//   Insert row (Ctrl+Shift+Enter), Delete row, Insert column, Delete column.
// - pathLabels: ["Screen", rootGridLabel, one label per path segment] — length path.length+2.
import type { Slots } from '../app/slots.ts';
import { slots as appSlots } from '../app/slots.ts';
import { locate, validDestinations, type Destination } from '../../core/salt/destinations.ts';
import { gridLabel } from '../../core/salt/labels.ts';
import { t } from '../messages/en.ts';
import type { SaltScreen } from '../../core/salt/model.ts';
import type { Path } from '../../core/types.ts';
import { SaltCanvas } from './SaltCanvas.tsx';
import { Palette } from '../palette/Palette.tsx';
import { ScreenOutline } from '../outline/screen-outline.tsx';
import { SaltProperties } from '../properties/salt-properties.tsx';
import type { Store } from '../app/store.ts';
import type { CanvasContext } from './canvas-keys.ts';
import {
  cmdDelete, cmdInsertRow, cmdDeleteRow, cmdInsertColumn, cmdDeleteColumn,
  cmdWrap, cmdUnwrap, cmdMoveTo,
} from './canvas-keys.ts';
import { moveTo as appMoveTo } from '../workspace/MoveToDialog.tsx';

function canvasCtx(store: Store, blockKey: string): CanvasContext | null {
  const view = store.getSnapshot().blocks.find((b) => b.key === blockKey);
  if (!view) return null;
  return { blockKey, view, store, moveToController: appMoveTo };
}

// ─── pathLabels ──────────────────────────────────────────────────────────────────────────────────

/**
 * Breadcrumb labels from the block to the element at `path`.
 * Returns: ["Screen", rootGridLabel, ...one label per path index].
 * Length = path.length + 2 when the root is identified, but the root label takes place of index [].
 * The Breadcrumb maps labels[i] to path prefix, with labels[0] = root and labels[-1] = the selection.
 */
function screenPathLabels(model: SaltScreen, path: Path): string[] {
  const rootLabel = t(`screen.label.${gridLabel(model.root)}`);
  // For an empty path (root selected), just return Screen and the root label.
  if (path.length === 0) return [t('screen.label.Screen'), rootLabel];

  // Build labels: ["Screen", rootGridLabel, ...one per path element].
  const labels: string[] = [t('screen.label.Screen'), rootLabel];
  // Walk the path and collect labels.
  let current: Path = [];
  for (let i = 0; i < path.length; i++) {
    current = [...current, path[i]!];
    const at = locate(model, current);
    if (!at) break;
    switch (at.kind) {
      case 'row':
        labels.push(t('screen.label.rowN', { n: at.rowIndex + 1 }));
        break;
      case 'separator':
        labels.push(t('screen.type.separator'));
        break;
      case 'cell': {
        const c = at.cell.content;
        if (c.type === 'grid') {
          labels.push(t(`screen.label.${gridLabel(c)}`));
          // Skip to the next part (container is both at odd and even depth).
        } else if (c.type === 'scrollArea') {
          labels.push(t('screen.type.scrollArea'));
        } else if (c.type === 'empty') {
          labels.push(t('screen.type.empty'));
        } else if (c.type === 'locked') {
          labels.push(t('screen.type.locked'));
        } else {
          // Leaf element type.
          labels.push(elementTypeName(c));
        }
        break;
      }
      case 'container': {
        const c = at.container;
        if (c.type === 'grid') {
          labels.push(t(`screen.label.${gridLabel(c)}`));
        } else {
          labels.push(t('screen.type.scrollArea'));
        }
        break;
      }
    }
  }
  return labels;
}

function elementTypeName(content: import('../../core/salt/model.ts').CellContent): string {
  switch (content.type) {
    case 'text': return t('screen.type.text');
    case 'button': return t('screen.type.button');
    case 'textField': return t('screen.type.textField');
    case 'checkbox': return t('screen.type.checkbox');
    case 'radioButton': return t('screen.type.radioButton');
    case 'dropDown': return t('screen.type.dropDown');
    case 'tree': return t('screen.type.tree');
    case 'tabBar': return t('screen.type.tabBar');
    case 'menuBar': return t('screen.type.menuBar');
    default: return t('screen.type.grid');
  }
}

// ─── hasPath ─────────────────────────────────────────────────────────────────────────────────────
function saltHasPath(model: SaltScreen, path: Path): boolean {
  if (path.length === 0) return true;
  return locate(model, path) !== null;
}

// ─── Register ────────────────────────────────────────────────────────────────────────────────────

export function registerScreenEditor(slots: Slots): () => void {
  const unregisterEditor = slots.blockEditors.register('screen', {
    Canvas: SaltCanvas,
    Outline: ScreenOutline,
    Palette: Palette,
    Properties: SaltProperties,
    commands: [
      {
        id: 'screen.selectParent',
        labelKey: 'screen.command.selectParent',
        shortcut: 'cancel',
        order: 10,
        isVisible(ctx) { return ctx.block?.kind === 'screen' && ctx.selection !== null && (ctx.selection?.length ?? 0) > 0; },
        run(ctx, s) {
          if (!ctx.selection || ctx.selection.length === 0) return;
          const store = s as Store;
          const parent = ctx.selection.length >= 2 ? ctx.selection.slice(0, -2) : [];
          store.select(parent);
        },
      },
      {
        id: 'screen.moveTo',
        labelKey: 'screen.command.moveTo',
        order: 20,
        isVisible(ctx) { return ctx.block?.kind === 'screen' && ctx.selection !== null; },
        isEnabled(ctx) { return !ctx.block?.readOnly; },
        run(ctx, s) {
          if (!ctx.block) return;
          const ctx2 = canvasCtx(s as Store, ctx.block.key);
          if (ctx2) cmdMoveTo(ctx.selection, ctx2);
        },
      },
      {
        id: 'screen.delete',
        labelKey: 'screen.command.delete',
        order: 30,
        isVisible(ctx) { return ctx.block?.kind === 'screen' && ctx.selection !== null; },
        isEnabled(ctx) { return !ctx.block?.readOnly; },
        run(ctx, s) {
          if (!ctx.block) return;
          const ctx2 = canvasCtx(s as Store, ctx.block.key);
          if (ctx2) cmdDelete(ctx.selection, ctx2);
        },
      },
      {
        id: 'screen.insertRow',
        labelKey: 'screen.command.insertRow',
        shortcut: [{ key: 'Enter', mod: true, shift: true }],
        order: 40,
        isVisible(ctx) { return ctx.block?.kind === 'screen'; },
        isEnabled(ctx) { return !ctx.block?.readOnly; },
        run(ctx, s) {
          if (!ctx.block) return;
          const ctx2 = canvasCtx(s as Store, ctx.block.key);
          if (ctx2) cmdInsertRow(ctx.selection, ctx2);
        },
      },
      {
        id: 'screen.deleteRow',
        labelKey: 'screen.command.deleteRow',
        shortcut: [{ key: 'Delete', mod: true, shift: true }],
        order: 41,
        isVisible(ctx) { return ctx.block?.kind === 'screen'; },
        isEnabled(ctx) { return !ctx.block?.readOnly; },
        run(ctx, s) {
          if (!ctx.block) return;
          const ctx2 = canvasCtx(s as Store, ctx.block.key);
          if (ctx2) cmdDeleteRow(ctx.selection, ctx2);
        },
      },
      {
        id: 'screen.insertColumn',
        labelKey: 'screen.command.insertColumn',
        shortcut: [{ key: 'Enter', mod: true, shift: true, alt: true }],
        order: 42,
        isVisible(ctx) { return ctx.block?.kind === 'screen'; },
        isEnabled(ctx) { return !ctx.block?.readOnly; },
        run(ctx, s) {
          if (!ctx.block) return;
          const ctx2 = canvasCtx(s as Store, ctx.block.key);
          if (ctx2) cmdInsertColumn(ctx.selection, ctx2);
        },
      },
      {
        id: 'screen.deleteColumn',
        labelKey: 'screen.command.deleteColumn',
        shortcut: [{ key: 'Delete', mod: true, shift: true, alt: true }],
        order: 43,
        isVisible(ctx) { return ctx.block?.kind === 'screen'; },
        isEnabled(ctx) { return !ctx.block?.readOnly; },
        run(ctx, s) {
          if (!ctx.block) return;
          const ctx2 = canvasCtx(s as Store, ctx.block.key);
          if (ctx2) cmdDeleteColumn(ctx.selection, ctx2);
        },
      },
      {
        id: 'screen.wrap',
        labelKey: 'screen.command.wrap',
        order: 50,
        isVisible(ctx) { return ctx.block?.kind === 'screen' && ctx.selection !== null; },
        isEnabled(ctx) { return !ctx.block?.readOnly; },
        run(ctx, s) {
          if (!ctx.block) return;
          const ctx2 = canvasCtx(s as Store, ctx.block.key);
          if (ctx2) cmdWrap(ctx.selection, ctx2, 'grid');
        },
      },
      {
        id: 'screen.wrapGroup',
        labelKey: 'screen.command.wrapGroup',
        order: 51,
        isVisible(ctx) { return ctx.block?.kind === 'screen' && ctx.selection !== null; },
        isEnabled(ctx) { return !ctx.block?.readOnly; },
        run(ctx, s) {
          if (!ctx.block) return;
          const ctx2 = canvasCtx(s as Store, ctx.block.key);
          if (ctx2) cmdWrap(ctx.selection, ctx2, 'group box');
        },
      },
      {
        id: 'screen.unwrap',
        labelKey: 'screen.command.unwrap',
        order: 52,
        isVisible(ctx) { return ctx.block?.kind === 'screen' && ctx.selection !== null; },
        isEnabled(ctx) { return !ctx.block?.readOnly; },
        run(ctx, s) {
          if (!ctx.block) return;
          const ctx2 = canvasCtx(s as Store, ctx.block.key);
          if (ctx2) cmdUnwrap(ctx.selection, ctx2);
        },
      },
    ],
    pathLabels: screenPathLabels,
    destinations(model: SaltScreen, target: Path): Destination[] {
      return validDestinations(model, target);
    },
    hasPath: saltHasPath,
  });

  return () => {
    unregisterEditor();
  };
}

// Register into the application slots eagerly (main.tsx imports this).
registerScreenEditor(appSlots);
