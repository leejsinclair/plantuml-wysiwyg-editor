// T107: block status banners, revert and older-format conversion in the workspace (FR-004/AC4, FR-010/AC1–AC4,
// AC7–AC9). VO-018 (invalid-only screen: Error with problem and line, no revert), VO-080 (last working version
// shown after reload), VO-109 (revert before and after reload), VO-110 ("Cannot be rendered" with the
// renderer's message), VO-017 (exactly one "Convert all" notice, undone in one step), VO-106 display (a plain
// reason for each status).
import { act, render, screen, waitFor, within } from '../render';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/ui/blocks/register.tsx';
import { importSource } from '../../../src/core/project/project.ts';
import { slots, type BlockEditor, type BlockEditorProps } from '../../../src/ui/app/slots.ts';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import { RenderQueue, type EngineFactory } from '../../../src/services/render/render-queue.ts';
import type { ProjectRecord, Settings } from '../../../src/services/storage/db.ts';
import { t } from '../../../src/ui/messages/en.ts';
import { notices, Notices } from '../../../src/ui/notices/Notices.tsx';
import { Workspace, type SettingsStore } from '../../../src/ui/workspace/Workspace.tsx';
import { corpusFiles } from '../../unit/corpus/corpus.ts';
import { decode } from '../../../src/core/source/decode.ts';

const corpus = (name: string) => readFileSync(resolve(import.meta.dirname, '../../corpus/import', name), 'utf8');

const GOOD = '@startsalt Login\n{\n  Name | "     "\n  [Save]\n}\n@endsalt\n';
const BROKEN = '@startsalt Login\n{\n  Name | "     "\n  [Save]\n@endsalt\n';
const HOME = '@startsalt Home\n{\n  [Go]\n}\n@endsalt\n';
const SEQUENCE = '@startuml\nAlice -> Bob : hi\n@enduml\n';
const OLDER_A = '@startuml Sign-in\nsalt\n{\n  Email | "     "\n  [Next]\n}\n@enduml\n';
const OLDER_B = "@startuml Settings\n' kept\nsalt\n{+\n  [X] Remember me\n}\n@enduml\n";

// A screen editor whose canvas shows what it was given, so the banner's read-only last working version can be seen.
function FakeCanvas({ blockKey, model, readOnly }: BlockEditorProps<unknown>) {
  return <div data-testid="fake-canvas" data-block={blockKey} data-readonly={String(readOnly)} data-model={JSON.stringify(model)} />;
}
const nothing = () => null;
const fakeEditor: BlockEditor = {
  Canvas: FakeCanvas, Outline: nothing, Palette: nothing, Properties: nothing, commands: [],
  pathLabels: () => [], destinations: () => [], hasPath: () => true,
};
let unregister: (() => void) | null = null;
beforeAll(() => {
  if (!slots.blockEditors.get('screen')) unregister = slots.blockEditors.register('screen', fakeEditor);
});
afterAll(() => unregister?.());

function memorySettings(): SettingsStore {
  let value: Settings = { panels: { outline: { collapsed: false }, source: { collapsed: false }, preview: { collapsed: false } } };
  return { initial: value, get: async () => value, put: async (s) => { value = s; } };
}

let seq = 0;
const recordFor = (source: string, over: Partial<ProjectRecord> = {}): ProjectRecord => {
  const state = importSource(source);
  return {
    id: `status-${++seq}`, name: 'Project', source: state.source, flowIndex: state.flowIndex, lastWorking: [],
    createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
    downloadedAt: null, downloadedRevision: null, ...over,
  };
};

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
  for (const n of notices.list()) notices.dismiss(n.id);
});

interface Setup { store: Store; announce: ReturnType<typeof vi.fn>; rerender: () => void }

function setup(record: ProjectRecord, queue?: RenderQueue): Setup {
  const announce = vi.fn();
  const store = createStore({ write: async () => {}, announce, ...(queue ? { renderQueue: queue } : {}) });
  cleanups.push(() => store.dispose());
  store.load(record);
  const settings = memorySettings();
  const ui = (n: number) => (
    <StoreContext.Provider value={store}>
      <Workspace key={n} platform="windows" settings={settings} {...(queue ? { renderQueue: queue } : {})} />
      <Notices />
    </StoreContext.Provider>
  );
  let n = 0;
  const view = render(ui(n));
  return { store, announce, rerender: () => view.rerender(ui(++n)) };
}

const banner = () => screen.getByRole('group', { name: t('blocks.banner.label') });
const queryBanner = () => screen.queryByRole('group', { name: t('blocks.banner.label') });
const panel = () => screen.getByRole('region', { name: t('region.projectPanel') });
const entry = (name: string) => within(panel()).getAllByRole('listitem').find((li) => within(li).queryByRole('button', { name }))!;
const statusOf = (name: string) => within(entry(name)).getByText(/^Status: /).textContent;
const keyOf = (store: Store, index: number) => store.getSnapshot().blocks[index]!.key;
const blockText = (store: Store, index: number) => {
  const b = store.getSnapshot().blocks[index]!;
  return store.getState()!.source.slice(b.start, b.end);
};

describe('Error: invalid-only screen (VO-018, FR-010/AC8, FR-004/AC4)', () => {
  it('names the block, the line and the problem, offers "Fix in source" and no revert, and leaves other blocks editable', async () => {
    const { store } = setup(recordFor(corpus('only-screen-invalid.puml') + HOME));
    act(() => store.openBlock(keyOf(store, 0)));
    const b = banner();
    expect(within(b).getByText(t('blocks.banner.sourceProblem'))).toBeInTheDocument();
    expect(within(b).getByText(t('blocks.banner.problem', { block: 'Broken', line: 2, problem: t('diagnostic.syntax.unclosedContainer') }))).toBeInTheDocument();
    expect(within(b).getByRole('button', { name: 'Fix in source' })).toBeInTheDocument();
    expect(within(b).queryByRole('button', { name: 'Revert to last working version' })).toBeNull();
    expect(within(b).getByText(t('blocks.banner.neverValid'))).toBeInTheDocument();
    expect(statusOf('Broken')).toBe('Status: Error');
    expect(statusOf('Home')).toBe('Status: Editable');

    // "Fix in source" puts the cursor at the start of the problem's line in the block's source view.
    await userEvent.setup().click(within(b).getByRole('button', { name: 'Fix in source' }));
    const source = screen.getByRole('region', { name: t('region.source') });
    const view = EditorView.findFromDOM(source.querySelector('.cm-editor') as HTMLElement)!;
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
    expect(view.hasFocus || source.contains(document.activeElement)).toBe(true);

    // Opening the other screen shows no banner: it is editable.
    act(() => store.openBlock(keyOf(store, 1)));
    expect(queryBanner()).toBeNull();
  });
});

describe('Revert to last working version (VO-080, VO-109, FR-010/AC4, FR-006/AC15)', () => {
  it('after a reload shows the last working version read-only and reverts it in one undoable step', async () => {
    const { store, announce } = setup(recordFor(BROKEN + HOME, { lastWorking: [{ blockIndex: 0, text: GOOD }] }));
    const b = banner();
    expect(within(b).getByText(t('blocks.banner.lastWorking'))).toBeInTheDocument();
    const canvas = within(b).getByTestId('fake-canvas');
    expect(canvas).toHaveAttribute('data-readonly', 'true');
    expect(canvas.getAttribute('data-model')).toContain('Save');
    expect(within(b).queryByText(t('blocks.banner.neverValid'))).toBeNull();

    await userEvent.setup().click(within(b).getByRole('button', { name: 'Revert to last working version' }));
    expect(blockText(store, 0)).toBe(GOOD);
    expect(store.getState()!.lastWorking).toEqual([]);
    expect(store.getSnapshot().record!.lastWorking).toEqual([]);
    expect(statusOf('Login')).toBe('Status: Editable');
    expect(announce).toHaveBeenCalledWith('blocks.announce.reverted', undefined);
    expect(queryBanner()).toBeNull();
    expect(store.getSnapshot().undoName?.nameKey).toBe('blocks.history.revert');

    act(() => store.undo());
    expect(blockText(store, 0)).toBe(BROKEN);
    expect(store.getState()!.lastWorking).toEqual([{ blockIndex: 0, text: GOOD }]);
  });

  it('works before a reload, and again after the stored record is reopened', async () => {
    const user = userEvent.setup();
    const first = setup(recordFor(GOOD + HOME));
    act(() => first.store.replaceBlockText(keyOf(first.store, 0), BROKEN));
    act(() => first.store.seal());
    expect(statusOf('Login')).toBe('Status: Error');
    await user.click(within(banner()).getByRole('button', { name: 'Revert to last working version' }));
    expect(blockText(first.store, 0)).toBe(GOOD);

    act(() => first.store.replaceBlockText(keyOf(first.store, 0), BROKEN));
    const saved = first.store.getSnapshot().record!;
    expect(saved.lastWorking).toEqual([{ blockIndex: 0, text: GOOD }]);
    cleanups.forEach((c) => c());
    cleanups = [];
    document.body.innerHTML = '';

    const second = setup({ ...saved, id: `status-${++seq}` });
    await user.click(within(banner()).getByRole('button', { name: 'Revert to last working version' }));
    expect(blockText(second.store, 0)).toBe(GOOD);
    expect(second.store.getState()!.lastWorking).toEqual([]);
  });
});

describe('Cannot be rendered (VO-110, FR-010/AC9)', () => {
  it('shows the status with the renderer\'s message in the preview, and is not reported as a source problem', async () => {
    const MESSAGE = 'Syntax Error? (Assumed diagram type: sequence)';
    const failing: EngineFactory = (onMessage) => {
      queueMicrotask(() => onMessage({ type: 'ready' }));
      return {
        post(m) {
          if (m.type === 'render') queueMicrotask(() => onMessage({ type: 'error', id: m.id, message: MESSAGE }));
        },
        terminate() {},
      };
    };
    const queue = new RenderQueue({ createEngine: failing });
    cleanups.push(() => queue.dispose());
    const OTHER = '@startuml\nthis is not a diagram\n@enduml\n';
    const { store } = setup(recordFor(HOME + OTHER + corpus('preprocessor-define.puml')), queue);
    queue.start();

    await waitFor(() => expect(statusOf('Settings')).toBe('Status: Cannot be rendered'));
    for (const index of [1, 2]) {
      act(() => store.openBlock(keyOf(store, index)));
      await waitFor(() => expect(within(screen.getByRole('region', { name: t('region.preview') })).getByText(MESSAGE)).toBeInTheDocument());
      const b = banner();
      expect(within(b).getByText(t('blocks.banner.cannotBeRendered'))).toBeInTheDocument();
      expect(within(b).getByText(t('blocks.banner.notAnError'))).toBeInTheDocument();
      expect(within(b).queryByText(t('blocks.banner.sourceProblem'))).toBeNull();
      expect(within(b).queryByRole('button', { name: 'Fix in source' })).toBeNull();
    }
    expect(within(entry('@startuml (block 2)')).getByText(/^Status: /).textContent).toBe('Status: Cannot be rendered');
  });
});

describe('Older format and "Convert all" (VO-017, FR-010/AC7)', () => {
  const SOURCE = OLDER_A + SEQUENCE + OLDER_B;
  const convertAllButtons = () => within(screen.getByRole('region', { name: t('notice.region') })).queryAllByRole('button', { name: 'Convert all' });

  it('shows exactly one "Convert all" notice per import, which converts every block in one undo step', async () => {
    const { store, rerender } = setup(recordFor(SOURCE));
    expect(notices.list().filter((n) => n.kind === 'convertAll')).toHaveLength(1);
    expect(convertAllButtons()).toHaveLength(1);
    expect(screen.getByText(t('blocks.convertAll.notice', { count: 2 }))).toBeInTheDocument();
    rerender();
    expect(convertAllButtons()).toHaveLength(1);
    expect(statusOf('Sign-in')).toBe('Status: Older format');

    await userEvent.setup().click(convertAllButtons()[0]!);
    expect(store.getState()!.source).toBe(
      '@startsalt Sign-in\n{\n  Email | "     "\n  [Next]\n}\n@endsalt\n' + SEQUENCE + "@startsalt Settings\n' kept\n{+\n  [X] Remember me\n}\n@endsalt\n",
    );
    const screens = within(panel()).getByRole('group', { name: t('projectPanel.screens') });
    expect(within(screens).getAllByRole('listitem')).toHaveLength(2);
    expect(statusOf('Sign-in')).toBe('Status: Editable');
    expect(statusOf('Settings')).toBe('Status: Editable');
    expect(convertAllButtons()).toHaveLength(0);
    expect(store.getSnapshot().undoName?.nameKey).toBe('blocks.history.convertAll');

    act(() => store.undo());
    expect(store.getState()!.source).toBe(SOURCE);
    expect(statusOf('Sign-in')).toBe('Status: Older format');
    expect(statusOf('Settings')).toBe('Status: Older format');
    expect(store.getSnapshot().undoName).toBeNull();
  });

  it('shows no notice for a project already edited since import, or with no older-format blocks', () => {
    setup(recordFor(SOURCE, { revision: 3 }));
    expect(notices.list()).toHaveLength(0);
    cleanups.forEach((c) => c());
    cleanups = [];
    document.body.innerHTML = '';
    setup(recordFor(GOOD + SEQUENCE));
    expect(notices.list()).toHaveLength(0);
  });

  it('converts one block from its project-panel entry and from the banner, each undoable', async () => {
    const user = userEvent.setup();
    const { store } = setup(recordFor(SOURCE, { revision: 2 }));
    const a = entry('Sign-in');
    expect(within(entry('@startuml (block 2)')).queryByRole('button', { name: 'Convert to current format' })).toBeNull();
    await user.click(within(a).getByRole('button', { name: 'Convert to current format' }));
    expect(blockText(store, 0)).toBe('@startsalt Sign-in\n{\n  Email | "     "\n  [Next]\n}\n@endsalt\n');
    expect(blockText(store, 2)).toBe(OLDER_B);
    expect(store.getSnapshot().undoName?.nameKey).toBe('blocks.history.convert');

    act(() => store.openBlock(keyOf(store, 2)));
    const b = banner();
    expect(within(b).getByText(t('reason.olderFormat'))).toBeInTheDocument();
    await user.click(within(b).getByRole('button', { name: 'Convert to current format' }));
    expect(blockText(store, 2)).toBe("@startsalt Settings\n' kept\n{+\n  [X] Remember me\n}\n@endsalt\n");
    act(() => store.undo());
    expect(blockText(store, 2)).toBe(OLDER_B);
    expect(blockText(store, 0)).toContain('@startsalt Sign-in');
  });
});

describe('A plain reason for each status (VO-106 display, FR-010/AC1)', () => {
  const files = corpusFiles().filter((f) => f.name.startsWith('import/'));

  it.each(files.map((f) => [f.name, f] as const))('%s', (_name, file) => {
    const decoded = decode(file.bytes);
    if (!decoded.ok) return; // binary corpus files are skipped
    const { store } = setup(recordFor(decoded.text));
    for (const view of store.getSnapshot().blocks) {
      act(() => store.openBlock(view.key));
      const current = store.getSnapshot().blocks.find((b) => b.key === view.key)!;
      if (current.status === 'Editable') {
        expect(queryBanner(), `${file.name} block ${current.index}`).toBeNull();
        continue;
      }
      const text = banner().textContent ?? '';
      expect(text, `${file.name} block ${current.index}`).toContain(current.status);
      const problem = current.status === 'Error' ? current.classification.problem : null;
      const reason = problem ? t(problem.messageKey, problem.params) : current.reasonKey ? t(current.reasonKey, current.reasonParams) : null;
      expect(reason, `${file.name} block ${current.index} has a reason`).not.toBeNull();
      expect(text).toContain(reason!);
    }
    cleanups.forEach((c) => c());
    cleanups = [];
    document.body.innerHTML = '';
  });
});
