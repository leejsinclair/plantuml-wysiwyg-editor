// T039: the preview pane (FR-005/AC1–AC6, FR-017/AC4, contracts/ui.md §9).
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { slots, type SlotContext } from '../../../src/ui/app/slots.ts';
import { t } from '../../../src/ui/messages/en.ts';
import preview from '../../../src/ui/messages/en/preview.ts';
import { Preview, type PreviewResult } from '../../../src/ui/preview/Preview.tsx';

const CTX: SlotContext = {
  projectId: 'p1',
  block: { key: 'b1', kind: 'flow', name: 'Screen-flow', readOnly: false },
  selection: null,
};

const TEXT_V1 = '@startuml Screen-flow\nstart\n:[[#Sign-in Sign in]];\nstop\n@enduml\n';
const TEXT_V2 = '@startuml Screen-flow\nstart\n:[[#Sign-in Sign in]];\n:Home;\nstop\n@enduml\n';

const SVG = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50">${body}</svg>`;

const OK_V1: PreviewResult = {
  text: TEXT_V1,
  outcome: 'ok',
  svg: SVG('<a href="#Sign-in" xlink:href="#Sign-in"><text x="1" y="10">Sign in</text></a><text x="1" y="30">Start</text>'),
};

const FAILED_V2: PreviewResult = { text: TEXT_V2, outcome: 'failed', message: 'Syntax Error? (line 4)' };

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
});

const pane = () => screen.getByRole('group', { name: new RegExp(t('preview.label')) });

describe('Preview: labelled read-only', () => {
  it('is a group labelled as the read-only rendered output', () => {
    render(<Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V1} latest={OK_V1} lastOk={OK_V1} />);
    expect(pane()).toHaveAccessibleName(`${t('preview.label')} ${t('preview.readOnly')}`);
  });

  it('keeps every string in its own catalogue part', () => {
    for (const key of Object.keys(preview)) expect(key.startsWith('preview.'), key).toBe(true);
  });
});

describe('Preview: FR-005/AC1 sanitised inline SVG', () => {
  it('shows the rendered SVG inline when the current text rendered', () => {
    render(<Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V1} latest={OK_V1} lastOk={OK_V1} />);
    const figure = within(pane()).getByRole('figure', { name: t('preview.diagram', { block: 'Screen-flow' }) });
    expect(figure.querySelector('svg')).not.toBeNull();
    expect(figure).toHaveTextContent('Sign in');
    expect(screen.queryByText(t('renderStatus.notYetChecked'))).toBeNull();
    expect(screen.queryByText(t('preview.outOfDate'))).toBeNull();
  });

  it('removes scripts, handlers and external references before display (VO-071)', () => {
    const hostile: PreviewResult = {
      text: TEXT_V1,
      outcome: 'ok',
      svg: SVG(
        '<script>window.__pwned = true</script><text onclick="window.__pwned=true" x="1" y="1">Hi</text>' +
          '<a href="https://example.com/x"><text>Out</text></a><image href="https://example.com/i.png"/>',
      ),
    };
    const { container } = render(
      <Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V1} latest={hostile} lastOk={hostile} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
    expect(container.innerHTML).not.toContain('example.com');
  });
});

describe('Preview: "Not yet checked" and out of date (FR-005/AC6)', () => {
  it('says "Not yet checked" when nothing has rendered yet', () => {
    render(<Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V1} latest={null} lastOk={null} />);
    expect(within(pane()).getByText(t('renderStatus.notYetChecked'))).toBeInTheDocument();
    expect(within(pane()).getByText(t('preview.nothingRendered'))).toBeInTheDocument();
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('keeps the last successful render, marked out of date, while newer text is not yet rendered', () => {
    render(<Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V2} latest={OK_V1} lastOk={OK_V1} />);
    expect(within(pane()).getByText(t('renderStatus.notYetChecked'))).toBeInTheDocument();
    expect(within(pane()).getByText(t('preview.outOfDate'))).toBeInTheDocument();
    const figure = screen.getByRole('figure');
    expect(figure).toHaveTextContent('Sign in');
    expect(figure).toHaveAttribute('data-out-of-date', 'true');
  });

  it('treats a timed-out render as "Not yet checked" and keeps the last render out of date', () => {
    const timedOut: PreviewResult = { text: TEXT_V2, outcome: 'timedOut' };
    render(<Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V2} latest={timedOut} lastOk={OK_V1} />);
    expect(within(pane()).getByText(t('renderStatus.notYetChecked'))).toBeInTheDocument();
    expect(within(pane()).getByText(t('preview.outOfDate'))).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: t('preview.renderingProblem') })).toBeNull();
  });

  it('labels a render of a block the editor could not check', () => {
    render(
      <Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V1} latest={OK_V1} lastOk={OK_V1} notCheckedByEditor />,
    );
    expect(within(pane()).getByText(t('preview.notCheckedByEditor'))).toBeInTheDocument();
  });
});

describe('Preview: rendering problems (FR-005/AC3–AC5)', () => {
  it('shows the renderer message, the block and an explanation in its own area, keeping the last render', () => {
    render(<Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V2} latest={FAILED_V2} lastOk={OK_V1} />);
    const problem = screen.getByRole('region', { name: t('preview.renderingProblem') });
    expect(problem).toHaveTextContent('Syntax Error? (line 4)');
    expect(problem).toHaveTextContent(t('preview.renderingProblemExplanation', { block: 'Screen-flow' }));
    // Never labelled as a source problem.
    expect(problem).not.toHaveTextContent(t('diagnostic.sourceProblem'));
    // The last render stays, out of date, outside the problem area.
    const figure = screen.getByRole('figure');
    expect(problem).not.toContainElement(figure);
    expect(figure).toHaveAttribute('data-out-of-date', 'true');
    expect(within(pane()).getByText(t('preview.outOfDate'))).toBeInTheDocument();
  });

  it('passes the renderer message through unchanged, as text', () => {
    const failed: PreviewResult = { text: TEXT_V1, outcome: 'failed', message: '<b>Zahlung</b> — 支払い' };
    const { container } = render(
      <Preview ctx={CTX} blockLabel="Écran" text={TEXT_V1} latest={failed} lastOk={null} />,
    );
    expect(screen.getByRole('region', { name: t('preview.renderingProblem') })).toHaveTextContent(
      '<b>Zahlung</b> — 支払い',
    );
    expect(container.querySelector('b')).toBeNull();
  });

  it('clears the problem when the latest render succeeds', () => {
    const okV2: PreviewResult = { text: TEXT_V2, outcome: 'ok', svg: SVG('<text>Home</text>') };
    render(<Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V2} latest={okV2} lastOk={okV2} />);
    expect(screen.queryByRole('region', { name: t('preview.renderingProblem') })).toBeNull();
    expect(screen.getByRole('figure')).toHaveAttribute('data-out-of-date', 'false');
  });
});

describe('Preview: link clicks go to the previewLink slot', () => {
  it('passes the link target to the registered handler and never navigates', async () => {
    const handler = vi.fn();
    unregister = slots.previewLink.set(handler);
    const user = userEvent.setup();
    const before = window.location.hash;
    render(<Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V1} latest={OK_V1} lastOk={OK_V1} />);
    await user.click(screen.getByText('Sign in'));
    expect(handler).toHaveBeenCalledWith('Sign-in', CTX);
    expect(window.location.hash).toBe(before);
  });

  it('decodes a percent-encoded target', () => {
    const handler = vi.fn();
    unregister = slots.previewLink.set(handler);
    const encoded: PreviewResult = {
      text: TEXT_V1,
      outcome: 'ok',
      svg: SVG('<a href="#%C3%89cran"><text>Go</text></a>'),
    };
    render(<Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V1} latest={encoded} lastOk={encoded} />);
    fireEvent.click(screen.getByText('Go'));
    expect(handler).toHaveBeenCalledWith('Écran', CTX);
  });

  it('ignores clicks outside links, and link clicks when no handler is registered', () => {
    const { container } = render(
      <Preview ctx={CTX} blockLabel="Screen-flow" text={TEXT_V1} latest={OK_V1} lastOk={OK_V1} />,
    );
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByText('Sign in').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const handler = vi.fn();
    unregister = slots.previewLink.set(handler);
    fireEvent.click(screen.getByText('Start'));
    expect(handler).not.toHaveBeenCalled();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
