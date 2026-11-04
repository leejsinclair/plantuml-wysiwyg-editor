// T048: the project library view (FR-006/AC8, AC10, FR-001/AC1, contracts/ui.md §2).
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dbLibraryStorage,
  hasChangesNotDownloaded,
  Library,
  newProjectRecord,
  refreshLibrary,
  type LibraryStorage,
} from '../../../src/ui/library/Library.tsx';
import { createSlots, type Slots } from '../../../src/ui/app/slots.ts';
import { t } from '../../../src/ui/messages/en.ts';
import library from '../../../src/ui/messages/en/library.ts';
import { split } from '../../../src/core/blocks/split.ts';
import { classify } from '../../../src/core/blocks/classify.ts';
import { getProject, openEditorDb, type ProjectRecord } from '../../../src/services/storage/db.ts';

const record = (over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: 'p1', name: 'Shop', source: '@startsalt Screen-1\n{\n}\n@endsalt\n', flowIndex: null, lastWorking: [],
  createdAt: '2026-01-01T09:00:00.000Z', modifiedAt: '2026-01-02T09:00:00.000Z', revision: 3,
  downloadedAt: null, downloadedRevision: null, ...over,
});

function memoryStorage(initial: ProjectRecord[] = []): LibraryStorage & { records: ProjectRecord[] } {
  const records = [...initial];
  return {
    records,
    list: vi.fn(async () => [...records]),
    put: vi.fn(async (r: ProjectRecord) => {
      const i = records.findIndex((x) => x.id === r.id);
      if (i >= 0) records[i] = r;
      else records.push(r);
    }),
  };
}

const formatTime = (iso: string) => `T(${iso})`;

let slotsUnderTest: Slots;
function show(storage: LibraryStorage, extra: Partial<Parameters<typeof Library>[0]> = {}) {
  slotsUnderTest = createSlots();
  const onOpen = vi.fn();
  render(
    <Library
      storage={storage}
      onOpen={onOpen}
      formatTime={formatTime}
      now={() => '2026-03-03T10:00:00.000Z'}
      newId={() => 'new-id'}
      slots={slotsUnderTest}
      {...extra}
    />,
  );
  return { onOpen };
}

const list = () => screen.getByRole('list', { name: t('library.listLabel') });
const rowFor = async (name: string) =>
  within(await screen.findByRole('list', { name: t('library.listLabel') })).getByRole('listitem', { name });

afterEach(() => vi.restoreAllMocks());

describe('Library: the project list (FR-006/AC10, AC8)', () => {
  it('shows each project with its last-modified time, most recently modified first', async () => {
    show(memoryStorage([
      record({ id: 'a', name: 'Older', modifiedAt: '2026-01-01T00:00:00.000Z' }),
      record({ id: 'b', name: 'Newer', modifiedAt: '2026-02-01T00:00:00.000Z' }),
    ]));
    const rows = within(await screen.findByRole('list', { name: t('library.listLabel') })).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByRole('link').textContent)).toEqual(['Newer', 'Older']);
    const newer = rows[0]!;
    expect(newer).toHaveTextContent(t('library.lastModified', { time: formatTime('2026-02-01T00:00:00.000Z') }));
    expect(newer.querySelector('time')?.getAttribute('datetime')).toBe('2026-02-01T00:00:00.000Z');
  });

  it('says "never downloaded" for a project that was never downloaded', async () => {
    show(memoryStorage([record({ name: 'Fresh' })]));
    const row = await rowFor('Fresh');
    expect(within(row).getByText(t('status.neverDownloaded'))).toBeInTheDocument();
    expect(t('status.neverDownloaded')).toBe('never downloaded');
    expect(row).not.toHaveTextContent(t('library.lastDownloaded', { time: '' }).trim());
  });

  it('shows the last-downloaded time, and no indicator when nothing changed since', async () => {
    show(memoryStorage([record({ name: 'Kept', revision: 4, downloadedAt: '2026-01-05T12:00:00.000Z', downloadedRevision: 4 })]));
    const row = await rowFor('Kept');
    expect(row).toHaveTextContent(t('library.lastDownloaded', { time: formatTime('2026-01-05T12:00:00.000Z') }));
    expect(within(row).queryByText(t('library.notDownloaded'))).toBeNull();
    expect(within(row).queryByText(t('status.neverDownloaded'))).toBeNull();
  });

  it('shows the not-downloaded indicator when the project changed after its last download', async () => {
    show(memoryStorage([record({ name: 'Changed', revision: 5, downloadedAt: '2026-01-05T12:00:00.000Z', downloadedRevision: 4 })]));
    const row = await rowFor('Changed');
    expect(within(row).getByText(t('library.notDownloaded'))).toBeInTheDocument();
    expect(row).toHaveTextContent(t('library.lastDownloaded', { time: formatTime('2026-01-05T12:00:00.000Z') }));
  });

  it('derives "changes not downloaded" as data-model §3.1 states', () => {
    expect(hasChangesNotDownloaded(record({ downloadedRevision: null }))).toBe(true);
    expect(hasChangesNotDownloaded(record({ revision: 2, downloadedRevision: 1, downloadedAt: 'x' }))).toBe(true);
    expect(hasChangesNotDownloaded(record({ revision: 2, downloadedRevision: 2, downloadedAt: 'x' }))).toBe(false);
  });

  it('states that projects are not synchronised between browsers or devices, also when the library is empty', async () => {
    show(memoryStorage([]));
    expect(await screen.findByText(t('library.empty'))).toBeInTheDocument();
    expect(screen.getByText(t('library.notSynchronised'))).toBeInTheDocument();
    expect(t('library.notSynchronised')).toMatch(/not synchronised between browsers or devices/);
  });

  it('reports a storage read failure instead of an empty library', async () => {
    show({ list: async () => { throw new Error('blocked'); }, put: async () => undefined });
    expect(await screen.findByRole('alert')).toHaveTextContent(t('library.loadFailed'));
    expect(screen.queryByText(t('library.empty'))).toBeNull();
  });

  it('reloads the list when refreshLibrary() is called (after a rename, duplicate or delete)', async () => {
    const storage = memoryStorage([record({ name: 'One' })]);
    show(storage);
    await rowFor('One');
    storage.records.push(record({ id: 'p2', name: 'Two' }));
    act(() => refreshLibrary());
    expect(await rowFor('Two')).toBeInTheDocument();
  });

  it('keeps every string in its own catalogue part', () => {
    for (const key of Object.keys(library)) expect(key.startsWith('library.'), key).toBe(true);
  });
});

describe('Library: open a project', () => {
  it('opens a project from its name, which links to its route', async () => {
    const { onOpen } = show(memoryStorage([record({ id: 'abc', name: 'Shop' })]));
    const link = within(await rowFor('Shop')).getByRole('link', { name: 'Shop' });
    expect(link).toHaveAttribute('href', '#/project/abc');
    await userEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith('abc');
  });
});

describe('Library: "Create project" (FR-001/AC1, data-model §7.6)', () => {
  it('builds a new record: "Untitled project", one empty screen, never downloaded', () => {
    const r = newProjectRecord('id-1', '2026-03-03T10:00:00.000Z');
    expect(r).toMatchObject({
      id: 'id-1', name: 'Untitled project', flowIndex: null, lastWorking: [], revision: 1,
      createdAt: '2026-03-03T10:00:00.000Z', modifiedAt: '2026-03-03T10:00:00.000Z',
      downloadedAt: null, downloadedRevision: null,
    });
    const blocks = split(r.source).filter((s) => s.type === 'block');
    expect(blocks).toHaveLength(1);
    const text = r.source.slice(blocks[0]!.start, blocks[0]!.end);
    expect(text.startsWith('@startsalt Screen-1')).toBe(true);
    expect(classify(text).category).toBe(1);
  });

  it('writes the new project, then opens it', async () => {
    const storage = memoryStorage([]);
    const { onOpen } = show(storage);
    await screen.findByText(t('library.empty'));
    await userEvent.click(screen.getByRole('button', { name: t('library.create') }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('new-id'));
    expect(storage.records).toHaveLength(1);
    expect(storage.records[0]).toMatchObject({ id: 'new-id', name: 'Untitled project', downloadedAt: null });
    expect(vi.mocked(storage.put).mock.invocationCallOrder[0]!).toBeLessThan(onOpen.mock.invocationCallOrder[0]!);
  });

  it('does not open anything and says why when the write fails', async () => {
    const storage = memoryStorage([]);
    vi.mocked(storage.put).mockRejectedValueOnce(new Error('quota'));
    const { onOpen } = show(storage);
    await screen.findByText(t('library.empty'));
    await userEvent.click(screen.getByRole('button', { name: t('library.create') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('library.createFailed'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: t('library.create') })).toBeEnabled();
  });

  it('stores the project in IndexedDB through the db layer', async () => {
    const db = await openEditorDb(`library-test-${Math.random()}`);
    const storage = dbLibraryStorage(db);
    await storage.put(newProjectRecord('db-1', '2026-03-03T10:00:00.000Z'));
    expect(await getProject(db, 'db-1')).toMatchObject({ name: 'Untitled project' });
    expect((await storage.list()).map((r) => r.id)).toEqual(['db-1']);
    db.close();
  });
});

describe('Library: the library slot', () => {
  it('places header items beside "Create project" and row items in every project row', async () => {
    const storage = memoryStorage([record({ id: 'a', name: 'Alpha' }), record({ id: 'b', name: 'Beta', modifiedAt: '2025-01-01T00:00:00.000Z' })]);
    slotsUnderTest = createSlots();
    slotsUnderTest.library.register({
      id: 'import', placement: 'header',
      Component: ({ ctx }) => <button type="button" data-ctx={String(ctx.projectId)}>{t('toolbar.import')}</button>,
    });
    slotsUnderTest.library.register({
      id: 'download', placement: 'row',
      Component: ({ projectId }) => <button type="button" data-project={projectId}>{t('toolbar.download')}</button>,
    });
    render(<Library storage={storage} onOpen={() => undefined} formatTime={formatTime} slots={slotsUnderTest} />);
    const header = screen.getByRole('button', { name: t('toolbar.import') });
    expect(header).toHaveAttribute('data-ctx', 'null');
    expect(screen.getByRole('button', { name: t('library.create') }).parentElement).toContainElement(header);
    const alpha = await rowFor('Alpha');
    const commands = within(alpha).getByRole('group', { name: t('library.rowCommands', { name: 'Alpha' }) });
    expect(within(commands).getByRole('button', { name: t('toolbar.download') })).toHaveAttribute('data-project', 'a');
    expect(within(await rowFor('Beta')).getByRole('button', { name: t('toolbar.download') })).toHaveAttribute('data-project', 'b');
    expect(within(list()).queryAllByRole('button', { name: t('toolbar.import') })).toHaveLength(0);
  });
});
