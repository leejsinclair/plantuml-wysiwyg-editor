// Library operations on the project store (data-model §3.1, §7.5, §7.6; FR-006/AC3, AC8).
//
// - Create: "Untitled project" with one empty screen, revision 1, never downloaded.
// - Rename: the name is trimmed; an empty result keeps the previous name. The modified time changes.
// - Duplicate: "Copy of <name>" with the same source, flow and last working versions; never downloaded.
// - Delete: the record is removed.
// - Mark downloaded: only a `.puml` download calls this. It records the revision that was downloaded, so a
//   newer stored revision still shows changes not downloaded.
//
// Each change reads and writes the whole record in one transaction.

import { createProject, type ProjectState } from '../../core/project/project.ts';
import { deleteProject, getProject, listProjects, putProject, type EditorDatabase, type ProjectRecord } from './db.ts';

export type DownloadState = 'never' | 'upToDate' | 'changesNotDownloaded';

/** data-model §7.5. */
export function downloadState(record: ProjectRecord): DownloadState {
  if (record.downloadedRevision === null || record.downloadedAt === null) return 'never';
  return record.downloadedRevision === record.revision ? 'upToDate' : 'changesNotDownloaded';
}

/** A record for a project made from `state`: revision 1, never downloaded. */
export function importedProjectRecord(id: string, name: string, state: ProjectState, now: string): ProjectRecord {
  return {
    id,
    name,
    source: state.source,
    flowIndex: state.flowIndex,
    lastWorking: state.lastWorking.map((e) => ({ blockIndex: e.blockIndex, text: e.text })),
    createdAt: now,
    modifiedAt: now,
    revision: 1,
    downloadedAt: null,
    downloadedRevision: null,
  };
}

export async function createProjectRecord(db: EditorDatabase, id: string, now: string): Promise<ProjectRecord> {
  const project = createProject();
  const record = importedProjectRecord(id, project.name, project, now);
  await putProject(db, record);
  return record;
}

/** Changes one stored record in a single read-modify-write transaction; `null` when it no longer exists. */
async function change(db: EditorDatabase, id: string, fn: (r: ProjectRecord) => ProjectRecord): Promise<ProjectRecord | null> {
  const tx = db.transaction('projects', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return null;
  }
  const next = fn(current);
  if (next !== current) await tx.store.put(next);
  await tx.done;
  return next;
}

export function renameProject(db: EditorDatabase, id: string, typed: string, now: string): Promise<ProjectRecord | null> {
  const name = typed.trim();
  return change(db, id, (r) => (name === '' || name === r.name ? r : { ...r, name, modifiedAt: now }));
}

export async function duplicateProject(db: EditorDatabase, id: string, newId: string, now: string): Promise<ProjectRecord | null> {
  const original = await getProject(db, id);
  if (!original) return null;
  const copy = importedProjectRecord(newId, `Copy of ${original.name}`, original, now);
  await putProject(db, copy);
  return copy;
}

export function removeProject(db: EditorDatabase, id: string): Promise<void> {
  return deleteProject(db, id);
}

/** Records a `.puml` download of `revision` (data-model §7.5). */
export function markDownloaded(db: EditorDatabase, id: string, revision: number, now: string): Promise<ProjectRecord | null> {
  return change(db, id, (r) => ({ ...r, downloadedAt: now, downloadedRevision: revision }));
}

/** The library operations over a database opened on first use; the UI is given this. */
export interface ProjectStore {
  get(id: string): Promise<ProjectRecord | undefined>;
  list(): Promise<ProjectRecord[]>;
  put(record: ProjectRecord): Promise<void>;
  rename(id: string, typed: string, now: string): Promise<ProjectRecord | null>;
  duplicate(id: string, newId: string, now: string): Promise<ProjectRecord | null>;
  remove(id: string): Promise<void>;
  markDownloaded(id: string, revision: number, now: string): Promise<ProjectRecord | null>;
}

export function dbProjectStore(database: () => Promise<EditorDatabase>): ProjectStore {
  return {
    get: async (id) => getProject(await database(), id),
    list: async () => listProjects(await database()),
    put: async (record) => putProject(await database(), record),
    rename: async (id, typed, now) => renameProject(await database(), id, typed, now),
    duplicate: async (id, newId, now) => duplicateProject(await database(), id, newId, now),
    remove: async (id) => removeProject(await database(), id),
    markDownloaded: async (id, revision, now) => markDownloaded(await database(), id, revision, now),
  };
}
