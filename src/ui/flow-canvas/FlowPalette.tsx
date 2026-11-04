// FlowPalette: the flow palette (T153; FR-009/AC8; contracts/ui.md §6).
// Offers Step, Decision, Loop and Stop. Each button inserts the item at the current selection.
import type { BlockEditorProps } from '../app/slots.ts';
import { useStore, useSession } from '../app/store.ts';
import { flowDoc } from '../../core/activity/destinations.ts';
import { insert, FLOW_PALETTE, type FlowPaletteItem } from '../../core/activity/ops/insert.ts';
import { t } from '../messages/en.ts';
import type { ScreenFlow } from '../../core/activity/model.ts';
import { useDragSource } from '../workspace/dnd.tsx';
import { PALETTE_PREFIX } from './flow-dnd.tsx';

function PaletteButton({ item, readOnly, onInsert }: { item: FlowPaletteItem; readOnly: boolean; onInsert(item: FlowPaletteItem): void }) {
  const { setNodeRef, listeners } = useDragSource(`${PALETTE_PREFIX}${item}`, readOnly);
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`flow-palette__item flow-palette__item--${item}`}
      title={t(`flow.palette.${item}Description`)}
      disabled={readOnly}
      onClick={() => onInsert(item)}
      {...listeners}
    >
      {t(`flow.palette.${item}`)}
    </button>
  );
}

export function FlowPalette({ blockKey, model: _model, selection: _selection, readOnly }: BlockEditorProps<ScreenFlow>) {
  const store = useStore();
  const session = useSession();
  const key = blockKey;

  const doInsert = (item: FlowPaletteItem): void => {
    if (readOnly) return;
    const state = store.getState();
    const view = session.blocks.find((b) => b.key === key);
    if (!state || !view) return;
    const text = state.source.slice(view.start, view.end);
    const doc = flowDoc(text, view.start);
    if (!doc) return;
    const path = session.selection?.blockKey === key ? (session.selection.path ?? null) : null;
    store.applyOp(insert(doc, path, item), { blockKey: key });
  };

  return (
    <div className="flow-palette" aria-label={t('flow.palette.label')}>
      <p className="flow-palette__hint">{t('flow.palette.hint')}</p>
      {FLOW_PALETTE.map((item) => (
        <PaletteButton key={item} item={item} readOnly={readOnly} onInsert={doInsert} />
      ))}
    </div>
  );
}
