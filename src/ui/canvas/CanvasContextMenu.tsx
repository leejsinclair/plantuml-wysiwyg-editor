// T015: CanvasContextMenu — right-click context menu for a canvas cell (FR-017, FR-022, US5).
// Shows "Link to screen…" when a canvas cell is right-clicked on a screen with a flow block.
// Selecting a screen from the picker calls setLink to create/update the navigation link.
import { useEffect, useRef, useState } from 'react';
import type { Path } from '../../core/types.ts';
import type { CanvasContext } from './canvas-keys.ts';
import { useSession } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { useLinkToScreen } from './link-to-screen.ts';

interface CanvasContextMenuProps {
  readonly path: Path;
  readonly cellLabel: string;
  readonly ctx: CanvasContext;
  readonly anchorX: number;
  readonly anchorY: number;
  onClose(): void;
}

export function CanvasContextMenu({ path: _path, cellLabel: _cellLabel, ctx: _ctx, anchorX, anchorY, onClose }: CanvasContextMenuProps) {
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
  const link = useLinkToScreen();
  const handleLinkToScreen = (targetName: string): void => {
    link(_cellLabel, targetName);
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
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
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
          className="canvas-context-menu__item"
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
              className="canvas-context-menu__item"
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
