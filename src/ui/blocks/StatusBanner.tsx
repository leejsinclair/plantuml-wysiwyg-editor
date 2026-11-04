// The block status banner above the canvas (T112; FR-004/AC4, FR-010/AC1–AC4, AC7–AC9, contracts/ui.md §9).
//
// - Editable blocks show nothing. Every other status shows "<block>: <status>" with its plain-language reason.
// - Error is labelled as a source problem naming the block, the line and the problem. "Fix in source" puts the
//   cursor on that line in the block's source view. "Revert to last working version" is offered only when a last
//   working version exists, and that version is shown read-only through the block's own canvas; a block that has
//   never been valid says so and offers no revert (FR-010/AC8).
// - Source only shows its explanation; Older format offers "Convert to current format".
// - Cannot be rendered says the renderer's message is in the preview: rendering problems are shown only in the
//   preview pane (contracts/ui.md §9), and such blocks are not reported as errors otherwise (FR-010/AC9).
import { useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import { classify } from '../../core/blocks/classify.ts';
import { convertOlderFormat } from '../../core/blocks/convert.ts';
import type { BlockView } from '../../core/project/project.ts';
import { revertToLastWorking } from '../../core/project/revert.ts';
import { slots as appSlots, useSlot, type SlotProps, type Slots } from '../app/slots.ts';
import { useSession, useStore, type Store } from '../app/store.ts';
import { has, t } from '../messages/en.ts';
import { blockLabel } from '../project-panel/ProjectPanel.tsx';

/**
 * "Fix in source": focuses the block's source view with the cursor at the start of `line` (1-based, within the
 * block) and scrolls it into view, as `SourceViewHandle.focusLine` does. The workspace does not expose the source
 * view's handle, so the CodeMirror view is found from the DOM. When the source view is not shown (its panel is
 * collapsed), the Source region is focused instead. Returns whether the line was focused.
 */
export function focusSourceLine(blockKey: string, line: number): boolean {
  const host = Array.from(document.querySelectorAll<HTMLElement>('.source-view')).find((el) => el.dataset['block'] === blockKey);
  const dom = host?.querySelector<HTMLElement>('.cm-editor');
  const view = dom ? EditorView.findFromDOM(dom) : null;
  if (!view) {
    document.querySelector<HTMLElement>('[data-region="source"]')?.focus();
    return false;
  }
  const doc = view.state.doc;
  const target = doc.line(Math.min(Math.max(1, Math.floor(line)), doc.lines));
  view.focus();
  view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) });
  return true;
}

/** "Revert to last working version" for one block: one undoable edit (FR-010/AC4). */
export function revertBlock(store: Store, view: BlockView): void {
  const state = store.getState();
  if (!state) return;
  store.applyOp(revertToLastWorking(state, view.index), { blockKey: view.key });
}

/** "Convert to current format" for one older-format block: one undoable edit (FR-010/AC7). */
export function convertBlock(store: Store, view: BlockView): void {
  const state = store.getState();
  if (!state) return;
  const edits = convertOlderFormat(state.source, {
    type: 'block', start: view.start, end: view.end, commentStart: view.commentStart, opener: view.opener, name: view.name,
  });
  if (edits.length === 0) return;
  store.applyEdits(edits, {
    nameKey: 'blocks.history.convert',
    blockKey: view.key,
    announceKey: 'blocks.announce.converted',
    announceParams: { block: blockLabel(view) },
  });
}

/** The plain-language reason for a status, or `null`. */
function reasonOf(view: BlockView): string | null {
  return view.reasonKey && has(view.reasonKey) ? t(view.reasonKey, view.reasonParams) : null;
}

export interface StatusBannerProps extends SlotProps {
  /** The slot registry whose block editors draw the last working version; defaults to the application's. */
  readonly slots?: Slots;
  /** "Fix in source"; defaults to `focusSourceLine`. */
  readonly focusSource?: (blockKey: string, line: number) => void;
}

function LastWorking({ view, text, slots }: { readonly view: BlockView; readonly text: string; readonly slots: Slots }) {
  useSlot(slots.blockEditors);
  const editor = view.kind === 'other' ? null : slots.blockEditors.get(view.kind);
  const model = useMemo(() => {
    const c = classify(text);
    return c.salt?.model ?? c.activity?.model ?? null;
  }, [text]);
  return (
    <div className="status-banner__last-working">
      <p>{t('blocks.banner.lastWorking')}</p>
      {editor && model ? <editor.Canvas blockKey={view.key} model={model} selection={null} readOnly /> : null}
    </div>
  );
}

export function StatusBanner({ ctx, slots = appSlots, focusSource = focusSourceLine }: StatusBannerProps) {
  const session = useSession();
  const store = useStore();
  const view = ctx.block ? session.blocks.find((b) => b.key === ctx.block!.key) : undefined;
  if (!view || view.status === 'Editable') return null;

  const label = blockLabel(view);
  const reason = reasonOf(view);
  const problem = view.status === 'Error' ? view.classification.problem : null;
  const lastWorking = view.hasLastWorking ? (store.getState()?.lastWorking.find((e) => e.blockIndex === view.index) ?? null) : null;

  return (
    <div role="group" aria-label={t('blocks.banner.label')} className="status-banner" data-status={view.status}>
      <p className="status-banner__status">{t('blocks.banner.status', { block: label, status: view.status })}</p>
      {view.status === 'Error' ? (
        <>
          <h3 className="status-banner__heading">{t('blocks.banner.sourceProblem')}</h3>
          <p>
            {problem
              ? t('blocks.banner.problem', { block: label, line: problem.line, problem: t(problem.messageKey, problem.params) })
              : reason}
          </p>
          <p>{t('blocks.banner.lockedUntilFixed')}</p>
          <div className="status-banner__actions">
            <button type="button" onClick={() => focusSource(view.key, problem?.line ?? 1)}>
              {t('blocks.fixInSource')}
            </button>
            {lastWorking ? (
              <button type="button" onClick={() => revertBlock(store, view)}>
                {t('blocks.revert')}
              </button>
            ) : null}
          </div>
          {lastWorking ? <LastWorking view={view} text={lastWorking.text} slots={slots} /> : <p>{t('blocks.banner.neverValid')}</p>}
        </>
      ) : (
        reason && <p className="status-banner__reason">{reason}</p>
      )}
      {view.status === 'Older format' ? (
        <div className="status-banner__actions">
          <button type="button" onClick={() => convertBlock(store, view)}>
            {t('blocks.convert')}
          </button>
        </div>
      ) : null}
      {view.status === 'Cannot be rendered' && view.renderStatus === 'failed' ? <p>{t('blocks.banner.cannotBeRendered')}</p> : null}
      {view.status === 'Cannot be rendered' && !view.classification.dependsOnExternal ? <p>{t('blocks.banner.notAnError')}</p> : null}
    </div>
  );
}
