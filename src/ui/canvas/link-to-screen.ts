// Links a wireframe element to a screen: the element has no flow step yet, so a step labelled with its text is
// added to the screen flow (made first when the project has none) and linked to the chosen screen. Shared by the
// canvas context menu and the "Link to screen" section of the Properties panel.
import { useStore, useSession } from '../app/store.ts';
import { flowDoc } from '../../core/activity/destinations.ts';
import { addLinkedStep } from '../../core/activity/ops/links.ts';
import { addFlow } from '../../core/project/flow-block.ts';
import { blocks as projectBlocks } from '../../core/project/project.ts';

/** Returns a function that adds a step labelled `label`, linked to screen `target`. True when it was added. */
export function useLinkToScreen(): (label: string, target: string) => boolean {
  const store = useStore();
  const session = useSession();
  return (label, target) => {
    let state = store.getState();
    if (!state) return false;
    if (!projectBlocks(state).some((b) => b.kind === 'flow')) {
      const added = addFlow(state.source, state.flowIndex);
      const anchor = session.openBlockKey ?? state.keys[0];
      if (!added.ok || !anchor) return false;
      store.applyEdits(added.edits, {
        nameKey: 'flow.history.addFlow',
        blockKey: anchor,
        order: added.order,
        flowIndex: added.flowIndex,
        announceKey: 'flow.block.added',
        announceParams: { name: added.name },
      });
      state = store.getState();
      if (!state) return false;
    }
    const flowView = projectBlocks(state).find((b) => b.kind === 'flow');
    const doc = flowView ? flowDoc(state.source.slice(flowView.start, flowView.end), flowView.start) : null;
    const flowKey = flowView ? state.keys[state.flowIndex ?? -1] : undefined;
    if (!doc || !flowKey) return false;
    store.applyOp(addLinkedStep(doc, label.trim() || target, target), { blockKey: flowKey });
    return true;
  };
}
