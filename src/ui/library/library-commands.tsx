// Library commands (FR-006/AC3, AC8, AC13, AC16, contracts/ui.md §2, data-model §7.6).
//
// - Each project row gets "Open", "Rename", "Duplicate", "Download" and "Delete".
// - "Rename" edits the name in place: Enter or "Save name" commits, Escape or "Cancel" keeps the old name. The
//   name is trimmed, and an empty name keeps the previous one with a message. The rename reaches every tab.
// - "Duplicate" stores "Copy of <name>", never downloaded.
// - "Delete" asks first (DeleteDialog); the confirmation says whether there are changes not downloaded and offers
//   "Download and delete". Other tabs showing the project are told.
// - The library header gets "Import .puml file", so an empty library offers both "Create project" and import.
// Each command re-reads the record first, so it acts on what is stored now, and refreshes the list afterwards.
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ProjectRecord } from '../../services/storage/db.ts';
import type { LibraryItem } from '../app/slots.ts';
import { t } from '../messages/en.ts';
import { ImportCommand } from '../storage/ImportCommand.tsx';
import { downloadRecord } from '../storage/DownloadCommand.tsx';
import type { StorageUi } from '../storage/StorageNotices.tsx';
import { DeleteDialog } from './DeleteDialog.tsx';
import { hasChangesNotDownloaded, refreshLibrary } from './Library.tsx';

/** The `library` slot entries. */
export function libraryItems(ui: StorageUi): LibraryItem[] {
  return [
    { id: 'storage.import', placement: 'header', order: 10, Component: () => <ImportCommand ui={ui} labelKey="storage.library.import" /> },
    {
      id: 'storage.rowCommands',
      placement: 'row',
      order: 10,
      Component: ({ projectId }) => (projectId ? <LibraryRowCommands ui={ui} projectId={projectId} /> : null),
    },
  ];
}

type Mode = { readonly kind: 'idle' } | { readonly kind: 'renaming'; readonly record: ProjectRecord } | { readonly kind: 'deleting'; readonly record: ProjectRecord };

export function LibraryRowCommands({ ui, projectId }: { readonly ui: StorageUi; readonly projectId: string }) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);

  const failed = (): void => {
    ui.notices.show({ kind: 'libraryFailed', key: 'libraryFailed', messageKey: 'storage.library.failed' });
  };

  /** The stored record, or `null` (with a notice and a refresh) when it has gone. */
  const current = async (): Promise<ProjectRecord | null> => {
    let record: ProjectRecord | undefined;
    try {
      record = await ui.projects.get(projectId);
    } catch {
      failed();
      return null;
    }
    if (!record) {
      ui.notices.show({ kind: 'libraryMissing', key: 'libraryMissing', messageKey: 'storage.library.missing' });
      refreshLibrary();
      return null;
    }
    return record;
  };

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await fn();
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------------------------------ rename
  const startRename = () =>
    void run(async () => {
      const record = await current();
      if (!record) return;
      setTyped(record.name);
      setMode({ kind: 'renaming', record });
    });

  const endRename = (): void => {
    setMode({ kind: 'idle' });
    // The field is gone after this render; focus goes back to the command.
    setTimeout(() => renameButton.current?.focus(), 0);
  };

  const commitRename = (event: FormEvent): void => {
    event.preventDefault();
    if (mode.kind !== 'renaming') return;
    const before = mode.record.name;
    void run(async () => {
      if (typed.trim() === '') {
        ui.announce('storage.library.renameEmpty', { name: before });
        endRename();
        return;
      }
      const renamed = await ui.projects.rename(projectId, typed, ui.now());
      endRename();
      if (!renamed) {
        ui.notices.show({ kind: 'libraryMissing', key: 'libraryMissing', messageKey: 'storage.library.missing' });
        refreshLibrary();
        return;
      }
      if (renamed.name === before) return;
      ui.tabs.broadcast({ type: 'project-renamed', projectId, name: renamed.name });
      refreshLibrary();
      ui.announce('storage.library.renamed', { name: renamed.name });
    });
  };

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    endRename();
  };

  // ---------------------------------------------------------------------------- duplicate, download
  const duplicate = () =>
    void run(async () => {
      const copy = await ui.projects.duplicate(projectId, ui.newId(), ui.now());
      if (!copy) {
        await current();
        return;
      }
      refreshLibrary();
      ui.announce('storage.library.duplicated', { name: copy.name });
    });

  const download = () =>
    void run(async () => {
      const record = await current();
      if (!record) return;
      await downloadRecord(ui, record);
      refreshLibrary();
    });

  // ------------------------------------------------------------------------------------------ delete
  const startDelete = () =>
    void run(async () => {
      const record = await current();
      if (record) setMode({ kind: 'deleting', record });
    });

  const cancelDelete = (): void => {
    setMode({ kind: 'idle' });
    setTimeout(() => deleteButton.current?.focus(), 0);
  };

  const remove = (record: ProjectRecord, downloadFirst: boolean) =>
    void run(async () => {
      if (downloadFirst) await downloadRecord(ui, record);
      await ui.projects.remove(projectId);
      setMode({ kind: 'idle' });
      ui.tabs.broadcast({ type: 'project-deleted', projectId });
      refreshLibrary();
      ui.announce('storage.library.deleted', { name: record.name });
    });

  return (
    <>
      <button type="button" disabled={busy} onClick={() => ui.navigate(projectId)}>
        {t('storage.library.open')}
      </button>
      {mode.kind === 'renaming' ? (
        <form className="library-rename" onSubmit={commitRename}>
          <input
            type="text"
            aria-label={t('storage.library.renameLabel', { name: mode.record.name })}
            value={typed}
            autoFocus
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={onRenameKey}
          />
          <button type="submit" disabled={busy}>
            {t('storage.library.renameSave')}
          </button>
          <button type="button" onClick={endRename}>
            {t('storage.library.renameCancel')}
          </button>
        </form>
      ) : (
        <button type="button" ref={renameButton} disabled={busy} onClick={startRename}>
          {t('storage.library.rename')}
        </button>
      )}
      <button type="button" disabled={busy} onClick={duplicate}>
        {t('storage.library.duplicate')}
      </button>
      <button type="button" disabled={busy} onClick={download}>
        {t('storage.library.download')}
      </button>
      <button type="button" ref={deleteButton} disabled={busy} onClick={startDelete}>
        {t('storage.library.delete')}
      </button>
      {mode.kind === 'deleting' && (
        <DeleteDialog
          name={mode.record.name}
          changesNotDownloaded={hasChangesNotDownloaded(mode.record)}
          busy={busy}
          onDelete={() => remove(mode.record, false)}
          onDownloadAndDelete={() => remove(mode.record, true)}
          onCancel={cancelDelete}
        />
      )}
    </>
  );
}
