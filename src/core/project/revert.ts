// "Revert to last working version" (FR-010/AC4, FR-006/AC15, data-model §3.2 and §7.4).
// The block's text is replaced by its stored last working version as one undoable operation. The edit is kept
// minimal (only the text the two versions do not share is replaced), so the source view flashes only what
// changed. Once applied the block parses again, so the store's `nextLastWorking` removes its entry; undo
// restores the entry with the invalid text through the history's `metaBefore`.
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { OpResult, TextEdit } from '../types.ts';
import { split } from '../blocks/split.ts';
import type { ProjectState } from './project.ts';

/** Message keys (src/ui/messages/en/blocks.ts). */
export const REVERT_KEYS = {
  history: 'blocks.history.revert',
  announce: 'blocks.announce.reverted',
  none: 'blocks.revert.none',
} as const;

/** One edit turning `from` into `to`, replacing only the differing middle; offsets are shifted by `base`. */
function minimalEdit(from: string, to: string, base: number): TextEdit {
  let prefix = 0;
  const max = Math.min(from.length, to.length);
  while (prefix < max && from[prefix] === to[prefix]) prefix++;
  let suffix = 0;
  while (suffix < max - prefix && from[from.length - 1 - suffix] === to[to.length - 1 - suffix]) suffix++;
  return { start: base + prefix, end: base + from.length - suffix, text: to.slice(prefix, to.length - suffix) };
}

/** Restores block `blockIndex` (file order) to its last working version, or refuses when it has none. */
export function revertToLastWorking(state: ProjectState, blockIndex: number): OpResult {
  const entry = state.lastWorking.find((e) => e.blockIndex === blockIndex);
  const block = split(state.source).filter((s) => s.type === 'block')[blockIndex];
  if (!entry || !block) return { ok: false, messageKey: REVERT_KEYS.none };
  const current = state.source.slice(block.start, block.end);
  if (current === entry.text) return { ok: false, messageKey: REVERT_KEYS.none };
  return {
    ok: true,
    edits: [minimalEdit(current, entry.text, block.start)],
    select: [],
    announceKey: REVERT_KEYS.announce,
    historyName: REVERT_KEYS.history,
  };
}
