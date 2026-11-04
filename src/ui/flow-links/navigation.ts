// Navigation between flow steps and screens (T163; FR-013/AC3, FR-009/AC8).
//
// "Open screen": opens the screen block and stores `returnToFlow` so "Back to flow" can restore the step.
// "Back to flow": re-selects the step and clears `returnToFlow`.
//
// Pure logic: no DOM, no rendering. Callers pass the store and session; this module maps the session state
// to the right store calls.
import type { Session, Store } from '../app/store.ts';
import { resolve } from '../../core/activity/destinations.ts';

/**
 * Opens the screen whose key is `screenKey`, storing the current step path so "Back to flow" can return.
 * Also focuses the screen's root grid (FR-009/AC8 "after opening a linked screen, to that screen's root grid").
 */
export function openScreen(store: Store, session: Session, screenKey: string, stepPath: readonly number[]): void {
  // Store the return target before switching blocks.
  store.setReturnToFlow({ stepPath: [...stepPath] });
  // Open the screen block (this also clears the selection).
  store.openBlock(screenKey);
  // Focus the screen's root grid (path [] = the root grid).
  store.select([]);
}

/**
 * Returns from a linked screen to the flow block, re-selecting the step.
 * No-op when there is no `returnToFlow` recorded or when the flow block is not found.
 */
export function backToFlow(store: Store, session: Session): void {
  const ret = session.returnToFlow;
  if (!ret) return;

  // Find the flow block.
  const flowBlock = session.blocks.find((b) => b.kind === 'flow') ?? null;
  if (!flowBlock) return;

  // Clear returnToFlow first, then open the flow and re-select the step.
  store.setReturnToFlow(null);
  store.openBlock(flowBlock.key);
  // Select the step path.
  store.select([...ret.stepPath]);
}

/** Whether "Back to flow" should be available: a return target is stored. */
export function canGoBack(session: Session): boolean {
  return session.returnToFlow !== null;
}

/**
 * Whether "Open screen" should be available: a flow block is open, a step with a valid link is selected,
 * and the linked screen exists.
 */
export function canOpenScreen(session: Session): { available: true; screenKey: string; stepPath: readonly number[] } | { available: false } {
  const openBlock = session.blocks.find((b) => b.key === session.openBlockKey) ?? null;
  if (!openBlock || openBlock.kind !== 'flow') return { available: false };

  const path = session.selection?.blockKey === openBlock.key ? session.selection.path : null;
  if (path === null) return { available: false };

  const model = openBlock.classification.activity?.model ?? null;
  if (!model) return { available: false };

  const r = resolve(model, path);
  if (!r || r.type !== 'element' || r.element.kind !== 'step' || !r.element.link) return { available: false };

  const target = r.element.link.target;
  const screenBlock = session.blocks.find((b) => b.kind === 'screen' && b.name === target) ?? null;
  if (!screenBlock) return { available: false };

  return { available: true, screenKey: screenBlock.key, stepPath: path };
}
