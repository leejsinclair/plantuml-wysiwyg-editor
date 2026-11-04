// Screen palette (T078; FR-008/AC7, section 3.3, contracts/ui.md §6).
// Five categories with item descriptions; Enter or click inserts. Each item has an accessible
// description stating Salt's limits.
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import type { BlockEditorProps } from '../app/slots.ts';
import { useStore, useSession } from '../app/store.ts';
import { PALETTE_CATEGORIES, type PaletteItem, type PaletteChoice } from '../../core/salt/ops/presets.ts';
import { insert } from '../../core/salt/ops/insert.ts';
import { screenDoc } from '../../core/salt/destinations.ts';
import { shiftEdits } from '../canvas/canvas-keys.ts';
import { t } from '../messages/en.ts';
import type { SaltScreen } from '../../core/salt/model.ts';
import { useDragSource, useEditorSensors } from '../workspace/dnd.tsx';

function PaletteItemButton({ item, readOnly, onInsert }: { item: PaletteItem; readOnly: boolean; onInsert(item: PaletteItem): void }) {
  const id = `palette::${item}`;
  const { setNodeRef, listeners } = useDragSource(id, readOnly);
  return (
    <li className="palette__item" role="listitem">
      <button
        ref={setNodeRef}
        type="button"
        className="palette__item-button"
        aria-label={item}
        title={t(`screen.palette.desc.${item}`)}
        disabled={readOnly}
        onClick={() => onInsert(item)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onInsert(item); }
        }}
        {...listeners}
      >
        <span className="palette__item-label" aria-hidden="true">{item}</span>
      </button>
    </li>
  );
}

export function Palette({ blockKey, readOnly }: BlockEditorProps<SaltScreen>) {
  const store = useStore();
  const session = useSession();
  const sensors = useEditorSensors();

  const doInsert = (item: PaletteItem): void => {
    if (readOnly) return;
    const state = store.getState();
    const view = session.blocks.find((b) => b.key === blockKey);
    if (!state || !view) return;
    const text = state.source.slice(view.start, view.end);
    const doc = screenDoc(text);
    if (!doc) return;
    const path = session.selection?.blockKey === blockKey ? (session.selection.path ?? null) : null;
    const choice: PaletteChoice = { item };
    const op = insert(doc, path, choice);
    if (op.ok) {
      store.applyOp({ ...op, edits: shiftEdits(op.edits, view.start) }, { blockKey });
    } else {
      store.applyOp(op);
    }
  };

  const handleDragEnd = ({ active }: DragEndEvent): void => {
    const id = String(active.id);
    if (!id.startsWith('palette::')) return;
    const item = id.slice('palette::'.length) as PaletteItem;
    doInsert(item);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="palette" role="group" aria-label={t('region.palette')}>
        {PALETTE_CATEGORIES.map((cat) => (
          <section key={cat.id} className="palette__category">
            <h3 className="palette__category-heading">
              {t(`screen.palette.category.${cat.id}`)}
            </h3>
            <ul className="palette__items" role="list">
              {cat.items.map((item) => (
                <PaletteItemButton key={item} item={item} readOnly={readOnly} onInsert={doInsert} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DndContext>
  );
}
