// The tab banner (FR-006/AC12, AC16, FR-007/AC7, EC-14, data-model §6.6, §7.4, contracts/ui.md §11).
//
// Shown at the top of the canvas while the open project is not edited in this tab:
// - read-only: another tab holds the edit lock. This tab shows the version stored when it was opened and does not
//   update. "Edit here instead" saves the other tab's pending edits, loads the latest stored version and moves
//   editing here; the prompt says undo history is not carried over (both histories are emptied).
// - handing over: waiting for the other tab to save and let go.
// - deleted elsewhere: the project was deleted in another tab; its content (as this tab has it) can be downloaded.
//   This tab's unsaved changes are no longer written, so the deletion is not undone by an autosave.
//
// The banner also runs this tab's side of the protocol for the open project: it opens the tab session, flushes
// and clears history when another tab takes over, follows renames, and publishes the role on the role board.
import { useEffect, useRef, useState } from 'react';
import type { ProjectTab, ProjectTabHooks, TabRole } from '../../services/storage/tabs.ts';
import type { SlotContext } from '../app/slots.ts';
import { useSession, useStore, type Store } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { downloadSession } from './DownloadCommand.tsx';
import type { StorageUi } from './StorageNotices.tsx';

function hooksFor(ui: StorageUi, store: Store, projectId: string): ProjectTabHooks {
  return {
    flush: async () => (await store.flush()).status === 'saved',
    clearHistory: () => store.clearHistory(),
    async loadLatest() {
      const latest = await ui.projects.get(projectId);
      if (!latest) return;
      const before = store.getSnapshot();
      const openIndex = before.blocks.findIndex((b) => b.key === before.openBlockKey);
      store.load(latest);
      const block = store.getSnapshot().blocks[openIndex];
      if (block) store.openBlock(block.key);
    },
    onRenamed(name) {
      // Only the editing tab writes; its next save then carries the new name instead of the old one.
      if (ui.tabs.find(projectId)?.getRole() === 'editing') store.updateRecord({ name });
    },
    onDeleted() {
      // Reloading the in-memory record drops the pending autosave, so nothing writes the project back.
      const record = store.getSnapshot().record;
      if (record && record.id === projectId) store.load(record);
    },
  };
}

/** Opens this tab's session for the project and follows its role. */
export function useProjectTab(ui: StorageUi, store: Store, projectId: string | null): { role: TabRole | null; tab: ProjectTab | null } {
  const [state, setState] = useState<{ role: TabRole | null; tab: ProjectTab | null }>({ role: null, tab: null });
  const previous = useRef<TabRole | null>(null);
  useEffect(() => {
    if (projectId === null) return;
    const tab = ui.tabs.open(projectId, hooksFor(ui, store, projectId));
    const sync = (): void => {
      const role = tab.getRole();
      if (previous.current === 'handingOver' && role === 'editing') ui.announce('storage.tab.editingHere');
      previous.current = role;
      ui.session.roles.set(projectId, role);
      setState({ role, tab });
    };
    sync();
    const stop = tab.subscribe(sync);
    return () => {
      stop();
      tab.close();
      ui.session.roles.set(projectId, null);
    };
  }, [projectId, ui, store]);
  return state;
}

export function TabBanner({ ui }: { readonly ctx?: SlotContext; readonly ui: StorageUi }) {
  const store = useStore();
  const { projectId } = useSession();
  const { role, tab } = useProjectTab(ui, store, projectId);

  if (role === 'readOnly') {
    return (
      <div role="region" aria-label={t('storage.tab.banner')} className="tab-banner" data-role="readOnly">
        <p>{t('storage.tab.readOnly')}</p>
        <p>{t('storage.tab.editHerePrompt')}</p>
        <button type="button" onClick={() => void tab?.editHere()}>
          {t('storage.tab.editHere')}
        </button>
      </div>
    );
  }
  if (role === 'handingOver') {
    return (
      <div role="region" aria-label={t('storage.tab.banner')} className="tab-banner" data-role="handingOver">
        <p role="status">{t('storage.tab.handingOver')}</p>
      </div>
    );
  }
  if (role === 'deletedElsewhere') {
    return (
      <div role="region" aria-label={t('storage.tab.banner')} className="tab-banner" data-role="deletedElsewhere">
        <p>{t('storage.tab.deleted')}</p>
        <button type="button" onClick={() => downloadSession(ui, store)}>
          {t('storage.tab.downloadContent')}
        </button>
      </div>
    );
  }
  return null;
}
