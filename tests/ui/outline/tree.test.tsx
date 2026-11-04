// T035: the generic accessible tree used by the outlines and "Move to…" (contracts/ui.md §7, FR-009).
// VO-097 (tree part): the outline acts as an accessible tree with selection following focus.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tree, type TreeItemData } from '../../../src/ui/outline/Tree.tsx';

const ITEMS: readonly TreeItemData[] = [
  {
    id: 'form',
    label: 'Form',
    children: [
      { id: 'email', label: 'Text field Email' },
      {
        id: 'buttons',
        label: 'Button bar',
        children: [
          { id: 'ok', label: 'Button OK' },
          { id: 'cancel', label: 'Button Cancel' },
        ],
      },
    ],
  },
  { id: 'footer', label: 'Text Footer' },
];

function Harness(props: {
  initialSelected?: string | null;
  defaultExpanded?: readonly string[];
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(props.initialSelected ?? null);
  return (
    <Tree
      label="Outline"
      items={ITEMS}
      selectedId={selected}
      defaultExpanded={props.defaultExpanded ?? ['form']}
      onSelect={(id) => {
        setSelected(id);
        props.onSelect?.(id);
      }}
      onActivate={props.onActivate}
    />
  );
}

const item = (name: string) => screen.getByRole('treeitem', { name });

describe('Tree: ARIA tree structure', () => {
  it('is a labelled tree of treeitems with level, position and expansion state', () => {
    render(<Harness />);
    const tree = screen.getByRole('tree', { name: 'Outline' });
    const items = within(tree).getAllByRole('treeitem');
    expect(items.map((i) => i.getAttribute('aria-level'))).toEqual(['1', '2', '2', '1']);
    expect(item('Form')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Button bar')).toHaveAttribute('aria-expanded', 'false');
    expect(item('Text Footer')).not.toHaveAttribute('aria-expanded');
    expect(item('Text field Email')).toHaveAttribute('aria-setsize', '2');
    expect(item('Button bar')).toHaveAttribute('aria-posinset', '2');
    // Collapsed children are not shown.
    expect(screen.queryByRole('treeitem', { name: 'Button OK' })).toBeNull();
  });

  it('marks the selected item and makes exactly one item tabbable', () => {
    render(<Harness initialSelected="email" />);
    expect(item('Text field Email')).toHaveAttribute('aria-selected', 'true');
    expect(item('Form')).toHaveAttribute('aria-selected', 'false');
    const tabbable = screen.getAllByRole('treeitem').filter((i) => i.tabIndex === 0);
    expect(tabbable).toEqual([item('Text field Email')]);
  });

  it('makes the first item tabbable when nothing is selected', () => {
    render(<Harness />);
    expect(screen.getAllByRole('treeitem').filter((i) => i.tabIndex === 0)).toEqual([item('Form')]);
  });

  it('expands to reveal a selected item that is inside a collapsed parent', () => {
    render(<Harness initialSelected="ok" defaultExpanded={[]} />);
    expect(item('Button OK')).toHaveAttribute('aria-selected', 'true');
    expect(item('Form')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Button bar')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Tree: VO-097 keyboard, selection follows focus', () => {
  it('Tab enters the tree on the selected item', async () => {
    const user = userEvent.setup();
    render(<Harness initialSelected="footer" />);
    await user.tab();
    expect(item('Text Footer')).toHaveFocus();
  });

  it('Down and Up move focus through visible items and selection follows', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(item('Text field Email')).toHaveFocus();
    expect(item('Text field Email')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    // "Button bar" is collapsed, so its children are skipped.
    expect(item('Text Footer')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(item('Text Footer')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(item('Button bar')).toHaveFocus();
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(['email', 'buttons', 'footer', 'buttons']);
  });

  it('Right expands a collapsed item, then moves to its first child', async () => {
    const user = userEvent.setup();
    render(<Harness initialSelected="buttons" />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(item('Button bar')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Button bar')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(item('Button OK')).toHaveFocus();
    expect(item('Button OK')).toHaveAttribute('aria-selected', 'true');
    // Right on a leaf does nothing.
    await user.keyboard('{ArrowRight}');
    expect(item('Button OK')).toHaveFocus();
  });

  it('Left collapses an expanded item, then moves to its parent', async () => {
    const user = userEvent.setup();
    render(<Harness initialSelected="email" />);
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(item('Form')).toHaveFocus();
    expect(item('Form')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(item('Form')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('treeitem', { name: 'Text field Email' })).toBeNull();
    // Left on a collapsed top-level item does nothing.
    await user.keyboard('{ArrowLeft}');
    expect(item('Form')).toHaveFocus();
  });

  it('Home and End move to the first and last visible items', async () => {
    const user = userEvent.setup();
    render(<Harness initialSelected="email" />);
    await user.tab();
    await user.keyboard('{End}');
    expect(item('Text Footer')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(item('Form')).toHaveFocus();
    expect(item('Form')).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter activates the focused item', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<Harness initialSelected="footer" onActivate={onActivate} />);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledWith('footer');
  });

  it('ignores arrows with modifiers, leaving them to other bindings', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness initialSelected="form" onSelect={onSelect} />);
    await user.tab();
    await user.keyboard('{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}');
    expect(item('Form')).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicking an item selects and focuses it; clicking a parent does not toggle it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(item('Text field Email'));
    expect(item('Text field Email')).toHaveFocus();
    expect(item('Text field Email')).toHaveAttribute('aria-selected', 'true');
    await user.click(item('Form'));
    expect(item('Form')).toHaveAttribute('aria-expanded', 'true');
  });

  it('follows a selection changed from outside without stealing focus', () => {
    const { rerender } = render(
      <Tree label="Outline" items={ITEMS} selectedId="form" defaultExpanded={['form']} onSelect={() => {}} />,
    );
    act(() =>
      rerender(<Tree label="Outline" items={ITEMS} selectedId="cancel" defaultExpanded={['form']} onSelect={() => {}} />),
    );
    expect(item('Button Cancel')).toHaveAttribute('aria-selected', 'true');
    expect(item('Button Cancel').tabIndex).toBe(0);
    expect(item('Button Cancel')).not.toHaveFocus();
  });
});

describe('Tree: controlled expansion', () => {
  it('reports expansion changes and shows what the caller passes', async () => {
    const user = userEvent.setup();
    const onExpandedChange = vi.fn();
    render(
      <Tree
        label="Destinations"
        items={ITEMS}
        selectedId="form"
        expanded={new Set<string>()}
        onExpandedChange={onExpandedChange}
        onSelect={() => {}}
      />,
    );
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect([...(onExpandedChange.mock.calls[0]![0] as Set<string>)]).toEqual(['form']);
    // Controlled: nothing changes until the caller passes the new set.
    expect(item('Form')).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders a custom label while keeping the accessible name', () => {
    render(
      <Tree
        label="Outline"
        items={[{ id: 'a', label: 'Grid' }]}
        selectedId={null}
        onSelect={() => {}}
        renderLabel={(i) => <strong data-testid="custom">{i.label}</strong>}
      />,
    );
    expect(screen.getByTestId('custom')).toBeInTheDocument();
    expect(item('Grid')).toBeInTheDocument();
  });
});
