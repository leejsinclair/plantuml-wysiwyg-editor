// Flow removal (section 3.7, FR-012/AC9, AC13, FR-020/AC4, FR-009/AC8; VO-034, VO-036, VO-064).
//
// Deleting an element deletes its contents (a decision's branches, a loop's body), its notes and the full-line
// comments directly above it, and the announcement names what was removed ("Deleted decision and 4 steps",
// "… and its comment"). The initial start and the final stop of the main path are refused. A selected branch
// is removed as a branch (branches.ts). Focus goes to the next element, else the previous one, else the
// container (FR-009/AC8). Lanes of the remaining elements are unchanged.
import type { MessageParams, OpResult, Path } from '../../types.ts';
import type { FlowElement, Path as FlowPath } from '../model.ts';
import { diffEdits, elementSpan, isFinalStop, isInitialStart, resolve, type FlowDoc } from '../destinations.ts';
import { rewrite } from '../lanes.ts';
import { removeBranch } from './branches.ts';

/** How a deletion is announced: the key names the element, its contents and whether a comment went with it. */
export function describeRemoval(kind: 'decision' | 'loop' | 'branch' | FlowElement['kind'], contents: readonly FlowElement[], comment: boolean): { key: string; params?: MessageParams } {
  const suffix = comment ? 'WithComment' : '';
  if (kind === 'decision' || kind === 'loop' || kind === 'branch') {
    const all = contents;
    if (all.length === 0) return { key: `flow.deleted.${kind}Empty${suffix}` };
    const steps = all.every((e) => e.kind === 'step');
    return { key: `flow.deleted.${kind}${steps ? '' : 'Items'}${suffix}`, params: { count: all.length } };
  }
  const name = kind === 'locked' ? 'lockedPart' : kind;
  return { key: `flow.deleted.${name}${suffix}` };
}

/** An element and everything inside it. */
export function descendants(e: FlowElement): FlowElement[] {
  if (e.kind === 'decision') return [e, ...e.branches.flatMap((b) => pathContents(b.path))];
  if (e.kind === 'loop') return [e, ...pathContents(e.body)];
  return [e];
}

export const pathContents = (p: FlowPath): FlowElement[] => p.elements.flatMap(descendants);

/** Deletes the element (or branch) at `target`. */
export function remove(doc: FlowDoc, target: Path): OpResult {
  const r = resolve(doc.model, target);
  if (!r) return { ok: false, messageKey: 'flow.refused.notFound' };
  if (r.type === 'slot') {
    if (r.container.kind === 'branch') return removeBranch(doc, target);
    return { ok: false, messageKey: 'flow.refused.deleteBody' };
  }
  if (isInitialStart(doc.model, target) || isFinalStop(doc.model, target)) return { ok: false, messageKey: 'flow.refused.startStop' };
  const { element, container, index } = r;
  const span = elementSpan(doc.text, element);
  const next = rewrite(doc, [{ start: span.start, end: span.end, text: '' }], { removed: target });
  if (next === null) return { ok: false, messageKey: 'flow.refused.position' };
  const contents = element.kind === 'decision' ? element.branches.flatMap((b) => pathContents(b.path)) : element.kind === 'loop' ? pathContents(element.body) : [];
  const { key, params } = describeRemoval(element.kind, contents, element.leadingComments.length > 0);
  const remaining = container.path.elements.length - 1;
  const select = index < remaining ? [...container.address, index] : index > 0 ? [...container.address, index - 1] : container.address;
  return {
    ok: true,
    edits: diffEdits(doc.text, next, doc.offset),
    select,
    announceKey: key,
    ...(params ? { announceParams: params } : {}),
    historyName: `flow.history.delete.${element.kind}`,
  };
}
