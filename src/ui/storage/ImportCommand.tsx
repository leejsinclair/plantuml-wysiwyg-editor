// "Import .puml file" (FR-006/AC5, AC13, AC17, FR-016/AC1): in the toolbar and in the library.
//
// The picker opens; cancelling it does nothing. A file that is not UTF-8 text is refused with an explanation and
// nothing is created. Otherwise a new project is stored, named after the file (with the import date appended if
// the name is already used), and opened on its first editable screen, else its flow, else its first block.
import { useState } from 'react';
import { importProjectFile } from '../../services/files/import-file.ts';
import type { SlotContext } from '../app/slots.ts';
import { refreshLibrary } from '../library/Library.tsx';
import { t } from '../messages/en.ts';
import type { StorageUi } from './StorageNotices.tsx';
import { IconFileImport } from '@tabler/icons-react';

const REFUSED = { 'not-utf8': 'storage.import.notUtf8', binary: 'storage.import.binary', storage: 'storage.import.failed' } as const;

/** Runs the whole import; resolves once the new project is opening, or nothing happened. */
export async function runImport(ui: StorageUi): Promise<void> {
  const file = await ui.pickFile();
  if (!file) return;
  const outcome = await importProjectFile(file, {
    listNames: async () => (await ui.projects.list()).map((p) => p.name),
    put: (record) => ui.projects.put(record),
    newId: ui.newId,
    now: ui.now,
    today: ui.today,
  });
  if (!outcome.ok) {
    ui.notices.show({ kind: 'importRefused', key: 'importRefused', messageKey: REFUSED[outcome.reason], params: { file: file.name } });
    return;
  }
  ui.session.pendingOpen.set(outcome.record.id, { index: outcome.openIndex, noticeKey: outcome.noticeKey });
  refreshLibrary();
  ui.navigate(outcome.record.id);
}

export interface ImportCommandProps {
  readonly ui: StorageUi;
  readonly ctx?: SlotContext;
  /** The library has its own label key; the toolbar uses the shared one. */
  readonly labelKey?: string;
}

export function ImportCommand({ ui, labelKey = 'toolbar.import' }: ImportCommandProps) {
  const [busy, setBusy] = useState(false);
  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      await runImport(ui);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="import-command" aria-busy={busy || undefined} onClick={() => void run()}>
      <IconFileImport size={16} aria-hidden="true" />
      {t(labelKey)}
    </button>
  );
}
