// A text property (FR-003, FR-007/AC13). Typing stays in the field until it loses focus or Enter is
// pressed; then the value is committed through the store as one `propertyTyping` history entry.
//
// While the field has focus, the undo shortcut first undoes the uncommitted typing in the field, and only
// when there is none does it undo the project history. Redo mirrors it. Esc drops uncommitted typing. These
// keys are handled here and not passed on, so the workspace's own undo shortcut does not also run.
import { useId, useState, type KeyboardEvent } from 'react';
import type { OpResult } from '../../core/types.ts';
import { useStore } from '../app/store.ts';
import { keyCommand, platformFrom } from '../keys.ts';

const platform = platformFrom(typeof navigator === 'undefined' ? '' : navigator.userAgent);

export interface PropertyFieldProps {
  /** The visible label (a catalogue string). */
  readonly label: string;
  /** The committed value, from the block's model. */
  readonly value: string;
  /** Builds the operation for a changed value; called only when the value differs. */
  onCommit(value: string): OpResult;
  /** A hint shown under the field, such as a limit (a catalogue string). */
  readonly description?: string;
  /** The block the edit applies to; the open block by default. */
  readonly blockKey?: string;
  readonly readOnly?: boolean;
}

export function PropertyField({ label, value, onCommit, description, blockKey, readOnly = false }: PropertyFieldProps) {
  const store = useStore();
  const id = useId();
  const descriptionId = useId();
  // `null` while the field shows the committed value; otherwise the uncommitted typing.
  const [draft, setDraft] = useState<string | null>(null);
  // Typing undone inside the field, for redo.
  const [undone, setUndone] = useState<string | null>(null);
  const dirty = draft !== null && draft !== value;

  const commit = (): void => {
    const typed = draft;
    setDraft(null);
    setUndone(null);
    if (readOnly || typed === null || typed === value) return;
    store.applyOp(onCommit(typed), { group: 'propertyTyping', ...(blockKey !== undefined ? { blockKey } : {}) });
    // The commit ends the typing run: the next commit is its own undo step.
    store.seal();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const command = keyCommand(event, platform);
    if (command === 'enter') {
      event.preventDefault();
      event.stopPropagation();
      commit();
    } else if (command === 'cancel' && dirty) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
      setUndone(null);
    } else if (command === 'undo') {
      event.preventDefault();
      event.stopPropagation();
      if (dirty) {
        setUndone(draft);
        setDraft(null);
      } else {
        setDraft(null);
        store.undo();
      }
    } else if (command === 'redo') {
      event.preventDefault();
      event.stopPropagation();
      if (undone !== null && !dirty) {
        setDraft(undone);
        setUndone(null);
      } else if (!dirty) {
        store.redo();
      }
    }
  };

  return (
    <div className="property-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={draft ?? value}
        readOnly={readOnly}
        aria-describedby={description !== undefined ? descriptionId : undefined}
        onChange={(event) => {
          if (readOnly) return;
          setDraft(event.target.value);
          setUndone(null);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {description !== undefined && (
        <p id={descriptionId} className="property-description">
          {description}
        </p>
      )}
    </div>
  );
}
