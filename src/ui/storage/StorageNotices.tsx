// Storage notices for the open project (FR-006/AC7, AC9, AC11, EC-15, data-model §6.5, §6.8).
//
// - A failed write shows a prominent, non-blocking notice at once (well within 1 second) with advice and
//   "Download a backup". It stays while the autosave retries, follows a change of cause (quota or other), and is
//   removed with an announcement when a retry succeeds. The toolbar meanwhile reads "Saving…".
// - Persistent storage is requested once per session, when the first project opens; a refusal and a detectable
//   private window each give one non-blocking notice.
// - Returning to a project with changes not downloaded gives one non-blocking reminder per project per session.
//   A project that is new, imported or duplicated and not yet edited (revision 1, never downloaded) holds nothing
//   that is not already elsewhere, so it is not reminded about.
// - After an import, the chosen block is opened and the import's status (if any) is shown.
//
// This module also defines `StorageUi`, the services every US2 component is given.
import { useEffect, useRef } from 'react';
import type { MessageParams } from '../../core/types.ts';
import type { PersistenceResult } from '../../services/storage/persistence.ts';
import type { ProjectStore } from '../../services/storage/library-ops.ts';
import type { TabRole, Tabs } from '../../services/storage/tabs.ts';
import { useSession, useStore } from '../app/store.ts';
import { hasChangesNotDownloaded } from '../library/Library.tsx';
import type { NoticesStore } from '../notices/Notices.tsx';
import { downloadSession } from './DownloadCommand.tsx';

/** Each open project's tab role, for whatever must follow it (the workspace's read-only state). */
export interface RoleBoard {
  get(projectId: string): TabRole | null;
  set(projectId: string, role: TabRole | null): void;
  subscribe(listener: () => void): () => void;
}

export function createRoleBoard(): RoleBoard {
  const roles = new Map<string, TabRole>();
  const listeners = new Set<() => void>();
  return {
    get: (projectId) => roles.get(projectId) ?? null,
    set(projectId, role) {
      if ((roles.get(projectId) ?? null) === role) return;
      if (role === null) roles.delete(projectId);
      else roles.set(projectId, role);
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Facts held for the browser session (data-model §3.3: not stored). */
export interface StorageSession {
  /** `true` the first time it is called in the session: persistent storage is requested once. */
  claimPersistenceCheck(): boolean;
  /** Set by an import, read when the imported project opens: the block to open and a status to show. */
  readonly pendingOpen: Map<string, { readonly index: number; readonly noticeKey: string | null }>;
  readonly roles: RoleBoard;
}

export function createStorageSession(): StorageSession {
  let checked = false;
  return {
    claimPersistenceCheck() {
      if (checked) return false;
      checked = true;
      return true;
    },
    pendingOpen: new Map(),
    roles: createRoleBoard(),
  };
}

/** What the storage components use; `register.tsx` builds the application's. */
export interface StorageUi {
  readonly projects: ProjectStore;
  readonly tabs: Tabs;
  readonly notices: NoticesStore;
  readonly announce: (key: string, params?: MessageParams) => void;
  /** ISO 8601 timestamp. */
  readonly now: () => string;
  /** The local date appended to an imported name on a clash, e.g. "2026-10-28". */
  readonly today: () => string;
  readonly newId: () => string;
  /** Hands a file to the browser as a download. */
  readonly save: (blob: Blob, fileName: string) => void;
  /** The file picker; `null` when cancelled. */
  readonly pickFile: () => Promise<File | null>;
  /** Opens a project's workspace. */
  readonly navigate: (projectId: string) => void;
  readonly persistence: () => Promise<PersistenceResult>;
  readonly session: StorageSession;
}

export function StorageNotices({ ui }: { readonly ui: StorageUi }) {
  const store = useStore();
  const { projectId, save } = useSession();

  // ---------------------------------------------------------------------------------- write failures
  const failure = useRef<{ id: string; key: string } | null>(null);
  useEffect(() => {
    if (save.status === 'failed') {
      const key = save.lastError ?? 'storage.failed';
      if (failure.current?.key === key) return;
      const id = ui.notices.show({
        kind: 'storageFailure',
        key: 'storageFailure',
        prominent: true,
        messageKey: key,
        actions: [{ labelKey: 'storage.downloadBackup', keepOpen: true, run: () => downloadSession(ui, store) }],
      });
      failure.current = id === null ? null : { id, key };
    } else if (save.status === 'saved' && failure.current) {
      ui.notices.dismiss(failure.current.id);
      failure.current = null;
      ui.announce('storage.recovered');
    }
  }, [save.status, save.lastError, ui, store]);
  useEffect(
    () => () => {
      if (failure.current) ui.notices.dismiss(failure.current.id);
      failure.current = null;
    },
    [ui],
  );

  // ------------------------------------------------------------------ persistence, once per session
  useEffect(() => {
    if (projectId === null || !ui.session.claimPersistenceCheck()) return;
    void ui.persistence().then(
      (result) => {
        if (result.persisted === false) ui.notices.show({ kind: 'persistRefused', oncePerSession: 'persistRefused', messageKey: 'storage.persistRefused' });
        if (result.privateWindow) ui.notices.show({ kind: 'privateWindow', oncePerSession: 'privateWindow', messageKey: 'storage.privateWindow' });
      },
      () => {
        // Nothing could be learned; nothing is shown.
      },
    );
  }, [projectId, ui]);

  // ------------------------------------------------------------ opening: import target and reminder
  useEffect(() => {
    if (projectId === null) return;
    const pending = ui.session.pendingOpen.get(projectId);
    if (pending) {
      ui.session.pendingOpen.delete(projectId);
      const block = store.getSnapshot().blocks[pending.index];
      if (block) store.openBlock(block.key);
      if (pending.noticeKey) ui.notices.show({ kind: 'importStatus', key: 'importStatus', messageKey: pending.noticeKey });
    }
    const record = store.getSnapshot().record;
    if (!record || record.id !== projectId || !hasChangesNotDownloaded(record)) return;
    if (record.downloadedRevision === null && record.revision <= 1) return;
    ui.notices.show({
      kind: 'backupReminder',
      oncePerSession: `backupReminder:${record.id}`,
      messageKey: 'storage.reminder',
      params: { name: record.name },
      actions: [{ labelKey: 'storage.reminderDownload', run: () => downloadSession(ui, store) }],
    });
  }, [projectId, ui, store]);

  return null;
}
