// Link control in a step's properties panel (T164; FR-013/AC1, AC4, AC6, FR-011/AC16, contracts/ui.md §8).
//
// Shows the current link status and offers:
// - When unlinked: a screen selector ("Link to another screen") and "Create screen".
// - When linked (valid): the linked screen name and "Remove link".
// - When linked (broken): broken-link message with "Link to another screen", "Create screen", "Remove link".
// - When linked (brokenCaseOnly): same with a "Use <suggestion>" fix.
// - When linked (ambiguous): ambiguous message with "Remove link".
import { useState } from 'react';
import type { SlotContext } from '../app/slots.ts';
import { useSession, useStore } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { linkStatus } from '../../core/project/links.ts';
import { flowDoc, resolve } from '../../core/activity/destinations.ts';
import { setLink, createAndLink } from '../../core/activity/ops/links.ts';

export interface LinkControlProps {
  readonly ctx: SlotContext;
}

export function LinkControl({ ctx }: LinkControlProps) {
  const session = useSession();
  const store = useStore();
  const [linking, setLinking] = useState(false);

  // Only show when a step is selected in the flow block.
  if (!ctx.block || ctx.block.kind !== 'flow' || ctx.selection === null) return null;
  if (ctx.block.readOnly) return null;

  const blockView = session.blocks.find((b) => b.key === ctx.block!.key) ?? null;
  if (!blockView) return null;

  const model = blockView.classification.activity?.model ?? null;
  if (!model) return null;

  // Find the step at the selection.
  const r = resolve(model, ctx.selection);
  if (!r || r.type !== 'element' || r.element.kind !== 'step') return null;

  const step = r.element;
  const stepPath = ctx.selection;

  // Determine link status.
  const screenNames = session.blocks.filter((b) => b.kind === 'screen').map((b) => b.name);
  const status = step.link ? linkStatus(step.link.target, screenNames) : null;
  const target = step.link?.target ?? null;

  const state = store.getState();
  if (!state) return null;
  const blockText = state.source.slice(blockView.start, blockView.end);
  const doc = flowDoc(blockText, blockView.start);
  if (!doc) return null;

  function doSetLink(newTarget: string | null): void {
    const op = setLink(doc!, stepPath, newTarget);
    store.applyOp(op, { blockKey: blockView!.key });
    setLinking(false);
  }

  function doCreateScreen(): void {
    const result = createAndLink(state!, doc!, stepPath);
    if ('ok' in result && (result as { ok: false }).ok === false) return;
    const r2 = result as Exclude<typeof result, { ok: false }>;
    // Apply link edits, then screen edits together.
    const combined = [...r2.linkEdits, ...r2.screenOp.edits];
    store.applyEdits(combined, {
      nameKey: r2.historyName,
      announceKey: 'links.created.announce',
      announceParams: { name: r2.screenName },
      blockKey: blockView!.key,
      order: r2.screenOp.order,
    });
  }

  // Render the control.
  if (!step.link) {
    // No link.
    return (
      <section className="link-control">
        <p className="link-control__status">{t('links.noLink')}</p>
        {linking ? (
          <ScreenSelector
            screenNames={screenNames.filter((n): n is string => n !== null)}
            onSelect={doSetLink}
            onCancel={() => setLinking(false)}
          />
        ) : (
          <>
            <button type="button" onClick={() => setLinking(true)}>
              {t('links.linkToScreen')}
            </button>
            <button type="button" onClick={doCreateScreen}>
              {t('links.createScreen')}
            </button>
          </>
        )}
      </section>
    );
  }

  // Has a link.
  return (
    <section className="link-control">
      {status?.status === 'valid' && (
        <p className="link-control__status">{t('links.linked', { name: status.screen })}</p>
      )}
      {(status?.status === 'broken' || status?.status === 'ambiguous') && (
        <p className="link-control__status link-control__status--broken">
          {status.status === 'ambiguous'
            ? t('links.ambiguous', { name: target! })
            : t('links.broken', { name: target! })}
        </p>
      )}
      {status?.status === 'brokenCaseOnly' && (
        <p className="link-control__status link-control__status--broken">
          {t('links.brokenCaseOnly', { name: target!, suggestion: status.suggestion })}
        </p>
      )}

      {linking ? (
        <ScreenSelector
          screenNames={screenNames.filter((n): n is string => n !== null)}
          onSelect={doSetLink}
          onCancel={() => setLinking(false)}
        />
      ) : (
        <>
          {(status?.status === 'broken' || status?.status === 'brokenCaseOnly' || status?.status === 'ambiguous') && (
            <button type="button" onClick={() => setLinking(true)}>
              {t('links.linkToScreen')}
            </button>
          )}
          {(status?.status === 'broken' || status?.status === 'brokenCaseOnly') && (
            <button type="button" onClick={doCreateScreen}>
              {t('links.createScreen')}
            </button>
          )}
          {status?.status === 'brokenCaseOnly' && (
            <button type="button" onClick={() => doSetLink(status.suggestion)}>
              {t('links.fixCase', { suggestion: status.suggestion })}
            </button>
          )}
          <button type="button" onClick={() => doSetLink(null)}>
            {t('links.removeLink')}
          </button>
        </>
      )}
    </section>
  );
}

interface ScreenSelectorProps {
  readonly screenNames: string[];
  readonly onSelect: (name: string) => void;
  readonly onCancel: () => void;
}

function ScreenSelector({ screenNames, onSelect, onCancel }: ScreenSelectorProps) {
  const [selected, setSelected] = useState(screenNames[0] ?? '');

  return (
    <div className="link-control__selector">
      <label>
        {t('links.linkLabel')}
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-label={t('links.linkLabel')}
        >
          {screenNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => onSelect(selected)} disabled={selected === ''}>
        {t('links.linkToScreen')}
      </button>
      <button type="button" onClick={onCancel}>
        {t('screens.warning.cancel')}
      </button>
    </div>
  );
}
