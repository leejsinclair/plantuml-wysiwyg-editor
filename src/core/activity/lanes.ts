// Lane switch writing (section 3.7, OD-8, FR-012/AC10, AC12, data-model §5.3 Lane).
//
// In activity source a `|Lane|` switch applies to every following statement in source order, across branches
// too, and PlantUML orders lanes by first appearance. The editor therefore never stores a lane per element: an
// operation states the lane each step, decision, loop and locked part should have and the lane list order, and
// `reconcileLanes` writes the fewest switch changes that make the source say exactly that:
//
// - The header: the switches before the first statement. PlantUML 1.2026.9 rejects a flow whose first switch
//   follows any statement, `start` included ("This swimlane must be defined at the start of the diagram"), so
//   the first switch is always written there. The header also declares lanes in list order when the switches
//   further down would not (a lane with no elements yet, or a reordered list), then switches back to the lane
//   in effect at the start.
// - The body: walking elements in source order, a switch is inserted before an element whose lane differs from
//   the one in effect, an existing switch is renamed when that is enough, and switches that no longer change
//   anything are removed. Later lanes, new ones included, may switch anywhere.
// - With no lanes, every switch is removed.
//
// Switches inside a locked part are part of its text and never changed.
import type { Path, TextEdit, TextRange } from '../types.ts';
import { applyEdits } from '../source/edits.ts';
import { parseActivity } from './parser.ts';
import type { FlowElement, LaneSwitch, ScreenFlow } from './model.ts';
import { atLineStart, eolOf, indentAt, isPrefix, lineEnd, lineStart, walk, type ElementRef, type FlowDoc } from './destinations.ts';

/** Elements that have a lane: steps, decisions, loops and locked parts. */
export type LanedElement = Exclude<FlowElement, { kind: 'start' } | { kind: 'stop' }>;
export const isLaned = (e: FlowElement): e is LanedElement => e.kind !== 'start' && e.kind !== 'stop';

/** The laned elements in source order. */
export const lanedElements = (model: ScreenFlow): ElementRef[] => walk(model).filter((r) => isLaned(r.element));

const nfc = (s: string) => s.normalize('NFC');

/**
 * Why a lane name cannot be used, as a message key, or `null`. Names are non-empty, contain no `|` and no line
 * break, and are unique within the flow after NFC (data-model §5.3 Lane).
 */
export function checkLaneName(name: string, others: readonly string[]): string | null {
  if (name.trim() === '') return 'flow.refused.laneEmpty';
  if (/[|\r\n]/.test(name)) return 'flow.refused.laneBar';
  if (others.some((o) => nfc(o) === nfc(name.trim()))) return 'flow.refused.laneTaken';
  return null;
}

/** Whether any element is in the lane. */
export const laneInUse = (model: ScreenFlow, lane: string): boolean =>
  lanedElements(model).some((r) => (r.element as LanedElement).lane === lane);

/** The lane in effect at `offset`: the last switch before it, else `null`. */
export function laneAt(model: ScreenFlow, offset: number): string | null {
  let lane: string | null = null;
  for (const s of model.laneSwitches) if (s.range.start < offset) lane = s.lane;
  return lane;
}

export interface LanePlan {
  /** The lane list, in the order the render shows it. Empty: the flow has no lanes. */
  readonly order: readonly string[];
  /** Existing switches naming a key now name its value (rename; a deleted lane's destination). */
  readonly rename?: ReadonlyMap<string, string>;
  /** The lane each laned element should have, by its position in `lanedElements` order. */
  laneOf(index: number, ref: ElementRef): string | null;
}

const uniq = (xs: readonly string[]): string[] => [...new Set(xs)];
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The edits (block-relative) that make the block's lane switches match `plan`. */
export function reconcileLanes(text: string, model: ScreenFlow, plan: LanePlan): TextEdit[] {
  const eol = eolOf(text);
  const edits: TextEdit[] = [];
  const laned = lanedElements(model);
  const locked = laned.filter((r) => r.element.kind === 'locked').map((r) => r.element.range);
  const inside = (s: LaneSwitch, ranges: readonly TextRange[]) => ranges.some((r) => s.range.start >= r.start && s.range.end <= r.end);
  const fixed = model.laneSwitches.filter((s) => inside(s, locked));
  const free = model.laneSwitches.filter((s) => !inside(s, locked));

  /** Removes a switch: its whole line when it stands alone on it. */
  const removeSwitch = (s: LaneSwitch): void => {
    const alone = atLineStart(text, s.range.start) && /^[ \t]*(?:\r\n|\r|\n|$)/.test(text.slice(s.range.end));
    edits.push(alone ? { start: lineStart(text, s.range.start), end: lineEnd(text, s.range.start), text: '' } : { start: s.range.start, end: s.range.end, text: '' });
  };

  if (plan.order.length === 0) {
    for (const s of free) removeSwitch(s);
    return edits;
  }

  const order = plan.order;
  const mapped = (s: LaneSwitch): string | null => {
    const lane = plan.rename?.get(s.lane) ?? s.lane;
    return order.includes(lane) ? lane : null;
  };
  /** Renames a kept switch when its lane name changes; decorations such as a colour are kept. */
  const keepSwitch = (s: LaneSwitch, lane: string): void => {
    if (s.lane !== lane) edits.push({ start: s.nameRange.start, end: s.nameRange.end, text: lane });
  };

  const firstElement = model.main.elements[0];
  const firstStatement = firstElement ? firstElement.range.start : text.length;
  const header = free.filter((s) => s.range.start < firstStatement);
  const body = free.filter((s) => s.range.start >= firstStatement);
  const desired = laned.map((r, i) => plan.laneOf(i, r) ?? order[0]!);

  // The lane in effect after the header: kept when it is still a lane, else the first element's.
  const lastHeader = header.length > 0 ? mapped(header[header.length - 1]!) : null;
  const firstBodyEvent = Math.min(body[0]?.range.start ?? Infinity, fixed[0]?.range.start ?? Infinity);
  const firstLaned = laned[0] && laned[0].element.range.start < firstBodyEvent ? desired[0]! : null;
  const headerLane = lastHeader ?? firstLaned ?? order[0]!;

  // ---- body
  type Event = { at: number; sw?: LaneSwitch; fixed?: boolean; el?: number };
  const events: Event[] = [
    ...body.map((sw): Event => ({ at: sw.range.start, sw })),
    ...fixed.map((sw): Event => ({ at: sw.range.start, sw, fixed: true })),
    ...laned.map((r, i): Event => ({ at: r.element.range.start, el: i })),
  ].sort((a, b) => a.at - b.at || (a.sw ? -1 : 1));
  const appearance: string[] = [];
  let current = headerLane;
  let pending: LaneSwitch[] = [];
  const keepPending = (): void => {
    for (const s of pending) {
      const lane = mapped(s);
      if (lane === null) removeSwitch(s);
      else {
        keepSwitch(s, lane);
        appearance.push(lane);
        current = lane;
      }
    }
    pending = [];
  };
  for (const ev of events) {
    if (ev.sw && ev.fixed) {
      keepPending();
      appearance.push(ev.sw.lane);
      current = ev.sw.lane;
    } else if (ev.sw) {
      pending.push(ev.sw);
    } else if (ev.el !== undefined) {
      const d = desired[ev.el]!;
      const ref = laned[ev.el]!;
      const valid = pending.filter((s) => mapped(s) !== null);
      for (const s of pending) if (mapped(s) === null) removeSwitch(s);
      if (valid.length === 0) {
        if (d !== current) insertBefore(ref.element, d);
      } else if (d === current && !valid.every((s) => mapped(s) === d)) {
        for (const s of valid) removeSwitch(s);
      } else {
        const last = valid[valid.length - 1]!;
        for (const s of valid.slice(0, -1)) {
          keepSwitch(s, mapped(s)!);
          appearance.push(mapped(s)!);
        }
        keepSwitch(last, d);
        appearance.push(d);
      }
      pending = [];
      if (d !== current) appearance.push(d);
      current = d;
    }
  }
  keepPending();

  // ---- header
  const extra = appearance.filter((l) => !order.includes(l));
  const target = uniq([...order, ...extra]);
  const existing = header.map(mapped);
  const existingValid =
    header.length > 0 &&
    existing.every((l) => l !== null) &&
    existing[existing.length - 1] === headerLane &&
    same(uniq([...(existing as string[]), ...appearance]), target);
  if (existingValid) {
    header.forEach((s, i) => keepSwitch(s, existing[i]!));
  } else {
    let lanes: string[] = [headerLane];
    for (let k = 0; k <= order.length; k++) {
      const prefix = order.slice(0, k);
      if (same(uniq([...prefix, headerLane, ...appearance]), target)) {
        lanes = prefix[prefix.length - 1] === headerLane ? prefix : [...prefix, headerLane];
        break;
      }
    }
    const indent = firstElement ? indentAt(text, firstElement.range.start) : '';
    /** A header line: an existing switch's text (keeping its decoration) or a new `|Lane|`. */
    const lineFor = (lane: string): string => {
      const s = header.find((h) => mapped(h) === lane);
      if (!s) return `${indent}|${lane}|`;
      const src = text.slice(s.range.start, s.range.end);
      return indent + src.slice(0, s.nameRange.start - s.range.start) + lane + src.slice(s.nameRange.end - s.range.start);
    };
    const newLines = lanes.map((l) => lineFor(l) + eol).join('');
    if (header.length > 0) {
      const from = lineStart(text, header[0]!.range.start);
      const to = lineEnd(text, header[header.length - 1]!.range.start);
      // Keep any comment lines between header switches, above the new header.
      const kept = text
        .slice(from, to)
        .match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g)!
        .filter((line) => !header.some((h) => line.trim() === text.slice(h.range.start, h.range.end).trim()))
        .join('');
      edits.push({ start: from, end: to, text: kept + newLines });
    } else {
      const at = firstElement ? (firstElement.leadingComments[0]?.start ?? firstElement.range.start) : text.length;
      const pos = firstElement ? lineStart(text, at) : endDirectiveLine(text);
      edits.push({ start: pos, end: pos, text: newLines });
    }
  }
  return edits;

  function insertBefore(element: FlowElement, lane: string): void {
    const at = element.leadingComments[0]?.start ?? element.range.start;
    if (atLineStart(text, at)) {
      const pos = lineStart(text, at);
      edits.push({ start: pos, end: pos, text: `${indentAt(text, at)}|${lane}|${eol}` });
    } else {
      edits.push({ start: at, end: at, text: `${eol}${indentAt(text, at)}|${lane}|${eol}` });
    }
  }
}

/** Start of the `@enduml` line, or the text end. */
function endDirectiveLine(text: string): number {
  const m = /^[ \t]*@end\w*/im.exec(text);
  return m ? m.index : text.length;
}

/** The lane plan that keeps every element in the lane it has (for operations that only change lanes' list). */
export const keepLanes: LanePlan['laneOf'] = (_index, ref) => (ref.element as LanedElement).lane;

// ------------------------------------------------------------------------------------- operations' lanes

/** How a structural change moved elements, so every element keeps its lane (section 3.7). */
export interface Carry {
  /** An old subtree that is gone (a removed element or branch). */
  readonly removed?: Path;
  /** A new subtree, every element of it in `addedLane`. */
  readonly added?: Path;
  readonly addedLane?: string | null;
  /** An old subtree now at `movedTo` in the new model, with the same shape. */
  readonly movedFrom?: Path;
  readonly movedTo?: Path;
}

/**
 * The lane each element of `after` should have: an element that existed before keeps its lane, matched by
 * source order outside the changed subtree; moved elements keep theirs; new ones take `addedLane`.
 */
export function carryLanes(before: ScreenFlow, after: ScreenFlow, carry: Carry): LanePlan['laneOf'] {
  const old = lanedElements(before);
  const under = (p: Path | undefined, ref: ElementRef) => p !== undefined && isPrefix(p, ref.path);
  const rest = old.filter((r) => !under(carry.removed, r) && !under(carry.movedFrom, r)).map((r) => (r.element as LanedElement).lane);
  const moved = old.filter((r) => under(carry.movedFrom, r)).map((r) => (r.element as LanedElement).lane);
  const lanes: (string | null)[] = [];
  let k = 0;
  let m = 0;
  for (const ref of lanedElements(after)) {
    if (under(carry.added, ref)) lanes.push(carry.addedLane ?? null);
    else if (under(carry.movedTo, ref)) lanes.push(moved[m++] ?? null);
    else lanes.push(rest[k++] ?? (ref.element as LanedElement).lane);
  }
  return (index) => lanes[index] ?? null;
}

/**
 * Applies block-relative structural edits, then rewrites the lane switches so lanes follow `carry` (or `plan`),
 * and returns the new block text; `null` when the result would not parse as a flow.
 */
export function rewrite(doc: FlowDoc, structural: readonly TextEdit[], carry: Carry, plan?: Partial<LanePlan>): string | null {
  const text = applyEdits(doc.text, structural);
  const model = parseActivity(text).model;
  if (!model) return null;
  const order = plan?.order ?? doc.model.lanes.map((l) => l.name);
  const laneOf = plan?.laneOf ?? carryLanes(doc.model, model, carry);
  const next = applyEdits(text, reconcileLanes(text, model, { order, laneOf, ...(plan?.rename ? { rename: plan.rename } : {}) }));
  return parseActivity(next).model ? next : null;
}
