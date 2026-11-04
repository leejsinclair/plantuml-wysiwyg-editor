// T052: the properties shell and PropertyField (FR-003, FR-007/AC13, contracts/ui.md §8). Test VO-092.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpResult, Path } from '../../../src/core/types.ts';
import { createSlots, type BlockEditor, type BlockEditorProps, type Slots } from '../../../src/ui/app/slots.ts';
import { createStore, StoreContext, useSession, useStore, type Store } from '../../../src/ui/app/store.ts';
import { t } from '../../../src/ui/messages/en.ts';
import properties from '../../../src/ui/messages/en/properties.ts';
import { PropertiesPanel } from '../../../src/ui/properties/PropertiesPanel.tsx';
import { PropertyField } from '../../../src/ui/properties/PropertyField.tsx';
import type { ProjectRecord } from '../../../src/services/storage/db.ts';

const screenBlock = (name: string, label = 'OK') => `@startsalt ${name}\n{\n  [${label}]\n}\n@endsalt\n`;
const flowBlock = '@startuml Screen-flow\nstart\n:Sign in;\nstop\n@enduml\n';
const otherBlock = '@startuml\nAlice -> Bob\n@enduml\n';

const record = (source: string, over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: 'p1', name: 'Project', source, flowIndex: null, lastWorking: [],
  createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
  downloadedAt: null, downloadedRevision: null, ...over,
});

/** The first button label in the open block, read from the source, and the op that replaces it. */
function useButtonLabel(): { value: string; onCommit: (v: string) => OpResult } {
  const session = useSession();
  const store = useStore();
  const view = session.blocks.find((b) => b.key === session.openBlockKey)!;
  const source = store.getState()!.source;
  const text = source.slice(view.start, view.end);
  const m = /\[([^\]]*)\]/.exec(text)!;
  const start = view.start + m.index + 1;
  return {
    value: m[1]!,
    onCommit: (v) => ({ ok: true, edits: [{ start, end: start + m[1]!.length, text: v }], select: [0], announceKey: 'test.changed', historyName: 'history.propertyTyping' }),
  };
}

function LabelField({ readOnly = false }: { readonly readOnly?: boolean }) {
  const { value, onCommit } = useButtonLabel();
  return <PropertyField label={t('toolbar.download')} value={value} onCommit={onCommit} readOnly={readOnly} />;
}

const seen: { selection: Path | null; readOnly: boolean }[] = [];
const fakeEditor = (): BlockEditor => ({
  Canvas: () => null,
  Outline: () => null,
  Palette: () => null,
  Properties: ({ selection, readOnly }: BlockEditorProps<unknown>) => {
    seen.push({ selection, readOnly });
    return (
      <div data-testid="editor-properties" data-selection={selection === null ? 'none' : selection.join('.')}>
        <LabelField readOnly={readOnly} />
      </div>
    );
  },
  commands: [],
  pathLabels: (_m, path) => ['Screen', ...path.map((i) => `Item ${i}`)],
  destinations: () => [],
  hasPath: () => true,
});

let stores: Store[] = [];
function setup(source: string, over: Partial<ProjectRecord> = {}, register?: (s: Slots) => void) {
  const slots = createSlots();
  slots.blockEditors.register('screen', fakeEditor());
  register?.(slots);
  const announce = vi.fn();
  const store = createStore({ write: async () => undefined, announce, slots, typingPauseMs: 300 });
  stores.push(store);
  store.load(record(source, over));
  render(
    <StoreContext.Provider value={store}>
      <PropertiesPanel slots={slots} />
    </StoreContext.Provider>,
  );
  return { store, slots, announce };
}

afterEach(() => {
  stores.forEach((s) => s.dispose());
  stores = [];
  seen.length = 0;
  vi.useRealTimers();
});

const source = (store: Store) => store.getState()!.source;
const field = () => screen.getByRole('textbox', { name: t('toolbar.download') });

describe('PropertiesPanel: what it shows (VO-129 properties part)', () => {
  it('with nothing selected, shows the open block\'s own properties', () => {
    setup(screenBlock('Login'));
    expect(screen.getByRole('heading', { name: t('properties.of', { subject: 'Login' }) })).toBeInTheDocument();
    expect(screen.getByTestId('editor-properties')).toHaveAttribute('data-selection', 'none');
  });

  it('with an element selected, shows that element\'s sections from blockEditors[kind].Properties', () => {
    const { store } = setup(screenBlock('Login'));
    act(() => store.select([0, 1]));
    expect(screen.getByTestId('editor-properties')).toHaveAttribute('data-selection', '0.1');
    expect(screen.getByRole('heading', { name: t('properties.of', { subject: 'Item 1' }) })).toBeInTheDocument();
  });

  it('adds every propertySections entry that applies to the context, in order', () => {
    const { store } = setup(screenBlock('Login'), {}, (slots) => {
      slots.propertySections.register({
        id: 'link', order: 2, appliesTo: (ctx) => ctx.selection !== null,
        Component: () => <p>{t('toolbar.redo')}</p>,
      });
      slots.propertySections.register({
        id: 'name', order: 1, appliesTo: (ctx) => ctx.selection === null && ctx.block?.kind === 'screen',
        Component: ({ ctx }) => <p data-block={ctx.block?.name}>{t('toolbar.undo')}</p>,
      });
    });
    expect(screen.getByText(t('toolbar.undo'))).toHaveAttribute('data-block', 'Login');
    expect(screen.queryByText(t('toolbar.redo'))).toBeNull();
    act(() => store.select([0]));
    expect(screen.queryByText(t('toolbar.undo'))).toBeNull();
    expect(screen.getByText(t('toolbar.redo'))).toBeInTheDocument();
  });

  it('for a kind with no registered editor, or other content, says the block is edited in source', () => {
    const { store } = setup(screenBlock('Login') + otherBlock);
    act(() => store.openBlock(store.getSnapshot().blocks[1]!.key));
    expect(screen.getByText(t('properties.sourceOnly'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('properties.of', { subject: t('properties.otherContent') }) })).toBeInTheDocument();
    expect(screen.queryByTestId('editor-properties')).toBeNull();
  });

  it('shows the flow\'s properties through its own editor when one is registered', () => {
    const { store } = setup(screenBlock('Login') + flowBlock, { flowIndex: 1 }, (slots) => {
      slots.blockEditors.register('flow', { ...fakeEditor(), Properties: () => <p data-testid="flow-properties" /> });
    });
    act(() => store.openBlock(store.getSnapshot().blocks[1]!.key));
    expect(screen.getByTestId('flow-properties')).toBeInTheDocument();
  });

  it('is read-only while the block\'s source view is being typed in (FR-004/AC8)', () => {
    const { store } = setup(screenBlock('Login'));
    act(() => store.beginSourceEdit(store.getSnapshot().openBlockKey!));
    expect(seen.at(-1)?.readOnly).toBe(true);
    expect(screen.getByText(t('properties.readOnlySourceEdit'))).toBeInTheDocument();
    expect(field()).toHaveAttribute('readonly');
  });

  it('says when no block is open', () => {
    const slots = createSlots();
    const store = createStore({ write: async () => undefined, announce: vi.fn(), slots });
    stores.push(store);
    render(<StoreContext.Provider value={store}><PropertiesPanel slots={slots} /></StoreContext.Provider>);
    expect(screen.getByText(t('properties.noBlock'))).toBeInTheDocument();
  });

  it('keeps every string in its own catalogue part', () => {
    for (const key of Object.keys(properties)) expect(key.startsWith('properties.'), key).toBe(true);
  });
});

describe('PropertyField: one propertyTyping entry, committed on blur or Enter (FR-007/AC13)', () => {
  it('does not change the source while typing, then commits on Enter as one undo step', async () => {
    const user = userEvent.setup();
    const { store } = setup(screenBlock('Login'));
    await user.clear(field());
    await user.type(field(), 'Save');
    expect(source(store)).toBe(screenBlock('Login', 'OK'));
    await user.keyboard('{Enter}');
    expect(source(store)).toBe(screenBlock('Login', 'Save'));
    expect(store.getSnapshot().undoName).toEqual({ nameKey: 'history.propertyTyping' });
    expect(field()).toHaveFocus();
    act(() => store.undo());
    expect(source(store)).toBe(screenBlock('Login', 'OK'));
    expect(store.getSnapshot().undoName).toBeNull();
    expect(field()).toHaveValue('OK');
  });

  it('commits on blur, even after pauses in the typing, as one undo step', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { store } = setup(screenBlock('Login'));
    await user.click(field());
    await user.type(field(), 'A');
    await act(async () => { vi.advanceTimersByTime(1000); });
    await user.type(field(), 'B');
    await user.tab();
    expect(source(store)).toBe(screenBlock('Login', 'OKAB'));
    act(() => store.undo());
    expect(source(store)).toBe(screenBlock('Login', 'OK'));
  });

  it('commits nothing when the value is unchanged', async () => {
    const user = userEvent.setup();
    const { store } = setup(screenBlock('Login'));
    await user.type(field(), 'X');
    await user.keyboard('{Backspace}{Enter}');
    await user.tab();
    expect(store.getSnapshot().undoName).toBeNull();
  });

  it('two commits in a row are two undo steps', async () => {
    const user = userEvent.setup();
    const { store } = setup(screenBlock('Login'));
    await user.type(field(), '1{Enter}');
    await user.type(field(), '2{Enter}');
    expect(source(store)).toBe(screenBlock('Login', 'OK12'));
    act(() => store.undo());
    expect(source(store)).toBe(screenBlock('Login', 'OK1'));
  });

  it('VO-092: undo while the field has focus undoes the typing in that field first, then the history', async () => {
    const user = userEvent.setup();
    const { store } = setup(screenBlock('Login'));
    await user.clear(field());
    await user.type(field(), 'Save{Enter}');
    await user.type(field(), ' now');
    expect(field()).toHaveValue('Save now');

    await user.keyboard('{Control>}z{/Control}');
    expect(field()).toHaveValue('Save');
    expect(source(store)).toBe(screenBlock('Login', 'Save'));
    expect(field()).toHaveFocus();

    await user.keyboard('{Control>}z{/Control}');
    expect(source(store)).toBe(screenBlock('Login', 'OK'));
    expect(field()).toHaveValue('OK');
  });

  it('redo while focused restores the field\'s undone typing first, then the history', async () => {
    const user = userEvent.setup();
    const { store } = setup(screenBlock('Login'));
    await user.type(field(), '!{Enter}');
    await user.type(field(), '?');
    await user.keyboard('{Control>}z{/Control}');
    expect(field()).toHaveValue('OK!');
    await user.keyboard('{Control>}y{/Control}');
    expect(field()).toHaveValue('OK!?');
    await user.keyboard('{Escape}');
    expect(field()).toHaveValue('OK!');
    await user.keyboard('{Control>}z{/Control}');
    expect(source(store)).toBe(screenBlock('Login', 'OK'));
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(source(store)).toBe(screenBlock('Login', 'OK!'));
  });

  it('keeps undo and redo inside the field: the key event does not reach the workspace', async () => {
    const user = userEvent.setup();
    setup(screenBlock('Login'));
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    await user.type(field(), 'x');
    outer.mockClear();
    await user.keyboard('{Control>}z{/Control}');
    expect(outer.mock.calls.filter(([e]) => (e as KeyboardEvent).key === 'z')).toHaveLength(0);
    document.removeEventListener('keydown', outer);
  });

  it('follows the stored value when it changes while the field is not being typed in', () => {
    const { store } = setup(screenBlock('Login'));
    const view = store.getSnapshot().blocks[0]!;
    const at = source(store).indexOf('OK', view.start);
    act(() => store.applyEdits([{ start: at, end: at + 2, text: 'Go' }], { nameKey: 'history.propertyTyping', blockKey: view.key }));
    expect(field()).toHaveValue('Go');
  });

  it('a refused commit changes nothing, is announced, and the field shows the stored value', async () => {
    const user = userEvent.setup();
    const slots = createSlots();
    const announce = vi.fn();
    const store = createStore({ write: async () => undefined, announce, slots });
    stores.push(store);
    store.load(record(screenBlock('Login')));
    const refuse = vi.fn((): OpResult => ({ ok: false, messageKey: 'test.refused' }));
    render(
      <StoreContext.Provider value={store}>
        <PropertyField label={t('toolbar.download')} value="OK" onCommit={refuse} />
      </StoreContext.Provider>,
    );
    await user.type(field(), '|{Enter}');
    expect(refuse).toHaveBeenCalledWith('OK|');
    expect(announce).toHaveBeenCalledWith('test.refused', undefined);
    expect(source(store)).toBe(screenBlock('Login'));
    expect(field()).toHaveValue('OK');
  });

  it('is labelled, can carry a description, and is read-only when asked', () => {
    const slots = createSlots();
    const store = createStore({ write: async () => undefined, announce: vi.fn(), slots });
    stores.push(store);
    render(
      <StoreContext.Provider value={store}>
        <PropertyField label={t('toolbar.download')} description={t('toolbar.redo')} value="v" onCommit={() => ({ ok: false, messageKey: 'x' })} readOnly />
      </StoreContext.Provider>,
    );
    expect(field()).toHaveAccessibleDescription(t('toolbar.redo'));
    expect(field()).toHaveAttribute('readonly');
    fireEvent.change(field(), { target: { value: 'w' } });
    fireEvent.blur(field());
    expect(store.getSnapshot().undoName).toBeNull();
  });
});
