// Screen and block operations for the project panel (T127; FR-011, FR-015/AC4, section 3.6, project-file.md §6
// and §7, data-model §3.1 and R-4). Each operation returns text edits plus the new block order
// (`order[newIndex]` = old index, `null` for a new block) so the caller carries block keys, `flowIndex` and
// `lastWorking` across it (`remap`). Message keys are in src/ui/messages/en/screens.ts. Pure: no DOM.
//
// - Add goes after the last screen, or at the end of the file when there is none.
// - Rename commits the typed text through `commitName`, refuses empty and duplicate names, and retargets every
//   linking step in the same edits.
// - Duplicate goes directly after the original, named `Copy-of-<name>` (else `Screen-n`).
// - Reorder exchanges a block with the nearest block of the same kind, each with its attached comment lines.
// - Delete removes the block with its attached comments and refuses the project's last block.

import type { MessageParams, Path, TextEdit } from '../types.ts';
import type { Step } from '../activity/model.ts';
import { applyEdits } from '../source/edits.ts';
import { commitName, generate } from '../names/names.ts';
import { chooseLineEnding, newScreenBlock } from './house-style.ts';
import { linksTo, retargetEdits } from './links.ts';
import { blocks, nextLastWorking, remap, type BlockView, type ProjectState } from './project.ts';

export interface BlockOpOk {
  readonly ok: true;
  readonly edits: readonly TextEdit[];
  /** `order[newIndex]` is the block's old index, `null` for a new block. */
  readonly order: readonly (number | null)[];
  /** The block to open afterwards, by its new index; `null` keeps the open block. */
  readonly open: number | null;
  readonly select: Path;
  readonly announceKey: string;
  readonly announceParams: MessageParams;
  readonly historyName: string;
}

export interface Refused {
  readonly ok: false;
  readonly messageKey: string;
  readonly params?: MessageParams;
}

export type BlockOp = BlockOpOk | Refused;
export type AddResult = BlockOpOk & { readonly name: string; readonly index: number };
export type RenameOp = (BlockOpOk & { readonly name: string; readonly previous: string | null; readonly affected: readonly Step[] }) | Refused;
export type DuplicateOp = (BlockOpOk & { readonly name: string }) | Refused;
export type DeleteOp = (BlockOpOk & { readonly affected: readonly Step[] }) | Refused;
export type Direction = 'up' | 'down';

export interface OpOptions {
  /** How the block is named in messages when it has no name ("Untitled screen 2", "@startuml (block 3)"). */
  readonly label?: string;
}

const EOL_AT_END = /(\r\n|\r|\n)$/;
const START_LINE = /^([ \t]*@start[A-Za-z0-9_]+)([ \t]*)(.*?)[ \t]*$/;

function views(state: ProjectState): BlockView[] {
  return blocks({ ...state, keys: [] });
}

const labelOf = (b: BlockView, options?: OpOptions) => options?.label ?? b.name ?? `@${b.opener}`;
const identity = (n: number) => Array.from({ length: n }, (_, i) => i);
/** Names of screens and the flow: one namespace (section 3.6). Other content's names are not compared. */
const namedOthers = (all: readonly BlockView[], except: number) => all.filter((b) => b.kind !== 'other' && b.index !== except).map((b) => b.name);
const flowOf = (all: readonly BlockView[]) => all.find((b) => b.kind === 'flow') ?? null;

/** The edit that sets the name on a block's start line, `at` being where the start line begins. */
function nameEdit(text: string, at: number, name: string): TextEdit {
  const lineEnd = text.slice(at).search(/\r|\n/);
  const line = text.slice(at, lineEnd === -1 ? text.length : at + lineEnd);
  const m = START_LINE.exec(line);
  if (!m) throw new Error('A block must start with an @start line');
  const [, opener, space, current] = m as unknown as [string, string, string, string];
  if (current === '') return { start: at + opener.length, end: at + opener.length + space.length, text: ` ${name}` };
  const start = at + opener.length + space.length;
  return { start, end: start + current.length, text: name };
}

/** The text to insert at `offset` so that `block` starts on its own line after a blank line. */
function insertion(source: string, offset: number, block: string, eol: string): string {
  const needsLine = offset > 0 && !/[\r\n]$/.test(source.slice(0, offset));
  return (needsLine ? eol : '') + eol + block;
}

const withEol = (text: string, eol: string) => (EOL_AT_END.test(text) ? text : text + eol);

/** The steps linking to the block (screens only), in source order. */
export function linkedSteps(state: ProjectState, index: number): Step[] {
  const all = views(state);
  const block = all[index];
  const flow = flowOf(all)?.classification.activity?.model ?? null;
  if (!block || block.kind !== 'screen' || block.name === null || !flow) return [];
  return linksTo(flow, block.name);
}

/** A new empty screen after the last screen (or at the end of the file), named `Screen-n` unless `name` is given. */
export function addScreen(state: ProjectState, options: { readonly name?: string } = {}): AddResult {
  const all = views(state);
  const taken = new Set(all.filter((b) => b.kind !== 'other' && b.name !== null).map((b) => b.name!));
  const name = options.name ?? generate('screen', taken);
  const eol = chooseLineEnding({ file: state.source });
  const lastScreen = all.filter((b) => b.kind === 'screen').at(-1) ?? null;
  const offset = lastScreen ? lastScreen.end : state.source.length;
  const index = lastScreen ? lastScreen.index + 1 : all.length;
  const order: (number | null)[] = identity(all.length);
  order.splice(index, 0, null);
  return {
    ok: true,
    edits: [{ start: offset, end: offset, text: insertion(state.source, offset, newScreenBlock(name, eol), eol) }],
    order,
    open: index,
    select: [],
    announceKey: 'screens.added',
    announceParams: { name },
    historyName: 'screens.history.add',
    name,
    index,
  };
}

/** Renames a screen or the flow to the committed form of `typed`, updating every linking step in the same edits. */
export function renameBlock(state: ProjectState, index: number, typed: string, options?: OpOptions): RenameOp {
  const all = views(state);
  const block = all[index];
  if (!block) throw new RangeError(`No block ${index}`);
  const result = commitName(typed, namedOthers(all, index));
  if (!result.ok) {
    return result.reason === 'empty'
      ? { ok: false, messageKey: 'screens.rename.empty' }
      : { ok: false, messageKey: 'screens.rename.duplicate', params: { name: result.conflictsWith } };
  }
  const { name } = result;
  const old = labelOf(block, options);
  const base = { ok: true as const, order: identity(all.length), open: null, select: [], historyName: 'screens.history.rename', name, previous: block.name };
  if (name === block.name) return { ...base, edits: [], affected: [], announceKey: 'screens.renamed', announceParams: { old, name } };

  const edits: TextEdit[] = [nameEdit(state.source, block.start, name)];
  const flow = flowOf(all);
  const flowModel = flow?.classification.activity?.model ?? null;
  const affected = block.kind === 'screen' && block.name !== null && flowModel ? linksTo(flowModel, block.name) : [];
  if (affected.length > 0) edits.push(...retargetEdits(flowModel!, flow!.start, block.name!, name));
  return {
    ...base,
    edits,
    affected,
    announceKey: affected.length > 0 ? 'screens.renamedWithLinks' : 'screens.renamed',
    announceParams: affected.length > 0 ? { old, name, count: affected.length } : { old, name },
  };
}

/** A copy of a screen directly after it, with a generated name and so no incoming links. */
export function duplicateScreen(state: ProjectState, index: number, options?: OpOptions): DuplicateOp {
  const all = views(state);
  const block = all[index];
  if (!block || block.kind !== 'screen') throw new RangeError(`Block ${index} is not a screen`);
  const taken = new Set(all.filter((b) => b.kind !== 'other' && b.name !== null).map((b) => b.name!));
  const name = generate({ copyOf: block.name }, taken);
  const eol = chooseLineEnding({ block: state.source.slice(block.start, block.end), file: state.source });
  const original = withEol(state.source.slice(block.start, block.end), eol);
  const copy = applyEdits(original, [nameEdit(original, 0, name)]);
  const order: (number | null)[] = identity(all.length);
  order.splice(index + 1, 0, null);
  return {
    ok: true,
    edits: [{ start: block.end, end: block.end, text: insertion(state.source, block.end, copy, eol) }],
    order,
    open: index + 1,
    select: [],
    announceKey: 'screens.duplicated',
    announceParams: { old: labelOf(block, options), name },
    historyName: 'screens.history.duplicate',
    name,
  };
}

/** The nearest block of the same kind in `direction`, or `null`. The flow has none. */
function neighbour(all: readonly BlockView[], index: number, direction: Direction): BlockView | null {
  const block = all[index];
  if (!block || block.kind === 'flow') return null;
  const same = all.filter((b) => b.kind === block.kind);
  const at = same.findIndex((b) => b.index === index);
  return same[direction === 'up' ? at - 1 : at + 1] ?? null;
}

export function canMove(state: ProjectState, index: number, direction: Direction): boolean {
  return neighbour(views(state), index, direction) !== null;
}

/** Exchanges the block with the nearest block of its kind, each with its attached comment lines. */
export function moveBlock(state: ProjectState, index: number, direction: Direction, options?: OpOptions): BlockOp {
  const all = views(state);
  const block = all[index];
  if (!block) throw new RangeError(`No block ${index}`);
  const other = neighbour(all, index, direction);
  const label = labelOf(block, options);
  if (!other) return { ok: false, messageKey: direction === 'up' ? 'screens.move.first' : 'screens.move.last', params: { name: label } };

  const [first, second] = other.index < index ? [other, block] : [block, other];
  let firstText = state.source.slice(first.commentStart, first.end);
  let secondText = state.source.slice(second.commentStart, second.end);
  // Only the file's last block can lack a line ending; keep the file that way after the exchange.
  if (!EOL_AT_END.test(secondText)) {
    const eol = EOL_AT_END.exec(firstText)?.[1] ?? chooseLineEnding({ file: state.source });
    secondText += eol;
    firstText = firstText.replace(EOL_AT_END, '');
  }
  const order = identity(all.length);
  order[first.index] = second.index;
  order[second.index] = first.index;
  return {
    ok: true,
    edits: [
      { start: first.commentStart, end: first.end, text: secondText },
      { start: second.commentStart, end: second.end, text: firstText },
    ],
    order,
    open: null,
    select: [],
    announceKey: direction === 'up' ? 'screens.movedUp' : 'screens.movedDown',
    announceParams: { name: label },
    historyName: 'screens.history.move',
  };
}

const BLANK_LINE_AFTER = /^[ \t]*(\r\n|\r|\n)/;
const BLANK_LINE_BEFORE = /(?:^|\r\n|\r|\n)([ \t]*(\r\n|\r|\n))$/;

/** Deletes a block with its attached comments. The steps linking to a deleted screen are kept, now broken. */
export function deleteBlock(state: ProjectState, index: number, options?: OpOptions): DeleteOp {
  const all = views(state);
  const block = all[index];
  if (!block) throw new RangeError(`No block ${index}`);
  if (all.length === 1) return { ok: false, messageKey: 'screens.delete.last' };

  const { source } = state;
  let from = block.commentStart;
  let to = block.end;
  const before = source.slice(0, from);
  const atStart = before === '' || before === '﻿';
  const blankBefore = atStart || BLANK_LINE_BEFORE.test(before);
  const after = BLANK_LINE_AFTER.exec(source.slice(to));
  // Leave one blank line where the block was, not two.
  if (after && blankBefore) to += after[0].length;
  else if (to === source.length && !atStart) {
    const m = BLANK_LINE_BEFORE.exec(before);
    if (m) from -= m[1]!.length;
  }

  const affected = linkedSteps(state, index);
  const order = identity(all.length).filter((i) => i !== index);
  const same = all.filter((b) => b.kind === block.kind);
  const at = same.findIndex((b) => b.index === index);
  const next = same[at + 1] ?? same[at - 1] ?? null;
  const name = labelOf(block, options);
  return {
    ok: true,
    edits: [{ start: from, end: to, text: '' }],
    order,
    open: next === null ? null : order.indexOf(next.index),
    select: [],
    announceKey: affected.length > 0 ? 'screens.deletedBrokenLinks' : 'screens.deleted',
    announceParams: affected.length > 0 ? { name, count: affected.length } : { name },
    historyName: 'screens.history.delete',
    affected,
  };
}

/**
 * The project after an operation, for callers without the session store (which does the same with block keys):
 * `flowIndex` and `lastWorking` follow the blocks.
 */
export function applyBlockOp(state: ProjectState, op: BlockOpOk): ProjectState {
  const source = applyEdits(state.source, op.edits);
  const count = views(state).length;
  const unchanged = op.order.length === count && op.order.every((old, i) => old === i);
  if (unchanged) return { source, flowIndex: state.flowIndex, lastWorking: nextLastWorking(state.source, source, state.flowIndex, state.lastWorking) };
  const { flowIndex, lastWorking } = remap({ ...state, keys: [] }, source, op.order, () => '');
  return { source, flowIndex, lastWorking };
}
