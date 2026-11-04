// The preview pane (FR-005/AC1–AC6, contracts/ui.md §9): the block's actual PlantUML output, labelled
// read-only.
//
// - The SVG is sanitised here, just before it is placed inline (R-8, FR-017/AC4).
// - The current text's render status shows "Not yet checked" until a render of exactly that text succeeds
//   or fails; a timed-out render also counts as not yet checked (FR-017/AC5).
// - While the current text has no successful render, the last successful one stays visible, marked out of
//   date (FR-005/AC6).
// - A rendering failure shows the renderer's own message, the block and a plain explanation in the
//   preview's own area, labelled as a rendering problem, never with source problems (FR-005/AC3–AC5).
// - Clicking a link in the render (a linked flow step) passes its target to the `previewLink` slot and never
//   navigates (US7).
import { useId, useMemo, type MouseEvent } from 'react';
import { sanitizeSvg } from '../../services/render/sanitize.ts';
import { slots, useSlot, type SlotContext } from '../app/slots.ts';
import { t } from '../messages/en.ts';

/** One render of a block's text, as the render queue reports it (data-model §6.7). */
export interface PreviewResult {
  /** The block text that was rendered. */
  readonly text: string;
  readonly outcome: 'ok' | 'failed' | 'timedOut';
  /** For `ok`: the renderer's SVG. Sanitised again here before display. */
  readonly svg?: string;
  /** For `failed`: the renderer's message, shown unchanged. */
  readonly message?: string;
}

export interface PreviewProps {
  readonly ctx: SlotContext;
  /** How the block is named in messages: its name, or "Untitled screen n". */
  readonly blockLabel: string;
  /** The block's current text. */
  readonly text: string;
  /** The latest render result for the block, or `null`. */
  readonly latest: PreviewResult | null;
  /** The last successful render, or `null`. */
  readonly lastOk: PreviewResult | null;
  /** The block is invalid under the editor's grammar and was rendered anyway (section 4.2 "Preview"). */
  readonly notCheckedByEditor?: boolean;
}

const XLINK = 'http://www.w3.org/1999/xlink';

/** The href of a link in rendered SVG or HTML. */
function hrefOf(link: Element): string | null {
  return link.getAttribute('href') ?? link.getAttributeNS(XLINK, 'href') ?? link.getAttribute('xlink:href');
}

function decodeTarget(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

export function Preview({ ctx, blockLabel, text, latest, lastOk, notCheckedByEditor = false }: PreviewProps) {
  const headingId = useId();
  const problemId = useId();
  const linkHandler = useSlot(slots.previewLink);

  const current = latest !== null && latest.text === text ? latest : null;
  const renderedNow = current?.outcome === 'ok' && current.svg !== undefined;
  const shown = renderedNow ? current : lastOk?.outcome === 'ok' && lastOk.svg !== undefined ? lastOk : null;
  const notYetChecked = current === null || current.outcome === 'timedOut';
  const outOfDate = shown !== null && shown.text !== text;
  const problem = latest?.outcome === 'failed' ? (latest.message ?? '') : null;

  const svg = shown?.svg;
  const safeSvg = useMemo(() => (svg === undefined ? null : sanitizeSvg(svg)), [svg]);

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a');
    if (!link || !event.currentTarget.contains(link)) return;
    // Never follow a link from the render: the app's routes live in the hash.
    event.preventDefault();
    const href = hrefOf(link);
    if (href === null || !href.startsWith('#') || href.length < 2) return;
    linkHandler?.(decodeTarget(href.slice(1)), ctx);
  };

  return (
    <div role="group" aria-labelledby={headingId} className="preview">
      <p id={headingId} className="preview-heading">
        {t('preview.label')} <span className="preview-read-only">{t('preview.readOnly')}</span>
      </p>

      <div className="preview-status">
        {notYetChecked ? <span className="preview-not-checked">{t('renderStatus.notYetChecked')}</span> : null}
        {outOfDate ? (
          <span className="preview-out-of-date">
            <strong>{t('preview.outOfDate')}</strong> <span>{t('preview.outOfDateDetail')}</span>
          </span>
        ) : null}
        {notCheckedByEditor ? <span className="preview-unchecked">{t('preview.notCheckedByEditor')}</span> : null}
      </div>

      {safeSvg !== null ? (
        <figure
          className="preview-diagram"
          aria-label={t('preview.diagram', { block: blockLabel })}
          data-out-of-date={outOfDate ? 'true' : 'false'}
        >
          <div onClick={onClick} dangerouslySetInnerHTML={{ __html: safeSvg }} />
        </figure>
      ) : (
        <p className="preview-empty">{t('preview.nothingRendered')}</p>
      )}

      {problem !== null ? (
        <section className="preview-problem" aria-labelledby={problemId}>
          <h3 id={problemId}>{t('preview.renderingProblem')}</h3>
          <p>{t('preview.renderingProblemExplanation', { block: blockLabel })}</p>
          <pre>{problem}</pre>
        </section>
      ) : null}
    </div>
  );
}
