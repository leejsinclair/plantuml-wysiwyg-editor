// T049: the workspace layout (FR-016/AC2–AC4, FR-015/AC3–AC5, FR-009/AC15, contracts/ui.md §3).
// VO-101 (region cycle), VO-129 (regions switch with the open block), VO-132 (regions present, panel collapse remembered).
import { act, fireEvent, render, screen, waitFor, within } from '../render';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSlots, type BlockEditor, type BlockEditorProps, type Slots } from '../../../src/ui/app/slots.ts';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import type { ProjectRecord, Settings } from '../../../src/services/storage/db.ts';
import { REGIONS, Workspace, type SettingsStore } from '../../../src/ui/workspace/Workspace.tsx';

const SCREEN_A = '@startsalt Login\n{\n  [OK]\n}\n@endsalt\n';
const FLOW = '@startuml Screen-flow\nstart\n:Sign in;\nstop\n@enduml\n';
const OTHER = '@startuml\nAlice -> Bob : hello\n@enduml\n';
const SCREEN_B = '@startsalt Home\n{\n  [Go]\n}\n@endsalt\n';

const record = (over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: 'p1', name: 'Project', source: SCREEN_A + FLOW + OTHER + SCREEN_B, flowIndex: 1, lastWorking: [],
  createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
  downloadedAt: null, downloadedRevision: null, ...over,
});

function fakeEditor(name: string): BlockEditor {
  const part = (role: string) => function Part({ blockKey, selection, readOnly }: BlockEditorProps<unknown>) {
    return <div data-testid={`${name}-${role}`} data-block={blockKey} data-readonly={String(readOnly)} data-selection={selection?.join('.') ?? ''} />;
  };
  return {
    Canvas: part('canvas'), Outline: part('outline'), Palette: part('palette'), Properties: part('properties'),
    commands: [{ id: `${name}-cmd`, labelKey: 'moveTo.title', shortcut: 'openScreen', run: () => {} }],
    pathLabels: (_m, path) => [name, ...path.map((i) => `Item ${i}`)],
    destinations: () => [],
    hasPath: () => true,
  };
}

function memorySettings(initial: Settings = { panels: { outline: { collapsed: false }, source: { collapsed: false }, preview: { collapsed: false } } }): SettingsStore & { puts: Settings[] } {
  let value = structuredClone(initial);
  const puts: Settings[] = [];
  return {
    puts,
    initial: structuredClone(value),
    get: async () => structuredClone(value),
    put: async (s) => { value = structuredClone(s); puts.push(structuredClone(s)); },
  };
}

let stores: Store[] = [];
afterEach(() => {
  stores.forEach((s) => s.dispose());
  stores = [];
});

function setup(opts: { settings?: SettingsStore; withEditors?: boolean; slots?: Slots } = {}) {
  const slots = opts.slots ?? createSlots();
  if (opts.withEditors !== false && !slots.blockEditors.get('screen')) {
    slots.blockEditors.register('screen', fakeEditor('Screen'));
    slots.blockEditors.register('flow', fakeEditor('Flow'));
  }
  const store = createStore({ write: async () => {}, slots, announce: vi.fn() });
  stores.push(store);
  store.load(record());
  const settings = opts.settings ?? memorySettings();
  const view = render(
    <StoreContext.Provider value={store}>
      <Workspace
        slots={slots}
        platform="windows"
        settings={settings}
        toolbar={<button type="button">tb</button>}
        projectPanel={<button type="button">pp</button>}
        properties={<button type="button">props</button>}
        source={<textarea aria-label="src" />}
        preview={<div>pv</div>}
      />
    </StoreContext.Provider>,
  );
  const keys = store.getSnapshot().blocks.map((b) => b.key);
  return { store, slots, settings, keys, view };
}

const regionNames = ['Project panel', 'Palette', 'Canvas', 'Outline', 'Properties', 'Source', 'Preview'];
const nextRegion = (shift = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'F6', ctrlKey: true, shiftKey: shift });
const regionOf = (el: Element | null) => el?.closest('[data-region]')?.getAttribute('aria-label') ?? null;

describe('Workspace: regions and default arrangement (FR-016/AC1, AC4, VO-132)', () => {
  it('has the seven named landmark regions in region-focus order', () => {
    setup();
    expect(REGIONS).toHaveLength(7);
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(regionNames);
  });

  it('places the project panel, palette and outline on the left, the canvas in the centre, properties on the right, and source and preview in a shared pane', () => {
    setup();
    const area = (name: string) => screen.getByRole('region', { name }).closest('[data-area]')?.getAttribute('data-area');
    expect(['Project panel', 'Palette', 'Outline'].map(area)).toEqual(['left', 'left', 'left']);
    expect(area('Canvas')).toBe('centre');
    expect(area('Properties')).toBe('right');
    expect(['Source', 'Preview'].map(area)).toEqual(['shared', 'shared']);
  });

  it('places the supplied content in its region', () => {
    setup();
    expect(within(screen.getByRole('region', { name: 'Project panel' })).getByRole('button', { name: 'pp' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Properties' })).getByRole('button', { name: 'props' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Source' })).getByRole('textbox', { name: 'src' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Preview' })).getByText('pv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tb' })).toBeInTheDocument();
  });
});

describe('Workspace: default collapsed panels (FR-012)', () => {
  it('starts the outline, source and preview collapsed when nothing is stored', () => {
    setup({ settings: { get: async () => ({ panels: {} }), put: async () => {} } });
    for (const name of ['Outline', 'Source', 'Preview']) {
      expect(within(screen.getByRole('region', { name })).getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
    expect(within(screen.getByRole('region', { name: 'Properties' })).getByRole('button', { name: 'Properties' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Workspace: panel collapse remembered in settings (FR-015/AC5, FR-016/AC4, VO-132)', () => {
  it('collapses a panel, keeps its region, and stores the choice', async () => {
    const settings = memorySettings();
    setup({ settings });
    const user = userEvent.setup();
    const toggle = within(screen.getByRole('region', { name: 'Palette' })).getByRole('button', { name: 'Palette' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('Screen-palette')).toBeNull();
    expect(screen.getByRole('region', { name: 'Palette' })).toBeInTheDocument();
    await waitFor(() => expect(settings.puts.at(-1)?.panels).toMatchObject({ palette: { collapsed: true } }));
    await user.click(within(screen.getByRole('region', { name: 'Preview' })).getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(settings.puts.at(-1)?.panels).toMatchObject({ palette: { collapsed: true }, preview: { collapsed: true } }));
  });

  it('restores collapsed panels from settings', async () => {
    setup({ settings: memorySettings({ panels: { outline: { collapsed: true }, 'project panel': { collapsed: true } } }) });
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Outline' })).getByRole('button', { name: 'Outline' })).toHaveAttribute('aria-expanded', 'false'));
    expect(within(screen.getByRole('region', { name: 'Project panel' })).getByRole('button', { name: 'Project panel' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(screen.getByRole('region', { name: 'Palette' })).getByRole('button', { name: 'Palette' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: 'pp' })).toBeNull();
  });

  it('has no collapse control on the canvas', () => {
    setup();
    expect(within(screen.getByRole('region', { name: 'Canvas' })).queryByRole('button', { name: 'Canvas' })).toBeNull();
  });
});

describe('Workspace: region-focus shortcut (FR-016/AC3, FR-009/AC15, VO-101)', () => {
  it('cycles forward through every region in order and wraps', () => {
    setup();
    const visited: (string | null)[] = [];
    for (let i = 0; i < 8; i++) {
      nextRegion();
      visited.push(regionOf(document.activeElement));
    }
    expect(visited).toEqual([...regionNames, 'Project panel']);
  });

  it('cycles backward with Shift', () => {
    setup();
    nextRegion();
    nextRegion(true);
    expect(regionOf(document.activeElement)).toBe('Preview');
    nextRegion(true);
    expect(regionOf(document.activeElement)).toBe('Source');
  });

  it('leaves a region from a focused control inside it, and returns to that control', async () => {
    setup();
    const user = userEvent.setup();
    const src = screen.getByRole('textbox', { name: 'src' });
    await user.click(src);
    nextRegion();
    expect(regionOf(document.activeElement)).toBe('Preview');
    nextRegion(true);
    expect(src).toHaveFocus();
  });

  it('reaches a collapsed region', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(within(screen.getByRole('region', { name: 'Outline' })).getByRole('button', { name: 'Outline' }));
    nextRegion();
    expect(regionOf(document.activeElement)).toBe('Properties');
    nextRegion(true);
    nextRegion(true);
    expect(regionOf(document.activeElement)).toBe('Canvas');
    nextRegion();
    expect(regionOf(document.activeElement)).toBe('Outline');
  });

  it('ignores other keys', () => {
    setup();
    fireEvent.keyDown(document.body, { key: 'F6' });
    expect(document.activeElement).toBe(document.body);
  });
});

describe('Workspace: the canvas region and contextual regions (FR-015/AC3, AC4, FR-016/AC2, VO-129)', () => {
  it('dispatches the canvas, palette and outline to the open block kind', () => {
    const { store, keys } = setup();
    expect(screen.getByTestId('Screen-canvas')).toHaveAttribute('data-block', keys[0]);
    expect(screen.getByTestId('Screen-palette')).toBeInTheDocument();
    expect(screen.getByTestId('Screen-outline')).toBeInTheDocument();
    act(() => store.openBlock(keys[1]!));
    expect(screen.getByTestId('Flow-canvas')).toHaveAttribute('data-block', keys[1]);
    expect(screen.getByTestId('Flow-palette')).toBeInTheDocument();
    expect(screen.queryByTestId('Screen-canvas')).toBeNull();
    act(() => store.openBlock(keys[3]!));
    expect(screen.getByTestId('Screen-canvas')).toHaveAttribute('data-block', keys[3]);
  });

  it('shows a source-only message for other content, with no visual editor', () => {
    const { store, keys } = setup();
    act(() => store.openBlock(keys[2]!));
    const canvas = screen.getByRole('region', { name: 'Canvas' });
    expect(within(canvas).getByText('This content can only be edited in the source view.')).toBeInTheDocument();
    expect(screen.queryByTestId('Screen-canvas')).toBeNull();
    expect(screen.queryByTestId('Screen-palette')).toBeNull();
  });

  it('shows the source-only message when no editor is registered for the kind', () => {
    setup({ withEditors: false });
    expect(within(screen.getByRole('region', { name: 'Canvas' })).getByText('This content can only be edited in the source view.')).toBeInTheDocument();
  });

  it('passes the selection in the open block to the editor', () => {
    const { store } = setup();
    act(() => store.select([0, 2]));
    expect(screen.getByTestId('Screen-canvas')).toHaveAttribute('data-selection', '0.2');
  });

  it("is read-only during a source edit of the open block only (FR-004/AC8)", () => {
    const { store, keys } = setup();
    expect(screen.getByTestId('Screen-canvas')).toHaveAttribute('data-readonly', 'false');
    act(() => store.beginSourceEdit(keys[0]!));
    expect(screen.getByTestId('Screen-canvas')).toHaveAttribute('data-readonly', 'true');
    expect(screen.getByTestId('Screen-palette')).toHaveAttribute('data-readonly', 'true');
    expect(within(screen.getByRole('region', { name: 'Canvas' })).getByText(/Read-only while you edit the source/)).toBeInTheDocument();
    act(() => store.openBlock(keys[3]!));
    expect(screen.getByTestId('Screen-canvas')).toHaveAttribute('data-readonly', 'false');
    act(() => store.openBlock(keys[0]!));
    act(() => store.endSourceEdit());
    expect(screen.getByTestId('Screen-canvas')).toHaveAttribute('data-readonly', 'false');
    expect(screen.queryByText(/Read-only while you edit the source/)).toBeNull();
  });

  it('shows banners at the top of the canvas region with the context', () => {
    const slots = createSlots();
    slots.banners.register({ id: 'status', Component: ({ ctx }) => <p>banner {ctx.block?.name ?? 'none'}</p> });
    setup({ slots });
    expect(within(screen.getByRole('region', { name: 'Canvas' })).getByText('banner Login')).toBeInTheDocument();
  });

  it('shows the breadcrumb and command bar for the open block; a breadcrumb part selects', async () => {
    const { store } = setup();
    const user = userEvent.setup();
    act(() => store.select([1, 4]));
    const canvas = screen.getByRole('region', { name: 'Canvas' });
    const nav = within(canvas).getByRole('navigation', { name: 'Selection path' });
    expect(nav.textContent).toBe('Screen › Item 1 › Item 4');
    expect(within(canvas).getByRole('group', { name: 'Commands for the selection' })).toBeInTheDocument();
    expect(within(canvas).getByRole('button', { name: 'Move to…' })).toHaveTextContent('Ctrl+Enter');
    await user.click(within(nav).getByRole('button', { name: 'Item 1' }));
    expect(store.getSnapshot().selection?.path).toEqual([1]);
  });
});

describe('Workspace with no props (as main.tsx renders it)', () => {
  it('places the toolbar, project panel, properties panel, source view and preview, reading the session from the store', async () => {
    const store = createStore({ write: async () => {}, announce: vi.fn() });
    stores.push(store);
    store.load(record());
    render(
      <StoreContext.Provider value={store}>
        <Workspace settings={memorySettings()} />
      </StoreContext.Provider>,
    );
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(regionNames);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Project panel' })).getAllByText('Login').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('region', { name: 'Properties' })).getByRole('heading', { name: 'Properties of Login' })).toBeInTheDocument();
    const source = screen.getByRole('region', { name: 'Source' });
    await waitFor(() => expect(source.textContent).toContain('@startsalt Login'));
    expect(within(screen.getByRole('region', { name: 'Preview' })).getByText(/Read-only/)).toBeInTheDocument();
    // Esc in the source view goes back to the canvas (FR-009/AC15).
    const editor = source.querySelector<HTMLElement>('.cm-content')!;
    editor.focus();
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(regionOf(document.activeElement)).toBe('Canvas');
  });
});
