import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Announcer, createAnnouncer } from '../../../src/ui/announcer/Announcer.tsx';
import { Notices, createNotices } from '../../../src/ui/notices/Notices.tsx';
import { t } from '../../../src/ui/messages/en.ts';

describe('Announcer: one polite live region (FR-009/AC9)', () => {
  it('renders a single polite, atomic status region that is visually hidden', () => {
    const announcer = createAnnouncer();
    render(<Announcer announcer={announcer} />);
    const regions = screen.getAllByRole('status');
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveAttribute('aria-live', 'polite');
    expect(regions[0]).toHaveAttribute('aria-atomic', 'true');
    expect(regions[0]).toBeEmptyDOMElement();
  });

  it('announces a catalogue message with its parameters', () => {
    const announcer = createAnnouncer();
    render(<Announcer announcer={announcer} />);
    act(() => announcer.announce('toolbar.undoAction', { action: 'Insert button' }));
    expect(screen.getByRole('status').textContent?.trim()).toBe('Undo Insert button');
  });

  it('changes the region text when the same message is announced again, so it is read again', () => {
    const announcer = createAnnouncer();
    render(<Announcer announcer={announcer} />);
    act(() => announcer.announce('autosave.saved'));
    const first = screen.getByRole('status').textContent;
    act(() => announcer.announce('autosave.saved'));
    const second = screen.getByRole('status').textContent;
    expect(first?.trim()).toBe('All changes saved');
    expect(second?.trim()).toBe('All changes saved');
    expect(second).not.toBe(first);
  });

  it('passes diagram content through unchanged', () => {
    const announcer = createAnnouncer();
    render(<Announcer announcer={announcer} />);
    act(() => announcer.announce('toolbar.undoAction', { action: 'Zahlung prüfen — 支払い' }));
    expect(screen.getByRole('status').textContent?.trim()).toBe('Undo Zahlung prüfen — 支払い');
  });

  it('clears the message', () => {
    const announcer = createAnnouncer();
    render(<Announcer announcer={announcer} />);
    act(() => announcer.announce('autosave.saved'));
    act(() => announcer.clear());
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('Notices: non-blocking notices with actions (data-model §6.8)', () => {
  it('shows notices in a labelled region without taking focus', () => {
    const notices = createNotices();
    render(
      <>
        <button type="button">Elsewhere</button>
        <Notices notices={notices} />
      </>,
    );
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    act(() => void notices.show({ kind: 'unknownProject', messageKey: 'notice.unknownProject' }));
    const region = screen.getByRole('region', { name: t('notice.region') });
    expect(within(region).getByText(t('notice.unknownProject'))).toBeInTheDocument();
    expect(elsewhere).toHaveFocus();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('runs an action and then dismisses the notice', async () => {
    const notices = createNotices();
    const undo = vi.fn();
    render(<Notices notices={notices} />);
    act(() =>
      void notices.show({
        kind: 'deleted',
        messageKey: 'toolbar.undoAction',
        params: { action: 'Delete screen' },
        actions: [{ labelKey: 'notice.undo', run: undo }],
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: t('notice.undo') }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Undo Delete screen')).toBeNull();
  });

  it('keeps the notice when an action says so', async () => {
    const notices = createNotices();
    const backup = vi.fn();
    render(<Notices notices={notices} />);
    act(() =>
      void notices.show({
        kind: 'storageFailure',
        messageKey: 'notice.unknownProject',
        actions: [{ labelKey: 'toolbar.download', run: backup, keepOpen: true }],
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: t('toolbar.download') }));
    expect(backup).toHaveBeenCalled();
    expect(screen.getByText(t('notice.unknownProject'))).toBeInTheDocument();
  });

  it('dismisses a notice with its Dismiss button', async () => {
    const notices = createNotices();
    render(<Notices notices={notices} />);
    act(() => void notices.show({ kind: 'x', messageKey: 'notice.unknownProject' }));
    await userEvent.click(screen.getByRole('button', { name: t('notice.dismiss') }));
    expect(screen.queryByText(t('notice.unknownProject'))).toBeNull();
    expect(notices.list()).toEqual([]);
  });

  it('shows a oncePerSession notice only once in the session, even after dismissal', () => {
    const notices = createNotices();
    const first = notices.show({ kind: 'persistRefused', messageKey: 'notice.unknownProject', oncePerSession: 'persist' });
    expect(first).not.toBeNull();
    notices.dismiss(first!);
    expect(notices.show({ kind: 'persistRefused', messageKey: 'notice.unknownProject', oncePerSession: 'persist' })).toBeNull();
    expect(notices.list()).toEqual([]);
    expect(notices.show({ kind: 'other', messageKey: 'notice.unknownProject', oncePerSession: 'backup' })).not.toBeNull();
  });

  it('replaces a notice that has the same key instead of stacking it', () => {
    const notices = createNotices();
    notices.show({ key: 'storage', kind: 'storageFailure', messageKey: 'notice.unknownProject' });
    notices.show({ key: 'storage', kind: 'storageFailure', messageKey: 'autosave.saving' });
    expect(notices.list().map((n) => n.messageKey)).toEqual(['autosave.saving']);
    notices.show({ kind: 'a', messageKey: 'notice.unknownProject' });
    notices.show({ kind: 'a', messageKey: 'notice.unknownProject' });
    expect(notices.list()).toHaveLength(3);
  });

  it('announces each shown notice through the polite announcer', () => {
    const announce = vi.fn();
    const notices = createNotices({ announce });
    notices.show({ kind: 'x', messageKey: 'toolbar.undoAction', params: { action: 'Insert' } });
    expect(announce).toHaveBeenCalledWith('toolbar.undoAction', { action: 'Insert' });
    notices.show({ kind: 'x', messageKey: 'notice.unknownProject', oncePerSession: 'k' });
    notices.show({ kind: 'x', messageKey: 'notice.unknownProject', oncePerSession: 'k' });
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('marks prominent notices so they stand out', () => {
    const notices = createNotices();
    render(<Notices notices={notices} />);
    act(() => void notices.show({ kind: 'storageFailure', messageKey: 'notice.unknownProject', prominent: true }));
    expect(screen.getByText(t('notice.unknownProject')).closest('[data-prominent="true"]')).not.toBeNull();
  });
});
