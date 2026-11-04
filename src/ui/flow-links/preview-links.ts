// Preview link handler (T165; FR-015/AC6, FR-013/AC3).
//
// When the user clicks a `#<screen-id>` link in the flow's rendered preview, this handler opens the
// linked screen. If the screen does not exist, the broken-link message is announced.
import type { SlotContext } from '../app/slots.ts';
import type { Store, Session } from '../app/store.ts';
import { announce } from '../announcer/Announcer.tsx';
import { linksTo } from '../../core/project/links.ts';
import { walk } from '../../core/activity/destinations.ts';
import { openScreen } from './navigation.ts';

/**
 * A `PreviewLinkHandler` for the `previewLink` slot.
 * `target` is the decoded fragment after `#` (e.g. "Sign-in").
 */
export function handlePreviewLink(target: string, ctx: SlotContext, store: Store, session: Session): void {
  // Find the screen by name.
  const screenBlock = session.blocks.find((b) => b.kind === 'screen' && b.name === target) ?? null;
  if (!screenBlock) {
    announce('links.broken', { name: target });
    return;
  }

  // Find the step path in the flow — we need it for "Back to flow".
  const flowBlock = session.blocks.find((b) => b.kind === 'flow') ?? null;
  const model = flowBlock?.classification.activity?.model ?? null;

  let stepPath: readonly number[] = [];
  if (model) {
    const steps = linksTo(model, target);
    if (steps.length > 0) {
      const refs = walk(model);
      const ref = refs.find((r) => r.element === steps[0]);
      if (ref) stepPath = ref.path;
    }
  }

  openScreen(store, session, screenBlock.key, stepPath);
}
