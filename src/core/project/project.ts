// The open project: stored source and metadata, runtime block keys, and the derived block views
// (data-model §3.1, §3.2, §4.3, §7.1, §7.6; R-4).

import type { BlockKind, BlockStatus, MessageParams, RenderStatus } from '../types.ts';
import { split, type Segment } from '../blocks/split.ts';
import { blockStatus, classify, REASONS, type Classification } from '../blocks/classify.ts';
import { nameStatus } from '../names/names.ts';
import { chooseLineEnding, newScreenBlock } from './house-style.ts';
import { linksTo } from './links.ts';

/** data-model §3.2: a block's full text from the last time it parsed as category 1 or 2. */
export interface LastWorking {
  readonly blockIndex: number;
  readonly text: string;
}

/** The stored part of a project that the editor derives everything else from. */
export interface ProjectState {
  readonly source: string;
  /** Position in file order of the screen flow; kept once set (FR-006/AC18). */
  readonly flowIndex: number | null;
  readonly lastWorking: readonly LastWorking[];
}

/** With runtime block keys in file order. Keys survive edits and reorders within a session; never stored. */
export interface KeyedState extends ProjectState {
  readonly keys: readonly string[];
}

export type NameFlag = 'not-allowed' | 'not-nfc' | 'duplicate';

export interface BlockView {
  readonly key: string;
  readonly index: number;
  /** File-absolute, from the `@start…` line to just past the `@end…` line. */
  readonly start: number;
  readonly end: number;
  /** Start of the comment lines that move and delete with the block. */
  readonly commentStart: number;
  readonly opener: string;
  readonly kind: BlockKind;
  readonly name: string | null;
  readonly nameFlag: NameFlag | null;
  /** For an unnamed screen: n in "Untitled screen n", counting unnamed screens in file order. */
  readonly untitledNumber: number | null;
  readonly status: BlockStatus;
  readonly reasonKey: string | null;
  readonly reasonParams?: MessageParams;
  readonly renderStatus: RenderStatus;
  /** Steps in the flow linking to this screen (FR-015/AC2); 0 for other blocks. */
  readonly incomingLinks: number;
  readonly hasLastWorking: boolean;
  readonly classification: Classification;
}

export const NEW_PROJECT_NAME = 'Untitled project';
const FIRST_SCREEN = 'Screen-1';

type BlockSegment = Extract<Segment, { type: 'block' }>;

// Models are memoised on block text (R-14). simplified: cleared whole past 2000 texts, use an LRU if profiling shows churn.
const memo = new Map<string, Classification>();
function classified(text: string): Classification {
  let c = memo.get(text);
  if (!c) {
    if (memo.size >= 2000) memo.clear();
    c = classify(text);
    memo.set(text, c);
  }
  return c;
}

const blockSegments = (source: string) => split(source).filter((s): s is BlockSegment => s.type === 'block');
const isScreen = (s: BlockSegment) => s.opener.toLowerCase() === 'startsalt';

/** A new project (data-model §7.6). */
export function createProject(): ProjectState & { readonly name: string } {
  return { name: NEW_PROJECT_NAME, source: newScreenBlock(FIRST_SCREEN, '\n'), flowIndex: null, lastWorking: [] };
}

/** The first activity block in the current syntax that is category 1 or isolable category 2 (FR-006/AC14). */
export function chooseFlow(source: string): number | null {
  const i = blockSegments(source).findIndex((s) => classified(source.slice(s.start, s.end)).flowCandidate);
  return i === -1 ? null : i;
}

/** An imported file's source and flow. A file with no blocks is given one new screen (data-model §3.1). */
export function importSource(text: string): ProjectState {
  if (blockSegments(text).length > 0) return { source: text, flowIndex: chooseFlow(text), lastWorking: [] };
  const eol = chooseLineEnding({ file: text });
  const separator = text === '' || /[\r\n]$/.test(text) ? '' : eol;
  return { source: text + separator + newScreenBlock(FIRST_SCREEN, eol), flowIndex: null, lastWorking: [] };
}

/**
 * The flow after re-dividing the flow's own text into the blocks at `indices`: the one that keeps the flow's
 * name, else the first activity block, else none (data-model §4.3).
 */
export function flowAfterRedivision(source: string, indices: readonly number[], flowName: string | null): number | null {
  const segments = blockSegments(source);
  const named = indices.find((i) => flowName !== null && segments[i]?.name === flowName);
  if (named !== undefined) return named;
  const activity = indices.find((i) => {
    const s = segments[i];
    return s !== undefined && classified(source.slice(s.start, s.end)).syntax === 'activity';
  });
  return activity ?? null;
}

export function withKeys(state: ProjectState, newKey: () => string): KeyedState {
  return { ...state, keys: blockSegments(state.source).map(() => newKey()) };
}

/**
 * Carries the metadata to a new segmentation (R-4). `order[newIndex]` is the block's old index, or `null` for a
 * new block. Inserts, deletes, reorders and re-divisions all go through here.
 */
export function remap(state: KeyedState, source: string, order: readonly (number | null)[], newKey: () => string): KeyedState {
  const newIndexOf = (old: number) => {
    const i = order.indexOf(old);
    return i === -1 ? null : i;
  };
  const lastWorking: LastWorking[] = [];
  for (const entry of state.lastWorking) {
    const blockIndex = newIndexOf(entry.blockIndex);
    if (blockIndex !== null) lastWorking.push({ blockIndex, text: entry.text });
  }
  return {
    source,
    flowIndex: state.flowIndex === null ? null : newIndexOf(state.flowIndex),
    lastWorking: lastWorking.sort((a, b) => a.blockIndex - b.blockIndex),
    keys: order.map((old) => (old === null ? newKey() : (state.keys[old] ?? newKey()))),
  };
}

/**
 * Last working versions after an edit that keeps the block count (data-model §3.2). A screen or the flow that
 * becomes category 3 keeps the text it had before; one that parses as category 1 or 2 has its entry removed.
 */
export function nextLastWorking(prevSource: string, nextSource: string, flowIndex: number | null, lastWorking: readonly LastWorking[]): LastWorking[] {
  const before = blockSegments(prevSource);
  const after = blockSegments(nextSource);
  const out: LastWorking[] = [];
  after.forEach((segment, i) => {
    const existing = lastWorking.find((e) => e.blockIndex === i);
    if (!isScreen(segment) && i !== flowIndex) {
      if (existing) out.push(existing);
      return;
    }
    if (classified(nextSource.slice(segment.start, segment.end)).category !== 3) return;
    if (existing) {
      out.push(existing);
      return;
    }
    const old = before.length === after.length ? before[i] : undefined;
    const oldText = old ? prevSource.slice(old.start, old.end) : null;
    const oldCategory = oldText === null ? null : classified(oldText).category;
    if (oldText !== null && (oldCategory === 1 || oldCategory === 2)) out.push({ blockIndex: i, text: oldText });
  });
  return out;
}

const FLAGS: Partial<Record<ReturnType<typeof nameStatus>, NameFlag>> = {
  notAllowed: 'not-allowed',
  notNormalised: 'not-nfc',
  duplicate: 'duplicate',
};

/** Every block in file order with its derived state (data-model §4.3, §7.1). */
export function blocks(state: KeyedState, renders: ReadonlyMap<string, RenderStatus> = new Map()): BlockView[] {
  const { source, flowIndex } = state;
  const segments = blockSegments(source);
  const kinds: BlockKind[] = segments.map((s, i) => (isScreen(s) ? 'screen' : i === flowIndex ? 'flow' : 'other'));
  const named = segments.map((s, i) => (kinds[i] === 'other' ? null : s.name));
  const flowModel = flowIndex === null ? null : (segments[flowIndex] ? classified(source.slice(segments[flowIndex].start, segments[flowIndex].end)).activity?.model ?? null : null);
  let untitled = 0;

  return segments.map((s, i) => {
    const kind = kinds[i]!;
    const c = classified(source.slice(s.start, s.end));
    const renderStatus = renders.get(state.keys[i]!) ?? 'Not yet checked';
    const status = blockStatus(kind, c, renderStatus === 'failed');
    const flag = kind === 'other' ? undefined : FLAGS[nameStatus(s.name, named.filter((_, j) => j !== i))];
    // A block that could be the flow but is not has no problem of its own; say why it is other content.
    const extra = kind === 'other' && c.flowCandidate;
    return {
      key: state.keys[i]!,
      index: i,
      start: s.start,
      end: s.end,
      commentStart: s.commentStart,
      opener: s.opener,
      kind,
      name: s.name,
      nameFlag: flag ?? null,
      untitledNumber: kind === 'screen' && s.name === null ? ++untitled : null,
      status,
      reasonKey: extra ? REASONS.extraActivity : c.reasonKey,
      ...(c.reasonParams && !extra ? { reasonParams: c.reasonParams } : {}),
      renderStatus,
      incomingLinks: kind === 'screen' && s.name !== null && flowModel ? linksTo(flowModel, s.name).length : 0,
      hasLastWorking: state.lastWorking.some((e) => e.blockIndex === i),
      classification: c,
    };
  });
}
