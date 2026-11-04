// User Story 2 registrations (T103): keep work safe in the browser and exchange it as a file.
//
// - library: "Import .puml file" beside "Create project", and each row's "Open", "Rename", "Duplicate",
//   "Download" and "Delete" (with the delete confirmation).
// - toolbar: "Import .puml file" and "Download".
// - banners: the tab banner, which also runs the one-editing-tab protocol (history cleared on handover), and the
//   storage notices (write failures with "Download a backup", persistence, private window, backup reminder).
// - Renames and deletions from other tabs refresh the library.
//
// `useProjectReadOnly` gives the workspace the tab's read-only state (another tab edits the project, a handover
// is under way, or the project was deleted elsewhere).
import { useSyncExternalStore } from 'react';
import { pickFile, localDate } from '../../services/files/import-file.ts';
import { saveBlob } from '../../services/files/download.ts';
import { openEditorDb, type EditorDatabase } from '../../services/storage/db.ts';
import { dbProjectStore } from '../../services/storage/library-ops.ts';
import { requestPersistence } from '../../services/storage/persistence.ts';
import { browserTabsOptions, createTabs } from '../../services/storage/tabs.ts';
import { announce } from '../announcer/Announcer.tsx';
import { slots as appSlots, type Slots } from '../app/slots.ts';
import { libraryItems } from '../library/library-commands.tsx';
import { projectHref, refreshLibrary } from '../library/Library.tsx';
import { notices } from '../notices/Notices.tsx';
import { DownloadCommand } from './DownloadCommand.tsx';
import { ImportCommand } from './ImportCommand.tsx';
import { createStorageSession, StorageNotices, type StorageUi } from './StorageNotices.tsx';
import { TabBanner } from './TabBanner.tsx';

/** The application's storage services over the browser's IndexedDB, Web Locks and BroadcastChannel. */
export function createAppStorageUi(): StorageUi {
  let db: Promise<EditorDatabase> | null = null;
  const tabs = createTabs(browserTabsOptions());
  tabs.onMessage((message) => {
    if (message.type === 'project-renamed' || message.type === 'project-deleted') refreshLibrary();
  });
  return {
    projects: dbProjectStore(() => (db ??= openEditorDb())),
    tabs,
    notices,
    announce,
    now: () => new Date().toISOString(),
    today: () => localDate(),
    newId: () => crypto.randomUUID(),
    save: (blob, fileName) => saveBlob(blob, fileName),
    pickFile: () => pickFile(),
    navigate: (projectId) => {
      window.location.hash = projectHref(projectId);
    },
    persistence: () => requestPersistence(),
    session: createStorageSession(),
  };
}

/** Adds every US2 contribution to `slots`; returns a function that removes them. */
export function registerStorage(slots: Slots, ui: StorageUi): () => void {
  const undo = [
    ...libraryItems(ui).map((item) => slots.library.register(item)),
    slots.toolbar.register({ id: 'storage.import', order: 10, Component: ({ ctx }) => <ImportCommand ui={ui} ctx={ctx} /> }),
    slots.toolbar.register({ id: 'storage.download', order: 20, Component: ({ ctx }) => <DownloadCommand ui={ui} ctx={ctx} /> }),
    slots.banners.register({ id: 'storage.tabBanner', order: -100, Component: ({ ctx }) => <TabBanner ui={ui} ctx={ctx} /> }),
    slots.banners.register({ id: 'storage.notices', order: -99, Component: () => <StorageNotices ui={ui} /> }),
  ];
  return () => undo.forEach((u) => u());
}

/** The application's storage services. */
export const appStorageUi: StorageUi = createAppStorageUi();

registerStorage(appSlots, appStorageUi);

/** Whether the workspace for `projectId` must be read-only in this tab (FR-006/AC12, AC16). */
export function useProjectReadOnly(projectId: string | null, ui: StorageUi = appStorageUi): boolean {
  const roles = ui.session.roles;
  const role = useSyncExternalStore(roles.subscribe, () => (projectId === null ? null : roles.get(projectId)));
  return role === 'readOnly' || role === 'handingOver' || role === 'deletedElsewhere';
}
