// Flow addressing and destinations (section 3.7, FR-009/AC13, R-7, data-model §5.3).
//
// A flow is addressed by structural paths from the main path:
// - `[i]` is element i of the main path;
// - for a decision at `P`, `[...P, b]` is its branch b (a selectable slot, empty or not) and `[...P, b, j]` is
//   element j of that branch;
// - for a loop at `P`, `[...P, 0]` is its body (a selectable slot) and `[...P, 0, j]` is element j of the body.
// Notes are never on a path: they belong to their owner.
//
// A destination is a position on a path: before element `index` of the container at `container` (`[]` is the
// main path). The same list serves drag and drop and "Move to…"; the keyboard move shortcut only ever moves along
// its own path (move.ts), never sideways between branches.
//
// This module also holds the source-position helpers every flow operation uses: where an element's lines begin
// and end, where a new line goes, and the edit list between two versions of a block.
import type { Path, TextEdit, TextRange } from '../types.ts';
import { INDENT, chooseLineEnding, type LineEnding } from '../project/house-style.ts';
import type { Branch, Decision, FlowElement, Loop, Path as FlowPath, ScreenFlow } from './model.ts';
import { parseActivity } from './parser.ts';

// ------------------------------------------------------------------------------------------------- documents

/** One flow block as operations see it: its text, its model and the block's offset in the file. */
export interface FlowDoc {
  readonly text: string;
  readonly model: ScreenFlow;
  /** File-absolute offset of the block; operations return file-absolute edits. */
  readonly offset: number;
}

/** The block's flow document, or `null` when it does not parse as a flow (invalid or source-only). */
export function flowDoc(text: string, offset = 0): FlowDoc | null {
  const model = parseActivity(text).model;
  return model ? { text, model, offset } : null;
}

// ------------------------------------------------------------------------------------------------ containers

/** A path that holds elements: the main path, a decision branch or a loop body. */
export interface Container {
  readonly address: Path;
  readonly kind: 'main' | 'branch' | 'body';
  readonly path: FlowPath;
  /** The decision or loop that owns a branch or body. */
  readonly owner: Decision | Loop | null;
  readonly ownerPath: Path | null;
  readonly branch: Branch | null;
  /** Nesting depth: 0 for the main path. */
  readonly depth: number;
}

export type Resolved =
  | { readonly type: 'element'; readonly element: FlowElement; readonly path: Path; readonly container: Container; readonly index: number }
  | { readonly type: 'slot'; readonly container: Container; readonly path: Path };

export const mainContainer = (model: ScreenFlow): Container => ({
  address: [], kind: 'main', path: model.main, owner: null, ownerPath: null, branch: null, depth: 0,
});

/** The containers directly inside an element (its branches or its body). */
export function childContainers(element: FlowElement, elementPath: Path, depth: number): Container[] {
  if (element.kind === 'decision') {
    return element.branches.map((branch, b) => ({
      address: [...elementPath, b], kind: 'branch', path: branch.path, owner: element, ownerPath: elementPath, branch, depth: depth + 1,
    }));
  }
  if (element.kind === 'loop') {
    return [{ address: [...elementPath, 0], kind: 'body', path: element.body, owner: element, ownerPath: elementPath, branch: null, depth: depth + 1 }];
  }
  return [];
}

/** What a structural path points at, or `null` when nothing is there. */
export function resolve(model: ScreenFlow, path: Path): Resolved | null {
  let container = mainContainer(model);
  let k = 0;
  for (;;) {
    if (k >= path.length) return k === 0 ? null : { type: 'slot', container, path };
    const index = path[k]!;
    const element = container.path.elements[index];
    if (!element) return null;
    const elementPath = path.slice(0, k + 1);
    if (k + 1 === path.length) return { type: 'element', element, path: elementPath, container, index };
    const child = childContainers(element, elementPath, container.depth)[path[k + 1]!];
    if (!child) return null;
    container = child;
    k += 2;
  }
}

export function hasPath(model: ScreenFlow, path: Path): boolean {
  return path.length === 0 || resolve(model, path) !== null;
}

/** The container at `address` (`[]` for the main path). */
export function containerAt(model: ScreenFlow, address: Path): Container | null {
  if (address.length === 0) return mainContainer(model);
  const r = resolve(model, address);
  return r?.type === 'slot' ? r.container : null;
}

export interface ElementRef {
  readonly element: FlowElement;
  readonly path: Path;
  readonly container: Container;
  readonly index: number;
}

/** Every element in source order (an element before its branches' contents). */
export function walk(model: ScreenFlow): ElementRef[] {
  const out: ElementRef[] = [];
  const visit = (container: Container): void => {
    container.path.elements.forEach((element, index) => {
      const path = [...container.address, index];
      out.push({ element, path, container, index });
      for (const child of childContainers(element, path, container.depth)) visit(child);
    });
  };
  visit(mainContainer(model));
  return out;
}

/** Every container in source order, the main path first. */
export function containers(model: ScreenFlow): Container[] {
  const out: Container[] = [mainContainer(model)];
  for (const ref of walk(model)) out.push(...childContainers(ref.element, ref.path, ref.container.depth));
  return out;
}

export const isPrefix = (prefix: Path, path: Path): boolean => prefix.length <= path.length && prefix.every((v, i) => path[i] === v);

/** The initial start: the first element of the main path, when it is `start`. */
export function isInitialStart(model: ScreenFlow, path: Path): boolean {
  return path.length === 1 && path[0] === 0 && model.main.elements[0]?.kind === 'start';
}

/** The final stop: the last element of the main path, when it is a stop. */
export function isFinalStop(model: ScreenFlow, path: Path): boolean {
  const els = model.main.elements;
  return path.length === 1 && path[0] === els.length - 1 && els[els.length - 1]?.kind === 'stop';
}

/** Whether a new or moved element of `kind` may stand before element `index` of `container`. */
export function canPlace(model: ScreenFlow, container: Container, index: number, kind: FlowElement['kind']): boolean {
  const els = container.path.elements;
  if (index < 0 || index > els.length) return false;
  if (container.kind === 'main') {
    if (els[0]?.kind === 'start' && index === 0) return false;
    if (els[els.length - 1]?.kind === 'stop' && index === els.length) return false;
  }
  // Nothing follows a stop on its path.
  if (index > 0 && els[index - 1]?.kind === 'stop') return false;
  // A stop ends a branch: only as its last element.
  if (kind === 'stop' || kind === 'start') return kind === 'stop' && container.kind === 'branch' && index === els.length;
  return true;
}

// ---------------------------------------------------------------------------------------------- destinations

export interface Destination {
  /** The container's address: `[]` for the main path, a branch or a loop body path otherwise. */
  readonly container: Path;
  /** Before this element; the container's length means at its end. */
  readonly index: number;
}

export const destinationKey = (d: Destination): string => `${d.container.join('.')}@${d.index}`;

/**
 * Every place the element at `target` can move to: positions on every path outside its own contents, except
 * where it already is, before the initial start, after the final stop and after a stop. The initial start and
 * final stop have none.
 */
export function validDestinations(model: ScreenFlow, target: Path): Destination[] {
  const r = resolve(model, target);
  if (r?.type !== 'element' || isInitialStart(model, target) || isFinalStop(model, target)) return [];
  const out: Destination[] = [];
  for (const c of containers(model)) {
    if (isPrefix(target, c.address)) continue;
    const same = c.address.length === r.container.address.length && isPrefix(c.address, r.container.address);
    for (let index = 0; index <= c.path.elements.length; index++) {
      if (same && (index === r.index || index === r.index + 1)) continue;
      // Without the element itself, a stop may end its own branch again.
      if (!canPlace(model, c, index, r.element.kind)) continue;
      out.push({ container: c.address, index });
    }
  }
  return out;
}

// -------------------------------------------------------------------------------------------- source helpers

export const eolOf = (text: string): LineEnding => chooseLineEnding({ block: text });

/** Offset of the start of the line holding `pos`. */
export function lineStart(text: string, pos: number): number {
  let i = pos;
  while (i > 0 && text[i - 1] !== '\n' && text[i - 1] !== '\r') i--;
  return i;
}

/** Offset just past the line ending of the line holding `pos` (or the text end). */
export function lineEnd(text: string, pos: number): number {
  let i = pos;
  while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
  if (text[i] === '\r' && text[i + 1] === '\n') return i + 2;
  return i < text.length ? i + 1 : i;
}

/** The whitespace at the start of the line holding `pos`. */
export function indentAt(text: string, pos: number): string {
  const start = lineStart(text, pos);
  return /^[ \t]*/.exec(text.slice(start))![0];
}

/** Whether only whitespace stands between the line start and `pos`. */
export const atLineStart = (text: string, pos: number): boolean => /^[ \t]*$/.test(text.slice(lineStart(text, pos), pos));

/**
 * The whole lines of an element: from its first leading comment to the end of its last note's line, including
 * the line ending. Comments directly above and notes move and are deleted with it (FR-020/AC4, section 3.7).
 */
export function elementSpan(text: string, element: FlowElement): TextRange {
  const first = element.leadingComments[0]?.start ?? element.range.start;
  const lastNote = element.notes[element.notes.length - 1];
  const last = lastNote ? lastNote.range.end : element.range.end;
  const start = atLineStart(text, first) ? lineStart(text, first) : first;
  return { start, end: lineEnd(text, Math.max(last - 1, start)) };
}

/** Where the line for a new or moved element goes, and its indentation, before element `index` of `container`. */
export function insertionPoint(text: string, container: Container, index: number): { pos: number; indent: string } {
  const els = container.path.elements;
  const previous = index > 0 ? els[index - 1] : undefined;
  if (previous) {
    const span = elementSpan(text, previous);
    return { pos: span.end, indent: indentAt(text, previous.range.start) };
  }
  if (container.kind === 'main') {
    const next = els[0];
    const at = next ? (next.leadingComments[0]?.start ?? next.range.start) : text.length;
    return { pos: lineStart(text, at), indent: next ? indentAt(text, at) : '' };
  }
  // First in a branch or loop body: after the header line and any notes at the start of the path.
  const header = container.branch?.header ?? (container.owner as Loop).header;
  const notes = container.path.leadingNotes;
  const after = notes.length > 0 ? notes[notes.length - 1]!.range.end : header.end;
  return { pos: lineEnd(text, Math.max(after - 1, header.start)), indent: indentAt(text, header.start) + INDENT };
}

/** Changes the indentation of every line of `chunk` from `from` to `to` where the line starts with `from`. */
export function reindent(chunk: string, from: string, to: string): string {
  if (from === to) return chunk;
  return chunk.replace(/(^|\r\n|\r|\n)([ \t]*)(?=\S)/g, (_whole, lead: string, ws: string) =>
    lead + (ws.startsWith(from) ? to + ws.slice(from.length) : to + ws),
  );
}

/**
 * The minimal edits turning `before` into `after`, by lines, offset by `offset`. Operations build a block's new
 * text in steps (structure, then lanes) and return this, so each edit touches only the lines that changed.
 */
export function diffEdits(before: string, after: string, offset = 0): TextEdit[] {
  const split = (s: string) => s.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];
  const a = split(before);
  const b = split(after);
  // Common prefix and suffix lines first; the middle by longest common subsequence.
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  const n = am.length;
  const m = bm.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i]![j] = am[i] === bm[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  }
  const edits: TextEdit[] = [];
  let pos = offset + a.slice(0, pre).join('').length;
  let i = 0;
  let j = 0;
  let hunk: { start: number; end: number; text: string } | null = null;
  const flush = () => {
    if (hunk) edits.push(narrow(hunk));
    hunk = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && am[i] === bm[j]) {
      flush();
      pos += am[i]!.length;
      i++;
      j++;
    } else if (j < m && (i >= n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      hunk ??= { start: pos, end: pos, text: '' };
      hunk.text += bm[j]!;
      j++;
    } else {
      hunk ??= { start: pos, end: pos, text: '' };
      hunk.end += am[i]!.length;
      pos += am[i]!.length;
      i++;
    }
  }
  flush();
  return edits;

  /** Trims the characters a hunk keeps at its start and end, so a changed word is one small edit. */
  function narrow(h: { start: number; end: number; text: string }): TextEdit {
    const old = before.slice(h.start - offset, h.end - offset);
    let p = 0;
    while (p < old.length && p < h.text.length && old[p] === h.text[p]) p++;
    let s = 0;
    while (s < old.length - p && s < h.text.length - p && old[old.length - 1 - s] === h.text[h.text.length - 1 - s]) s++;
    return { start: h.start + p, end: h.end - s, text: h.text.slice(p, h.text.length - s) };
  }
}
