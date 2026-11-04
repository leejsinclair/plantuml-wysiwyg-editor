// T159: link control UI tests (FR-013/AC1, AC4, AC6, FR-009/AC8; VO-038, VO-040, VO-126).
//
// VO-038: "Create screen" creates a screen named from the step and links the step.
// VO-040: a broken step offers "Link to another screen", "Create screen" and "Remove link".
// VO-126: linked steps look different from unlinked ones.
import { render, screen, waitFor } from '../render';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRecord, Settings } from '../../../src/services/storage/db.ts';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import { slots } from '../../../src/ui/app/slots.ts';
import '../../../src/ui/flow-canvas/register.tsx';
import '../../../src/ui/flow-links/register.tsx';
import { t } from '../../../src/ui/messages/en.ts';
import { Workspace, type SettingsStore } from '../../../src/ui/workspace/Workspace.tsx';
import { notices, Notices } from '../../../src/ui/notices/Notices.tsx';

const FLOW = (...lines: string[]) => ['@startuml Screen-flow', 'start', ...lines, 'stop', '@enduml', ''].join('\n');
const SIGN_IN = '@startsalt Sign-in\n{\n  [OK]\n}\n@endsalt\n';

const record = (source: string, flowIndex: number): ProjectRecord => ({
  id: 'p1', name: 'Proj', source, flowIndex, lastWorking: [],
  createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
  downloadedAt: null, downloadedRevision: null,
});

const memorySettings = (): SettingsStore => {
  let value: Settings = { panels: {} };
  return { get: async () => value, put: async (s) => { value = s; } };
};

let stores: Store[] = [];

/** Loads the project, opens the flow block and selects the step at `path`. */
function setup(source: string, flowIndex: number, path: number[]) {
  const store = createStore({ write: async () => undefined, announce: vi.fn(), slots });
  stores.push(store);
  store.load(record(source, flowIndex));
  const state = store.getState()!;
  store.openBlock(state.keys[flowIndex]!);
  store.select(path);
  const utils = render(
    <StoreContext.Provider value={store}>
      <Notices />
      <Workspace platform="windows" settings={memorySettings()} slots={slots} />
    </StoreContext.Provider>,
  );
  return { store, ...utils };
}

afterEach(() => {
  for (const s of stores) s.dispose();
  stores = [];
  for (const n of notices.list()) notices.dismiss(n.id);
});

describe('VO-038: Create screen', () => {
  it('creates a screen named from the step and links the step in one undo step', async () => {
    const user = userEvent.setup();
    const source = SIGN_IN + FLOW(':Enter credentials;');
    const { store } = setup(source, 1, [1]);
    await user.click(await screen.findByRole('button', { name: t('links.createScreen') }));
    await waitFor(() => expect(store.getState()!.source).toContain('@startsalt Enter-credentials'));
    expect(store.getState()!.source).toContain(':[[#Enter-credentials Enter credentials]];');

    store.undo();
    expect(store.getState()!.source).toBe(source);
  });
});

describe('VO-040: broken link actions', () => {
  it('offers Link to another screen, Create screen and Remove link', async () => {
    const source = SIGN_IN + FLOW(':[[#Missing Enter credentials]];');
    setup(source, 1, [1]);
    expect(await screen.findByText(t('links.broken', { name: 'Missing' }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('links.linkToScreen') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('links.createScreen') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('links.removeLink') })).toBeInTheDocument();
  });

  it('Remove link turns the step back into a plain step', async () => {
    const user = userEvent.setup();
    const source = SIGN_IN + FLOW(':[[#Missing Enter credentials]];');
    const { store } = setup(source, 1, [1]);
    await user.click(await screen.findByRole('button', { name: t('links.removeLink') }));
    await waitFor(() => expect(store.getState()!.source).toContain(':Enter credentials;'));
    expect(store.getState()!.source).not.toContain('[[');
  });

  it('suggests the screen name when only the case differs', async () => {
    const user = userEvent.setup();
    const source = SIGN_IN + FLOW(':[[#sign-in Enter credentials]];');
    const { store } = setup(source, 1, [1]);
    await user.click(await screen.findByRole('button', { name: t('links.fixCase', { suggestion: 'Sign-in' }) }));
    await waitFor(() => expect(store.getState()!.source).toContain(':[[#Sign-in Enter credentials]];'));
  });
});

describe('VO-126: linked steps look different', () => {
  it('marks a linked step differently from an unlinked one', async () => {
    const source = SIGN_IN + FLOW(':[[#Sign-in Linked step]];', ':Plain step;');
    setup(source, 1, [1]);
    const canvas = await screen.findByRole('region', { name: t('flow.canvas.label') });
    const items = Array.from(canvas.querySelectorAll('[role="treeitem"]'));
    const linked = items.find((el) => /Linked step/.test(el.textContent ?? ''))!;
    const plain = items.find((el) => /Plain step/.test(el.textContent ?? ''))!;
    expect(linked).toBeTruthy();
    expect(plain).toBeTruthy();
    expect(linked.innerHTML).not.toBe(plain.innerHTML.replace('Plain step', 'Linked step'));
    expect(`${linked.className} ${linked.getAttribute('aria-label') ?? ''} ${linked.innerHTML}`).toMatch(/link/i);
  });
});
