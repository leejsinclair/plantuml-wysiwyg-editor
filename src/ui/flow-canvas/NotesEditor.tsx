// NotesEditor: add/edit/delete notes on the selected element (T154; FR-012/AC1; contracts/ui.md §8).
import type { BlockEditorProps } from '../app/slots.ts';
import { useStore, useSession } from '../app/store.ts';
import { flowDoc, resolve } from '../../core/activity/destinations.ts';
import { addNote, setNoteText, setNoteSide, removeNote } from '../../core/activity/ops/notes.ts';
import { t } from '../messages/en.ts';
import type { ScreenFlow } from '../../core/activity/model.ts';

export function NotesEditor({ blockKey, model, selection: _selection, readOnly }: BlockEditorProps<ScreenFlow>) {
  const store = useStore();
  const session = useSession();

  const getDoc = () => {
    const state = store.getState();
    const view = session.blocks.find((b) => b.key === blockKey);
    if (!state || !view) return null;
    const text = state.source.slice(view.start, view.end);
    return flowDoc(text, view.start);
  };

  const path = session.selection?.blockKey === blockKey ? (session.selection.path ?? null) : null;

  // Derive notes from model + selection
  const notes = (() => {
    if (!path || !model) return [];
    const r = resolve(model, path);
    if (!r || r.type !== 'element') return [];
    return r.element.notes ?? [];
  })();

  if (!path) return null;

  return (
    <section className="notes-editor" aria-label={t('flow.notes.title')}>
      <h3 className="notes-editor__title">{t('flow.notes.title')}</h3>
      {notes.length === 0 && <p className="notes-editor__none">{t('flow.notes.none')}</p>}
      {notes.map((note, i) => (
        <div key={i} className="notes-editor__note">
          <label htmlFor={`note-text-${i}`} className="notes-editor__label">
            {t('flow.notes.text', { n: i + 1 })}
          </label>
          <input
            id={`note-text-${i}`}
            type="text"
            className="notes-editor__input"
            defaultValue={note.text.text}
            readOnly={readOnly}
            onBlur={(e) => {
              const doc = getDoc();
              if (!doc || !path) return;
              store.applyOp(setNoteText(doc, path, i, e.currentTarget.value), { blockKey });
            }}
          />
          <label htmlFor={`note-side-${i}`} className="notes-editor__label">
            {t('flow.notes.side', { n: i + 1 })}
          </label>
          <select
            id={`note-side-${i}`}
            className="notes-editor__select"
            value={note.side}
            disabled={readOnly}
            onChange={(e) => {
              const doc = getDoc();
              if (!doc || !path) return;
              store.applyOp(setNoteSide(doc, path, i, e.currentTarget.value as 'left' | 'right'), { blockKey });
            }}
          >
            <option value="left">{t('flow.notes.left')}</option>
            <option value="right">{t('flow.notes.right')}</option>
          </select>
          <button
            type="button"
            className="notes-editor__delete"
            aria-label={t('flow.notes.delete', { n: i + 1 })}
            disabled={readOnly}
            onClick={() => {
              const doc = getDoc();
              if (!doc || !path) return;
              store.applyOp(removeNote(doc, path, i), { blockKey });
            }}
          >
            {t('flow.notes.delete', { n: i + 1 })}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="notes-editor__add"
        disabled={readOnly}
        onClick={() => {
          const doc = getDoc();
          if (!doc || !path) return;
          store.applyOp(addNote(doc, path), { blockKey });
        }}
      >
        {t('flow.notes.add')}
      </button>
    </section>
  );
}
