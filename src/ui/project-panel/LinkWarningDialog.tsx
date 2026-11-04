// The link warning (T129; FR-011/AC5, AC8). Before a screen that flow steps link to is renamed or deleted, a
// modal `alertdialog` lists the affected steps with "Proceed" and "Cancel". Cancel (or Esc) changes nothing.
// Focus starts on Cancel, Tab stays inside the dialog, and focus returns to where it was when it closes.
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { t } from '../messages/en.ts';

export interface LinkWarningDialogProps {
  /** The title and explanation (catalogue strings). */
  readonly title: string;
  readonly body: string;
  /** The affected steps' texts, in source order. */
  readonly steps: readonly string[];
  onProceed(): void;
  onCancel(): void;
}

const FOCUSABLE = 'button:not([disabled])';

export function LinkWarningDialog({ title, body, steps, onProceed, onCancel }: LinkWarningDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const listId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === 'Tab') {
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (focusable.length === 0) return;
      const at = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (at <= 0 ? focusable.length - 1 : at - 1) : (at + 1) % focusable.length;
      event.preventDefault();
      focusable[next]?.focus();
    }
  };

  return (
    <div className="move-to-backdrop">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="move-to link-warning"
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={bodyId}>{body}</p>
        <h3 id={listId}>{t('screens.warning.steps')}</h3>
        <ul aria-labelledby={listId}>
          {steps.map((step, i) => (
            <li key={i}>{step === '' ? t('screens.warning.untitledStep') : step}</li>
          ))}
        </ul>
        <div className="move-to__actions">
          <button type="button" onClick={onProceed}>
            {t('screens.warning.proceed')}
          </button>
          <button ref={cancelRef} type="button" onClick={onCancel}>
            {t('screens.warning.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
