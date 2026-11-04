// T085: library commands (VO-011, VO-076, VO-079; FR-006/AC3, AC8, AC10, AC11, AC13, contracts/ui.md §2).
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Library } from '../../../src/ui/library/Library.tsx';
import { createSlots } from '../../../src/ui/app/slots.ts';
import { createStore, StoreContext } from '../../../src/ui/app/store.ts';
import { libraryItems } from '../../../src/ui/library/library-commands.tsx';
import { StorageNotices } from '../../../src/ui/storage/StorageNotices.tsx';
import { t } from '../../../src/ui/messages/en.ts';
import type { StorageUi } from '../../../src/ui/storage/StorageNotices.tsx';
import { blobText, makeUi, NOW, record } from '../storage/helpers.ts';

const formatTime = (iso: string) => `T(${iso})`;

async function showLibrary(setup: ReturnType<typeof makeUi>, records = [record()]) {
  for (const r of records) await setup.projects.put(r);
  const slots = createSlots();
  for (const item of libraryItems(setup.ui)) slots.library.register(item);
  const onOpen = vi.fn();
  render(<Library storage={{ list: setup.projects.list, put: setup.projects.put }} onOpen={onOpen} formatTime={formatTime} slots={slots} />);
  return { onOpen };
}

const rowFor = async (name: string) =>
  within(await screen.findByRole('list', { name: t('library.listLabel') })).findByRole('listitem', { name });
const commands = async (name: string) => within(await rowFor(name)).getByRole('group', { name: t('library.rowCommands', { name }) });

describe('delete confirmation (VO-011, FR-006/AC3)', () => {
  it('says the project has changes not downloaded and offers "Download and delete"', async () => {
    const setup = makeUi();
    await showLibrary(setup);
    await userEvent.click(within(await commands('Shop')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: t('storage.delete.title', { name: 'Shop' }) });
    expect(dialog).toHaveTextContent(t('storage.delete.notDownloaded'));
    expect(within(dialog).getByRole('button', { name: 'Download and delete' })).toBeInTheDocument();
    // The safe choice has focus.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('says every change is downloaded when it is, with no "Download and delete"', async () => {
    const setup = makeUi();
    await showLibrary(setup, [record({ downloadedAt: NOW, downloadedRevision: 3 })]);
    await userEvent.click(within(await commands('Shop')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(t('storage.delete.upToDate'));
    expect(within(dialog).queryByRole('button', { name: 'Download and delete' })).toBeNull();
  });

  it('deletes after confirmation, tells other tabs and refreshes the list', async () => {
    const setup = makeUi();
    await showLibrary(setup, [record(), record({ id: 'p2', name: 'Other' })]);
    await userEvent.click(within(await commands('Shop')).getByRole('button', { name: 'Delete' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Shop' })).toBeNull());
    expect(await setup.projects.get('p1')).toBeUndefined();
    expect(setup.broadcast).toHaveBeenCalledWith({ type: 'project-deleted', projectId: 'p1' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('"Download and delete" downloads the exact source, then deletes', async () => {
    const setup = makeUi();
    const source = '﻿@startsalt Home\r\n{\r\n  [OK]\r\n}\r\n@endsalt';
    await showLibrary(setup, [record({ source, name: 'My: shop' })]);
    await userEvent.click(within(await commands('My: shop')).getByRole('button', { name: 'Delete' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Download and delete' }));
    await waitFor(async () => expect(await setup.projects.get('p1')).toBeUndefined());
    expect(setup.saved).toHaveLength(1);
    expect(setup.saved[0]!.fileName).toBe('My- shop.puml');
    expect(await blobText(setup.saved[0]!.blob)).toBe(source);
  });

  it('cancel and Escape keep the project and return focus to "Delete"', async () => {
    const setup = makeUi();
    await showLibrary(setup);
    const del = within(await commands('Shop')).getByRole('button', { name: 'Delete' });
    await userEvent.click(del);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(del).toHaveFocus();
    await userEvent.click(del);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await setup.projects.get('p1')).toBeDefined();
  });
});

describe('row commands (VO-076)', () => {
  it('"Open" opens the project', async () => {
    const setup = makeUi();
    await showLibrary(setup);
    await userEvent.click(within(await commands('Shop')).getByRole('button', { name: 'Open' }));
    expect(setup.ui.navigate).toHaveBeenCalledWith('p1');
  });

  it('"Rename" trims the name, tells other tabs and shows it', async () => {
    const setup = makeUi();
    await showLibrary(setup);
    await userEvent.click(within(await commands('Shop')).getByRole('button', { name: 'Rename' }));
    const field = await screen.findByRole('textbox', { name: t('storage.library.renameLabel', { name: 'Shop' }) });
    expect(field).toHaveValue('Shop');
    expect(field).toHaveFocus();
    await userEvent.clear(field);
    await userEvent.type(field, '  Shop v2  {Enter}');
    expect(await rowFor('Shop v2')).toBeInTheDocument();
    expect((await setup.projects.get('p1'))?.name).toBe('Shop v2');
    expect(setup.broadcast).toHaveBeenCalledWith({ type: 'project-renamed', projectId: 'p1', name: 'Shop v2' });
    expect(setup.announce).toHaveBeenCalledWith('storage.library.renamed', { name: 'Shop v2' });
  });

  it('an empty name keeps the previous one and says so', async () => {
    const setup = makeUi();
    await showLibrary(setup);
    await userEvent.click(within(await commands('Shop')).getByRole('button', { name: 'Rename' }));
    const field = await screen.findByRole('textbox');
    await userEvent.clear(field);
    await userEvent.type(field, '   {Enter}');
    await waitFor(() => expect(setup.announce).toHaveBeenCalledWith('storage.library.renameEmpty', { name: 'Shop' }));
    expect((await setup.projects.get('p1'))?.name).toBe('Shop');
    expect(setup.broadcast).not.toHaveBeenCalled();
  });

  it('Escape cancels a rename', async () => {
    const setup = makeUi();
    await showLibrary(setup);
    await userEvent.click(within(await commands('Shop')).getByRole('button', { name: 'Rename' }));
    await userEvent.type(await screen.findByRole('textbox'), 'xyz{Escape}');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect((await setup.projects.get('p1'))?.name).toBe('Shop');
  });

  it('"Duplicate" adds "Copy of …", never downloaded', async () => {
    const setup = makeUi();
    await showLibrary(setup, [record({ downloadedAt: NOW, downloadedRevision: 3 })]);
    await userEvent.click(within(await commands('Shop')).getByRole('button', { name: 'Duplicate' }));
    const copy = await rowFor('Copy of Shop');
    expect(copy).toHaveTextContent(t('status.neverDownloaded'));
  });

  it('"Download" saves one file named after the project and records the download', async () => {
    const setup = makeUi();
    await showLibrary(setup);
    await userEvent.click(within(await commands('Shop')).getByRole('button', { name: 'Download' }));
    await waitFor(async () => expect((await setup.projects.get('p1'))?.downloadedRevision).toBe(3));
    expect(setup.saved.map((s) => s.fileName)).toEqual(['Shop.puml']);
    expect(await blobText(setup.saved[0]!.blob)).toBe(record().source);
    await waitFor(async () => expect(await rowFor('Shop')).toHaveTextContent(t('library.lastDownloaded', { time: formatTime(NOW) })));
  });
});

describe('import from the library (FR-006/AC13)', () => {
  const file = (name: string, content: string | Uint8Array) => new File([content as BlobPart], name, { type: 'text/plain' });

  it('the empty library offers "Import .puml file", which creates and opens the project', async () => {
    const setup = makeUi({ pickFile: vi.fn(async () => file('Checkout.puml', '@startsalt A\n{\n}\n@endsalt\n')) });
    await showLibrary(setup, []);
    await screen.findByText(t('library.empty'));
    await userEvent.click(screen.getByRole('button', { name: 'Import .puml file' }));
    await waitFor(() => expect(setup.ui.navigate).toHaveBeenCalled());
    const id = vi.mocked(setup.ui.navigate).mock.calls[0]![0];
    expect(await setup.projects.get(id)).toMatchObject({ name: 'Checkout', downloadedAt: null, source: '@startsalt A\n{\n}\n@endsalt\n' });
  });

  it('appends the date when the name is already used', async () => {
    const setup = makeUi({ pickFile: vi.fn(async () => file('Shop.puml', '')) });
    await showLibrary(setup);
    await userEvent.click(screen.getByRole('button', { name: 'Import .puml file' }));
    await waitFor(() => expect(setup.ui.navigate).toHaveBeenCalled());
    const id = vi.mocked(setup.ui.navigate).mock.calls[0]![0];
    expect((await setup.projects.get(id))?.name).toBe('Shop 2026-10-28');
  });

  it('refuses a binary file with an explanation and creates nothing', async () => {
    const setup = makeUi({ pickFile: vi.fn(async () => file('photo.png', new Uint8Array([0x89, 0x50, 0, 1]))) });
    await showLibrary(setup);
    await userEvent.click(screen.getByRole('button', { name: 'Import .puml file' }));
    await waitFor(() => expect(setup.notices.list()).toHaveLength(1));
    expect(setup.notices.list()[0]).toMatchObject({ messageKey: 'storage.import.binary', params: { file: 'photo.png' } });
    expect(await setup.projects.list()).toHaveLength(1);
    expect(setup.ui.navigate).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is cancelled', async () => {
    const setup = makeUi();
    await showLibrary(setup);
    await userEvent.click(screen.getByRole('button', { name: 'Import .puml file' }));
    await act(async () => {});
    expect(setup.notices.list()).toHaveLength(0);
    expect(await setup.projects.list()).toHaveLength(1);
  });
});

describe('times, statement and reminder (VO-079, FR-006/AC10, AC11)', () => {
  it('shows last-modified times and the not-synchronised statement', async () => {
    const setup = makeUi();
    await showLibrary(setup);
    expect(await rowFor('Shop')).toHaveTextContent(t('library.lastModified', { time: formatTime('2026-10-02T09:00:00.000Z') }));
    expect(screen.getByText(t('library.notSynchronised'))).toBeInTheDocument();
  });

  function openProject(ui: StorageUi, r = record()) {
    const store = createStore({ write: async () => {}, announce: vi.fn(), slots: createSlots() });
    store.load(r);
    const view = render(
      <StoreContext.Provider value={store}>
        <StorageNotices ui={ui} />
      </StoreContext.Provider>,
    );
    return { store, view };
  }

  it('reminds once per session when returning to a project with changes not downloaded', async () => {
    const setup = makeUi();
    const first = openProject(setup.ui);
    await waitFor(() => expect(setup.notices.list().map((n) => n.messageKey)).toContain('storage.reminder'));
    const reminder = setup.notices.list().find((n) => n.messageKey === 'storage.reminder')!;
    expect(reminder.params).toEqual({ name: 'Shop' });
    expect(reminder.prominent).toBeFalsy();
    setup.notices.dismiss(reminder.id);
    first.view.unmount();
    first.store.dispose();
    openProject(setup.ui);
    await act(async () => {});
    expect(setup.notices.list().map((n) => n.messageKey)).not.toContain('storage.reminder');
  });

  it('does not remind about a project whose changes are all downloaded, or a new untouched one', async () => {
    const setup = makeUi();
    openProject(setup.ui, record({ downloadedAt: NOW, downloadedRevision: 3 }));
    openProject(setup.ui, record({ id: 'fresh', revision: 1 }));
    await act(async () => {});
    expect(setup.notices.list().map((n) => n.messageKey)).not.toContain('storage.reminder');
  });

  it('the reminder\'s "Download now" downloads the project', async () => {
    const setup = makeUi();
    openProject(setup.ui);
    await waitFor(() => expect(setup.notices.list()).toHaveLength(1));
    const { Notices } = await import('../../../src/ui/notices/Notices.tsx');
    render(<Notices notices={setup.notices} />);
    await userEvent.click(screen.getByRole('button', { name: 'Download now' }));
    expect(setup.saved.map((s) => s.fileName)).toEqual(['Shop.puml']);
  });

  it('reports persistent storage refused and a private window once each per session (FR-006/AC9)', async () => {
    const persistence = vi.fn(async () => ({ persisted: false, privateWindow: true }));
    const setup = makeUi({ persistence });
    const first = openProject(setup.ui, record({ revision: 1 }));
    await waitFor(() => expect(setup.notices.list().map((n) => n.messageKey).sort()).toEqual(['storage.persistRefused', 'storage.privateWindow']));
    first.view.unmount();
    openProject(setup.ui, record({ id: 'p2', revision: 1 }));
    await act(async () => {});
    expect(persistence).toHaveBeenCalledTimes(1);
    expect(setup.notices.list()).toHaveLength(2);
  });
});
