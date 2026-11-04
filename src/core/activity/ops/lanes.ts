// Lane operations (section 3.7, OD-8, FR-012/AC10, AC12, AC13; VO-121, VO-037). Lanes are a list in the flow's
// properties: add, rename, reorder and delete, plus setting one element's lane. Each operation states the lane
// list and every element's lane, and lanes.ts writes the switches:
// - adding the first lane places every element in it; a later lane is added at the end of the list;
// - renaming rewrites every switch naming the lane;
// - deleting a lane in use needs a destination lane for its elements (the caller asks); deleting the only lane
//   removes every switch, so the flow has no lanes again;
// - setting a step's, decision's or loop's lane changes that element's lane only.
import type { OpResult, Path } from '../../types.ts';
import type { ScreenFlow } from '../model.ts';
import { diffEdits, resolve, type FlowDoc } from '../destinations.ts';
import { checkLaneName, isLaned, keepLanes, laneInUse, rewrite, type LanePlan, type LanedElement } from '../lanes.ts';

const names = (model: ScreenFlow) => model.lanes.map((l) => l.name);

function finish(doc: FlowDoc, plan: LanePlan, select: Path, key: string, params: Record<string, string>): OpResult {
  const next = rewrite(doc, [], {}, plan);
  if (next === null) return { ok: false, messageKey: 'flow.refused.position' };
  return { ok: true, edits: diffEdits(doc.text, next, doc.offset), select, announceKey: `flow.lane.${key}`, announceParams: params, historyName: `flow.history.lane.${key}` };
}

/** Adds a lane at the end of the list. The first lane takes every element. */
export function addLane(doc: FlowDoc, name: string, select: Path = []): OpResult {
  const refused = checkLaneName(name, names(doc.model));
  if (refused) return { ok: false, messageKey: refused };
  const lane = name.trim();
  const first = doc.model.lanes.length === 0;
  return finish(doc, { order: [...names(doc.model), lane], laneOf: first ? () => lane : keepLanes }, select, 'added', { lane });
}

export function renameLane(doc: FlowDoc, from: string, to: string, select: Path = []): OpResult {
  if (!names(doc.model).includes(from)) return { ok: false, messageKey: 'flow.refused.laneUnknown' };
  const refused = checkLaneName(to, names(doc.model).filter((n) => n !== from));
  if (refused) return { ok: false, messageKey: refused };
  const lane = to.trim();
  if (lane === from) return { ok: false, messageKey: 'flow.refused.laneUnchanged' };
  const rename = new Map([[from, lane]]);
  return finish(
    doc,
    { order: names(doc.model).map((n) => (n === from ? lane : n)), rename, laneOf: (i, ref) => { const l = keepLanes(i, ref); return l === from ? lane : l; } },
    select,
    'renamed',
    { lane: from, name: lane },
  );
}

/** Moves a lane to position `toIndex` in the list; the render shows lanes in list order. */
export function moveLane(doc: FlowDoc, name: string, toIndex: number, select: Path = []): OpResult {
  const order = names(doc.model);
  const from = order.indexOf(name);
  if (from === -1) return { ok: false, messageKey: 'flow.refused.laneUnknown' };
  if (toIndex < 0 || toIndex >= order.length || toIndex === from) return { ok: false, messageKey: 'flow.refused.laneEdge' };
  const next = order.filter((n) => n !== name);
  next.splice(toIndex, 0, name);
  return finish(doc, { order: next, laneOf: keepLanes }, select, 'moved', { lane: name });
}

/**
 * Deletes a lane. A lane in use needs `destination`, which takes its elements; the only lane needs none and
 * removes every switch.
 */
export function deleteLane(doc: FlowDoc, name: string, destination?: string, select: Path = []): OpResult {
  const order = names(doc.model);
  if (!order.includes(name)) return { ok: false, messageKey: 'flow.refused.laneUnknown' };
  if (order.length === 1) return finish(doc, { order: [], laneOf: () => null }, select, 'deleted', { lane: name });
  const inUse = laneInUse(doc.model, name);
  if (inUse && (destination === undefined || destination === name || !order.includes(destination))) {
    return { ok: false, messageKey: 'flow.refused.laneDestination' };
  }
  const rest = order.filter((n) => n !== name);
  const target = destination && destination !== name && order.includes(destination) ? destination : rest[0]!;
  return finish(
    doc,
    { order: rest, ...(inUse ? { rename: new Map([[name, target]]) } : {}), laneOf: (i, ref) => { const l = keepLanes(i, ref); return l === name ? target : l; } },
    select,
    'deleted',
    { lane: name },
  );
}

/** Sets the lane of the step, decision, loop or locked part at `path`; no other element's lane changes. */
export function setLane(doc: FlowDoc, path: Path, lane: string): OpResult {
  const r = resolve(doc.model, path);
  if (r?.type !== 'element' || !isLaned(r.element)) return { ok: false, messageKey: 'flow.refused.notFound' };
  if (!names(doc.model).includes(lane)) return { ok: false, messageKey: 'flow.refused.laneUnknown' };
  if ((r.element as LanedElement).lane === lane) return { ok: false, messageKey: 'flow.refused.laneUnchanged' };
  const element = r.element;
  return finish(
    doc,
    { order: names(doc.model), laneOf: (i, ref) => (ref.element.range.start === element.range.start ? lane : keepLanes(i, ref)) },
    path,
    'set',
    { lane },
  );
}
