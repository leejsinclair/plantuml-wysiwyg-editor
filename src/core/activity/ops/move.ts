// Flow moves (section 3.2 "Keys", section 3.7, FR-009/AC2, FR-012/AC12, AC13; VO-036, VO-099).
//
// - `move` places an element at any destination `validDestinations` offers (drag and drop, "Move to…"). Its
//   lines move whole: the comments directly above, the element (with a decision's branches or a loop's body)
//   and its notes, re-indented for their new depth. It keeps its lane, and so does every other element.
// - `moveByKey` moves one position along the element's own path (Up or Down), past one neighbour. At the start
//   or end of a branch or loop body, or next to the initial start or final stop, nothing moves and the user is
//   told to use "Move to…". It never moves sideways between branches.
// - The initial start and final stop of the main path cannot move.
import type { OpResult, Path } from '../../types.ts';
import { applyEdits } from '../../source/edits.ts';
import { parseActivity } from '../parser.ts';
import {
  containerAt,
  destinationKey,
  diffEdits,
  elementSpan,
  indentAt,
  insertionPoint,
  isFinalStop,
  isInitialStart,
  reindent,
  resolve,
  validDestinations,
  walk,
  type Destination,
  type FlowDoc,
} from '../destinations.ts';
import { carryLanes, reconcileLanes } from '../lanes.ts';

/** Moves the element at `target` to `to`, which must be one of its valid destinations. */
export function move(doc: FlowDoc, target: Path, to: Destination): OpResult {
  const r = resolve(doc.model, target);
  if (r?.type !== 'element') return { ok: false, messageKey: 'flow.refused.notFound' };
  if (isInitialStart(doc.model, target) || isFinalStop(doc.model, target)) return { ok: false, messageKey: 'flow.refused.startStop' };
  if (!validDestinations(doc.model, target).some((d) => destinationKey(d) === destinationKey(to))) {
    return { ok: false, messageKey: 'flow.refused.destination' };
  }
  const container = containerAt(doc.model, to.container)!;
  const { text } = doc;
  const span = elementSpan(text, r.element);
  const point = insertionPoint(text, container, to.index);
  const chunk = reindent(text.slice(span.start, span.end), indentAt(text, r.element.range.start), point.indent);
  const structural = applyEdits(text, [
    { start: span.start, end: span.end, text: '' },
    { start: point.pos, end: point.pos, text: chunk },
  ]);
  // Find the moved element: the first element starting inside the moved lines.
  const chunkStart = point.pos > span.start ? point.pos - (span.end - span.start) : point.pos;
  const model = parseActivity(structural).model;
  if (!model) return { ok: false, messageKey: 'flow.refused.position' };
  const moved = walk(model).find((ref) => ref.element.range.start >= chunkStart && ref.element.range.start < chunkStart + chunk.length);
  if (!moved) return { ok: false, messageKey: 'flow.refused.position' };
  const laneOf = carryLanes(doc.model, model, { movedFrom: target, movedTo: moved.path });
  const next = applyEdits(structural, reconcileLanes(structural, model, { order: doc.model.lanes.map((l) => l.name), laneOf }));
  if (!parseActivity(next).model) return { ok: false, messageKey: 'flow.refused.position' };
  // Lane switches added above the element do not change its path.
  return {
    ok: true,
    edits: diffEdits(text, next, doc.offset),
    select: moved.path,
    announceKey: `flow.moved.${r.element.kind}`,
    historyName: `flow.history.move.${r.element.kind}`,
  };
}

/** The keyboard move shortcut: one position up or down along the element's path, never sideways. */
export function moveByKey(doc: FlowDoc, target: Path, dir: 'up' | 'down' | 'left' | 'right'): OpResult {
  const r = resolve(doc.model, target);
  if (r?.type !== 'element') return { ok: false, messageKey: 'flow.refused.notFound' };
  if (isInitialStart(doc.model, target) || isFinalStop(doc.model, target)) return { ok: false, messageKey: 'flow.refused.startStop' };
  if (dir === 'left' || dir === 'right') return { ok: false, messageKey: 'flow.refused.moveSideways' };
  const index = dir === 'up' ? r.index - 1 : r.index + 2;
  const to: Destination = { container: r.container.address, index };
  const offered = validDestinations(doc.model, target).some((d) => destinationKey(d) === destinationKey(to));
  if (!offered || index < 0 || index > r.container.path.elements.length) return { ok: false, messageKey: 'flow.refused.moveEdge' };
  return move(doc, target, to);
}
