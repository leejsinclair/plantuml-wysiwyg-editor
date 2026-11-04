// The project panel (FR-015/AC1–AC3, FR-011/AC11, contracts/ui.md §5). It lists every screen in file order,
// the screen flow, then every block of other content in file order. Each entry shows the block's status, the
// plain-language reason for it, its render status (FR-017, VO-067), how many flow steps link to a screen and
// any flag on an imported name. Choosing an entry opens that block.
//
// Commands are not written here: the stories add them through the `projectPanel` slot, `header` entries above
// the lists ("Add screen", "Add screen flow") and `block` entries beside each block (rename, convert, …).
import { useId, useMemo } from 'react';
import type { BlockView, NameFlag } from '../../core/project/project.ts';
import type { RenderStatus } from '../../core/types.ts';
import { slots, useSlot, type SlotContext } from '../app/slots.ts';
import { useSession, useStore, type Session } from '../app/store.ts';
import { t } from '../messages/en.ts';

const NAME_FLAG_KEYS: Readonly<Record<NameFlag, string>> = {
  'not-allowed': 'projectPanel.nameFlag.notAllowed',
  'not-nfc': 'projectPanel.nameFlag.notNfc',
  duplicate: 'projectPanel.nameFlag.duplicate',
};

const RENDER_STATUS_KEYS: Readonly<Record<RenderStatus, string>> = {
  'Not yet checked': 'renderStatus.notYetChecked',
  rendered: 'projectPanel.render.rendered',
  failed: 'projectPanel.render.failed',
};

/** How a block is named in the panel and in messages: its name, "Untitled screen n", or its opener. */
export function blockLabel(block: BlockView): string {
  if (block.kind !== 'other' && block.name !== null) return block.name;
  if (block.kind === 'screen' && block.untitledNumber !== null) return t('names.untitledScreen', { n: block.untitledNumber });
  if (block.name !== null) return block.name;
  return t('projectPanel.otherUnnamed', { opener: block.opener, n: block.index + 1 });
}

/** The context the slot entries see, from the session. */
export function slotContextOf(session: Session): SlotContext {
  const open = session.blocks.find((b) => b.key === session.openBlockKey) ?? null;
  return {
    projectId: session.projectId,
    block: open && { key: open.key, kind: open.kind, name: open.name, readOnly: session.sourceEditKey === open.key },
    selection: session.selection?.blockKey === open?.key ? (session.selection?.path ?? null) : null,
  };
}

function Reason({ block }: { readonly block: BlockView }) {
  const problem = block.status === 'Error' ? block.classification.problem : null;
  if (problem) {
    return <p className="project-panel__reason">{t('projectPanel.problemAtLine', { line: problem.line, problem: t(problem.messageKey, problem.params) })}</p>;
  }
  if (block.reasonKey === null) return null;
  return <p className="project-panel__reason">{t(block.reasonKey, block.reasonParams)}</p>;
}

interface EntryProps {
  readonly block: BlockView;
  readonly open: boolean;
  readonly ctx: SlotContext;
  readonly onOpen: (key: string) => void;
}

function Entry({ block, open, ctx, onOpen }: EntryProps) {
  const detailsId = useId();
  const entries = useSlot(slots.projectPanel).filter((item) => item.placement === 'block');
  return (
    <li className="project-panel__entry" data-block-key={block.key}>
      <button
        type="button"
        className="project-panel__open"
        aria-current={open ? 'true' : undefined}
        aria-describedby={detailsId}
        onClick={() => onOpen(block.key)}
      >
        {blockLabel(block)}
      </button>
      <div id={detailsId} className="project-panel__details">
        <span className="project-panel__status">{t('projectPanel.status', { status: block.status })}</span>{' '}
        <span className="project-panel__render-status">{t(RENDER_STATUS_KEYS[block.renderStatus])}</span>
        {block.kind === 'screen' && (
          <span className="project-panel__links">
            {' '}
            {block.incomingLinks === 0 ? t('projectPanel.noIncomingLinks') : t('projectPanel.incomingLinks', { count: block.incomingLinks })}
          </span>
        )}
        {block.nameFlag && (
          <p className="project-panel__name-flag" role="note">
            {t(NAME_FLAG_KEYS[block.nameFlag])}
          </p>
        )}
        <Reason block={block} />
      </div>
      {entries.length > 0 && (
        <div className="project-panel__commands">
          {entries.map(({ id, Component }) => (
            <Component key={id} ctx={ctx} blockKey={block.key} />
          ))}
        </div>
      )}
    </li>
  );
}

interface SectionProps {
  readonly titleKey: string;
  readonly blocks: readonly BlockView[];
  readonly openKey: string | null;
  readonly ctx: SlotContext;
  readonly onOpen: (key: string) => void;
  readonly emptyKey?: string;
}

function Section({ titleKey, blocks, openKey, ctx, onOpen, emptyKey }: SectionProps) {
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId} className="project-panel__section">
      <h3 id={headingId}>{t(titleKey)}</h3>
      {blocks.length === 0 ? (
        emptyKey && <p>{t(emptyKey)}</p>
      ) : (
        <ul>
          {blocks.map((block) => (
            <Entry key={block.key} block={block} open={block.key === openKey} ctx={ctx} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProjectPanel() {
  const session = useSession();
  const store = useStore();
  const header = useSlot(slots.projectPanel).filter((item) => item.placement === 'header');
  const ctx = useMemo(() => slotContextOf(session), [session]);
  const { screens, flow, other } = useMemo(() => {
    const byKind = (kind: BlockView['kind']) => session.blocks.filter((b) => b.kind === kind);
    return { screens: byKind('screen'), flow: byKind('flow'), other: byKind('other') };
  }, [session.blocks]);
  const onOpen = (key: string) => store.openBlock(key);

  return (
    <div className="project-panel" aria-label={t('projectPanel.label')} role="group">
      {header.length > 0 && (
        <div className="project-panel__header">
          {header.map(({ id, Component }) => (
            <Component key={id} ctx={ctx} />
          ))}
        </div>
      )}
      <Section titleKey="projectPanel.screens" blocks={screens} openKey={session.openBlockKey} ctx={ctx} onOpen={onOpen} emptyKey="projectPanel.noScreens" />
      {flow.length > 0 && <Section titleKey="projectPanel.flow" blocks={flow} openKey={session.openBlockKey} ctx={ctx} onOpen={onOpen} />}
      {other.length > 0 && <Section titleKey="projectPanel.other" blocks={other} openKey={session.openBlockKey} ctx={ctx} onOpen={onOpen} />}
    </div>
  );
}
