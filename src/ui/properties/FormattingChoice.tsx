// FormattingChoice: the "Keep formatting" / "Remove formatting" choice (T080; VO-059).
// Shown when a text property has imported creole formatting; the user must choose before
// any edit is applied (setProperty refuses with 'screen.refuse.formattingChoice').
import type { Path } from '../../core/types.ts';
import type { BlockView } from '../../core/project/project.ts';
import { useStore } from '../app/store.ts';
import { screenDoc } from '../../core/salt/destinations.ts';
import { setProperty } from '../../core/salt/ops/properties.ts';
import { shiftEdits } from '../canvas/canvas-keys.ts';
import { t } from '../messages/en.ts';
import type { PropertyName } from '../../core/salt/ops/properties.ts';

export interface FormattingChoiceProps {
  readonly blockKey: string;
  readonly view: BlockView;
  readonly path: Path;
  /** The property whose text has formatting. */
  readonly property: PropertyName;
  readonly currentText: string;
}

export function FormattingChoice({ blockKey, view, path, property, currentText }: FormattingChoiceProps) {
  const store = useStore();

  const apply = (formatting: 'keep' | 'remove'): void => {
    const state = store.getState();
    if (!state) return;
    const text = state.source.slice(view.start, view.end);
    const doc = screenDoc(text);
    if (!doc) return;
    const op = setProperty(doc, path, property, { text: currentText, formatting });
    if (op.ok) {
      store.applyOp({ ...op, edits: shiftEdits(op.edits, view.start) }, { blockKey });
    } else {
      store.applyOp(op);
    }
  };

  return (
    <div className="formatting-choice" role="group" aria-label={t('screen.formatting.description')}>
      <p className="formatting-choice__description">{t('screen.formatting.description')}</p>
      <div className="formatting-choice__buttons">
        <button type="button" className="formatting-choice__btn" onClick={() => apply('keep')}>
          {t('screen.formatting.keep')}
        </button>
        <button type="button" className="formatting-choice__btn" onClick={() => apply('remove')}>
          {t('screen.formatting.remove')}
        </button>
      </div>
    </div>
  );
}
