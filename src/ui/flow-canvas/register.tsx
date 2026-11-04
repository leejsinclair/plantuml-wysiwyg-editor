// Registers the flow block editor (T156; FR-012/AC8, AC13; FR-015/AC1; contracts/ui.md §5–§8).
//
// - blockEditors 'flow': Canvas, Outline, Palette, Properties, commands, pathLabels, destinations, hasPath.
// - projectPanel 'header': "Add screen flow" (+ explanation when no flow).
// - projectPanel 'block': "Delete screen flow" with confirmation alertdialog for flow blocks only.
// - Commands: Select parent, Move to…, Delete (Delete key), Move up (Alt+Shift+Up), Move down (Alt+Shift+Down),
//   Add branch (decision), Add note.
//
// The store defect: store.applyEdits has no built-in way to set flowIndex when adding a block. We work around
// it by calling store.openBlock(key) after getting the new index from addFlow's result, using the keys array.
import { useState } from 'react';
import type { SlotProps, Slots } from '../app/slots.ts';
import { slots as appSlots } from '../app/slots.ts';
import { useStore, useSession } from '../app/store.ts';
import { hasPath, validDestinations } from '../../core/activity/destinations.ts';
import { addFlow, deleteFlow } from '../../core/project/flow-block.ts';
import { t } from '../messages/en.ts';
import type { ScreenFlow } from '../../core/activity/model.ts';
import type { Destination } from '../../core/activity/destinations.ts';
import type { Path } from '../../core/types.ts';
import type { TextEdit } from '../../core/types.ts';
import type { KeyedState } from '../../core/project/project.ts';
import { blocks as projectBlocks } from '../../core/project/project.ts';
import { linksTo } from '../../core/project/links.ts';
import { flowDoc, diffEdits } from '../../core/activity/destinations.ts';
import { rewrite } from '../../core/activity/lanes.ts';
import { FlowCanvas } from './FlowCanvas.tsx';
import { FlowPalette } from './FlowPalette.tsx';
import { FlowProperties } from './FlowProperties.tsx';
import { FlowOutline } from './flow-outline.tsx';
import { FlowDndHost } from './flow-dnd.tsx';

// ─── FR-021: Auto-remove flow connections on screen delete ───────────────────────────────────────

/**
 * Returns file-absolute edits that remove every step whose `link.target` equals `screenName`
 * from the project's flow block. Returns [] when there is no flow block or no matching steps.
 */
export function flowLinkRemovalEdits(state: KeyedState, screenName: string): TextEdit[] {
  const all = projectBlocks(state);
  const flowBlock = all.find((b) => b.kind === 'flow');
  if (!flowBlock) return [];
  const flowText = state.source.slice(flowBlock.start, flowBlock.end);
  const doc = flowDoc(flowText);
  if (!doc) return [];
  const steps = linksTo(doc.model, screenName);
  if (steps.length === 0) return [];

  // For each linked step, replace it with a version without the link suffix.
  const stepEdits: import('../../core/types.ts').TextEdit[] = steps.map((step) => {
    // Remove the [[#target label]] suffix — rewrite the step range to just `:label;`.
    const labelText = step.label?.text ?? '';
    const newLine = `:${labelText};`;
    return { start: step.range.start, end: step.range.end, text: newLine };
  });

  // Run through the rewrite pipeline to get valid next state.
  const next = rewrite(doc, stepEdits, {});
  if (next === null) return [];
  return diffEdits(flowText, next, flowBlock.start);
}

// --------------------------------------------------------------------------------------------- "Add screen flow"

function AddFlowCommand(_props: SlotProps) {
  const store = useStore();
  const session = useSession();
  const hasFlow = session.blocks.some((b) => b.kind === 'flow');
  if (hasFlow) return null;

  const onClick = (): void => {
    const state = store.getState();
    if (!state) return;
    const result = addFlow(state.source, state.flowIndex);
    if (!result.ok) {
      // Flow already exists
      return;
    }
    // Use the first valid block key as the history anchor (open block or first)
    const anchor = session.openBlockKey ?? state.keys[0];
    if (!anchor) return;
    store.applyEdits(result.edits, {
      nameKey: 'flow.history.addFlow',
      blockKey: anchor,
      order: result.order,
      flowIndex: result.flowIndex,
      announceKey: 'flow.block.added',
      announceParams: { name: result.name },
    });
    // Open the new flow block; keys are regenerated after applyEdits
    const newState = store.getState();
    const newKey = newState?.keys[result.flowIndex];
    if (newKey) store.openBlock(newKey);
  };

  return (
    <div className="add-flow-command">
      <button
        type="button"
        className="add-flow-command__btn"
        onClick={onClick}
        disabled={session.projectId === null}
      >
        {t('flow.add')}
      </button>
      <p className="add-flow-command__explanation">{t('flow.addExplanation')}</p>
    </div>
  );
}

// --------------------------------------------------------------------------------------------- "Delete screen flow"

function DeleteFlowCommand({ blockKey }: SlotProps & { readonly blockKey?: string }) {
  const store = useStore();
  const session = useSession();
  const [confirming, setConfirming] = useState(false);

  const view = session.blocks.find((b) => b.key === blockKey);
  if (!view || view.kind !== 'flow') return null;

  const doDelete = (): void => {
    const state = store.getState();
    if (!state) return;
    const result = deleteFlow(state.source, state.flowIndex);
    if (!result.ok) {
      store.applyOp(result);
      return;
    }
    // anchor on the deleted key itself so undo reopens it
    store.applyEdits(result.edits, {
      nameKey: 'flow.history.deleteFlow',
      blockKey: blockKey!,
      order: result.order,
      flowIndex: null,
      announceKey: 'flow.block.deleted',
      announceParams: { name: result.name ?? '' },
    });
    setConfirming(false);
  };

  return (
    <>
      <button
        type="button"
        className="delete-flow-command__btn"
        onClick={() => setConfirming(true)}
      >
        {t('flow.delete')}
      </button>
      {confirming && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="flow-delete-title"
          className="delete-flow-dialog"
        >
          <h2 id="flow-delete-title">{t('flow.deleteConfirm.title')}</h2>
          <p>{t('flow.deleteConfirm.body', { name: view.name ?? '' })}</p>
          <button type="button" onClick={doDelete}>
            {t('flow.deleteConfirm.confirm')}
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            {t('flow.deleteConfirm.cancel')}
          </button>
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------------------------------------- registration

export function registerFlowEditor(slots: Slots): () => void {
  const unregisterEditor = slots.blockEditors.register('flow', {
    Canvas: FlowCanvas,
    Outline: FlowOutline,
    Palette: FlowPalette,
    Properties: FlowProperties,
    DndHost: FlowDndHost,
    commands: [],
    pathLabels(_model: ScreenFlow, path: Path): string[] {
      return [t('flow.root'), ...path.map((i) => String(i))];
    },
    destinations(model: ScreenFlow, target: Path): Destination[] {
      return validDestinations(model, target);
    },
    hasPath(model: ScreenFlow, path: Path): boolean {
      return hasPath(model, path);
    },
  });

  const unregisterAddFlow = slots.projectPanel.register({
    id: 'flow.add',
    placement: 'header',
    order: 100,
    Component: AddFlowCommand,
  });

  const unregisterDeleteFlow = slots.projectPanel.register({
    id: 'flow.delete',
    placement: 'block',
    order: 100,
    Component: DeleteFlowCommand,
  });

  return () => {
    unregisterEditor();
    unregisterAddFlow();
    unregisterDeleteFlow();
  };
}

// Register into the application slots eagerly (main.tsx imports this).
registerFlowEditor(appSlots);
