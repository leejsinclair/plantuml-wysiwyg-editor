// T050: the toolbar (contracts/ui.md §3 and §4, FR-016/AC1, FR-007/AC9 VO-089, FR-006/AC7).
import { act, render, screen } from '../render';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSlots, type SlotContext, type SlotProps, type Slots } from '../../../src/ui/app/slots.ts';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import type { ProjectRecord } from '../../../src/services/storage/db.ts';
import { t } from '../../../src/ui/messages/en.ts';
import { ariaShortcuts, autosaveText, historyLabel, Toolbar } from '../../../src/ui/workspace/Toolbar.tsx';

const SOURCE = '@startsalt Sign-in\n{\n  [OK]\n}\n@endsalt\n';
const RECORD: ProjectRecord = {
  id: 'p1', name: 'Project', source: SOURCE, flowIndex: null, lastWorking: [],
  createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
  downloadedAt: null, downloadedRevision: null,
};
const CTX: SlotContext = { projectId: 'p1', block: { key: 'b1', kind: 'screen', name: 'Sign-in', readOnly: false }, selection: null };

interface Deferred { resolve(): void; reject(e: Error): void }

let stores: Store[] = [];
afterEach(() => {
  stores.forEach((s) => s.dispose());
  stores = [];
});

function setup(options: { load?: boolean; manualWrites?: boolean } = {}) {
  const pending: Deferred[] = [];
  const write = options.manualWrites
    ? () => new Promise<void>((resolve, reject) => pending.push({ resolve, reject }))
    : async () => {};
  const slots = createSlots();
  const store = createStore({ write, announce: vi.fn(), slots, typingPauseMs: 0 });
  stores.push(store);
  if (options.load !== false) store.load(RECORD);
  const view = render(
    <StoreContext.Provider value={store}>
      <Toolbar ctx={CTX} slots={slots} platform="windows" />
    </StoreContext.Provider>,
  );
  return { store, slots, pending, view };
}

const toolbar = () => screen.getByRole('toolbar', { name: t('toolbar.label') });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
/** Types into the open block's source, as the source view would. */
const typeSource = (store: Store, text: string) => act(() => store.replaceBlockText(store.getSnapshot().openBlockKey!, text));

describe('Toolbar: Undo and Redo name their action (FR-007/AC9, VO-089)', () => {
  it('is a labelled toolbar with Undo and Redo disabled before any change', () => {
    setup();
    expect(toolbar()).toBeInTheDocument();
    const undo = button(t('toolbar.undo'));
    const redo = button(t('toolbar.redo'));
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    expect(undo).toHaveAccessibleDescription(t('toolbar.nothingToUndo'));
    expect(redo).toHaveAccessibleDescription(t('toolbar.nothingToRedo'));
  });

  it('names the action Undo will undo after an operation', () => {
    const { store } = setup();
    typeSource(store, SOURCE.replace('[OK]', '[Sign in]'));
    const undo = button(t('toolbar.undoAction', { action: t('history.sourceTyping') }));
    expect(undo).toBeEnabled();
    expect(undo).toHaveAccessibleName('Undo typing in the source');
    expect(button(t('toolbar.redo'))).toBeDisabled();
  });

  it('names the action Redo will redo after undoing, and runs undo and redo on click', async () => {
    const user = userEvent.setup();
    const { store } = setup();
    typeSource(store, SOURCE.replace('[OK]', '[Sign in]'));
    await user.click(button(/^Undo typing in the source$/));
    expect(store.getState()!.source).toBe(SOURCE);
    expect(button(t('toolbar.undo'))).toBeDisabled();
    const redo = button(t('toolbar.redoAction', { action: t('history.sourceTyping') }));
    expect(redo).toHaveAccessibleName('Redo typing in the source');
    await user.click(redo);
    expect(store.getState()!.source).toContain('[Sign in]');
    expect(button(/^Undo typing in the source$/)).toBeEnabled();
    expect(button(t('toolbar.redo'))).toBeDisabled();
  });

  it('follows the history when it is cleared (FR-007/AC7)', () => {
    const { store } = setup();
    typeSource(store, SOURCE.replace('[OK]', '[Sign in]'));
    act(() => store.clearHistory());
    expect(button(t('toolbar.undo'))).toBeDisabled();
  });

  it('advertises the shortcuts from keys.ts', () => {
    setup();
    expect(button(t('toolbar.undo'))).toHaveAttribute('aria-keyshortcuts', 'Control+Z');
    expect(button(t('toolbar.redo'))).toHaveAttribute('aria-keyshortcuts', 'Control+Y Control+Shift+Z');
    expect(ariaShortcuts('redo', 'mac')).toBe('Meta+Shift+Z');
  });

  it('builds the label from the action name and its parameters', () => {
    expect(historyLabel('undo', null)).toBe('Undo');
    expect(historyLabel('redo', null)).toBe('Redo');
    expect(historyLabel('undo', { nameKey: 'history.propertyTyping' })).toBe('Undo typing in a property');
  });
});

describe('Toolbar: autosave status (contracts/ui.md §4, FR-006/AC7)', () => {
  it('says "All changes saved" after opening a project', () => {
    setup();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it('says "Saving…" while a change is unwritten and returns to "All changes saved" once written', async () => {
    const { store, pending } = setup({ manualWrites: true });
    typeSource(store, SOURCE.replace('[OK]', '[Sign in]'));
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    let flushed: Promise<unknown> = Promise.resolve();
    act(() => {
      flushed = store.flush();
    });
    expect(pending).toHaveLength(1);
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    await act(async () => {
      pending[0]!.resolve();
      await flushed;
    });
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it('maps every save status to the two exact strings', () => {
    expect(autosaveText('saved')).toBe('All changes saved');
    expect(autosaveText('pending')).toBe('Saving…');
    expect(autosaveText('saving')).toBe('Saving…');
    expect(autosaveText('failed')).toBe('Saving…');
  });

  it('shows no status without an open project', () => {
    setup({ load: false });
    expect(screen.queryByText('All changes saved')).toBeNull();
  });
});

describe('Toolbar: the toolbar slot (FR-016/AC1)', () => {
  const contribution = (slots: Slots, id: string, label: string, order?: number) =>
    slots.toolbar.register({
      id,
      ...(order !== undefined ? { order } : {}),
      Component: ({ ctx }: SlotProps) => <button type="button" data-project={ctx.projectId ?? ''}>{label}</button>,
    });

  it('shows contributions after Undo, Redo and the status, in slot order, with the context', () => {
    const { slots } = setup();
    act(() => {
      contribution(slots, 'download', t('toolbar.download'), 20);
      contribution(slots, 'import', t('toolbar.import'), 10);
    });
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['Undo', 'Redo', t('toolbar.import'), t('toolbar.download')]);
    expect(button(t('toolbar.download'))).toHaveAttribute('data-project', 'p1');
  });

  it('removes a contribution when it is unregistered', () => {
    const { slots } = setup();
    let remove: () => void = () => {};
    act(() => {
      remove = contribution(slots, 'download', t('toolbar.download'));
    });
    expect(button(t('toolbar.download'))).toBeInTheDocument();
    act(() => remove());
    expect(screen.queryByRole('button', { name: t('toolbar.download') })).toBeNull();
  });

  it('moves focus between enabled controls with the arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    const { store, slots } = setup();
    act(() => {
      contribution(slots, 'import', t('toolbar.import'), 10);
      contribution(slots, 'download', t('toolbar.download'), 20);
    });
    typeSource(store, SOURCE.replace('[OK]', '[Sign in]'));
    const undo = button(/^Undo typing in the source$/);
    act(() => undo.focus());
    await user.keyboard('{ArrowRight}');
    expect(button(t('toolbar.import'))).toHaveFocus();
    await user.keyboard('{End}');
    expect(button(t('toolbar.download'))).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(undo).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(button(t('toolbar.download'))).toHaveFocus();
    await user.keyboard('{Home}');
    expect(undo).toHaveFocus();
  });
});
