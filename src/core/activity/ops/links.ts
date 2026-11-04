// Link operations (T162; FR-013/AC1, AC5, AC6, FR-011/AC6, data-model §5.3 Link).
//
// - `setLink` writes, changes or removes the `[[#<target> <label>]]` suffix on a step line.
// - `createAndLink` creates a new screen block named from the step's label (via `generate({ fromLabel })`)
//   and links the step to it in a single compound result.
//
// The label is re-escaped for a linked step when a link is set (`:` before `[` would start `[[`; `|` ends a
// lane name; `]` ends the link). Pure: no DOM, no session.
import type { OpResult, TextEdit, Path } from '../../types.ts';
import { escapeStepLabel } from '../escape.ts';
import { diffEdits, flowDoc, resolve, type FlowDoc } from '../destinations.ts';
import { insert } from './insert.ts';
import { rewrite } from '../lanes.ts';
import { addScreen, type AddResult } from '../../project/screens.ts';
import { generate } from '../../names/names.ts';
import type { ProjectState } from '../../project/project.ts';
import { blocks } from '../../project/project.ts';

// ─── setLink ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Links, changes or removes the link on the step at `path`.
 * Pass `target: null` to remove the link.
 */
export function setLink(doc: FlowDoc, path: Path, target: string | null): OpResult {
  const r = resolve(doc.model, path);
  if (!r || r.type !== 'element' || r.element.kind !== 'step') {
    return { ok: false, messageKey: 'flow.refused.notFound' };
  }
  const step = r.element;
  const labelText = step.label.text;

  // Re-escape the label for the new context (linked vs unlinked).
  const escapedLabel = escapeStepLabel(labelText, target !== null);
  const newLine = target !== null ? `:[[#${target} ${escapedLabel}]];` : `:${escapedLabel};`;

  // Replace the entire step range.
  const edit: TextEdit = { start: step.range.start, end: step.range.end, text: newLine };
  const next = rewrite(doc, [edit], {});
  if (next === null) return { ok: false, messageKey: 'flow.refused.position' };
  const edits = diffEdits(doc.text, next, doc.offset);

  if (target === null) {
    return {
      ok: true,
      edits,
      select: path,
      announceKey: 'links.removed.announce',
      historyName: 'links.history.remove',
    };
  }
  const wasLinked = step.link !== null;
  return {
    ok: true,
    edits,
    select: path,
    announceKey: wasLinked ? 'links.changed.announce' : 'links.linked.announce',
    announceParams: { name: target },
    historyName: 'links.history.set',
  };
}

// ─── createAndLink ────────────────────────────────────────────────────────────────────────────────

export interface CreateAndLinkResult {
  /** The link op edits (file-absolute). */
  readonly linkEdits: readonly TextEdit[];
  /** The screen-add result from `addScreen`. */
  readonly screenOp: AddResult;
  /** History name key. */
  readonly historyName: string;
  /** The created screen name. */
  readonly screenName: string;
}

/**
 * Creates a new screen named from the step's label and links the step to it.
 * Returns both the link edits (file-absolute) and the screen-add result.
 * The caller applies both sets of edits and records one history entry.
 */
export function createAndLink(
  state: ProjectState,
  doc: FlowDoc,
  path: Path,
): CreateAndLinkResult | { readonly ok: false; readonly messageKey: string } {
  const r = resolve(doc.model, path);
  if (!r || r.type !== 'element' || r.element.kind !== 'step') {
    return { ok: false, messageKey: 'flow.refused.notFound' };
  }
  const step = r.element;

  // Generate a screen name from the step's label against current taken names.
  const all = blocks({ ...state, keys: [] });
  const taken = new Set(all.filter((b) => b.kind !== 'other' && b.name !== null).map((b) => b.name!));
  const screenName = generate({ fromLabel: step.label.text }, taken);

  // Create the screen.
  const screenOp = addScreen(state, { name: screenName });

  // Set the link on the step.
  const linkOp = setLink(doc, path, screenName);
  if (!linkOp.ok) return { ok: false, messageKey: linkOp.messageKey };

  return {
    linkEdits: linkOp.edits,
    screenOp,
    historyName: 'links.history.createAndLink',
    screenName,
  };
}

// ─── addLinkedStep ────────────────────────────────────────────────────────────────────────────────

/**
 * Adds a step labelled `label` that links to `target`, before the flow's final stop, and selects it. Used to
 * link a wireframe element to a screen: the element has no step yet, so one is made for it.
 */
export function addLinkedStep(doc: FlowDoc, label: string, target: string): OpResult {
  const base: FlowDoc = { text: doc.text, model: doc.model, offset: 0 };
  const made = insert(base, null, 'step');
  if (!made.ok) return made;
  let text = doc.text;
  for (const e of [...made.edits].sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  const grown = flowDoc(text);
  const select = made.select;
  const r = grown && select ? resolve(grown.model, select) : null;
  if (!grown || !r || r.type !== 'element' || r.element.kind !== 'step') return { ok: false, messageKey: 'flow.refused.notFound' };
  const line = `:[[#${target} ${escapeStepLabel(label, true)}]];`;
  const next = rewrite(grown, [{ start: r.element.range.start, end: r.element.range.end, text: line }], {});
  if (next === null) return { ok: false, messageKey: 'flow.refused.position' };
  return {
    ok: true,
    edits: diffEdits(doc.text, next, doc.offset),
    select,
    announceKey: 'links.linked.announce',
    announceParams: { name: target },
    historyName: 'links.history.set',
  };
}
