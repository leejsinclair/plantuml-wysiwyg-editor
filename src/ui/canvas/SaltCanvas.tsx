// SaltCanvas: the screen editing canvas (T077; FR-002/AC2–AC4, AC8, AC12–AC13, FR-009/AC3, AC10,
// FR-016/AC5–AC6, VO-002, VO-005, VO-006, VO-049, VO-057, VO-095, VO-096, VO-097).
// Renders a Salt screen model as a grid of cells; each cell is selectable and editable.
// Empty cells are always visible when "Show layout guides" is on. The empty-screen prompt is shown
// when the screen has only one empty cell.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Path } from '../../core/types.ts';
import type { SaltScreen, Grid, ScrollArea, CellsRow, SeparatorRow } from '../../core/salt/model.ts';
import type { BlockEditorProps } from '../app/slots.ts';
import type { Platform } from '../keys.ts';
import { useStore, useSession } from '../app/store.ts';
import { platformFrom } from '../keys.ts';
import { t } from '../messages/en.ts';
import { validDestinations, destinationKey, type Destination } from '../../core/salt/destinations.ts';
import { EditorDnd } from '../workspace/dnd.tsx';
import type { MoveToController } from '../workspace/MoveToDialog.tsx';
import { moveTo as appMoveTo } from '../workspace/MoveToDialog.tsx';
import { DropZone } from './DropZone.tsx';
import { CellView } from './CellView.tsx';
import { SeparatorLine } from './components.tsx';
import type { CanvasContext } from './canvas-keys.ts';
import { cmdDelete, docFor } from './canvas-keys.ts';
import { move } from '../../core/salt/ops/move.ts';
import { columnCount } from '../../core/salt/model.ts';
import { gridLabel } from '../../core/salt/labels.ts';
import { appSettingsStore } from '../workspace/Workspace.tsx';
import { Checkbox } from '@mantine/core';
import './canvas.css';

const platform: Platform = platformFrom(typeof navigator === 'undefined' ? '' : navigator.userAgent);

export interface SaltCanvasProps extends BlockEditorProps<SaltScreen> {
  readonly moveToController?: MoveToController;
}

/** Whether the screen is "empty" — the root has no rows, or exactly one empty cell. */
function isEmptyScreen(model: SaltScreen): boolean {
  const root = model.root;
  if (root.rows.length === 0) return true;
  if (root.rows.length !== 1) return false;
  const row = root.rows[0];
  if (!row || row.type !== 'cells') return false;
  return row.cells.length === 1 && row.cells[0]?.content.type === 'empty';
}

interface GridViewProps {
  readonly container: Grid | ScrollArea;
  readonly containerPath: Path;
  readonly selection: Path | null;
  readonly showGuides: boolean;
  readonly readOnly: boolean;
  readonly ctx: CanvasContext;
  readonly label: string;
  /** The full model for navigation. */
  readonly model: SaltScreen;
  onSelect(path: Path): void;
  onSelectParent(path: Path): void;
}

function GridView({ container, containerPath, selection, showGuides, readOnly, ctx, label, model, onSelect, onSelectParent }: GridViewProps) {
  const isGrid = container.type === 'grid';
  const rows = container.rows;

  const handleCellSelect = (path: Path) => onSelect(path);
  const handleSelectParent = () => {
    // Select parent = the container itself.
    onSelectParent(containerPath);
  };
  const handleEnterContainer = (cellPath: Path) => {
    // A cell's content is a nested container; select its root.
    onSelect([...cellPath, 0]);
  };

  return (
    <div
      role="grid"
      aria-label={label}
      className={`salt-grid salt-grid--${isGrid ? (container as Grid).style : 'scroll'}${showGuides ? ' salt-grid--guides' : ''}`}
      data-path={containerPath.join(',')}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, columnCount(container))}, auto)` }}
    >
      {rows.map((row, ri) => {
        const rowPath = [...containerPath, ri];
        if (row.type === 'separator') {
          const sepRow = row as SeparatorRow;
          const sepSelected = selection !== null && selection.join(',') === rowPath.join(',');
          return (
            <div
              key={ri}
              role="row"
              className="salt-row salt-row--separator"
              aria-label={t('screen.type.separator')}
              data-path={rowPath.join(',')}
              style={{ gridRow: ri + 1, gridColumn: '1 / -1' }}
            >
              <div
                role="gridcell"
                tabIndex={sepSelected ? 0 : -1}
                aria-selected={sepSelected}
                aria-label={t('screen.type.separator')}
                className={`salt-cell salt-cell--separator${sepSelected ? ' salt-cell--selected' : ''}`}
                onClick={(e) => { e.stopPropagation(); onSelect(rowPath); }}
                style={{ outline: sepSelected ? '2px solid var(--selection, Highlight)' : undefined }}
              >
                <SeparatorLine kind={sepRow.separatorKind} />
              </div>
            </div>
          );
        }
        const cellsRow = row as CellsRow;
        return (
          <div key={ri} role="row" className="salt-row" data-path={rowPath.join(',')}>
            {cellsRow.cells.map((cell, ci) => {
              const cellPath = [...containerPath, ri, ci];
              const cellSelected = selection !== null && selection.join(',') === cellPath.join(',');
              return (
                <CellView
                  key={ci}
                  path={cellPath}
                  content={cell.content}
                  container={container}
                  rowIndex={ri}
                  colIndex={ci}
                  column={cell.column}
                  containerPath={containerPath}
                  span={cell.span}
                  selected={cellSelected}
                  showGuides={showGuides}
                  readOnly={readOnly}
                  platform={platform}
                  ctx={ctx}
                  model={model}
                  onSelect={handleCellSelect}
                  onSelectParent={handleSelectParent}
                  onEnterContainer={handleEnterContainer}
                  nested={
                    cell.content.type === 'grid' || cell.content.type === 'scrollArea' ? (
                      <GridView
                        container={cell.content}
                        containerPath={cellPath}
                        selection={selection}
                        showGuides={showGuides}
                        readOnly={readOnly}
                        ctx={ctx}
                        label={t(`screen.label.${cell.content.type === 'grid' ? gridLabel(cell.content) : 'Grid'}`)}
                        model={model}
                        onSelect={onSelect}
                        onSelectParent={onSelectParent}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        );
      })}
      {!readOnly && (
        <div className="salt-dropzone-end" style={{ gridRow: rows.length + 1, gridColumn: '1 / -1' }}>
          <DropZone destination={{ kind: 'end', container: containerPath }} side="whole" />
        </div>
      )}
    </div>
  );
}

export function SaltCanvas({ blockKey, model, selection, readOnly, moveToController = appMoveTo }: SaltCanvasProps) {
  const store = useStore();
  const session = useSession();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [showGuides, setShowGuides] = useState(false);

  useEffect(() => {
    appSettingsStore.get().then((s) => { setShowGuides(s.layoutLines ?? false); }).catch(() => undefined);
  }, []);

  const toggleGuides = (on: boolean): void => {
    setShowGuides(on);
    appSettingsStore.get()
      .then((s) => appSettingsStore.put({ ...s, layoutLines: on }))
      .catch(() => undefined);
  };

  const view = session.blocks.find((b) => b.key === blockKey);
  const empty = isEmptyScreen(model);

  const ctx: CanvasContext = {
    blockKey,
    view: view!,
    store,
    moveToController,
  };

  const onSelect = useCallback((path: Path) => {
    store.select(path);
  }, [store]);




  // After a focus request, move focus into the canvas.
  useEffect(() => {
    const f = session.focus;
    if (!f || f.blockKey !== blockKey) return;
    const path = f.path;
    if (!canvasRef.current) return;
    const pathStr = path.join(',');
    const el = canvasRef.current.querySelector<HTMLElement>(`[data-path="${pathStr}"][role="gridcell"]`);
    if (el) el.focus();
    else canvasRef.current.focus();
  }, [session.focus, blockKey]);

  const rootLabel = t('screen.label.Screen');
  const containerPath: Path = [];

  const destinationsForPath = (pathStr: string): readonly Destination[] => {
    const p = pathStr ? pathStr.split(',').map(Number) : [];
    return validDestinations(model, p);
  };

  if (!view) return null;

  return (
    <div
      ref={canvasRef}
      className="salt-canvas"
      aria-label={t('screen.canvas.roleDescription')}
      aria-roledescription={t('screen.canvas.roleDescription')}
      data-show-guides={showGuides || undefined}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Delete' && !readOnly && selection !== null) {
          e.preventDefault();
          cmdDelete(selection, ctx);
        }
      }}
    >
      {/* Show layout guides toggle */}
      <div className="salt-canvas__controls">
        <Checkbox
          size="xs"
          className="salt-canvas__guides-toggle"
          checked={showGuides}
          onChange={(e) => toggleGuides(e.currentTarget.checked)}
          label={t('screen.canvas.showGuides')}
        />
      </div>

      {/* Empty screen prompt */}
      {empty && (
        <p className="salt-canvas__empty-prompt">{t('screen.canvas.emptyPrompt')}</p>
      )}

      {/* The root grid */}
      <EditorDnd<Destination>
        destinationsFor={(id) => destinationsForPath(id)}
        destinationKey={destinationKey}
        onMove={(dragId, dest) => {
          const p = dragId ? dragId.split(',').map(Number) : [];
          const doc = docFor(ctx);
          if (!doc) return;
          const op = move(doc, p, dest);
          if (op.ok) {
            const offset = view.start;
            store.applyOp({ ...op, edits: op.edits.map((e) => ({ ...e, start: e.start + offset, end: e.end + offset })) }, { blockKey });
          } else {
            store.applyOp(op);
          }
        }}
        disabled={readOnly}
      >
        <GridView
          container={model.root}
          containerPath={containerPath}
          selection={selection}
          showGuides={showGuides}
          readOnly={readOnly}
          ctx={ctx}
          label={rootLabel}
          model={model}
          onSelect={onSelect}
          onSelectParent={(p) => store.select(p.length > 0 ? p.slice(0, -2) : [])}
        />
      </EditorDnd>
    </div>
  );
}
