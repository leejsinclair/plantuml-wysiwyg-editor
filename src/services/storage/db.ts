// IndexedDB layer (R-5, data-model §3). Each project is one record in `projects`, written whole in one
// transaction, so a write either completes or leaves the previous version in place.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DB_NAME = 'plantuml-editor';
export const DB_VERSION = 1;
const SETTINGS_KEY = 'settings';

/** data-model §3.2: a block's full text from the last time it parsed as category 1 or 2. */
export interface LastWorkingVersion {
  blockIndex: number;
  text: string;
}

/** data-model §3.1. */
export interface ProjectRecord {
  id: string;
  name: string;
  /** The whole `.puml` text exactly as it would be downloaded. */
  source: string;
  flowIndex: number | null;
  lastWorking: LastWorkingVersion[];
  createdAt: string;
  modifiedAt: string;
  revision: number;
  downloadedAt: string | null;
  downloadedRevision: number | null;
}

/** Collapsible workspace regions whose state is remembered (data-model §3.3). */
export type PanelRegion = 'project panel' | 'palette' | 'outline' | 'properties' | 'source' | 'preview';

/** data-model §3.3: one record per browser. */
export interface Settings {
  panels: Partial<Record<PanelRegion, { collapsed: boolean }>>;
  /** Per-project panel state, keyed by project id (FR-013). */
  projectPanels?: Partial<Record<string, Partial<Record<PanelRegion, { collapsed: boolean }>  >>>;
  /** Layout-lines display preference (FR-010). */
  layoutLines?: boolean;
}

/** No stored settings means outline, source and preview start collapsed; layout lines off. */
export const DEFAULT_SETTINGS: Settings = {
  panels: { outline: { collapsed: true }, source: { collapsed: true }, preview: { collapsed: true } },
  projectPanels: {},
  layoutLines: false,
};

export function getProjectPanelSettings(
  settings: Settings,
  projectId: string,
): Partial<Record<PanelRegion, { collapsed: boolean }>> {
  return settings.projectPanels?.[projectId] ?? {};
}

export async function putProjectPanelSettings(
  db: EditorDatabase,
  projectId: string,
  panels: Partial<Record<PanelRegion, { collapsed: boolean }>>,
): Promise<void> {
  const current = await getSettings(db);
  const next: Settings = { ...current, projectPanels: { ...(current.projectPanels ?? {}), [projectId]: panels } };
  return putSettings(db, next);
}

interface EditorSchema extends DBSchema {
  projects: { key: string; value: ProjectRecord };
  settings: { key: string; value: Settings };
}

export type EditorDatabase = IDBPDatabase<EditorSchema>;

export function openEditorDb(name: string = DB_NAME): Promise<EditorDatabase> {
  return openDB<EditorSchema>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('settings');
      }
    },
  });
}

/** Writes the whole record in one transaction. Rejects, leaving the stored version intact, on failure. */
export async function putProject(db: EditorDatabase, record: ProjectRecord): Promise<void> {
  const tx = db.transaction('projects', 'readwrite');
  try {
    await Promise.all([tx.store.put(record), tx.done]);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // already finished or aborted
    }
    // Wait for the abort to settle so a later read sees the previous version.
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export function getProject(db: EditorDatabase, id: string): Promise<ProjectRecord | undefined> {
  return db.get('projects', id);
}

export function listProjects(db: EditorDatabase): Promise<ProjectRecord[]> {
  return db.getAll('projects');
}

export async function deleteProject(db: EditorDatabase, id: string): Promise<void> {
  const tx = db.transaction('projects', 'readwrite');
  await Promise.all([tx.store.delete(id), tx.done]);
}

export async function getSettings(db: EditorDatabase): Promise<Settings> {
  return (await db.get('settings', SETTINGS_KEY)) ?? structuredClone(DEFAULT_SETTINGS);
}

export async function putSettings(db: EditorDatabase, settings: Settings): Promise<void> {
  const tx = db.transaction('settings', 'readwrite');
  await Promise.all([tx.store.put(settings, SETTINGS_KEY), tx.done]);
}
