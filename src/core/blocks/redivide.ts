// Re-division on leaving the source view (spec section 4.2 "Block boundaries", FR-004/AC10, FR-011/AC15,
// data-model §4.3 and §7.2, contracts/core-api.md §2).
//
// While a block's source is being typed in, its boundaries are fixed. On leaving, if the typed text no longer
// forms exactly that one block, the file is re-divided once: the text is kept exactly as typed, the file's blocks
// are found again, and the metadata follows them through `order` (R-4). This module only computes the change;
// the caller warns, refuses or applies it as one undoable step.

import type { TextEdit } from '../types.ts';
import { split, type Segment } from './split.ts';
import { classify } from './classify.ts';
import { flowAfterRedivision } from '../project/project.ts';
import { linksTo } from '../project/links.ts';

type BlockSegment = Extract<Segment, { type: 'block' }>;

export interface Redivision {
  /** Puts the typed text in place of the block, unchanged. */
  readonly edits: TextEdit[];
  /** `order[newIndex]` is the block's old index, `null` for a block the re-division creates (as `remap` takes). */
  readonly order: (number | null)[];
  /** The screen flow's index afterwards (data-model §4.3). */
  readonly flowIndex: number | null;
  /** How many blocks the typed text forms. */
  readonly blockCount: number;
  /** The new index of the block that keeps the edited block's identity (key, revert target), or `null`. */
  readonly keeperIndex: number | null;
  /** Names of screens the re-division removes that steps link to: the user is warned first (FR-004/AC10). */
  readonly removedLinkedScreens: string[];
  /** The project would have no block left: refused (FR-011/AC15, EC-01). */
  readonly removesLastBlock: boolean;
}

const blockSegments = (source: string) => split(source).filter((s): s is BlockSegment => s.type === 'block');
const isScreen = (s: BlockSegment) => s.opener.toLowerCase() === 'startsalt';

/**
 * The re-division of the block at `blockStart`–`blockEnd` when its text becomes `text` (by default the text
 * already there), or `null` when the text still forms exactly that one block with the file's other blocks
 * unchanged. `flowIndex` is the screen flow's index before the change.
 */
export function redivide(
  source: string,
  blockStart: number,
  blockEnd: number,
  text: string = source.slice(blockStart, blockEnd),
  flowIndex: number | null = null,
): Redivision | null {
  const before = blockSegments(source);
  const e = before.findIndex((b) => b.start === blockStart && b.end === blockEnd);
  if (e === -1) throw new RangeError(`${blockStart}–${blockEnd} is not a block of the source`);
  const edited = before[e]!;
  const next = source.slice(0, blockStart) + text + source.slice(blockEnd);
  const after = blockSegments(next);
  const delta = text.length - (blockEnd - blockStart);
  const rangeEnd = blockStart + text.length;

  const unchanged =
    after.length === before.length &&
    after.every((n, i) => {
      const o = before[i]!;
      if (i < e) return n.start === o.start && n.end === o.end;
      if (i === e) return n.start === blockStart && n.end === rangeEnd;
      return n.start === o.start + delta && n.end === o.end + delta;
    });
  if (unchanged) return null;

  // Blocks before and after the typed text are the same blocks as before; those inside it are found again.
  const inRange: number[] = [];
  const order = after.map((n, j): number | null => {
    if (n.start < blockStart) {
      const i = before.findIndex((o, k) => k < e && o.start === n.start);
      return i === -1 ? null : i;
    }
    if (n.start < rangeEnd) {
      inRange.push(j);
      return null;
    }
    const i = before.findIndex((o, k) => k > e && o.start + delta === n.start);
    return i === -1 ? null : i;
  });

  const wasFlow = flowIndex !== null && e === flowIndex;
  let keeper: number | null;
  if (wasFlow) {
    keeper = flowAfterRedivision(next, inRange, edited.name);
  } else {
    const opener = edited.opener.toLowerCase();
    keeper =
      inRange.find((j) => after[j]!.opener.toLowerCase() === opener && after[j]!.name === edited.name) ??
      (isScreen(edited) ? inRange.find((j) => isScreen(after[j]!)) : undefined) ??
      inRange[0] ??
      null;
  }
  if (keeper !== null) order[keeper] = e;

  const newFlowIndex = wasFlow ? keeper : flowIndex === null ? null : nullIfMissing(order.indexOf(flowIndex));

  const removedLinkedScreens: string[] = [];
  if (isScreen(edited) && edited.name !== null && !inRange.some((j) => isScreen(after[j]!)) && flowIndex !== null && !wasFlow) {
    const f = before[flowIndex];
    const model = f ? classify(source.slice(f.start, f.end)).activity?.model : undefined;
    if (model && linksTo(model, edited.name).length > 0) removedLinkedScreens.push(edited.name);
  }

  return {
    edits: [{ start: blockStart, end: blockEnd, text }],
    order,
    flowIndex: newFlowIndex,
    blockCount: inRange.length,
    keeperIndex: keeper,
    removedLinkedScreens,
    removesLastBlock: after.length === 0,
  };
}

const nullIfMissing = (i: number): number | null => (i === -1 ? null : i);
