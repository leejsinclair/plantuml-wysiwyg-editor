// LaneList: add, rename, reorder, and delete lanes (T154; FR-012/AC10, AC12; VO-037; contracts/ui.md §8).
// Deleting a lane in use shows a confirmation dialog asking for a destination lane.
import { useState } from 'react';
import type { BlockEditorProps } from '../app/slots.ts';
import { useStore, useSession } from '../app/store.ts';
import { flowDoc } from '../../core/activity/destinations.ts';
import { laneInUse } from '../../core/activity/lanes.ts';
import { addLane, renameLane, moveLane, deleteLane } from '../../core/activity/ops/lanes.ts';
import { t } from '../messages/en.ts';
import type { ScreenFlow } from '../../core/activity/model.ts';

interface DeleteDialogState {
  readonly laneName: string;
  readonly otherLanes: readonly string[];
}

export function LaneList({ blockKey, model, selection: _selection, readOnly }: BlockEditorProps<ScreenFlow>) {
  const store = useStore();
  const session = useSession();
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [newName, setNewName] = useState('');
  const [destinationLane, setDestinationLane] = useState<string>('');

  const getDoc = () => {
    const state = store.getState();
    const view = session.blocks.find((b) => b.key === blockKey);
    if (!state || !view) return null;
    const text = state.source.slice(view.start, view.end);
    return flowDoc(text, view.start);
  };

  const lanes = model?.lanes ?? [];

  const handleAdd = (): void => {
    if (!newName.trim()) return;
    const doc = getDoc();
    if (!doc) return;
    const path = session.selection?.blockKey === blockKey ? (session.selection.path ?? []) : [];
    store.applyOp(addLane(doc, newName.trim(), path), { blockKey });
    setNewName('');
  };

  const handleRename = (from: string, to: string): void => {
    const doc = getDoc();
    if (!doc) return;
    const path = session.selection?.blockKey === blockKey ? (session.selection.path ?? []) : [];
    store.applyOp(renameLane(doc, from, to, path), { blockKey });
  };

  const handleMoveUp = (name: string): void => {
    const doc = getDoc();
    if (!doc) return;
    const idx = lanes.findIndex((l) => l.name === name);
    if (idx <= 0) return;
    const path = session.selection?.blockKey === blockKey ? (session.selection.path ?? []) : [];
    store.applyOp(moveLane(doc, name, idx - 1, path), { blockKey });
  };

  const handleMoveDown = (name: string): void => {
    const doc = getDoc();
    if (!doc) return;
    const idx = lanes.findIndex((l) => l.name === name);
    if (idx === -1 || idx >= lanes.length - 1) return;
    const path = session.selection?.blockKey === blockKey ? (session.selection.path ?? []) : [];
    store.applyOp(moveLane(doc, name, idx + 1, path), { blockKey });
  };

  const handleDeleteRequest = (name: string): void => {
    const doc = getDoc();
    if (!doc) return;
    if (laneInUse(doc.model, name)) {
      const otherLanes = lanes.map((l) => l.name).filter((n) => n !== name);
      setDeleteDialog({ laneName: name, otherLanes });
      setDestinationLane(otherLanes[0] ?? '');
    } else {
      const path = session.selection?.blockKey === blockKey ? (session.selection.path ?? []) : [];
      store.applyOp(deleteLane(doc, name, undefined, path), { blockKey });
    }
  };

  const confirmDelete = (): void => {
    if (!deleteDialog) return;
    const doc = getDoc();
    if (!doc) return;
    const path = session.selection?.blockKey === blockKey ? (session.selection.path ?? []) : [];
    store.applyOp(deleteLane(doc, deleteDialog.laneName, destinationLane || undefined, path), { blockKey });
    setDeleteDialog(null);
  };

  return (
    <section className="lane-list" aria-label={t('flow.lanes.title')}>
      <h3 className="lane-list__title">{t('flow.lanes.title')}</h3>
      {lanes.length === 0 && <p className="lane-list__none">{t('flow.lanes.none')}</p>}
      <ul className="lane-list__items">
        {lanes.map((lane, i) => (
          <li key={lane.name} className="lane-list__item">
            <input
              type="text"
              className="lane-list__name"
              aria-label={t('flow.lanes.name', { n: i + 1 })}
              defaultValue={lane.name}
              readOnly={readOnly}
              onBlur={(e) => {
                if (e.currentTarget.value !== lane.name) {
                  handleRename(lane.name, e.currentTarget.value);
                }
              }}
            />
            <button
              type="button"
              aria-label={t('flow.lanes.up', { lane: lane.name })}
              disabled={readOnly || i === 0}
              onClick={() => handleMoveUp(lane.name)}
            >
              {t('flow.lanes.up', { lane: lane.name })}
            </button>
            <button
              type="button"
              aria-label={t('flow.lanes.down', { lane: lane.name })}
              disabled={readOnly || i === lanes.length - 1}
              onClick={() => handleMoveDown(lane.name)}
            >
              {t('flow.lanes.down', { lane: lane.name })}
            </button>
            <button
              type="button"
              aria-label={t('flow.lanes.delete', { lane: lane.name })}
              disabled={readOnly}
              onClick={() => handleDeleteRequest(lane.name)}
            >
              {t('flow.lanes.delete', { lane: lane.name })}
            </button>
          </li>
        ))}
      </ul>
      <div className="lane-list__add">
        <label htmlFor="lane-new-name" className="lane-list__add-label">
          {t('flow.lanes.newName')}
        </label>
        <input
          id="lane-new-name"
          type="text"
          className="lane-list__new-name"
          value={newName}
          disabled={readOnly}
          onChange={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button
          type="button"
          className="lane-list__add-btn"
          disabled={readOnly || !newName.trim()}
          onClick={handleAdd}
        >
          {t('flow.lanes.add')}
        </button>
      </div>

      {deleteDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lane-delete-title"
          className="lane-list__dialog"
        >
          <h4 id="lane-delete-title">{t('flow.lanes.deleteTitle', { lane: deleteDialog.laneName })}</h4>
          <p>{t('flow.lanes.deleteBody', { lane: deleteDialog.laneName })}</p>
          <label htmlFor="lane-delete-dest">{t('flow.lanes.destination')}</label>
          <select
            id="lane-delete-dest"
            value={destinationLane}
            onChange={(e) => setDestinationLane(e.currentTarget.value)}
          >
            {deleteDialog.otherLanes.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <button type="button" onClick={confirmDelete}>
            {t('flow.lanes.deleteConfirm')}
          </button>
          <button type="button" onClick={() => setDeleteDialog(null)}>
            {t('flow.lanes.cancel')}
          </button>
        </div>
      )}
    </section>
  );
}
