import { describe, expect, it, vi } from 'vitest';
import { createSlots, slots, type BlockEditor, type Command } from '../../../src/ui/app/slots.ts';

const Nothing = () => null;

const editor = (labels: string[]): BlockEditor<{ title: string }, string> => ({
  Canvas: Nothing,
  Outline: Nothing,
  Palette: Nothing,
  Properties: Nothing,
  commands: [{ id: 'select-parent', labelKey: 'command.selectParent', shortcut: 'cancel', run: () => {} }],
  pathLabels: (model, path) => [model.title, ...labels.slice(0, path.length)],
  destinations: () => ['at the end'],
  hasPath: () => true,
});

const command = (id: string, order?: number): Command => ({ id, labelKey: `command.${id}`, order, run: () => {} });

describe('slot registry', () => {
  it('exposes every slot the stories plug into', () => {
    expect(Object.keys(slots).sort()).toEqual(
      ['banners', 'blockEditors', 'commands', 'library', 'previewLink', 'projectPanel', 'propertySections', 'sourceEdit', 'toolbar'].sort(),
    );
  });

  it('keys block editors by block kind, one owner each', () => {
    const s = createSlots();
    expect(s.blockEditors.get('screen')).toBeNull();
    const off = s.blockEditors.register('screen', editor(['Form', 'Row 2']));
    const screen = s.blockEditors.get('screen');
    expect(screen?.pathLabels({ title: 'Screen' }, [0, 1])).toEqual(['Screen', 'Form', 'Row 2']);
    expect(s.blockEditors.get('flow')).toBeNull();
    expect(() => s.blockEditors.register('screen', editor([]))).toThrow(/screen/);
    off();
    expect(s.blockEditors.get('screen')).toBeNull();
  });

  it('lists contributions by order, then registration, and refuses duplicate ids', () => {
    const s = createSlots();
    s.commands.register(command('b'));
    s.commands.register(command('a', 10));
    s.commands.register(command('c'));
    s.commands.register(command('first', -1));
    expect(s.commands.list().map((c) => c.id)).toEqual(['first', 'b', 'c', 'a']);
    expect(() => s.commands.register(command('b'))).toThrow(/b/);
  });

  it('keeps list snapshots stable until something changes', () => {
    const s = createSlots();
    s.toolbar.register({ id: 'download', Component: Nothing });
    const first = s.toolbar.list();
    expect(s.toolbar.list()).toBe(first);
    const off = s.toolbar.register({ id: 'export', Component: Nothing });
    expect(s.toolbar.list()).not.toBe(first);
    off();
    expect(s.toolbar.list().map((i) => i.id)).toEqual(['download']);
  });

  it('notifies subscribers on register and unregister', () => {
    const s = createSlots();
    const listener = vi.fn();
    const stop = s.banners.subscribe(listener);
    const off = s.banners.register({ id: 'status', Component: Nothing });
    off();
    off(); // unregistering twice is harmless
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    s.banners.register({ id: 'status', Component: Nothing });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('holds a single source-edit controller and preview-link handler', () => {
    const s = createSlots();
    expect(s.sourceEdit.get()).toBeNull();
    const controller = { begin: vi.fn(), change: vi.fn(), end: vi.fn() };
    const off = s.sourceEdit.set(controller);
    expect(s.sourceEdit.get()).toBe(controller);
    expect(() => s.sourceEdit.set({ begin() {}, change() {}, end() {} })).toThrow();
    off();
    expect(s.sourceEdit.get()).toBeNull();

    const handler = vi.fn();
    s.previewLink.set(handler);
    s.previewLink.get()?.('Login', { projectId: 'p', block: null, selection: null });
    expect(handler).toHaveBeenCalledWith('Login', { projectId: 'p', block: null, selection: null });
  });

  it('filters property sections and project-panel entries by their own predicates', () => {
    const s = createSlots();
    s.propertySections.register({ id: 'name', appliesTo: (ctx) => ctx.selection === null, Component: Nothing });
    s.propertySections.register({ id: 'link', appliesTo: (ctx) => ctx.block?.kind === 'flow', Component: Nothing });
    const ctx = { projectId: 'p', block: { key: 'b1', kind: 'flow' as const, name: 'Screen-flow', readOnly: false }, selection: [0] };
    expect(s.propertySections.list().filter((p) => p.appliesTo(ctx)).map((p) => p.id)).toEqual(['link']);

    s.projectPanel.register({ id: 'add-flow', placement: 'header', Component: Nothing });
    s.projectPanel.register({ id: 'convert', placement: 'block', Component: Nothing });
    expect(s.projectPanel.list().filter((p) => p.placement === 'block').map((p) => p.id)).toEqual(['convert']);
  });
});
