// The delete confirmation (FR-006/AC3, contracts/ui.md §2): an `alertdialog` that says whether the project has
// changes that have not been downloaded and, when it has, offers "Download and delete". Focus starts on
// "Cancel", stays inside the dialog, and Escape cancels.
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { t } from '../messages/en.ts';

export interface DeleteDialogProps {
  readonly name: string;
  readonly changesNotDownloaded: boolean;
  readonly busy?: boolean;
  onDownloadAndDelete(): void;
  onDelete(): void;
  onCancel(): void;
}

export function DeleteDialog({ name, changesNotDownloaded, busy = false, onDownloadAndDelete, onDelete, onCancel }: DeleteDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
    if (buttons.length === 0) return;
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="dialog delete-dialog"
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{t('storage.delete.title', { name })}</h2>
        <div id={descriptionId}>
          <p>{t(changesNotDownloaded ? 'storage.delete.notDownloaded' : 'storage.delete.upToDate')}</p>
          <p>{t('storage.delete.cannotUndo')}</p>
        </div>
        <div className="dialog__actions">
          {changesNotDownloaded && (
            <button type="button" disabled={busy} onClick={onDownloadAndDelete}>
              {t('storage.delete.downloadAndDelete')}
            </button>
          )}
          <button type="button" disabled={busy} onClick={onDelete}>
            {t('storage.delete.confirm')}
          </button>
          <button type="button" ref={cancel} disabled={busy} onClick={onCancel}>
            {t('storage.delete.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
