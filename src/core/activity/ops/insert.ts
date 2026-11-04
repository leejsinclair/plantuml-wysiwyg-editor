// Flow insertion (section 3.7 "Insertion point", FR-012/AC1, AC8, FR-009/AC8, FR-020/AC5; VO-124, VO-065).
//
// A palette item ("Step", "Decision", "Loop", "Stop") is inserted:
// - after the selected element on its path (before it when the selection is a stop, since nothing follows one);
// - as the first element of a selected branch or loop body, empty ones included;
// - at the end of the main path, before the final stop, when nothing is selected.
// A stop only ends a branch. The new element is written in the house style at its path's indentation, takes the
// lane of the element before it (lanes.ts), and is selected.
import type { OpResult, Path } from '../../types.ts';
import { flow } from '../../project/house-style.ts';
import type { FlowElement } from '../model.ts';
import {
  canPlace,
  containerAt,
  diffEdits,
  eolOf,
  insertionPoint,
  mainContainer,
  resolve,
  type Container,
  type FlowDoc,
} from '../destinations.ts';
import { isLaned, laneAt, rewrite } from '../lanes.ts';

export type FlowPaletteItem = 'step' | 'decision' | 'loop' | 'stop';
export const FLOW_PALETTE: readonly FlowPaletteItem[] = ['step', 'decision', 'loop', 'stop'];

const KIND: Record<FlowPaletteItem, FlowElement['kind']> = { step: 'step', decision: 'decision', loop: 'loop', stop: 'stop' };

/** Where an item goes for a selection: a container and the index the new element takes in it. */
export function insertionTarget(doc: FlowDoc, selection: Path | null): { container: Container; index: number } | null {
  const { model } = doc;
  if (selection === null || selection.length === 0) {
    const main = mainContainer(model);
    const els = main.path.elements;
    return { container: main, index: els[els.length - 1]?.kind === 'stop' ? els.length - 1 : els.length };
  }
  const r = resolve(model, selection);
  if (!r) return null;
  if (r.type === 'slot') return { container: r.container, index: 0 };
  return { container: r.container, index: r.element.kind === 'stop' ? r.index : r.index + 1 };
}

/** The lane of the element before position `index` of `container`: a sibling, else the owner, else the start's. */
export function laneBefore(doc: FlowDoc, container: Container, index: number): string | null {
  if (doc.model.lanes.length === 0) return null;
  const els = container.path.elements;
  for (let i = index - 1; i >= 0; i--) {
    const e = els[i]!;
    if (isLaned(e)) return e.lane;
  }
  if (container.owner) return container.owner.lane;
  const first = doc.model.main.elements[0];
  return laneAt(doc.model, first ? first.range.start : doc.text.length) ?? doc.model.lanes[0]!.name;
}

/** The new element's lines at `indent`, without a final line ending. */
function template(item: FlowPaletteItem, indent: string, eol: string): string {
  const d = flow.DEFAULTS;
  switch (item) {
    case 'step':
      return indent + flow.step(d.step);
    case 'stop':
      return indent + flow.stop();
    case 'decision':
      return [`if (${d.condition}) then (${d.thenLabel})`, `else (${d.elseLabel})`, 'endif'].map((l) => indent + l).join(eol);
    case 'loop':
      return ['repeat', `repeat while (${d.loopCondition})`].map((l) => indent + l).join(eol);
  }
}

/** Inserts a palette item by the section 3.7 rules; the new element is selected (FR-009/AC8). */
export function insert(doc: FlowDoc, selection: Path | null, item: FlowPaletteItem): OpResult {
  const target = insertionTarget(doc, selection);
  if (!target) return { ok: false, messageKey: 'flow.refused.notFound' };
  return insertAt(doc, target.container.address, target.index, item);
}

/** Inserts a palette item before element `index` of the container at `address` (a drop between elements). */
export function insertAt(doc: FlowDoc, address: Path, index: number, item: FlowPaletteItem): OpResult {
  const container = containerAt(doc.model, address);
  if (!container) return { ok: false, messageKey: 'flow.refused.notFound' };
  if (!canPlace(doc.model, container, index, KIND[item])) {
    return { ok: false, messageKey: item === 'stop' ? 'flow.refused.stopPosition' : 'flow.refused.position' };
  }
  const eol = eolOf(doc.text);
  const { pos, indent } = insertionPoint(doc.text, container, index);
  const lead = pos > 0 && !/[\r\n]$/.test(doc.text.slice(0, pos)) ? eol : '';
  const select = [...container.address, index];
  const next = rewrite(doc, [{ start: pos, end: pos, text: lead + template(item, indent, eol) + eol }], {
    added: select,
    addedLane: laneBefore(doc, container, index),
  });
  if (next === null) return { ok: false, messageKey: 'flow.refused.position' };
  return {
    ok: true,
    edits: diffEdits(doc.text, next, doc.offset),
    select,
    announceKey: `flow.inserted.${item}`,
    historyName: `flow.history.insert.${item}`,
  };
}
