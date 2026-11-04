// T083: library operations on the project store (VO-076, VO-077; data-model §3.1, §7.5, §7.6, FR-006/AC3, AC8).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { getProject, listProjects, openEditorDb, putProject, type EditorDatabase, type ProjectRecord } from '../../../src/services/storage/db.ts';
import {
  createProjectRecord,
  downloadState,
  duplicateProject,
  importedProjectRecord,
  markDownloaded,
  removeProject,
  renameProject,
} from '../../../src/services/storage/library-ops.ts';

let n = 0;
let db: EditorDatabase | undefined;
async function open(): Promise<EditorDatabase> {
  db = await openEditorDb(`library-ops-${++n}`);
  return db;
}
afterEach(() => {
  db?.close();
  db = undefined;
});

const T0 = '2026-10-01T10:00:00.000Z';
const T1 = '2026-10-02T10:00:00.000Z';
function record(over: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'p1', name: 'Shop', source: '@startsalt A\n{\n}\n@endsalt\n@startsalt B\n{\n  [OK\n@endsalt\n', flowIndex: null,
    lastWorking: [{ blockIndex: 1, text: '@startsalt B\n{\n  [OK]\n}\n@endsalt\n' }],
    createdAt: T0, modifiedAt: T0, revision: 4, downloadedAt: null, downloadedRevision: null, ...over,
  };
}

describe('create (VO-076)', () => {
  it('stores "Untitled project" with one empty screen, never downloaded', async () => {
    const d = await open();
    const r = await createProjectRecord(d, 'new', T1);
    expect(r).toMatchObject({ id: 'new', name: 'Untitled project', flowIndex: null, revision: 1, downloadedAt: null, downloadedRevision: null, createdAt: T1, modifiedAt: T1 });
    expect(r.source).toBe('@startsalt Screen-1\n{\n}\n@endsalt\n');
    expect(await getProject(d, 'new')).toEqual(r);
  });

  it('allows names that are not unique', async () => {
    const d = await open();
    await createProjectRecord(d, 'a', T1);
    await createProjectRecord(d, 'b', T1);
    expect((await listProjects(d)).map((p) => p.name)).toEqual(['Untitled project', 'Untitled project']);
  });
});

describe('rename (VO-076)', () => {
  it('trims the name and updates the modified time', async () => {
    const d = await open();
    await putProject(d, record());
    const r = await renameProject(d, 'p1', '  Shop 2  ', T1);
    expect(r).toMatchObject({ name: 'Shop 2', modifiedAt: T1, revision: 4 });
    expect((await getProject(d, 'p1'))?.name).toBe('Shop 2');
  });

  it('keeps the previous name when the result is empty', async () => {
    const d = await open();
    await putProject(d, record());
    const r = await renameProject(d, 'p1', '   ', T1);
    expect(r).toMatchObject({ name: 'Shop', modifiedAt: T0 });
  });

  it('returns null for a project that no longer exists', async () => {
    expect(await renameProject(await open(), 'gone', 'X', T1)).toBeNull();
  });
});

describe('duplicate (VO-076, VO-077)', () => {
  it('copies source, flow and last working versions as "Copy of …", never downloaded', async () => {
    const d = await open();
    await putProject(d, record({ flowIndex: null, downloadedAt: T0, downloadedRevision: 4 }));
    const copy = await duplicateProject(d, 'p1', 'p2', T1);
    expect(copy).toMatchObject({
      id: 'p2', name: 'Copy of Shop', source: record().source, flowIndex: null, lastWorking: record().lastWorking,
      createdAt: T1, modifiedAt: T1, downloadedAt: null, downloadedRevision: null,
    });
    expect(downloadState(copy!)).toBe('never');
    expect(await getProject(d, 'p2')).toEqual(copy);
    expect((await getProject(d, 'p1'))?.name).toBe('Shop');
  });
});

describe('delete (VO-076)', () => {
  it('removes the record', async () => {
    const d = await open();
    await putProject(d, record());
    await removeProject(d, 'p1');
    expect(await getProject(d, 'p1')).toBeUndefined();
  });
});

describe('download state (VO-077, data-model §7.5)', () => {
  it('is never downloaded until a .puml download, then up to date', async () => {
    const d = await open();
    await putProject(d, record());
    expect(downloadState(record())).toBe('never');
    const r = await markDownloaded(d, 'p1', 4, T1);
    expect(r).toMatchObject({ downloadedAt: T1, downloadedRevision: 4, modifiedAt: T0, revision: 4 });
    expect(downloadState(r!)).toBe('upToDate');
  });

  it('has changes not downloaded after the source changes', () => {
    expect(downloadState(record({ revision: 5, downloadedAt: T0, downloadedRevision: 4 }))).toBe('changesNotDownloaded');
  });

  it('records the revision that was downloaded, even when the stored one is newer', async () => {
    const d = await open();
    await putProject(d, record({ revision: 6 }));
    const r = await markDownloaded(d, 'p1', 5, T1);
    expect(downloadState(r!)).toBe('changesNotDownloaded');
  });

  it('a rename does not count as a change to download', async () => {
    const d = await open();
    await putProject(d, record({ downloadedAt: T0, downloadedRevision: 4 }));
    expect(downloadState((await renameProject(d, 'p1', 'New', T1))!)).toBe('upToDate');
  });
});

describe('imported records (VO-013)', () => {
  it('builds a new never-downloaded record from an import', () => {
    const r = importedProjectRecord('id9', 'Mine', { source: 'x', flowIndex: null, lastWorking: [] }, T1);
    expect(r).toEqual({
      id: 'id9', name: 'Mine', source: 'x', flowIndex: null, lastWorking: [], createdAt: T1, modifiedAt: T1,
      revision: 1, downloadedAt: null, downloadedRevision: null,
    });
  });
});
