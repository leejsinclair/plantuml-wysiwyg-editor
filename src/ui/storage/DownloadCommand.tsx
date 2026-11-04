// The toolbar "Download" command and the download notices (FR-006/AC4, AC8, FR-014/AC1, AC6, EC-12,
// contracts/ui.md §3 and §11).
//
// - "Download" saves the open project's whole source as one `.puml` file, exactly as stored, and records the
//   download (only a `.puml` download counts). In the editing tab the record is updated through the store, so
//   its autosave keeps the download state; in a read-only tab the stored record is updated directly.
// - Non-blocking notices list the blocks standard PlantUML will report errors for and count the blocks not yet
//   checked; a separate notice says when the screen flow would import as other content.
// - The library's "Download" and "Download and delete", the backup reminder and "Download a backup" use the same
//   functions.
import type { BlockView } from '../../core/project/project.ts';
import { blocks, withKeys } from '../../core/project/project.ts';
import { downloadProject, type DownloadReport } from '../../services/files/download.ts';
import type { ProjectRecord } from '../../services/storage/db.ts';
import type { SlotContext } from '../app/slots.ts';
import { useSession, useStore, type Store } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { blockLabel } from '../project-panel/ProjectPanel.tsx';
import type { StorageUi } from './StorageNotices.tsx';
import { IconDownload } from '@tabler/icons-react';

const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/** Shows the notices a download calls for; nothing when every block has been rendered. */
export function showDownloadNotices(ui: StorageUi, report: DownloadReport): void {
  const names = (views: readonly BlockView[]) => list.format(views.map((b) => blockLabel(b)));
  if (report.unrenderable.length > 0) {
    ui.notices.show({
      kind: 'downloadReport',
      key: 'downloadReport',
      messageKey: 'storage.download.unrenderable',
      params: { count: report.unrenderable.length, blocks: names(report.unrenderable), unchecked: report.notChecked },
    });
  } else if (report.notChecked > 0) {
    ui.notices.show({ kind: 'downloadReport', key: 'downloadReport', messageKey: 'storage.download.notChecked', params: { unchecked: report.notChecked } });
  }
  if (report.flowWillBeOther) {
    ui.notices.show({
      kind: 'downloadFlow',
      key: 'downloadFlow',
      messageKey: 'storage.download.flowWillBeOther',
      params: { name: blockLabel(report.flowWillBeOther) },
    });
  }
}

/** Downloads the project open in the store, including edits not yet stored. */
export function downloadSession(ui: StorageUi, store: Store): void {
  const session = store.getSnapshot();
  const state = store.getState();
  const record = session.record;
  if (!record || !state) return;
  const report = downloadProject({ name: record.name, source: state.source, views: session.blocks }, { save: ui.save });
  showDownloadNotices(ui, report);
  const now = ui.now();
  const tab = ui.tabs.find(record.id);
  if (!tab || tab.getRole() === 'editing') store.updateRecord({ downloadedAt: now, downloadedRevision: record.revision });
  else void ui.projects.markDownloaded(record.id, record.revision, now).catch(() => undefined);
}

/** Downloads a stored project (from the library) and records the download. */
export async function downloadRecord(ui: StorageUi, record: ProjectRecord): Promise<void> {
  let n = 0;
  const views = blocks(withKeys(record, () => `d${++n}`));
  const report = downloadProject({ name: record.name, source: record.source, views }, { save: ui.save });
  showDownloadNotices(ui, report);
  await ui.projects.markDownloaded(record.id, record.revision, ui.now());
}

export function DownloadCommand({ ui }: { readonly ctx: SlotContext; readonly ui: StorageUi }) {
  const store = useStore();
  const session = useSession();
  if (session.projectId === null) return null;
  return (
    <button type="button" className="toolbar__download" onClick={() => downloadSession(ui, store)}>
      <IconDownload size={16} aria-hidden="true" />
      {t('toolbar.download')}
    </button>
  );
}
