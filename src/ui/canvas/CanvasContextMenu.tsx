// T015: CanvasContextMenu — right-click context menu for a canvas cell (FR-017, FR-022, US5).
// Shows "Link to screen…" when a canvas cell is right-clicked on a screen with a flow block.
// Selecting a screen from the picker calls setLink to create/update the navigation link.
import { useEffect, useRef, useState } from 'react';
import type { Path } from '../../core/types.ts';
import type { CanvasContext } from './canvas-keys.ts';
import { useStore, useSession } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { flowDoc } from '../../core/activity/destinations.ts';
import { addLinkedStep } from '../../core/activity/ops/links.ts';
import { addFlow } from '../../core/project/flow-block.ts';
import { blocks as projectBlocks } from '../../core/project/project.ts';

interface CanvasContextMenuProps {
  readonly path: Path;
  readonly cellLabel: string;
  readonly ctx: CanvasContext;
  readonly anchorX: number;
  readonly anchorY: number;
  onClose(): void;
}

export function CanvasContextMenu({ path: _path, cellLabel: _cellLabel, ctx: _ctx, anchorX, anchorY, onClose }: CanvasContextMenuProps) {
  const store = useStore();
  const session = useSession();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Close on outside click.
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  // Close on Escape.
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  const screenBlocks = session.blocks.filter((b) => b.kind === 'screen' && b.name);

  // The element has no flow step yet, so a step labelled with its text is added to the screen flow (made first
  // when the project has none) and linked to the chosen screen.
  const handleLinkToScreen = (targetName: string): void => {
    let state = store.getState();
    if (!state) return;
    if (!projectBlocks(state).some((b) => b.kind === 'flow')) {
      const added = addFlow(state.source, state.flowIndex);
      const anchor = session.openBlockKey ?? state.keys[0];
      if (!added.ok || !anchor) { onClose(); return; }
      store.applyEdits(added.edits, {
        nameKey: 'flow.history.addFlow',
        blockKey: anchor,
        order: added.order,
        flowIndex: added.flowIndex,
        announceKey: 'flow.block.added',
        announceParams: { name: added.name },
      });
      state = store.getState();
      if (!state) return;
    }
    const flowView = projectBlocks(state).find((b) => b.kind === 'flow');
    const doc = flowView ? flowDoc(state.source.slice(flowView.start, flowView.end), flowView.start) : null;
    const flowKey = flowView ? state.keys[state.flowIndex ?? -1] : undefined;
    if (!doc || !flowKey) { onClose(); return; }
    const label = _cellLabel.trim() || targetName;
    store.applyOp(addLinkedStep(doc, label, targetName), { blockKey: flowKey });
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('canvas.contextMenu.label')}
      style={{
        position: 'fixed',
        left: anchorX,
        top: anchorY,
        background: 'var(--menu-bg, #fff)',
        border: '1px solid var(--menu-border, #ccc)',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: 1000,
        minWidth: 160,
      }}
    >
      {!showPicker ? (
        <div
          role="menuitem"
          tabIndex={0}
          onClick={() => setShowPicker(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') setShowPicker(true); }}
          style={{ padding: '6px 12px', cursor: 'pointer' }}
          aria-label={t('canvas.contextMenu.linkToScreen')}
        >
          {t('canvas.contextMenu.linkToScreen')}
        </div>
      ) : (
        <div role="listbox" aria-label={t('canvas.contextMenu.pickScreen')}>
          <div style={{ padding: '4px 12px 2px', fontSize: 11, opacity: 0.6 }}>
            {t('canvas.contextMenu.pickScreen')}
          </div>
          {screenBlocks.map((sb) => (
            <div
              key={sb.key}
              role="option"
              aria-selected={false}
              tabIndex={0}
              onClick={() => handleLinkToScreen(sb.name!)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLinkToScreen(sb.name!); }}
              style={{ padding: '6px 12px', cursor: 'pointer' }}
            >
              {sb.name}
            </div>
          ))}
          {screenBlocks.length === 0 && (
            <div style={{ padding: '6px 12px', opacity: 0.5 }}>
              {t('canvas.contextMenu.noScreens')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
