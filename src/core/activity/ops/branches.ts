// Decision branches and the text of flow elements (FR-012/AC1, AC2, AC8, AC9, data-model §5.3 Branch).
//
// - A decision has at least two branches: exactly one `if`, first; any number of `elseif`; at most one `else`,
//   last. "Add branch" adds an `elseif` before the `else`, or an `else` when there is none (an imported `if`
//   with one branch). Removing a branch that would leave fewer than two is refused; removing the `if` makes the
//   first `elseif` the `if`. A removed branch takes its contents and notes with it, and the announcement names
//   what was removed.
// - `setText` edits a step label, a decision or branch condition, a branch label and a loop's condition and
//   labels. Text is escaped only where the syntax would otherwise read it (section 3.4); brackets inside a
//   condition or label are written literally unless they are unbalanced.
import type { OpResult, Path, TextEdit, TextRange } from '../../types.ts';
import { escapeStepLabel } from '../escape.ts';
import type { Branch, Decision, Loop, TextValue } from '../model.ts';
import { diffEdits, eolOf, indentAt, lineStart, resolve, type FlowDoc } from '../destinations.ts';
import { rewrite } from '../lanes.ts';
import { describeRemoval, pathContents } from './remove.ts';

/** The decision at `path`, or the decision owning the branch at `path`, with its path. */
function decisionAt(doc: FlowDoc, path: Path): { decision: Decision; path: Path } | null {
  const r = resolve(doc.model, path);
  if (r?.type === 'element' && r.element.kind === 'decision') return { decision: r.element, path };
  if (r?.type === 'slot' && r.container.kind === 'branch') return { decision: r.container.owner as Decision, path: r.container.ownerPath! };
  return null;
}

const finish = (doc: FlowDoc, next: string | null, select: Path, announceKey: string, historyName: string, params?: Record<string, string | number>): OpResult =>
  next === null
    ? { ok: false, messageKey: 'flow.refused.position' }
    : { ok: true, edits: diffEdits(doc.text, next, doc.offset), select, announceKey, historyName, ...(params ? { announceParams: params } : {}) };

/** Adds a branch to the decision at `path` (or owning the branch at `path`), and selects it. */
export function addBranch(doc: FlowDoc, path: Path): OpResult {
  const found = decisionAt(doc, path);
  if (!found) return { ok: false, messageKey: 'flow.refused.notFound' };
  const { decision } = found;
  const eol = eolOf(doc.text);
  const elseIndex = decision.branches.findIndex((b) => b.branchKind === 'else');
  const before = elseIndex === -1 ? decision.end : decision.branches[elseIndex]!.header;
  const indent = indentAt(doc.text, before.start);
  const line = elseIndex === -1 ? `else (no)` : `elseif (Condition?) then (yes)`;
  const pos = lineStart(doc.text, before.start);
  const next = rewrite(doc, [{ start: pos, end: pos, text: `${indent}${line}${eol}` }], {});
  const index = elseIndex === -1 ? decision.branches.length : elseIndex;
  return finish(doc, next, [...found.path, index], 'flow.addedBranch', 'flow.history.addBranch');
}

/** Removes the branch at `path` (a decision path plus the branch index) with its contents. */
export function removeBranch(doc: FlowDoc, path: Path): OpResult {
  const r = resolve(doc.model, path);
  if (r?.type !== 'slot' || r.container.kind !== 'branch') return { ok: false, messageKey: 'flow.refused.notFound' };
  const decision = r.container.owner as Decision;
  const b = path[path.length - 1]!;
  if (decision.branches.length <= 2) return { ok: false, messageKey: 'flow.refused.twoBranches' };
  const branch = decision.branches[b]!;
  const nextHeader = decision.branches[b + 1]?.header ?? decision.end;
  const edits: TextEdit[] = [{ start: lineStart(doc.text, branch.header.start), end: lineStart(doc.text, nextHeader.start), text: '' }];
  if (b === 0) {
    // The first elseif becomes the if.
    const header = decision.branches[1]!.header;
    const keyword = /^(?:elseif|else\s+if)/i.exec(doc.text.slice(header.start, header.end))!;
    edits.push({ start: header.start, end: header.start + keyword[0].length, text: 'if' });
  }
  const next = rewrite(doc, edits, { removed: path });
  const { key, params } = describeRemoval('branch', pathContents(branch.path), false);
  const select = [...path.slice(0, -1), Math.min(b, decision.branches.length - 2)];
  return finish(doc, next, select, key, 'flow.history.delete.branch', params);
}

// ------------------------------------------------------------------------------------------------- text

export type TextField = 'label' | 'condition' | 'branchLabel' | 'loopIs' | 'loopExit';

/** Text inside `( … )`: escaped like a step label, and brackets escaped too when they are unbalanced. */
export function escapeBracketed(text: string): string {
  const escaped = escapeStepLabel(text, false);
  let depth = 0;
  let balanced = true;
  for (const c of escaped) {
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) balanced = false;
  }
  if (balanced && depth === 0) return escaped;
  return escaped.replace(/[()]/g, (c) => (c === '(' ? '<U+0028>' : '<U+0029>'));
}

const src = (doc: FlowDoc, v: TextValue | null): string | null => (v ? doc.text.slice(v.raw.start, v.raw.end) : null);

/** The `if`/`elseif`/`else` header with its condition and label, rebuilt (used when a part appears or goes). */
function branchHeader(kind: Branch['branchKind'], condition: string | null, label: string | null): string {
  const tail = label !== null && label !== '' ? ` (${label})` : '';
  if (kind === 'else') return `else${tail}`;
  return `${kind} (${condition ?? ''}) then${tail}`;
}

/** Sets a text property; the edit touches only that text where it already exists. */
export function setText(doc: FlowDoc, path: Path, field: TextField, value: string): OpResult {
  const r = resolve(doc.model, path);
  if (!r) return { ok: false, messageKey: 'flow.refused.notFound' };
  const ok = (edit: TextEdit): OpResult => finish(doc, rewrite(doc, [edit], {}), path, `flow.changed.${field}`, `flow.history.text.${field}`);
  const replace = (raw: TextRange, text: string): OpResult => ok({ start: raw.start, end: raw.end, text });

  if (field === 'label' && r.type === 'element' && r.element.kind === 'step') {
    const step = r.element;
    return replace(step.label.raw, escapeStepLabel(value, step.link !== null));
  }

  // A branch: the branch itself, or a decision's first branch.
  const branch: Branch | null =
    r.type === 'slot' && r.container.kind === 'branch' ? r.container.branch : r.type === 'element' && r.element.kind === 'decision' ? r.element.branches[0]! : null;
  if (branch && (field === 'condition' || field === 'branchLabel')) {
    if (field === 'condition' && branch.branchKind === 'else') return { ok: false, messageKey: 'flow.refused.elseCondition' };
    const current = field === 'condition' ? branch.condition : branch.label;
    if (current && value !== '') return replace(current.raw, escapeBracketed(value));
    const condition = field === 'condition' ? escapeBracketed(value) : src(doc, branch.condition);
    const label = field === 'branchLabel' ? (value === '' ? null : escapeBracketed(value)) : src(doc, branch.label);
    return replace(branch.header, branchHeader(branch.branchKind, condition, label));
  }

  if (r.type === 'element' && r.element.kind === 'loop' && (field === 'condition' || field === 'loopIs' || field === 'loopExit')) {
    const loop: Loop = r.element;
    const current = field === 'condition' ? loop.condition : field === 'loopIs' ? loop.labels.is : loop.labels.exit;
    if (current && value !== '') return replace(current.raw, escapeBracketed(value));
    const part = (f: TextField, v: TextValue | null): string | null => (f === field ? (value === '' ? null : escapeBracketed(value)) : src(doc, v));
    const condition = field === 'condition' ? escapeBracketed(value) : (src(doc, loop.condition) ?? '');
    const is = part('loopIs', loop.labels.is);
    const exit = part('loopExit', loop.labels.exit);
    if (loop.loopKind === 'repeat') {
      if (field === 'condition' || field === 'loopIs' || field === 'loopExit') {
        const line = `repeat while (${condition})${is ? ` is (${is})` : ''}${exit ? ` not (${exit})` : ''}`;
        return replace(loop.end, line);
      }
    }
    if (field === 'loopExit') return replace(loop.end, `endwhile${exit ? ` (${exit})` : ''}`);
    return replace(loop.header, `while (${condition})${is ? ` is (${is})` : ''}`);
  }
  return { ok: false, messageKey: 'flow.refused.notFound' };
}
