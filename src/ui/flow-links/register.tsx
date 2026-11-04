// Register the link control, "Open screen" and "Back to flow" commands, and the preview-link handler
// (T166; FR-013/AC1, AC3, AC4, contracts/ui.md §8).
//
// - `propertySections`: the LinkControl section, shown when a step is selected in the flow.
// - `commands`: "Open screen" (Ctrl+Enter / Cmd+Enter, FR-013/AC3) and "Back to flow".
// - `previewLink`: the handler that opens the linked screen when a preview link is clicked (FR-015/AC6).
//
// Commands and the preview handler are plain functions, so a banner component hands them the live store.
import { useEffect } from 'react';
import { slots } from '../app/slots.ts';
import { keyCommand, platformFrom } from '../keys.ts';
import { useStore, type Store } from '../app/store.ts';
import type { SlotContext } from '../app/slots.ts';
import { canGoBack, canOpenScreen, openScreen, backToFlow } from './navigation.ts';
import { handlePreviewLink } from './preview-links.ts';
import { LinkControl } from './LinkControl.tsx';

let liveStore: Store | null = null;

function StoreBridge() {
  const store = useStore();
  useEffect(() => {
    liveStore = store;
    // The "Open screen" shortcut works from anywhere in the flow, as the command bar's button does.
    const platform = platformFrom(navigator.userAgent);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (keyCommand(event, platform) !== 'openScreen') return;
      const session = store.getSnapshot();
      const result = canOpenScreen(session);
      if (!result.available) return;
      event.preventDefault();
      openScreen(store, session, result.screenKey, result.stepPath);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (liveStore === store) liveStore = null;
    };
  }, [store]);
  return null;
}

slots.banners.register({ id: 'links.storeBridge', order: -999, Component: StoreBridge });

// ─── propertySections ────────────────────────────────────────────────────────────────────────────

// LinkControl renders nothing unless the selection is a step.
slots.propertySections.register({
  id: 'links.linkControl',
  order: 10,
  appliesTo: (ctx: SlotContext) => ctx.block?.kind === 'flow' && ctx.selection !== null,
  Component: ({ ctx }) => <LinkControl ctx={ctx} />,
});

// ─── commands ────────────────────────────────────────────────────────────────────────────────────

/** "Open screen" opens the linked screen from the selected step (Ctrl+Enter). */
slots.commands.register({
  id: 'links.openScreen',
  labelKey: 'links.openScreen',
  shortcut: 'openScreen',
  order: 10,
  isVisible: (ctx) => ctx.block?.kind === 'flow',
  isEnabled: (ctx) => liveStore !== null && ctx.block?.kind === 'flow' && canOpenScreen(liveStore.getSnapshot()).available,
  run() {
    if (!liveStore) return;
    const session = liveStore.getSnapshot();
    const result = canOpenScreen(session);
    if (result.available) openScreen(liveStore, session, result.screenKey, result.stepPath);
  },
});

/** "Back to flow" returns to the flow and re-selects the step; shown only after "Open screen". */
slots.commands.register({
  id: 'links.backToFlow',
  labelKey: 'links.backToFlow',
  order: 11,
  isVisible: () => liveStore !== null && canGoBack(liveStore.getSnapshot()),
  run() {
    if (liveStore) backToFlow(liveStore, liveStore.getSnapshot());
  },
});

// ─── previewLink ─────────────────────────────────────────────────────────────────────────────────

slots.previewLink.set((target, ctx) => {
  if (liveStore) handlePreviewLink(target, ctx, liveStore, liveStore.getSnapshot());
});
