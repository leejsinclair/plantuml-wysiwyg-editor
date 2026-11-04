import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LockedPlaceholder } from '../../../src/ui/workspace/LockedPlaceholder.tsx';
import { t } from '../../../src/ui/messages/en.ts';

// Any catalogue key stands in for a status reason here; the reason texts belong to the block messages.
const REASON = 'diagnostic.syntax.unclosedKeyword';
const FORK = 'fork\n  :Send email;\nfork again\n  :Log;\nend fork';

describe('LockedPlaceholder (section 4.1, FR-010/AC2)', () => {
  it('is a labelled locked item naming the reason', () => {
    render(<LockedPlaceholder reasonKey={REASON} reasonParams={{ keyword: 'fork' }} excerpt={FORK} />);
    const item = screen.getByRole('group', { name: `${t('lockedPlaceholder.title')} ${t(REASON, { keyword: 'fork' })}` });
    expect(item).toHaveAttribute('aria-roledescription', t('lockedPlaceholder.roleDescription'));
    expect(within(item).getByText(t(REASON, { keyword: 'fork' }))).toBeVisible();
  });

  it('shows the source excerpt exactly as written, as text and not markup', () => {
    const excerpt = '{T#\n  + Größe | <b>Ä</b> | 名前\n}';
    render(<LockedPlaceholder reasonKey={REASON} excerpt={excerpt} />);
    const code = screen.getByTestId('locked-excerpt');
    expect(code.textContent).toBe(excerpt);
    expect(code.querySelector('b')).toBeNull();
    expect(code.closest('pre')).not.toBeNull();
  });

  it('describes the item with its excerpt and that it changes only in the source', () => {
    render(<LockedPlaceholder reasonKey={REASON} excerpt={FORK} />);
    const item = screen.getByRole('group');
    expect(item).toHaveAccessibleDescription(expect.stringContaining(t('lockedPlaceholder.editInSource')));
    expect(item).toHaveAccessibleDescription(expect.stringContaining(':Send email;'));
  });

  it('shortens a long excerpt, saying how many lines are not shown', () => {
    const long = Array.from({ length: 9 }, (_, i) => `line ${i + 1}`).join('\r\n');
    render(<LockedPlaceholder reasonKey={REASON} excerpt={long} maxLines={3} />);
    expect(screen.getByTestId('locked-excerpt').textContent).toBe('line 1\nline 2\nline 3');
    expect(screen.getByText(t('lockedPlaceholder.moreLines', { count: 6 }))).toBeVisible();
  });

  it('says nothing about hidden lines when the whole excerpt fits', () => {
    const short = 'fork\n  :A;\nfork again\nend fork';
    render(<LockedPlaceholder reasonKey={REASON} excerpt={short} />);
    expect(screen.queryByText(/more line/)).toBeNull();
    expect(screen.getByTestId('locked-excerpt').textContent).toBe(short);
  });

  it('is never a live form control', () => {
    render(<LockedPlaceholder reasonKey={REASON} excerpt={'"value   "\n[OK]\n[X] Remember'} />);
    for (const role of ['button', 'textbox', 'checkbox', 'link']) expect(screen.queryByRole(role)).toBeNull();
  });

  it('lets each canvas supply its own role, focus, selection and pointer handling', async () => {
    const onClick = vi.fn();
    render(
      <LockedPlaceholder
        reasonKey={REASON}
        excerpt={FORK}
        role="treeitem"
        aria-selected
        tabIndex={0}
        selected
        className="cell"
        data-path="0.2"
        onClick={onClick}
      />,
    );
    const item = screen.getByRole('treeitem', { selected: true });
    expect(item).toHaveAttribute('tabindex', '0');
    expect(item).toHaveAttribute('data-selected', 'true');
    expect(item).toHaveAttribute('data-path', '0.2');
    expect(item).toHaveClass('locked-placeholder', 'cell');
    await userEvent.click(within(item).getByTestId('locked-excerpt'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('gives each placeholder its own ids, so two on one canvas keep their own labels', () => {
    render(
      <>
        <LockedPlaceholder reasonKey={REASON} reasonParams={{ keyword: 'fork' }} excerpt="fork" />
        <LockedPlaceholder reasonKey={REASON} reasonParams={{ keyword: 'switch' }} excerpt="switch" />
      </>,
    );
    const [first, second] = screen.getAllByRole('group');
    expect(first).toHaveAccessibleName(expect.stringContaining('fork'));
    expect(second).toHaveAccessibleName(expect.stringContaining('switch'));
    expect(second).toHaveAccessibleDescription(expect.not.stringContaining('fork'));
  });
});
