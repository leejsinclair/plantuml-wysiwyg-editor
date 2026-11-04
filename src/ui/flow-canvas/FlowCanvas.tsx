// FlowCanvas: the structured top-to-bottom flow canvas (T152; FR-013/AC2, AC4, FR-009/AC13; VO-033, VO-034,
// VO-036, VO-093, VO-099). Renders elements as a tree, handles keyboard navigation and structural commands.
// Lane markers appear before each element whose lane differs from the previous one.
// Locked parts use LockedPlaceholder. Steps get link badges (linked/broken/caseOnly/ambiguous).
// Notes are shown beside their owner. Drag targets use validDestinations.
import { useCallback, useEffect, useId, useRef } from 'react';
import type { BlockEditorProps } from '../app/slots.ts';
import { useStore, useSession } from '../app/store.ts';
import {
  flowDoc,
  resolve,
} from '../../core/activity/destinations.ts';
import { remove } from '../../core/activity/ops/remove.ts';
import { moveByKey } from '../../core/activity/ops/move.ts';
import { linkStatus } from '../../core/project/links.ts';
import { LockedPlaceholder } from '../workspace/LockedPlaceholder.tsx';
import { t } from '../messages/en.ts';
import type { ScreenFlow, FlowElement, Branch, Note } from '../../core/activity/model.ts';
import type { Path } from '../../core/types.ts';
import { flowCommand } from './flow-keys.ts';
import { dropIdForPath, END_DROP_ID, useFlowDrop } from './flow-dnd.tsx';

function pathKey(path: Path): string {
  return path.join(',');
}

function laneFor(element: FlowElement): string | null {
  if ('lane' in element) return element.lane;
  return null;
}

interface RenderItemProps {
  readonly element: FlowElement;
  readonly path: Path;
  readonly selected: boolean;
  readonly readOnly: boolean;
  readonly prevLane: string | null;
  readonly screenNames: readonly (string | null)[];
  onSelect(path: Path): void;
  onKeyDown(event: React.KeyboardEvent<HTMLElement>, path: Path): void;
  readonly tabbablePath: Path | null;
}

function BranchSlot({
  path, selected, readOnly: _readOnly, onSelect, onKeyDown, tabbablePath,
}: {
  path: Path; selected: boolean; readOnly: boolean;
  onSelect(p: Path): void;
  onKeyDown(e: React.KeyboardEvent<HTMLElement>, p: Path): void;
  tabbablePath: Path | null;
}) {
  const isTabbable = tabbablePath !== null && pathKey(path) === pathKey(tabbablePath);
  const { setNodeRef: setDropRef, over: dropOver } = useFlowDrop(dropIdForPath(path));
  return (
    <div
      ref={setDropRef}
      role="treeitem"
      tabIndex={isTabbable ? 0 : -1}
      aria-selected={selected}
      className={`flow-canvas__slot${selected ? ' flow-canvas__slot--selected' : ''}`}
      style={dropOver ? { outline: '2px dashed var(--selection, Highlight)' } : undefined}
      onClick={(e) => { onSelect(path); (e.currentTarget as HTMLElement).focus(); }}
      onKeyDown={(e) => onKeyDown(e, path)}
    >
      <span className="flow-canvas__slot-label">
        {t('flow.item.emptyBranch', { text: '' })}
      </span>
    </div>
  );
}

function BranchView({
  branch, branchPath, parentPath: _parentPath, selected, readOnly, screenNames, onSelect, onKeyDown, tabbablePath,
}: {
  branch: Branch; branchPath: Path; parentPath: Path;
  selected: boolean; readOnly: boolean;
  screenNames: readonly (string | null)[];
  onSelect(p: Path): void;
  onKeyDown(e: React.KeyboardEvent<HTMLElement>, p: Path): void;
  tabbablePath: Path | null;
}) {
  const label = branch.label?.text ?? '';

  if (branch.path.elements.length === 0) {
    return (
      <div className="flow-canvas__branch">
        <div className="flow-canvas__branch-label">{label || t('flow.item.branchUnlabelled', { n: branchPath[branchPath.length - 1]! + 1 })}</div>
        <BranchSlot
          path={branchPath}
          selected={selected}
          readOnly={readOnly}
          onSelect={onSelect}
          onKeyDown={onKeyDown}
          tabbablePath={tabbablePath}
        />
      </div>
    );
  }

  return (
    <div className="flow-canvas__branch">
      <div className="flow-canvas__branch-label">{label || t('flow.item.branchUnlabelled', { n: branchPath[branchPath.length - 1]! + 1 })}</div>
      <div className="flow-canvas__branch-items">
        {branch.path.elements.map((el, j) => (
          <RenderItem
            key={pathKey([...branchPath, j])}
            element={el}
            path={[...branchPath, j]}
            selected={selected}
            readOnly={readOnly}
            prevLane={j === 0 ? null : laneFor(branch.path.elements[j - 1]!)}
            screenNames={screenNames}
            onSelect={onSelect}
            onKeyDown={onKeyDown}
            tabbablePath={tabbablePath}
          />
        ))}
      </div>
    </div>
  );
}

function RenderItem({
  element, path, selected, readOnly, prevLane, screenNames, onSelect, onKeyDown, tabbablePath,
}: RenderItemProps) {
  const isTabbable = tabbablePath !== null && pathKey(path) === pathKey(tabbablePath);
  const { setNodeRef: setDropRef, over: dropOver } = useFlowDrop(dropIdForPath(path));
  const isSelected = selected && pathKey(path) === pathKey(path); // always true but selection passed from parent
  const currentLane = laneFor(element);
  const showLaneChange = currentLane !== null && currentLane !== prevLane;

  if (element.kind === 'locked') {
    return (
      <LockedPlaceholder
        role="treeitem"
        tabIndex={isTabbable ? 0 : -1}
        aria-selected={isSelected}
        reasonKey={element.reason}
        excerpt={element.excerpt}
        onClick={(e) => { onSelect(path); (e.currentTarget as HTMLElement).focus(); }}
        onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => onKeyDown(e, path)}
      />
    );
  }

  const label = (() => {
    switch (element.kind) {
      case 'start': return t('flow.item.start');
      case 'stop': return t(element.keyword === 'end' ? 'flow.item.end' : 'flow.item.stop');
      case 'step': return t('flow.item.step', { text: element.label.text });
      case 'decision': return t('flow.item.decision', { text: element.branches[0]?.condition?.text ?? '' });
      case 'loop': return t('flow.item.loop', { text: element.labels.is?.text ?? '' });
    }
  })();

  const notes: readonly Note[] = element.notes ?? [];
  const leftNotes = notes.filter((n) => n.side === 'left');
  const rightNotes = notes.filter((n) => n.side === 'right');

  let linkBadge: string | null = null;
  let linkBadgeKey: string | null = null;
  if (element.kind === 'step' && element.link) {
    const status = linkStatus(element.link.target, screenNames);
    if (status.status === 'valid') { linkBadgeKey = 'flow.link.linked'; linkBadge = element.link.target; }
    else if (status.status === 'broken') { linkBadgeKey = 'flow.link.broken'; linkBadge = element.link.target; }
    else if (status.status === 'brokenCaseOnly') { linkBadgeKey = 'flow.link.caseOnly'; linkBadge = element.link.target; }
    else if (status.status === 'ambiguous') { linkBadgeKey = 'flow.link.ambiguous'; linkBadge = element.link.target; }
  }

  const fullLabel = (() => {
    let l = label;
    if (notes.length > 0) l = t('flow.item.withNotes', { count: notes.length, item: l });
    if (currentLane && showLaneChange) l = t('flow.item.inLane', { item: l, lane: currentLane });
    return l;
  })();

  const itemElement = (
    <div
      role="treeitem"
      tabIndex={isTabbable ? 0 : -1}
      aria-selected={isSelected}
      aria-label={fullLabel}
      className={`flow-canvas__item flow-canvas__item--${element.kind}${isSelected ? ' flow-canvas__item--selected' : ''}`}
      onClick={(e) => { onSelect(path); (e.currentTarget as HTMLElement).focus(); }}
      onKeyDown={(e) => onKeyDown(e, path)}
    >
      <span className="flow-canvas__item-label">{label}</span>
      {element.kind === 'step' && !element.link && (
        <span className="flow-canvas__no-link" title={t('flow.item.noLink')} style={{ opacity: 0.55, fontSize: '0.8em', marginLeft: 8 }}>
          {t('links.linkToScreen')}…
        </span>
      )}
      {linkBadgeKey && linkBadge && (
        <span
          className={`flow-canvas__link-badge flow-canvas__link-badge--${linkBadgeKey.replace('flow.link.', '')}`}
          aria-label={t(linkBadgeKey as Parameters<typeof t>[0], { screen: linkBadge })}
          style={{ marginLeft: 8, fontSize: '0.8em' }}
        >
          → {linkBadge}
        </span>
      )}
    </div>
  );

  return (
    <div className="flow-canvas__element-wrapper">
      {showLaneChange && (
        <div className="flow-canvas__lane-marker" aria-hidden="true">
          {t('flow.lane.marker', { lane: currentLane! })}
        </div>
      )}
      {leftNotes.length > 0 && (
        <div className="flow-canvas__note flow-canvas__note--left" aria-label={t('flow.note.leftMarker')}>
          {leftNotes.map((n) => n.text.text).join('; ')}
        </div>
      )}
      <div ref={setDropRef} className={`flow-canvas__item-row${dropOver ? ' flow-canvas__item-row--drop' : ''}`} style={dropOver ? { outline: '2px dashed var(--selection, Highlight)', outlineOffset: 2 } : undefined}>
        {itemElement}
        {rightNotes.length > 0 && (
          <div className="flow-canvas__note flow-canvas__note--right" aria-label={t('flow.note.rightMarker')}>
            {rightNotes.map((n) => n.text.text).join('; ')}
          </div>
        )}
      </div>
      {element.kind === 'decision' && (
        <div className="flow-canvas__branches">
          {element.branches.map((branch, b) => (
            <BranchView
              key={b}
              branch={branch}
              branchPath={[...path, b]}
              parentPath={path}
              selected={isSelected}
              readOnly={readOnly}
              screenNames={screenNames}
              onSelect={onSelect}
              onKeyDown={onKeyDown}
              tabbablePath={tabbablePath}
            />
          ))}
        </div>
      )}
      {element.kind === 'loop' && (
        <div className="flow-canvas__loop-body">
          {element.body.elements.length === 0 ? (
            <BranchSlot
              path={[...path, 0]}
              selected={isSelected}
              readOnly={readOnly}
              onSelect={onSelect}
              onKeyDown={onKeyDown}
              tabbablePath={tabbablePath}
            />
          ) : (
            element.body.elements.map((el, j) => (
              <RenderItem
                key={pathKey([...path, 0, j])}
                element={el}
                path={[...path, 0, j]}
                selected={isSelected}
                readOnly={readOnly}
                prevLane={j === 0 ? null : laneFor(element.body.elements[j - 1]!)}
                screenNames={screenNames}
                onSelect={onSelect}
                onKeyDown={onKeyDown}
                tabbablePath={tabbablePath}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FlowHelp() {
  return (
    <details className="flow-canvas__help" open style={{ marginBottom: 8, fontSize: '0.9em' }}>
      <summary>{t('flow.help.title')}</summary>
      <ul>
        <li>{t('flow.help.add')}</li>
        <li>{t('flow.help.link')}</li>
        <li>{t('flow.help.open')}</li>
      </ul>
    </details>
  );
}

function EndDropArea() {
  const { setNodeRef: setDropRef, over: dropOver } = useFlowDrop(END_DROP_ID);
  return (
    <div
      ref={setDropRef}
      className="flow-canvas__end-drop"
      style={{ minHeight: 32, marginTop: 8, opacity: dropOver ? 1 : 0.4, border: '1px dashed currentColor', textAlign: 'center', fontSize: '0.85em' }}
    >
      {t('flow.dropHere')}
    </div>
  );
}

export function FlowCanvas({ blockKey, model, selection, readOnly }: BlockEditorProps<ScreenFlow>) {
  const store = useStore();
  const session = useSession();
  const labelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus the tabbable (selected) element when selection changes via keyboard commands.
  const prevSelectionRef = useRef<string | null>(null);
  const selectionKey = selection ? pathKey(selection) : null;
  useEffect(() => {
    if (selectionKey !== null && selectionKey !== prevSelectionRef.current) {
      prevSelectionRef.current = selectionKey;
      const el = containerRef.current?.querySelector<HTMLElement>(`[role="treeitem"][tabindex="0"]`);
      if (el && document.activeElement !== el && containerRef.current?.contains(document.activeElement)) {
        el.focus();
      }
    }
  }, [selectionKey]);

  const getDoc = useCallback(() => {
    const state = store.getState();
    const view = session.blocks.find((b) => b.key === blockKey);
    if (!state || !view) return null;
    const text = state.source.slice(view.start, view.end);
    return flowDoc(text, view.start);
  }, [store, session, blockKey]);

  const screenNames = session.blocks.filter((b) => b.kind === 'screen').map((b) => b.name);

  const onSelect = useCallback((path: Path): void => {
    store.select(path);
  }, [store]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>, path: Path): void => {
    const cmd = flowCommand(event.nativeEvent);
    if (cmd.kind === 'none') return;
    event.preventDefault();
    event.stopPropagation();

    if (cmd.kind === 'delete') {
      if (readOnly) return;
      const doc = getDoc();
      if (!doc) return;
      store.applyOp(remove(doc, path), { blockKey });
      return;
    }

    if (cmd.kind === 'move') {
      if (readOnly) return;
      const doc = getDoc();
      if (!doc) return;
      store.applyOp(moveByKey(doc, path, cmd.direction), { blockKey });
      return;
    }

    if (cmd.kind === 'navigate') {
      if (!model) return;
      // Up/Down: along path; Left/Right: between branches of a decision
      const dir = cmd.direction;
      if (dir === 'up' || dir === 'down') {
        // Navigate to previous/next sibling at the same level
        const r = resolve(model, path);
        if (!r) return;
        if (r.type === 'element') {
          const siblings = r.container.path.elements;
          const idx = r.index;
          if (dir === 'up' && idx > 0) store.select([...r.container.address, idx - 1]);
          else if (dir === 'down' && idx < siblings.length - 1) store.select([...r.container.address, idx + 1]);
        }
      } else if (dir === 'left' || dir === 'right') {
        // Move between branches: find the parent decision
        if (path.length < 2) return;
        const branchIndex = path[path.length - 1]!;
        const elementPath = path.slice(0, -1);
        const parentR = resolve(model, elementPath);
        if (!parentR || parentR.type !== 'element' || parentR.element.kind !== 'decision') return;
        const branches = parentR.element.branches;
        const newB = dir === 'right' ? branchIndex + 1 : branchIndex - 1;
        if (newB >= 0 && newB < branches.length) {
          store.select([...elementPath, newB]);
        }
      }
      return;
    }

    if (cmd.kind === 'enter') {
      if (!model) return;
      const r = resolve(model, path);
      if (!r) return;
      if (r.type === 'element') {
        const el = r.element;
        if (el.kind === 'decision' && el.branches.length > 0) {
          store.select([...path, 0]);
        } else if (el.kind === 'loop') {
          store.select([...path, 0]);
        }
      }
      return;
    }

    if (cmd.kind === 'cancel') {
      if (!model) return;
      // Select parent
      if (path.length === 0) return;
      if (path.length === 1) {
        store.select([]);
      } else {
        store.select(path.slice(0, -1));
      }
    }
  }, [model, readOnly, store, blockKey, getDoc]);

  if (!model) {
    return (
      <div
        role="region"
        aria-labelledby={labelId}
        className="flow-canvas flow-canvas--empty"
      >
        <h2 id={labelId} className="flow-canvas__heading">{t('flow.canvas.label')}</h2>
        <p>{t('flow.canvas.empty')}</p>
      </div>
    );
  }

  const elements = model.main.elements;
  const tabbablePath = selection ?? (elements.length > 0 ? [0] : null);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-labelledby={labelId}
      aria-label={t('flow.canvas.label')}
      className="flow-canvas"
      id={labelId}
    >
      <h2 id={labelId} className="flow-canvas__heading" aria-hidden="true">{t('flow.canvas.label')}</h2>
      <FlowHelp />
      <div role="tree" aria-label={t('flow.canvas.label')} className="flow-canvas__tree">
        {elements.length === 0 && (
          <p className="flow-canvas__empty">{t('flow.canvas.empty')}</p>
        )}
        {elements.map((el, i) => (
          <RenderItem
            key={pathKey([i])}
            element={el}
            path={[i]}
            selected={selection !== null && pathKey(selection) === pathKey([i])}
            readOnly={readOnly}
            prevLane={i === 0 ? null : laneFor(elements[i - 1]!)}
            screenNames={screenNames}
            onSelect={onSelect}
            onKeyDown={onKeyDown}
            tabbablePath={tabbablePath}
          />
        ))}
      </div>
      {!readOnly && <EndDropArea />}
    </div>
  );
}
