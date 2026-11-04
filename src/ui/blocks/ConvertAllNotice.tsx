// The one "Convert all" notice per import with older-format blocks (T113; FR-010/AC7, section 3.6 "Import").
//
// When a project opens that holds older-format Salt and has not been changed since it was created (a fresh
// import: revision 1), one non-blocking notice offers "Convert all". It is shown at most once per project in a
// session, however often the workspace re-renders. "Convert all" converts every older-format block as one
// undoable edit; nothing is ever converted without the user choosing to.
import { useEffect } from 'react';
import { convertAllOlderFormat } from '../../core/blocks/convert.ts';
import type { ProjectRecord } from '../../services/storage/db.ts';
import { announce as defaultAnnounce } from '../announcer/Announcer.tsx';
import type { SlotProps } from '../app/slots.ts';
import { useSession, useStore, type Store } from '../app/store.ts';
import { notices as appNotices, type NoticesStore } from '../notices/Notices.tsx';

/** A project that has not changed since it was created: a fresh import, or a new project. */
const isUnchangedSinceImport = (record: ProjectRecord): boolean => record.revision <= 1;

/** "Convert all": every older-format block in one undoable edit. */
export function convertAll(store: Store, announce: (key: string, params?: Record<string, number>) => void = defaultAnnounce): void {
  const state = store.getState();
  if (!state) return;
  const edits = convertAllOlderFormat(state.source);
  const first = store.getSnapshot().blocks.find((b) => b.status === 'Older format');
  if (edits.length === 0 || !first) {
    announce('blocks.announce.nothingToConvert');
    return;
  }
  const count = store.getSnapshot().blocks.filter((b) => b.classification.olderFormat).length;
  store.applyEdits(edits, {
    nameKey: 'blocks.history.convertAll',
    blockKey: first.key,
    announceKey: 'blocks.announce.convertedAll',
    announceParams: { count },
  });
}

export interface ConvertAllNoticeProps extends Partial<SlotProps> {
  /** Where the notice is shown; the application's notices by default. */
  readonly notices?: NoticesStore;
}

/** Shows the notice when a freshly imported project with older-format blocks opens. Renders nothing itself. */
export function ConvertAllNotice({ notices = appNotices }: ConvertAllNoticeProps) {
  const session = useSession();
  const store = useStore();
  const projectId = session.projectId;

  useEffect(() => {
    const { record, blocks } = store.getSnapshot();
    if (projectId === null || !record || record.id !== projectId || !isUnchangedSinceImport(record)) return;
    const count = blocks.filter((b) => b.status === 'Older format').length;
    if (count === 0) return;
    notices.show({
      kind: 'convertAll',
      key: `convertAll:${projectId}`,
      oncePerSession: `convertAll:${projectId}`,
      messageKey: 'blocks.convertAll.notice',
      params: { count },
      actions: [{ labelKey: 'blocks.convertAll', run: () => convertAll(store) }],
    });
  }, [projectId, store, notices]);

  return null;
}
