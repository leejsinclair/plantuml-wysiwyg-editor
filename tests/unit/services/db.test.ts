import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  deleteProject,
  getProject,
  getSettings,
  listProjects,
  openEditorDb,
  putProject,
  putSettings,
  type EditorDatabase,
  type ProjectRecord,
} from '../../../src/services/storage/db.ts';

let n = 0;
let db: EditorDatabase | undefined;

async function open(): Promise<EditorDatabase> {
  db = await openEditorDb(`test-db-${++n}`);
  return db;
}

afterEach(() => {
  db?.close();
  db = undefined;
});

function record(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'p-1',
    name: 'Untitled project',
    source: '@startsalt Screen-1\n{\n}\n@endsalt\n',
    flowIndex: null,
    lastWorking: [],
    createdAt: '2026-10-27T10:00:00.000Z',
    modifiedAt: '2026-10-27T10:00:00.000Z',
    revision: 1,
    downloadedAt: null,
    downloadedRevision: null,
    ...overrides,
  };
}

describe('IndexedDB layer', () => {
  it('creates the projects and settings stores', async () => {
    const d = await open();
    expect([...d.objectStoreNames].sort()).toEqual(['projects', 'settings']);
  });

  it('stores and reads a project record keyed by id', async () => {
    const d = await open();
    const r = record({ flowIndex: 1, lastWorking: [{ blockIndex: 0, text: '@startsalt A\n{\n}\n@endsalt\n' }] });
    await putProject(d, r);
    expect(await getProject(d, 'p-1')).toEqual(r);
    expect(await getProject(d, 'missing')).toBeUndefined();
  });

  it('stores source exactly as typed, including BOM, CRLF, no final newline and invalid text', async () => {
    const d = await open();
    const source = '﻿@startsalt A\r\n{\r\n  {\r\n@endsalt';
    await putProject(d, record({ source }));
    expect((await getProject(d, 'p-1'))?.source).toBe(source);
  });

  it('replaces the whole record on every write, never merging', async () => {
    const d = await open();
    await putProject(d, record({ flowIndex: 2, lastWorking: [{ blockIndex: 1, text: 'x' }] }));
    const next = record({ flowIndex: null, lastWorking: [], revision: 2, name: 'Renamed' });
    await putProject(d, next);
    expect(await getProject(d, 'p-1')).toEqual(next);
  });

  it('leaves the previous version intact when a write fails', async () => {
    const d = await open();
    const v1 = record();
    await putProject(d, v1);
    const broken = { ...record({ revision: 2 }), source: (() => 'x') as unknown as string };
    await expect(putProject(d, broken)).rejects.toBeDefined();
    expect(await getProject(d, 'p-1')).toEqual(v1);
  });

  it('lists every project and deletes one', async () => {
    const d = await open();
    await putProject(d, record({ id: 'a', modifiedAt: '2026-10-27T09:00:00.000Z' }));
    await putProject(d, record({ id: 'b', modifiedAt: '2026-10-27T11:00:00.000Z' }));
    expect((await listProjects(d)).map((r) => r.id).sort()).toEqual(['a', 'b']);
    await deleteProject(d, 'a');
    expect((await listProjects(d)).map((r) => r.id)).toEqual(['b']);
  });

  it('returns default settings until settings are saved', async () => {
    const d = await open();
    expect(await getSettings(d)).toEqual(DEFAULT_SETTINGS);
    const s = { panels: { palette: { collapsed: true }, preview: { collapsed: false } } };
    await putSettings(d, s);
    expect(await getSettings(d)).toEqual(s);
  });

  it('keeps data across reopening the same database', async () => {
    const name = `test-db-${++n}`;
    const first = await openEditorDb(name);
    await putProject(first, record());
    first.close();
    db = await openEditorDb(name);
    expect(await getProject(db, 'p-1')).toEqual(record());
  });
});
