// CellView: one cell in the canvas grid (T077; FR-009/AC3, FR-016/AC5–AC6, VO-057, VO-096).
// Renders the cell content Salt-like and handles selection, focus, keyboard and inline editing.
import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { Path } from '../../core/types.ts';
import type { CellContent, Grid, ScrollArea, SaltScreen } from '../../core/salt/model.ts';
import type { CanvasContext } from './canvas-keys.ts';
import { cmdMoveByKey, navigateCell } from './canvas-keys.ts';
import { screenDoc } from '../../core/salt/destinations.ts';
import { mainTextProperty, setProperty } from '../../core/salt/ops/properties.ts';
import { shiftEdits } from './canvas-keys.ts';
import { t } from '../messages/en.ts';
import { InlineEdit } from './InlineEdit.tsx';
import {
  TextComponent, ButtonComponent, TextFieldComponent, CheckboxComponent,
  RadioButtonComponent, DropDownComponent, TreeComponent, TabBarComponent,
  MenuBarComponent, EmptyCellMarker,
} from './components.tsx';
import { LockedPlaceholder } from '../workspace/LockedPlaceholder.tsx';
import { keyCommand } from '../keys.ts';
import type { Platform } from '../keys.ts';
import { useDragSource } from '../workspace/dnd.tsx';
import { axisOf } from '../../core/salt/destinations.ts';
import type { Path as ZonePath } from '../../core/types.ts';
import { DropZone } from './DropZone.tsx';
import { CanvasContextMenu } from './CanvasContextMenu.tsx';

export interface CellViewProps {
  readonly path: Path;
  readonly content: CellContent;
  readonly container: Grid | ScrollArea;
  readonly rowIndex: number;
  readonly colIndex: number;
  /** 0-based start column and columns covered, for explicit placement in the parent grid. */
  readonly column?: number;
  readonly span?: number;
  /** Path of the container this cell sits in, for the drop zones' destination keys. */
  readonly containerPath?: ZonePath;
  readonly selected: boolean;
  readonly showGuides: boolean;
  readonly readOnly: boolean;
  readonly platform: Platform;
  readonly ctx: CanvasContext;
  /** The full screen model for navigation. */
  readonly model: SaltScreen;
  onSelect(path: Path): void;
  onSelectParent(): void;
  onEnterContainer(path: Path): void;
  /** The nested container's own view, for a grid or scroll area cell. */
  readonly nested?: React.ReactNode;
}

function elementTypeName(content: CellContent): string {
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
    case 'grid': return t('screen.type.grid');
    case 'scrollArea': return t('screen.type.scrollArea');
    case 'empty': return t('screen.type.empty');
    case 'locked': return t('screen.type.locked');
  }
}

function elementText(content: CellContent): string | null {
  const m = mainTextProperty(content);
  return m ? m.value.text : null;
}

function ariaLabel(content: CellContent, row: number, col: number, containerLabel: string): string {
  const type = elementTypeName(content);
  const text = elementText(content);
  if (text) {
    return t('screen.describe.withText', { type, text, row, column: col, container: containerLabel });
  }
  return t('screen.describe.noText', { type, row, column: col, container: containerLabel });
}

export function CellView({
  path, content, container, rowIndex, colIndex, column, span, containerPath, selected, showGuides, readOnly, platform, ctx, model, onSelect, onSelectParent, onEnterContainer, nested,
}: CellViewProps) {
  const [editing, setEditing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const pathKey = path.join(',');
  const { setNodeRef: setDragRef, listeners: dragListeners, isDragging } = useDragSource(pathKey, readOnly);

  const containerLabel = t('screen.label.Grid'); // simplified; full label comes from the parent SaltCanvas

  // Drop zones for this cell: before/after along the container's axis, or the cell itself when it is empty.
  const dropZones = () => {
    const c = containerPath ?? [];
    if (content.type === 'empty') return <DropZone destination={{ kind: 'cell', container: c, row: rowIndex, cell: colIndex }} side="whole" />;
    const axis = axisOf(container);
    if (!axis) return null;
    const index = axis === 'row' ? colIndex : rowIndex;
    return (
      <>
        <DropZone destination={{ kind: 'before', container: c, index }} side="start" axis={axis} />
        <DropZone destination={{ kind: 'after', container: c, index }} side="end" axis={axis} />
      </>
    );
  };

  const startEdit = (): void => {
    if (readOnly) return;
    const m = mainTextProperty(content);
    if (!m) return; // No editable text property.
    setEditing(true);
  };

  const handleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    onSelect(path);
    // Ensure the cell gets focus so keyboard events reach it.
    (e.currentTarget as HTMLElement).focus();
  };

  const handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(path);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDblClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (!selected) onSelect(path);
    startEdit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (editing) return; // InlineEdit handles its own keys.
    if (e.target !== e.currentTarget) return; // A nested cell handles its own keys.
    const command = keyCommand(e, platform);

    if (command === 'edit') { e.preventDefault(); startEdit(); return; }
    if (command === 'enter') {
      e.preventDefault();
      // On a container: enter it. On a leaf: start editing.
      if (content.type === 'grid' || content.type === 'scrollArea') {
        onEnterContainer(path);
      } else {
        startEdit();
      }
      return;
    }
    if (command === 'cancel') {
      e.preventDefault();
      e.stopPropagation();
      onSelectParent();
      return;
    }
    if (command === 'toggle') {
      e.preventDefault();
      if (content.type === 'checkbox' || content.type === 'radioButton') {
        const prop = content.type === 'checkbox' ? 'checked' : 'selected';
        const val = content.type === 'checkbox' ? String(!content.checked) : String(!content.selected);
        const state = ctx.store.getState();
        const view = ctx.view;
        if (!state) return;
        const text = state.source.slice(view.start, view.end);
        const doc = screenDoc(text);
        if (!doc) return;
        const op = setProperty(doc, path, prop, val);
        if (op.ok) {
          ctx.store.applyOp({ ...op, edits: shiftEdits(op.edits, view.start) }, { blockKey: ctx.blockKey });
        } else {
          ctx.store.applyOp(op);
        }
      }
      return;
    }
    // Navigation (plain arrows: move selection to adjacent cell).
    if (command === 'up') {
      e.preventDefault();
      const next = navigateCell(model, path, 'up');
      if (next) onSelect(next);
      return;
    }
    if (command === 'down') {
      e.preventDefault();
      const next = navigateCell(model, path, 'down');
      if (next) onSelect(next);
      return;
    }
    if (command === 'left') {
      e.preventDefault();
      const next = navigateCell(model, path, 'left');
      if (next) onSelect(next);
      return;
    }
    if (command === 'right') {
      e.preventDefault();
      const next = navigateCell(model, path, 'right');
      if (next) onSelect(next);
      return;
    }
    // Move commands (Alt+Shift+arrows: move the element).
    if (command === 'moveUp') { e.preventDefault(); cmdMoveByKey(path, 'up', ctx); return; }
    if (command === 'moveDown') { e.preventDefault(); cmdMoveByKey(path, 'down', ctx); return; }
    if (command === 'moveLeft') { e.preventDefault(); cmdMoveByKey(path, 'left', ctx); return; }
    if (command === 'moveRight') { e.preventDefault(); cmdMoveByKey(path, 'right', ctx); return; }
  };

  const handleInlineCommit = (): void => setEditing(false);
  const handleInlineCancel = (): void => setEditing(false);

  const mainText = mainTextProperty(content);
  const label = ariaLabel(content, rowIndex + 1, colIndex + 1, containerLabel);

  // Build the visual content.
  let visual: React.ReactNode;
  if (editing && mainText && !readOnly) {
    visual = (
      <InlineEdit
        initialValue={mainText.value.text}
        property={mainText.prop as 'text' | 'label' | 'value'}
        blockKey={ctx.blockKey}
        view={ctx.view}
        path={path}
        onCommit={handleInlineCommit}
        onCancel={handleInlineCancel}
      />
    );
  } else {
    switch (content.type) {
      case 'text': visual = <TextComponent text={content.text.text} />; break;
      case 'button': visual = <ButtonComponent label={content.label.text} rough />; break;
      case 'textField': visual = <TextFieldComponent value={content.value.text} width={content.width} rough />; break;
      case 'checkbox': visual = <CheckboxComponent checked={content.checked} label={content.label.text} />; break;
      case 'radioButton': visual = <RadioButtonComponent selected={content.selected} label={content.label.text} />; break;
      case 'dropDown': visual = <DropDownComponent value={content.value.text} open={content.open} options={content.options} />; break;
      case 'tree': visual = <TreeComponent items={content.items} rough />; break;
      case 'tabBar': visual = <TabBarComponent tabs={content.tabs} selectedIndex={content.selectedIndex} />; break;
      case 'menuBar': visual = <MenuBarComponent items={content.items} />; break;
      case 'empty': visual = <EmptyCellMarker visible={showGuides || selected} />; break;
      case 'locked':
        visual = (
          <LockedPlaceholder
            reasonKey={content.reason}
            excerpt={content.excerpt}
            selected={selected}
            role="gridcell"
            tabIndex={selected ? 0 : -1}
            aria-label={label}
            aria-selected={selected}
            onClick={handleClick}
          />
        );
        // Return early — LockedPlaceholder already has its outer wrapper.
        return visual as JSX.Element;
      case 'grid':
      case 'scrollArea':
        // The parent grid hands over the nested container's own view.
        visual = <div className="salt-nested-container">{nested}</div>;
        break;
      default:
        visual = null;
    }
  }

  const cellLabel = mainTextProperty(content)?.value.text ?? '';
  const zones = readOnly ? null : dropZones();
  return (
    <>
      <div
        ref={setDragRef}
        role="gridcell"
        tabIndex={selected ? 0 : -1}
        aria-label={label}
        aria-selected={selected}
        className={`salt-cell${selected ? ' salt-cell--selected' : ''}${content.type === 'empty' ? ' salt-cell--empty' : ''}${isDragging ? ' salt-cell--dragging' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDblClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        data-path={path.join(',')}
        style={{ gridRow: rowIndex + 1, gridColumn: column === undefined ? undefined : `${column + 1} / span ${span ?? 1}`, outline: selected ? '2px solid var(--selection, Highlight)' : undefined, outlineOffset: selected ? 1 : undefined, padding: '2px 4px', minWidth: '2em', opacity: isDragging ? 0.4 : undefined }}
        {...dragListeners}
      >
        {visual}
        {zones}
      </div>
      {contextMenu && (
        <CanvasContextMenu
          path={path}
          cellLabel={cellLabel}
          ctx={ctx}
          anchorX={contextMenu.x}
          anchorY={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

import type React from 'react';
import type { JSX } from 'react';
