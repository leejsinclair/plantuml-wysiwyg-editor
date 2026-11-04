// The rename field (T128; FR-011/AC7, contracts/ui.md §5). While the user types, the text is left exactly as
// typed and a preview says what will be saved ("Will be saved as Sign-in"). Enter or leaving the field commits;
// the owner converts the text (`normalise` through the screen operations) and either applies it or returns a
// refusal message, which is shown under the field while the previous name is kept. Esc drops the typing.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { normalise } from '../../core/names/names.ts';
import { t } from '../messages/en.ts';

export interface RenameFieldProps {
  /** The visible label (a catalogue string). */
  readonly label: string;
  /** The current name; '' for an unnamed screen. */
  readonly value: string;
  /** Commits typed text. Returns a refusal message to show, or `null` when it was applied or handed on. */
  onCommit(typed: string): string | null;
  /** Esc, or leaving the field with nothing to commit. */
  onCancel?(): void;
  readonly autoFocus?: boolean;
  readonly readOnly?: boolean;
}

export function RenameField({ label, value, onCommit, onCancel, autoFocus = false, readOnly = false }: RenameFieldProps) {
  const id = useId();
  const previewId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // `null` while the field shows the committed name. A ref as well, so a blur right after Enter sees the commit.
  const [draft, setDraftState] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setDraft = (next: string | null): void => {
    draftRef.current = next;
    setDraftState(next);
  };

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autoFocus]);

  const commit = (): void => {
    const typed = draftRef.current;
    setDraft(null);
    if (readOnly || typed === null || typed === value) {
      onCancel?.();
      return;
    }
    setError(onCommit(typed));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
      setError(null);
      onCancel?.();
    }
  };

  const typing = draft !== null && draft !== value;
  const converted = typing ? normalise(draft) : '';
  const describedBy = [typing ? previewId : null, error !== null ? errorId : null].filter((x) => x !== null).join(' ');

  return (
    <div className="property-field rename-field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={draft ?? value}
        readOnly={readOnly}
        aria-invalid={error !== null ? true : undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        onChange={(event) => {
          if (readOnly) return;
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {typing && (
        <p id={previewId} className="property-description">
          {converted === '' ? t('screens.rename.previewEmpty') : t('screens.rename.preview', { name: converted })}
        </p>
      )}
      {error !== null && (
        <p id={errorId} className="property-description rename-field__error">
          {error}
        </p>
      )}
    </div>
  );
}
