// T116: the source edit session (data-model §7.2, spec section 4.2). VO-024 re-division warning and cancel,
// VO-063 switching without typing, VO-066 invalid text kept, VO-085 typing runs as undo steps, VO-118 source-view
// renames, VO-133 the whole-file view.
import { act, fireEvent, render, screen, within } from '../render';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSlots, type BlockEditor, type BlockEditorProps, type Slots } from '../../../src/ui/app/slots.ts';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import type { ProjectRecord, Settings } from '../../../src/services/storage/db.ts';
import { Workspace, type SettingsStore } from '../../../src/ui/workspace/Workspace.tsx';
import { createNotices, Notices, type NoticesStore } from '../../../src/ui/notices/Notices.tsx';
import { registerSourceEdit } from '../../../src/ui/source-view/register.tsx';
import { t } from '../../../src/ui/messages/en.ts';
import type { Path } from '../../../src/core/types.ts';

const screenText = (name: string, body = '  [OK]') => `@startsalt ${name}\n{\n${body}\n}\n@endsalt\n`;
const FLOW = '@startuml Screen-flow\nstart\n:[[#Login Sign in]];\n:[[#Login Again]];\n:Plain;\nstop\n@enduml\n';
const LOGIN = screenText('Login');
const HOME = screenText('Home', '  [Go]');

const record = (source: string, flowIndex: number | null): ProjectRecord => ({
  id: 'p1', name: 'Project', source, flowIndex, lastWorking: [],
  createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
  downloadedAt: null, downloadedRevision: null,
});

function fakeEditor(name: string, pathAt?: (model: unknown, offset: number) => Path | null): BlockEditor {
  const part = (role: string) => function Part({ blockKey, selection, readOnly }: BlockEditorProps<unknown>) {
    return <div data-testid={`${name}-${role}`} data-block={blockKey} data-readonly={String(readOnly)} data-selection={selection?.join('.') ?? ''} />;
  };
  return {
    Canvas: part('canvas'), Outline: part('outline'), Palette: part('palette'), Properties: part('properties'),
    commands: [], pathLabels: () => [name], destinations: () => [], hasPath: () => true,
    ...(pathAt ? { pathAt } : {}),
  } as BlockEditor;
}

const settings = (): SettingsStore => {
  let value: Settings = { panels: { outline: { collapsed: false }, source: { collapsed: false }, preview: { collapsed: false } } };
  return { initial: value, get: async () => value, put: async (s) => { value = s; } };
};

let stores: Store[] = [];
let removers: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  removers.forEach((r) => r());
  removers = [];
  stores.forEach((s) => s.dispose());
  stores = [];
  vi.useRealTimers();
});

interface Setup {
  store: Store;
  slots: Slots;
  notices: NoticesStore;
  writes: ProjectRecord[];
  clipboard: string[];
}

function setup(source: string, flowIndex: number | null = null, opts: { pathAt?: (model: unknown, offset: number) => Path | null } = {}): Setup {
  const slots = createSlots();
  slots.blockEditors.register('screen', fakeEditor('Screen', opts.pathAt));
  slots.blockEditors.register('flow', fakeEditor('Flow'));
  const notices = createNotices({ announce: () => {} });
  const clipboard: string[] = [];
  removers.push(registerSourceEdit(slots, { notices, pauseMs: 300, writeClipboard: async (text) => { clipboard.push(text); } }));
  const writes: ProjectRecord[] = [];
  const store = createStore({ write: async (r) => { writes.push(r); }, slots, announce: vi.fn() });
  stores.push(store);
  store.load(record(source, flowIndex));
  render(
    <StoreContext.Provider value={store}>
      <Notices notices={notices} />
      <Workspace slots={slots} platform="windows" settings={settings()} projectPanel={<span />} properties={<span />} preview={<span />} />
    </StoreContext.Provider>,
  );
  return { store, slots, notices, writes, clipboard };
}

function editor(): EditorView {
  const dom = document.querySelector('.source-view .cm-editor');
  expect(dom).not.toBeNull();
  return EditorView.findFromDOM(dom as HTMLElement)!;
}

/** Types: replaces the whole text of the open block's source view, as user input. */
function typeText(text: string): void {
  const v = editor();
  act(() => v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, userEvent: 'input.type' }));
}

function pause(ms = 300): void {
  act(() => vi.advanceTimersByTime(ms));
}

async function leave(): Promise<void> {
  await act(async () => {
    fireEvent.blur(editor().contentDOM);
    await Promise.resolve();
  });
}

const source = (s: Setup) => s.store.getState()!.source;
const keyOf = (s: Setup, name: string) => s.store.getSnapshot().blocks.find((b) => b.name === name)!.key;

describe('source edit: locking and pauses', () => {
  it('the source view is editable once the controller is registered', () => {
    setup(LOGIN + '\n' + HOME);
    expect(editor().state.readOnly).toBe(false);
  });

  it('the first keystroke locks only this block; a pause applies the text; leaving unlocks (FR-004/AC8, AC9)', async () => {
    const s = setup(LOGIN + '\n' + HOME);
    const login = keyOf(s, 'Login');
    typeText(screenText('Login', '  [Cancel]'));
    expect(s.store.getSnapshot().sourceEditKey).toBe(login);
    expect(screen.getByTestId('Screen-canvas')).toHaveAttribute('data-readonly', 'true');
    // Not applied before the pause.
    expect(source(s)).toBe(LOGIN + '\n' + HOME);
    pause();
    expect(source(s)).toBe(screenText('Login', '  [Cancel]') + '\n' + HOME);
    expect(screen.getByTestId('Screen-canvas')).toHaveAttribute('data-readonly', 'true');
    await leave();
    expect(s.store.getSnapshot().sourceEditKey).toBeNull();
    expect(screen.getByTestId('Screen-canvas')).toHaveAttribute('data-readonly', 'false');
  });

  it('maps the cursor to a selection on a pause, when the block editor can tell', () => {
    const pathAt = vi.fn((_m: unknown, offset: number): Path => [offset > 15 ? 1 : 0]);
    const s = setup(LOGIN, null, { pathAt });
    typeText(screenText('Login', '  [Cancel]'));
    act(() => editor().dispatch({ selection: { anchor: 20 } }));
    pause();
    expect(pathAt).toHaveBeenCalled();
    expect(s.store.getSnapshot().selection?.path).toEqual([1]);
  });

  it('switching between canvas and source without typing leaves the source byte-identical (VO-063)', async () => {
    const text = "' comment\n" + LOGIN + '\n\n' + HOME + 'no final newline';
    const s = setup(text);
    for (let i = 0; i < 3; i++) {
      act(() => editor().focus());
      await leave();
      act(() => screen.getByTestId('Screen-canvas').focus());
      pause(1000);
    }
    expect(source(s)).toBe(text);
    expect(s.store.getSnapshot().undoName).toBeNull();
  });

  it('typing runs between pauses are one undo step each, until leaving (VO-085)', async () => {
    const s = setup(LOGIN);
    typeText(screenText('Login', '  [A'));
    pause(100);
    typeText(screenText('Login', '  [AB]'));
    pause(400);
    typeText(screenText('Login', '  [AB] | [C'));
    pause(100);
    typeText(screenText('Login', '  [AB] | [CD]'));
    await leave();
    expect(source(s)).toBe(screenText('Login', '  [AB] | [CD]'));
    expect(s.store.getSnapshot().undoName).toEqual({ nameKey: 'history.sourceTyping' });
    act(() => s.store.undo());
    expect(source(s)).toBe(screenText('Login', '  [AB]'));
    act(() => s.store.undo());
    expect(source(s)).toBe(LOGIN);
    expect(s.store.getSnapshot().undoName).toBeNull();
  });
});

describe('source edit: invalid text is kept (FR-020/AC6, VO-066)', () => {
  it('keeps the typed invalid text through leaving, other edits and a reload', async () => {
    const s = setup(LOGIN + '\n' + HOME);
    const invalid = '@startsalt Login\n{\n  [OK\n@endsalt\n';
    typeText(invalid);
    pause();
    await leave();
    expect(source(s)).toBe(invalid + '\n' + HOME);
    const login = s.store.getSnapshot().blocks[0]!;
    expect(login.status).toBe('Error');
    expect(login.hasLastWorking).toBe(true);
    // A visual edit in another block leaves it alone.
    const home = s.store.getSnapshot().blocks[1]!;
    act(() => s.store.applyEdits([{ start: home.end - '}\n@endsalt\n'.length, end: home.end - '}\n@endsalt\n'.length, text: '  [More]\n' }], { nameKey: 'history.sourceTyping', blockKey: home.key }));
    expect(source(s).startsWith(invalid + '\n')).toBe(true);
    await act(async () => { await s.store.flush(); });
    // Reload: a new store from what was written.
    const saved = s.writes.at(-1)!;
    expect(saved.source.startsWith(invalid)).toBe(true);
    expect(saved.lastWorking).toEqual([{ blockIndex: 0, text: LOGIN }]);
    const reloaded = createStore({ write: async () => {}, announce: vi.fn() });
    stores.push(reloaded);
    reloaded.load(saved);
    expect(reloaded.getState()!.source.startsWith(invalid)).toBe(true);
    expect(reloaded.getSnapshot().blocks[0]!.hasLastWorking).toBe(true);
  });
});

describe('source edit: re-division on leaving (FR-004/AC10, VO-024)', () => {
  it('is not re-divided while typing; leaving re-divides once, as one undo step, with a report', async () => {
    const s = setup(LOGIN + '\n' + HOME);
    const [loginKey, homeKey] = s.store.getSnapshot().blocks.map((b) => b.key);
    const typed = '@startsalt Login\n{\n  [OK]\n}\n';
    typeText(typed);
    pause(1000);
    // Held: the stored source and the blocks are unchanged while typing.
    expect(source(s)).toBe(LOGIN + '\n' + HOME);
    expect(editor().state.doc.toString()).toBe(typed);
    await leave();
    expect(source(s)).toBe(typed + '\n' + HOME);
    expect(s.store.getSnapshot().blocks.map((b) => b.key)).toEqual([loginKey, homeKey]);
    expect(screen.getByText(t('source.redivided', { block: 'Login', count: 1 }))).toBeInTheDocument();
    expect(s.store.getSnapshot().undoName).toEqual({ nameKey: 'history.redivide', params: { block: 'Login' } });
    expect(s.store.getSnapshot().sourceEditKey).toBeNull();
    act(() => s.store.undo());
    expect(source(s)).toBe(LOGIN + '\n' + HOME);
    expect(s.store.getSnapshot().undoName).toBeNull();
  });

  it('a split block keeps its identity on the first part and adds the new block', async () => {
    const s = setup(LOGIN + '\n' + HOME);
    const loginKey = keyOf(s, 'Login');
    typeText(LOGIN + screenText('Extra'));
    await leave();
    const blocks = s.store.getSnapshot().blocks;
    expect(blocks.map((b) => b.name)).toEqual(['Login', 'Extra', 'Home']);
    expect(blocks[0]!.key).toBe(loginKey);
    expect(screen.getByText(t('source.redivided', { block: 'Login', count: 2 }))).toBeInTheDocument();
  });

  it('warns before removing a linked screen; cancelling keeps the text and the block', async () => {
    const original = LOGIN + '\n' + HOME + '\n' + FLOW;
    const s = setup(original, 2);
    const typed = '{\n  [OK]\n}\n@endsalt\n';
    typeText(typed);
    await leave();
    const dialog = screen.getByRole('alertdialog', { name: t('source.redivideWarning.title') });
    expect(dialog).toHaveTextContent(t('source.redivideWarning.message', { block: 'Login', screens: 'Login', count: 2 }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: t('source.redivideWarning.cancel') }));
      await Promise.resolve();
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(source(s)).toBe(original);
    expect(s.store.getSnapshot().blocks.map((b) => b.name)).toEqual(['Login', 'Home', 'Screen-flow']);
    expect(editor().state.doc.toString()).toBe(typed);
    // The block stays locked with the text held, and the user is told.
    expect(s.store.getSnapshot().sourceEditKey).toBe(keyOf(s, 'Login'));
    expect(screen.getByText(t('source.redivideCancelled'))).toBeInTheDocument();
    expect(s.store.getSnapshot().undoName).toBeNull();
  });

  it('proceeding removes the screen in one undo step', async () => {
    const original = LOGIN + '\n' + HOME + '\n' + FLOW;
    const s = setup(original, 2);
    const typed = '{\n  [OK]\n}\n@endsalt\n';
    typeText(typed);
    await leave();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('source.redivideWarning.proceed') }));
      await Promise.resolve();
    });
    expect(source(s)).toBe(typed + '\n' + HOME + '\n' + FLOW);
    expect(s.store.getSnapshot().blocks.map((b) => b.name)).toEqual(['Home', 'Screen-flow']);
    expect(s.store.getSnapshot().blocks[1]!.kind).toBe('flow');
    expect(screen.getByText(t('source.redividedNone', { block: 'Login' }))).toBeInTheDocument();
    act(() => s.store.undo());
    expect(source(s)).toBe(original);
    expect(s.store.getSnapshot().blocks.map((b) => b.kind)).toEqual(['screen', 'screen', 'flow']);
  });

  it('refuses to remove the last block and says why (FR-011/AC15)', async () => {
    const s = setup(LOGIN);
    typeText('{\n}\n');
    await leave();
    expect(source(s)).toBe(LOGIN);
    expect(screen.getByText(t('source.lastBlockRefused', { block: 'Login' }))).toBeInTheDocument();
    expect(s.store.getSnapshot().undoName).toBeNull();
  });
});

describe('source edit: renaming in the source view (FR-011/AC14, OD-4, VO-118)', () => {
  it('an allowed, unique name updates the links in the same undo step, without confirmation', async () => {
    const original = LOGIN + '\n' + HOME + '\n' + FLOW;
    const s = setup(original, 2);
    typeText(screenText('Sign-in'));
    pause(1000);
    expect(source(s)).toBe(original);
    await leave();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(source(s)).toBe(screenText('Sign-in') + '\n' + HOME + '\n' + FLOW.replaceAll('#Login', '#Sign-in'));
    expect(screen.getByText('Updated 2 steps')).toBeInTheDocument();
    act(() => s.store.undo());
    expect(source(s)).toBe(original);
  });

  it('any other name keeps the typed name, breaks the links and offers Undo', async () => {
    const original = LOGIN + '\n' + HOME + '\n' + FLOW;
    const s = setup(original, 2);
    typeText(screenText('Home'));
    await leave();
    // Never rewritten: the typed duplicate name stays, and the links keep the previous name.
    expect(source(s)).toBe(screenText('Home') + '\n' + HOME + '\n' + FLOW);
    expect(s.store.getSnapshot().blocks[0]!.nameFlag).toBe('duplicate');
    const message = t('source.rename.broken.duplicate', { count: 2, name: 'Home', previous: 'Login' });
    const notice = screen.getByText(message).closest('li')!;
    act(() => fireEvent.click(within(notice).getByRole('button', { name: t('notice.undo') })));
    expect(source(s)).toBe(original);
  });

  it('a name that is not allowed is flagged the same way', async () => {
    const original = LOGIN + '\n' + FLOW;
    const s = setup(original, 1);
    typeText(screenText('1 bad'));
    await leave();
    expect(source(s)).toBe(screenText('1 bad') + '\n' + FLOW);
    expect(screen.getByText(t('source.rename.broken.notAllowed', { count: 2, name: '1 bad', previous: 'Login' }))).toBeInTheDocument();
  });
});

describe('the whole-file view (FR-016/AC7, VO-133)', () => {
  it('shows the entire file, text between blocks included, read-only and copyable', async () => {
    const whole = "' header comment\n" + LOGIN + '\nfree text between\n\n' + HOME + 'trailing';
    const s = setup(whole);
    const toggle = screen.getByRole('button', { name: t('source.wholeFile.toggle') });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    act(() => fireEvent.click(toggle));
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const dialog = screen.getByRole('dialog', { name: t('source.wholeFile.title') });
    const text = within(dialog).getByRole('textbox', { name: t('source.wholeFile.editor') });
    expect(text).toHaveAttribute('aria-readonly', 'true');
    const view = EditorView.findFromDOM(dialog.querySelector('.cm-editor') as HTMLElement)!;
    expect(view.state.doc.toString()).toBe(whole);
    expect(view.state.readOnly).toBe(true);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: t('source.wholeFile.copy') }));
      await Promise.resolve();
    });
    expect(s.clipboard).toEqual([whole]);
    act(() => fireEvent.click(within(dialog).getByRole('button', { name: t('source.wholeFile.close') })));
    expect(screen.queryByRole('dialog', { name: t('source.wholeFile.title') })).toBeNull();
    expect(source(s)).toBe(whole);
  });
});
