// The project library (FR-006/AC8, AC10, FR-001/AC1, contracts/ui.md §2, data-model §7.6).
//
// - Every stored project is listed, most recently modified first, with its last-modified time, its
//   last-downloaded time or "never downloaded", and a "not downloaded" indicator when it changed after
//   its last download.
// - "Create project" writes a new record ("Untitled project", one empty screen) and only then opens it.
// - The page always states that projects are not synchronised between browsers or devices.
// - The `library` slot adds header entries beside "Create project" (Import) and row entries to every
//   project (Rename, Duplicate, Delete, Download). Commands that change stored projects call
//   `refreshLibrary()` so the list re-reads storage.
import { useCallback, useEffect, useId, useState } from 'react';
import { createProject } from '../../core/project/project.ts';
import { listProjects, putProject, type EditorDatabase, type ProjectRecord } from '../../services/storage/db.ts';
import { slots as defaultSlots, useSlot, type LibraryItem, type SlotContext, type Slots } from '../app/slots.ts';
import { t } from '../messages/en.ts';

/** What the library needs from storage; `dbLibraryStorage` provides it over IndexedDB. */
export interface LibraryStorage {
  list(): Promise<readonly ProjectRecord[]>;
  /** Writes the whole record in one transaction. */
  put(record: ProjectRecord): Promise<void>;
}

export function dbLibraryStorage(db: EditorDatabase): LibraryStorage {
  return { list: () => listProjects(db), put: (record) => putProject(db, record) };
}

/** A new project's record (data-model §7.6 "Create"): never downloaded, revision 1. */
export function newProjectRecord(id: string, now: string): ProjectRecord {
  const project = createProject();
  return {
    id,
    name: project.name,
    source: project.source,
    flowIndex: project.flowIndex,
    lastWorking: project.lastWorking.map((e) => ({ ...e })),
    createdAt: now,
    modifiedAt: now,
    revision: 1,
    downloadedAt: null,
    downloadedRevision: null,
  };
}

/** data-model §3.1: the project has changes that are in no downloaded file. */
export function hasChangesNotDownloaded(record: ProjectRecord): boolean {
  return record.downloadedRevision === null || record.downloadedRevision !== record.revision;
}

/** The route of a project's workspace (contracts/ui.md §1). */
export const projectHref = (id: string): string => `#/project/${encodeURIComponent(id)}`;

// ------------------------------------------------------------------------------------- refresh signal

const refreshListeners = new Set<() => void>();

/** Makes every mounted library re-read storage (after a rename, duplicate, delete or import). */
export function refreshLibrary(): void {
  for (const listener of [...refreshListeners]) listener();
}

// -------------------------------------------------------------------------------------------- view

const defaultFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export interface LibraryProps {
  readonly storage: LibraryStorage;
  /** Opens a project's workspace; the default sets the hash route. */
  readonly onOpen?: (id: string) => void;
  readonly now?: () => string;
  readonly newId?: () => string;
  /** Formats an ISO 8601 timestamp for display. */
  readonly formatTime?: (iso: string) => string;
  readonly slots?: Slots;
}

const NO_CONTEXT: SlotContext = { projectId: null, block: null, selection: null };

type Listing =
  | { readonly state: 'loading' }
  | { readonly state: 'failed' }
  | { readonly state: 'ready'; readonly projects: readonly ProjectRecord[] };

const byModifiedDesc = (a: ProjectRecord, b: ProjectRecord): number =>
  a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : a.name.localeCompare(b.name);

function navigate(id: string): void {
  window.location.hash = projectHref(id);
}

export function Library({
  storage,
  onOpen = navigate,
  now = () => new Date().toISOString(),
  newId = () => crypto.randomUUID(),
  formatTime = (iso) => defaultFormat.format(new Date(iso)),
  slots = defaultSlots,
}: LibraryProps) {
  const headingId = useId();
  const items = useSlot(slots.library);
  const [listing, setListing] = useState<Listing>({ state: 'loading' });
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  const load = useCallback(() => {
    let current = true;
    storage.list().then(
      (projects) => current && setListing({ state: 'ready', projects: [...projects].sort(byModifiedDesc) }),
      () => current && setListing({ state: 'failed' }),
    );
    return () => {
      current = false;
    };
  }, [storage]);

  useEffect(() => {
    let cancel = load();
    const reload = () => {
      cancel();
      cancel = load();
    };
    refreshListeners.add(reload);
    return () => {
      refreshListeners.delete(reload);
      cancel();
    };
  }, [load]);

  const create = async (): Promise<void> => {
    setCreating(true);
    setCreateFailed(false);
    const record = newProjectRecord(newId(), now());
    try {
      await storage.put(record);
    } catch {
      setCreating(false);
      setCreateFailed(true);
      return;
    }
    setCreating(false);
    onOpen(record.id);
  };

  const header = items.filter((i) => i.placement === 'header');
  const rowItems = items.filter((i) => i.placement === 'row');

  return (
    <section className="library" aria-labelledby={headingId}>
      <h1 id={headingId}>{t('library.heading')}</h1>
      <div className="library-actions">
        <button type="button" onClick={() => void create()} disabled={creating}>
          {t('library.create')}
        </button>
        {header.map(({ id, Component }) => (
          <Component key={id} ctx={NO_CONTEXT} />
        ))}
      </div>
      {createFailed && <p role="alert">{t('library.createFailed')}</p>}
      <p className="library-statement">{t('library.notSynchronised')}</p>
      {listing.state === 'loading' && <p>{t('library.loading')}</p>}
      {listing.state === 'failed' && <p role="alert">{t('library.loadFailed')}</p>}
      {listing.state === 'ready' && listing.projects.length === 0 && <p>{t('library.empty')}</p>}
      {listing.state === 'ready' && listing.projects.length > 0 && (
        <ul aria-label={t('library.listLabel')} className="library-list">
          {listing.projects.map((project) => (
            <ProjectRow key={project.id} project={project} items={rowItems} formatTime={formatTime} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}

interface ProjectRowProps {
  readonly project: ProjectRecord;
  readonly items: readonly LibraryItem[];
  readonly formatTime: (iso: string) => string;
  readonly onOpen: (id: string) => void;
}

function ProjectRow({ project, items, formatTime, onOpen }: ProjectRowProps) {
  const nameId = useId();
  const downloaded = project.downloadedAt;
  // A never-downloaded project says so; the indicator marks changes made after a download (ui.md §2).
  const changedSince = downloaded !== null && hasChangesNotDownloaded(project);
  return (
    <li aria-labelledby={nameId} className="library-row">
      <a
        id={nameId}
        href={projectHref(project.id)}
        onClick={(event) => {
          // A modified click keeps the browser's own behaviour (a new tab or window).
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          onOpen(project.id);
        }}
      >
        {project.name}
      </a>
      <span className="library-modified">
        <TimeText messageKey="library.lastModified" iso={project.modifiedAt} formatTime={formatTime} />
      </span>
      <span className="library-downloaded">
        {downloaded === null ? (
          t('status.neverDownloaded')
        ) : (
          <TimeText messageKey="library.lastDownloaded" iso={downloaded} formatTime={formatTime} />
        )}
      </span>
      {changedSince && <strong className="library-not-downloaded">{t('library.notDownloaded')}</strong>}
      {items.length > 0 && (
        <span role="group" aria-label={t('library.rowCommands', { name: project.name })} className="library-row-commands">
          {items.map(({ id, Component }) => (
            <Component key={id} ctx={NO_CONTEXT} projectId={project.id} />
          ))}
        </span>
      )}
    </li>
  );
}

/** A catalogue message with its `{time}` part marked up as a machine-readable `<time>`. */
function TimeText({ messageKey, iso, formatTime }: { readonly messageKey: string; readonly iso: string; readonly formatTime: (iso: string) => string }) {
  const marker = '\u0000';
  const [before = '', after = ''] = t(messageKey, { time: marker }).split(marker);
  return (
    <>
      {before}
      <time dateTime={iso}>{formatTime(iso)}</time>
      {after}
    </>
  );
}
