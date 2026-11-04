// T086: the toolbar "Download" and its notices (VO-127, VO-083; FR-006/AC4, AC7, FR-014/AC1, AC6, EC-12), and the
// storage failure notice with "Download a backup".
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSlots, type SlotContext } from '../../../src/ui/app/slots.ts';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import { DownloadCommand } from '../../../src/ui/storage/DownloadCommand.tsx';
import { StorageNotices } from '../../../src/ui/storage/StorageNotices.tsx';
import { TabBanner } from '../../../src/ui/storage/TabBanner.tsx';
import { createTabs } from '../../../src/services/storage/tabs.ts';
import { Notices } from '../../../src/ui/notices/Notices.tsx';
import { downloadFileName } from '../../../src/services/files/download.ts';
import { t } from '../../../src/ui/messages/en.ts';
import type { ProjectRecord } from '../../../src/services/storage/db.ts';
import { blobBytes, blobText, FakeHub, FakeLocks, makeUi, NOW, record } from './helpers.ts';

const CTX: SlotContext = { projectId: 'p1', block: null, selection: null };
const screenBlock = (name: string, body = '  [OK]') => `@startsalt ${name}\n{\n${body}\n}\n@endsalt\n`;
const INVALID = '@startsalt Broken\n{\n  [Save]\n@endsalt\n';
const OLDER = '@startuml Legacy\nsalt\n{\n  [OK]\n}\n@enduml\n';
const INCLUDE = '@startsalt Shared\n!include parts.iuml\n{\n  [OK]\n}\n@endsalt\n';
const FLOW = '@startuml Journey\nstart\n:Go;\nstop\n@enduml\n';
const BAD_FLOW = '@startuml Journey\nstart\nif (x) then (y)\nstop\n@enduml\n';

let stores: Store[] = [];
afterEach(() => {
  stores.forEach((s) => s.dispose());
  stores = [];
  vi.useRealTimers();
});

function setUp(r: ProjectRecord, write: (r: ProjectRecord) => Promise<void> = async () => {}) {
  const setup = makeUi();
  const store = createStore({ write, announce: vi.fn(), slots: createSlots(), now: () => NOW });
  stores.push(store);
  store.load(r);
  render(
    <StoreContext.Provider value={store}>
      <DownloadCommand ctx={CTX} ui={setup.ui} />
      <StorageNotices ui={setup.ui} />
      <Notices notices={setup.notices} />
    </StoreContext.Provider>,
  );
  return { ...setup, store };
}

const messages = (setup: { notices: { list(): readonly { messageKey: string }[] } }) => setup.notices.list().map((n) => n.messageKey);

describe('Download (FR-006/AC4, FR-014/AC1)', () => {
  it('saves the exact source, byte-order mark and line endings included, named after the project', async () => {
    const source = '﻿' + screenBlock('Home').replace(/\n/g, '\r\n').replace(/\r\n$/, '');
    const setup = setUp(record({ source, name: 'Shop/2026' }));
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(setup.saved).toHaveLength(1);
    expect(setup.saved[0]!.fileName).toBe('Shop-2026.puml');
    const bytes = await blobBytes(setup.saved[0]!.blob);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await blobText(setup.saved[0]!.blob)).toBe(source);
    expect([...bytes]).toEqual([...new TextEncoder().encode(source)]);
  });

  it('marks the project downloaded at its current revision (only a .puml download counts)', async () => {
    const setup = setUp(record({ revision: 7 }));
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(setup.store.getSnapshot().record).toMatchObject({ downloadedAt: NOW, downloadedRevision: 7 });
  });

  it('makes file names safe', () => {
    expect(downloadFileName('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j.puml');
    expect(downloadFileName('Zahlung prüfen')).toBe('Zahlung prüfen.puml');
    expect(downloadFileName('  ...  ')).toBe('project.puml');
    expect(downloadFileName('trailing. ')).toBe('trailing.puml');
  });
});

describe('download notices (VO-127, FR-014/AC6)', () => {
  it('lists the blocks that cannot be rendered and counts those not yet checked; every block is unchanged', async () => {
    const source = screenBlock('Home') + INVALID + OLDER + INCLUDE + screenBlock('About');
    const setup = setUp(record({ source }));
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(await blobText(setup.saved[0]!.blob)).toBe(source);
    const notice = setup.notices.list().find((n) => n.messageKey === 'storage.download.unrenderable');
    expect(notice).toBeDefined();
    expect(notice!.params).toMatchObject({ count: 3, unchecked: 2 });
    const text = t(notice!.messageKey, notice!.params);
    for (const name of ['Broken', 'Legacy', 'Shared']) expect(text).toContain(name);
    expect(text).not.toContain('Home');
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('counts blocks not yet checked even when every block can be rendered', async () => {
    const setup = setUp(record({ source: screenBlock('Home') }));
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    const notice = setup.notices.list().find((n) => n.messageKey === 'storage.download.notChecked');
    expect(notice?.params).toEqual({ unchecked: 1 });
  });

  it('warns that an invalid flow will import as other content (VO-083, EC-12)', async () => {
    const setup = setUp(record({ source: screenBlock('Home') + BAD_FLOW, flowIndex: 1 }));
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    const notice = setup.notices.list().find((n) => n.messageKey === 'storage.download.flowWillBeOther');
    expect(notice?.params).toEqual({ name: 'Journey' });
  });

  it('warns for a source-only flow too, but not for a valid one', async () => {
    const sourceOnly = '@startuml Journey\nstart\n:Go;\ngoto there\nstop\n@enduml\n';
    const a = setUp(record({ source: sourceOnly, flowIndex: 0 }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Download' })[0]!);
    expect(messages(a)).toContain('storage.download.flowWillBeOther');
    const b = setUp(record({ id: 'p2', source: FLOW, flowIndex: 0 }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Download' })[1]!);
    expect(messages(b)).not.toContain('storage.download.flowWillBeOther');
  });
});

describe('storage failure (FR-006/AC7)', () => {
  it('shows a prominent notice with "Download a backup" within 1 second, and clears it when a retry succeeds', async () => {
    let failing = true;
    const writes: ProjectRecord[] = [];
    const write = vi.fn(async (r: ProjectRecord) => {
      if (failing) throw new DOMException('full', 'QuotaExceededError');
      writes.push(r);
    });
    const setup = setUp(record(), write);
    vi.useFakeTimers();
    act(() => setup.store.updateRecord({ name: 'Shop 2' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const notice = setup.notices.list().find((n) => n.kind === 'storageFailure');
    expect(notice).toMatchObject({ messageKey: 'storage.failed.quota', prominent: true });
    expect(screen.getByText(t('storage.failed.quota'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download a backup' }));
    expect(setup.saved.map((s) => s.fileName)).toEqual(['Shop 2.puml']);
    // The notice stays while writes still fail.
    expect(screen.getByText(t('storage.failed.quota'))).toBeInTheDocument();

    failing = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(setup.store.getSnapshot().save.status).toBe('saved');
    expect(setup.notices.list().find((n) => n.kind === 'storageFailure')).toBeUndefined();
    expect(setup.announce).toHaveBeenCalledWith('storage.recovered');
    expect(writes.at(-1)?.name).toBe('Shop 2');
  });
});

describe('tab banner (FR-006/AC12, AC16, FR-007/AC7)', () => {
  function openTab(shared: ReturnType<typeof makeUi>, locks: FakeLocks, hub: FakeHub, r: ProjectRecord) {
    const tabs = createTabs({ locks, channel: hub.channel(), releaseDelayMs: 0 });
    const own = makeUi({ projects: shared.projects, tabs, notices: shared.notices });
    const store = createStore({ write: (x) => shared.projects.put(x), announce: vi.fn(), slots: createSlots(), now: () => NOW });
    stores.push(store);
    store.load(r);
    const view = render(
      <StoreContext.Provider value={store}>
        <TabBanner ui={own.ui} />
      </StoreContext.Provider>,
    );
    return { store, view, ui: own.ui, saved: own.saved, tabs };
  }

  it('makes the second tab read-only, and "Edit here instead" saves the first tab and moves editing', async () => {
    const shared = makeUi();
    const locks = new FakeLocks();
    const hub = new FakeHub();
    const r = record({ source: screenBlock('Home') });
    await shared.projects.put(r);
    const a = openTab(shared, locks, hub, r);
    await waitFor(() => expect(a.ui.session.roles.get('p1')).toBe('editing'));
    const b = openTab(shared, locks, hub, r);
    const banner = await within(b.view.container).findByRole('region', { name: t('storage.tab.banner') });
    expect(banner).toHaveTextContent(t('storage.tab.readOnly'));
    expect(banner).toHaveTextContent('Undo history is not carried over');
    expect(within(a.view.container).queryByRole('region')).toBeNull();

    // An edit in the first tab, not yet written.
    const at = a.store.getState()!.source.indexOf('  [OK]');
    act(() => a.store.applyEdits([{ start: at, end: at, text: '  "Name"\n' }], { nameKey: 'history.sourceTyping', blockKey: a.store.getSnapshot().blocks[0]!.key }));
    expect(a.store.getSnapshot().undoName).not.toBeNull();

    await userEvent.click(within(banner).getByRole('button', { name: 'Edit here instead' }));
    await waitFor(() => expect(b.ui.session.roles.get('p1')).toBe('editing'));
    expect(a.ui.session.roles.get('p1')).toBe('readOnly');
    expect(b.store.getState()!.source).toContain('"Name"');
    expect(a.store.getSnapshot().undoName).toBeNull();
    expect(b.store.getSnapshot().undoName).toBeNull();
    expect(within(a.view.container).getByRole('button', { name: 'Edit here instead' })).toBeInTheDocument();
    expect(within(b.view.container).queryByRole('region')).toBeNull();
  });

  it('says a project was deleted in another tab and offers its content as a download', async () => {
    const shared = makeUi();
    const locks = new FakeLocks();
    const hub = new FakeHub();
    const r = record({ source: screenBlock('Home') });
    const a = openTab(shared, locks, hub, r);
    await waitFor(() => expect(a.ui.session.roles.get('p1')).toBe('editing'));
    const library = createTabs({ locks, channel: hub.channel() });
    library.broadcast({ type: 'project-deleted', projectId: 'p1' });
    const banner = await within(a.view.container).findByRole('region', { name: t('storage.tab.banner') });
    expect(banner).toHaveTextContent(t('storage.tab.deleted'));
    await userEvent.click(within(banner).getByRole('button', { name: 'Download its content' }));
    expect(a.saved.map((s) => s.fileName)).toEqual(['Shop.puml']);
    expect(await blobText(a.saved[0]!.blob)).toBe(r.source);
    library.dispose();
  });

  it('applies a rename from another tab to the editing tab\'s record', async () => {
    const shared = makeUi();
    const locks = new FakeLocks();
    const hub = new FakeHub();
    const a = openTab(shared, locks, hub, record());
    await waitFor(() => expect(a.ui.session.roles.get('p1')).toBe('editing'));
    const library = createTabs({ locks, channel: hub.channel() });
    library.broadcast({ type: 'project-renamed', projectId: 'p1', name: 'Renamed' });
    await waitFor(() => expect(a.store.getSnapshot().record?.name).toBe('Renamed'));
    library.dispose();
  });
});
