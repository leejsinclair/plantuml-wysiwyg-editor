// Export and copy commands (T172; FR-014/AC2–AC5, contracts/ui.md §11, US8).
//
// - "Export SVG" and "Export PNG" export the open block's current image: the SVG the preview shows, and that
//   SVG at 2× as PNG (export-image.ts). Image export is refused, with an explanation, for a block that is
//   invalid, in the older format or depends on `!include`, and for a block whose current text has no image yet
//   or that PlantUML could not draw, so an out-of-date image is never exported as if current.
// - A refused export stays focusable (`aria-disabled`) with its explanation as the description; activating it
//   shows the explanation. "Copy source" and "Copy project source" stay available for every block.
// - Copying confirms in the group's own status line, or says the browser refused (FR-014/AC4).
// - Export and copy never set `downloadedAt`: only a `.puml` download does (data-model §3.6).
//
// Render results come from the render queue. The application binds its queue with `bindExportRenders`; a
// test (or another host) may pass one as `renders`.
import { useId, useState, useSyncExternalStore } from 'react';
import type { MessageParams } from '../../core/types.ts';
import type { BlockView } from '../../core/project/project.ts';
import { copyText, type CopyResult } from '../../services/files/clipboard.ts';
import { exportPng, exportSvg, imageFileName, standaloneSvg } from '../../services/render/export-image.ts';
import type { BlockRender } from '../../services/render/render-queue.ts';
import { sanitizeSvg } from '../../services/render/sanitize.ts';
import type { SlotContext } from '../app/slots.ts';
import { useSession, useStore } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { blockLabel } from '../project-panel/ProjectPanel.tsx';
import { IconCopy, IconFileCode, IconPhoto, IconVectorTriangle } from '@tabler/icons-react';

/** What the commands read from the render queue (`RenderQueue` satisfies it). */
export interface RenderSource {
  get(key: string): BlockRender | null;
  subscribe(listener: (key: string | null) => void): () => void;
}

/** The side effects, replaceable in tests. */
export interface ExportServices {
  exportSvg(svg: string, fileName: string): void;
  exportPng(svg: string, fileName: string): Promise<void>;
  copy(text: string): Promise<CopyResult>;
}

const defaultServices: ExportServices = {
  exportSvg: (svg, fileName) => exportSvg(svg, fileName),
  exportPng: (svg, fileName) => exportPng(svg, fileName),
  copy: (text) => copyText(text),
};

// ------------------------------------------------------------------------------------ render binding

let bound: RenderSource | null = null;
const bindingListeners = new Set<() => void>();

/** Makes `source` (the application's render queue) the one the registered commands read. Returns an unbind. */
export function bindExportRenders(source: RenderSource): () => void {
  bound = source;
  bindingListeners.forEach((l) => l());
  return () => {
    if (bound !== source) return;
    bound = null;
    bindingListeners.forEach((l) => l());
  };
}

const subscribeBinding = (listener: () => void): (() => void) => {
  bindingListeners.add(listener);
  return () => bindingListeners.delete(listener);
};
const boundSource = (): RenderSource | null => bound;

const noSubscription = (): (() => void) => () => {};

function useRender(source: RenderSource | null, key: string | null): BlockRender | null {
  return useSyncExternalStore(
    source ? (listener) => source.subscribe(() => listener()) : noSubscription,
    () => (source && key !== null ? source.get(key) : null),
  );
}

// ------------------------------------------------------------------------------------------ refusal

export interface Refusal {
  readonly key: string;
  readonly params: MessageParams;
}

/**
 * Why the block cannot be exported as an image now, or `null` when its current text has rendered. What the
 * editor knows about the block comes first (FR-014/AC5), then the renderer's answer for the current text.
 */
export function exportRefusal(view: BlockView, render: BlockRender | null): Refusal | null {
  const params = { block: blockLabel(view) };
  const c = view.classification;
  if (c.olderFormat) return { key: 'export.refused.olderFormat', params };
  if (c.dependsOnExternal) return { key: 'export.refused.include', params };
  if (c.category === 3) return { key: 'export.refused.invalid', params };
  if (render?.status === 'failed') return { key: 'export.refused.renderProblem', params };
  if (render?.status !== 'rendered' || render.latest?.outcome !== 'ok') return { key: 'export.refused.notRendered', params };
  return null;
}

// ---------------------------------------------------------------------------------------- component

export interface ExportCommandsProps {
  readonly ctx: SlotContext;
  /** Render results; the application's bound render queue by default. */
  readonly renders?: RenderSource;
  readonly services?: ExportServices;
}

interface Message {
  readonly text: string;
  /** The block open when it was shown; it is hidden once another block opens. */
  readonly blockKey: string | null;
}

export function ExportCommands({ ctx, renders, services = defaultServices }: ExportCommandsProps) {
  const store = useStore();
  const session = useSession();
  const groupLabelId = useId();
  const bindingSource = useSyncExternalStore(subscribeBinding, boundSource, boundSource);
  const source = renders ?? bindingSource;
  const openKey = ctx.block?.key ?? null;
  const view = openKey === null ? null : (session.blocks.find((b) => b.key === openKey) ?? null);
  const render = useRender(source, view?.key ?? null);
  const [message, setMessage] = useState<Message | null>(null);

  if (ctx.projectId === null) return null;

  const show = (text: string): void => setMessage({ text, blockKey: openKey });
  const refusal = view ? exportRefusal(view, render) : null;
  const explanation = refusal ? t(refusal.key, refusal.params) : null;
  const projectName = session.record?.name ?? '';

  const exportImage = (format: 'svg' | 'png'): void => {
    if (!view) return;
    if (explanation !== null || render?.latest?.outcome !== 'ok') {
      if (explanation !== null) show(explanation);
      return;
    }
    // The markup the preview places inline, as a standalone file.
    const svg = standaloneSvg(sanitizeSvg(render.latest.svg));
    const fileName = imageFileName(projectName, blockLabel(view), format);
    if (format === 'svg') {
      services.exportSvg(svg, fileName);
      return;
    }
    services.exportPng(svg, fileName).catch(() => show(t('export.pngProblem', { block: blockLabel(view) })));
  };

  const copy = async (text: string, confirmation: string): Promise<void> => {
    const result = await services.copy(text);
    show(result.ok ? confirmation : t('export.copyFailed'));
  };

  const copyBlock = (): void => {
    const source = store.getState()?.source;
    if (!view || source === undefined) return;
    void copy(source.slice(view.start, view.end), t('export.copied', { block: blockLabel(view) }));
  };

  const copyProject = (): void => {
    const source = store.getState()?.source;
    if (source === undefined) return;
    void copy(source, t('export.projectCopied'));
  };

  const refusedProps = explanation === null ? {} : { 'aria-disabled': true as const, title: explanation };
  const shown = message !== null && message.blockKey === openKey ? message.text : '';

  return (
    <span role="group" aria-labelledby={groupLabelId} className="export">
      <span id={groupLabelId} hidden>
        {t('export.group')}
      </span>
      {view && (
        <>
          <button type="button" className="export__svg" {...refusedProps} onClick={() => exportImage('svg')}>
            <IconVectorTriangle size={16} aria-hidden="true" />
            {t('export.svg')}
          </button>
          <button type="button" className="export__png" {...refusedProps} onClick={() => exportImage('png')}>
            <IconPhoto size={16} aria-hidden="true" />
            {t('export.png')}
          </button>
          <button type="button" className="export__copy" onClick={copyBlock}>
            <IconCopy size={16} aria-hidden="true" />
            {t('export.copySource')}
          </button>
        </>
      )}
      <button type="button" className="export__copy-project" onClick={copyProject}>
        <IconFileCode size={16} aria-hidden="true" />
        {t('export.copyProjectSource')}
      </button>
      <span role="status" className="export__status">
        {shown}
      </span>
    </span>
  );
}
