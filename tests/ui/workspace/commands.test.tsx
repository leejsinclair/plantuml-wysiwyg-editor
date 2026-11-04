// T053: the structural command bar, the "Move to…" dialog and the breadcrumb (FR-009/AC2, AC14, FR-002/AC12,
// contracts/ui.md §7). Command labels are catalogue keys; these tests borrow existing keys so the strings are real.
import { act, fireEvent, render, screen, within } from '../render';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createSlots, type BlockEditor, type Command, type SlotContext } from '../../../src/ui/app/slots.ts';
import { CommandBar, collectCommands, commandForKey } from '../../../src/ui/workspace/CommandBar.tsx';
import { MoveToDialog, MoveToHost, createMoveToController, type DestinationNode } from '../../../src/ui/workspace/MoveToDialog.tsx';
import { Breadcrumb, breadcrumbParts } from '../../../src/ui/workspace/Breadcrumb.tsx';

const Nothing = () => null;

function editorWith(commands: readonly Command[]): BlockEditor {
  return {
    Canvas: Nothing, Outline: Nothing, Palette: Nothing, Properties: Nothing, commands,
    pathLabels: () => [], destinations: () => [], hasPath: () => true,
  };
}

const ctx: SlotContext = { projectId: 'p1', block: { key: 'b1', kind: 'screen', name: 'Login', readOnly: false }, selection: [0] };

function setup(extra: { platform?: 'windows' | 'mac' | 'linux'; context?: SlotContext } = {}) {
  const slots = createSlots();
  const runs: string[] = [];
  const run = (id: string) => (c: SlotContext) => { runs.push(`${id}:${c.block?.key ?? '-'}`); };
  slots.blockEditors.register('screen', editorWith([
    { id: 'move', labelKey: 'moveTo.title', shortcut: [{ key: 'm', mod: true, shift: true }], order: 20, run: run('move') },
    { id: 'parent', labelKey: 'toolbar.download', shortcut: 'cancel', order: 10, run: run('parent') },
    { id: 'hidden', labelKey: 'notice.dismiss', isVisible: () => false, run: run('hidden') },
    { id: 'disabled', labelKey: 'toolbar.import', isEnabled: () => false, order: 30, run: run('disabled') },
  ]));
  slots.commands.register({ id: 'open', labelKey: 'toolbar.undo', shortcut: 'openScreen', order: 15, run: run('open') });
  slots.commands.register({ id: 'redo', labelKey: 'toolbar.redo', shortcut: 'redo', order: 40, run: run('redo') });
  render(<CommandBar ctx={extra.context ?? ctx} slots={slots} platform={extra.platform ?? 'windows'} />);
  return { slots, runs };
}

describe('CommandBar (FR-009/AC14)', () => {
  it("shows every visible command from the open block's editor and the commands slot, in order", () => {
    setup();
    const bar = screen.getByRole('group', { name: 'Commands for the selection' });
    const names = within(bar).getAllByRole('button').map((b) => b.getAttribute('data-command'));
    expect(names).toEqual(['parent', 'open', 'move', 'disabled', 'redo']);
    expect(within(bar).queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('names each control by its label and shows its keyboard shortcut', () => {
    setup();
    const open = screen.getByRole('button', { name: 'Undo' });
    expect(open).toHaveTextContent('Ctrl+Enter');
    expect(open).toHaveAttribute('aria-keyshortcuts', 'Control+Enter');
    const move = screen.getByRole('button', { name: 'Move to…' });
    expect(move).toHaveTextContent('Ctrl+Shift+M');
    expect(screen.getByRole('button', { name: 'Download' })).toHaveTextContent('Escape');
    // Every chord of a binding is shown.
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(redo).toHaveTextContent('Ctrl+Y');
    expect(redo).toHaveTextContent('Ctrl+Shift+Z');
    expect(redo).toHaveAttribute('aria-keyshortcuts', 'Control+Y Control+Shift+Z');
  });

  it('shows shortcuts in the platform form', () => {
    setup({ platform: 'mac' });
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveTextContent('Cmd+Enter');
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('aria-keyshortcuts', 'Meta+Enter');
    expect(screen.getByRole('button', { name: 'Redo' })).not.toHaveTextContent('Cmd+Y');
  });

  it('runs a command with the context when its control is pressed; a disabled command cannot run', async () => {
    const { runs } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Move to…' }));
    await user.click(screen.getByRole('button', { name: 'Import .puml file' }));
    expect(screen.getByRole('button', { name: 'Import .puml file' })).toBeDisabled();
    expect(runs).toEqual(['move:b1']);
  });

  it('shows only slot commands when no block is open', () => {
    setup({ context: { projectId: 'p1', block: null, selection: null } });
    const ids = screen.getAllByRole('button').map((b) => b.getAttribute('data-command'));
    expect(ids).toEqual(['open', 'redo']);
  });

  it('updates when a command is registered later', () => {
    const { slots } = setup();
    act(() => { slots.commands.register({ id: 'late', labelKey: 'notice.undo', order: 1, run: () => {} }); });
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('data-command'))[0]).toBe('late');
  });
});

describe('commandForKey', () => {
  const slots = createSlots();
  const seen: string[] = [];
  slots.blockEditors.register('screen', editorWith([
    { id: 'move', labelKey: 'moveTo.title', shortcut: [{ key: 'm', mod: true, shift: true }], run: () => seen.push('move') },
    { id: 'off', labelKey: 'toolbar.import', shortcut: 'moveUp', isEnabled: () => false, run: () => seen.push('off') },
  ]));
  slots.commands.register({ id: 'open', labelKey: 'toolbar.undo', shortcut: 'openScreen', run: () => seen.push('open') });
  const commands = collectCommands(slots, ctx);
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
    key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
  });

  it('finds the visible, enabled command bound to a key event', () => {
    expect(commandForKey(key('Enter', { ctrlKey: true }), commands, ctx, 'windows')?.id).toBe('open');
    expect(commandForKey(key('M', { ctrlKey: true, shiftKey: true }), commands, ctx, 'windows')?.id).toBe('move');
    expect(commandForKey(key('M', { metaKey: true, shiftKey: true }), commands, ctx, 'mac')?.id).toBe('move');
  });

  it('ignores disabled commands and unbound keys', () => {
    expect(commandForKey(key('ArrowUp', { altKey: true, shiftKey: true }), commands, ctx, 'windows')).toBeNull();
    expect(commandForKey(key('Enter'), commands, ctx, 'windows')).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------- Move to…

type Dest = { container: string; at: string };
const NODES: readonly DestinationNode<Dest>[] = [
  {
    id: 'form', label: 'Form',
    children: [
      { id: 'form-cell', label: 'Empty cell, row 2 column 1', destination: { container: 'form', at: 'r2c1' } },
      { id: 'form-end', label: 'At the end', destination: { container: 'form', at: 'end' } },
    ],
  },
  {
    id: 'bar', label: 'Button bar',
    children: [{ id: 'bar-before', label: "Before 'OK'", destination: { container: 'bar', at: 'before 0' } }],
  },
];

describe('MoveToDialog (FR-009/AC2, contracts/ui.md §7)', () => {
  it('is a modal dialog titled "Move to…" with a tree of the valid destinations', () => {
    render(<MoveToDialog nodes={NODES} onMove={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Move to…' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const tree = within(dialog).getByRole('tree', { name: 'Valid destinations' });
    expect(within(tree).getByRole('treeitem', { name: 'Form' })).toBeInTheDocument();
    expect(within(tree).getByRole('treeitem', { name: 'Empty cell, row 2 column 1' })).toBeInTheDocument();
    expect(within(tree).getByRole('treeitem', { name: 'Button bar' })).toBeInTheDocument();
  });

  it('focuses the tree on open; a container alone cannot be chosen', () => {
    render(<MoveToDialog nodes={NODES} onMove={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('treeitem', { name: 'Form' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Move here' })).toBeDisabled();
  });

  it('moves to the chosen destination with the button or Enter', async () => {
    const onMove = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MoveToDialog nodes={NODES} onMove={onMove} onClose={onClose} />);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('treeitem', { name: 'At the end' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onMove).toHaveBeenLastCalledWith({ container: 'form', at: 'end' });
    await user.click(screen.getByRole('treeitem', { name: 'Empty cell, row 2 column 1' }));
    await user.click(screen.getByRole('button', { name: 'Move here' }));
    expect(onMove).toHaveBeenLastCalledWith({ container: 'form', at: 'r2c1' });
    // Enter on a container does not move.
    onMove.mockClear();
    await user.click(screen.getByRole('treeitem', { name: 'Form' }));
    await user.keyboard('{Enter}');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('closes on Esc and on Cancel without moving (FR-009/AC12)', async () => {
    const onMove = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MoveToDialog nodes={NODES} onMove={onMove} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<><button>Outside</button><MoveToDialog nodes={NODES} onMove={() => {}} onClose={() => {}} /></>);
    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await user.tab({ shift: true });
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    }
  });

  it('says so when there is no valid destination', () => {
    render(<MoveToDialog nodes={[]} onMove={() => {}} onClose={() => {}} />);
    expect(screen.getByText('There is no valid destination for this element.')).toBeInTheDocument();
    expect(screen.queryByRole('tree')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});

describe('MoveToHost: commands open the dialog through a controller', () => {
  it('opens on request, moves, closes and returns focus to where it was', async () => {
    const controller = createMoveToController();
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<><button>Move to…</button><MoveToHost controller={controller} /></>);
    const opener = screen.getByRole('button', { name: 'Move to…' });
    opener.focus();
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => controller.open({ nodes: NODES, onMove }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('treeitem', { name: "Before 'OK'" }));
    await user.click(screen.getByRole('button', { name: 'Move here' }));
    expect(onMove).toHaveBeenCalledWith({ container: 'bar', at: 'before 0' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});

// ----------------------------------------------------------------------------------------- Breadcrumb

describe('Breadcrumb (FR-002/AC12, contracts/ui.md §7)', () => {
  it('maps each label to the path prefix it names, aligned from the selected element', () => {
    expect(breadcrumbParts(['Screen', 'Form', 'Row 2', 'Button'], [0, 1, 3])).toEqual([
      { label: 'Screen', path: [] },
      { label: 'Form', path: [0] },
      { label: 'Row 2', path: [0, 1] },
      { label: 'Button', path: [0, 1, 3] },
    ]);
    // An editor may name fewer levels than the path has.
    expect(breadcrumbParts(['Screen', 'Button'], [0, 1, 3])).toEqual([
      { label: 'Screen', path: [] },
      { label: 'Button', path: [0, 1, 3] },
    ]);
  });

  it('is a navigation landmark with parts separated by " › ", each selectable', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Breadcrumb labels={['Screen', 'Form', 'Row 2', 'Button']} path={[0, 1, 3]} onSelect={onSelect} />);
    const nav = screen.getByRole('navigation', { name: 'Selection path' });
    expect(nav.textContent).toBe('Screen › Form › Row 2 › Button');
    const parts = within(nav).getAllByRole('button');
    expect(parts.map((p) => p.textContent)).toEqual(['Screen', 'Form', 'Row 2', 'Button']);
    expect(parts[3]).toHaveAttribute('aria-current', 'location');
    await user.click(parts[1]!);
    expect(onSelect).toHaveBeenLastCalledWith([0]);
    fireEvent.click(parts[0]!);
    expect(onSelect).toHaveBeenLastCalledWith([]);
  });

  it('shows only the block with nothing current when nothing is selected', () => {
    render(<Breadcrumb labels={['Screen']} path={null} onSelect={() => {}} />);
    const part = screen.getByRole('button', { name: 'Screen' });
    expect(part).not.toHaveAttribute('aria-current');
  });
});
