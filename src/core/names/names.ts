// Block names: one namespace for every named block, screens and the flow (spec section 3.6, OD-3, R-12,
// data-model §4.4). Pure functions; the project and screen operations build renames and link edits on top.

/** Longest allowed name, in characters (code points), suffix included (A-8). */
export const MAX_NAME_LENGTH = 64;

/** Derived name status of a block (data-model §4.4). Anything but `valid` and `unnamed` is flagged. */
export type NameStatus = 'valid' | 'unnamed' | 'notAllowed' | 'notNormalised' | 'duplicate';

/** Outcome of committing a typed name (FR-011/AC7). */
export type CommitResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'duplicate'; conflictsWith: string };

export type GenerateBase = 'screen' | 'flow' | { fromLabel: string } | { copyOf: string | null };

const ALLOWED = /^\p{L}[\p{L}\p{M}\p{Nd}_-]*$/u;
const DISALLOWED_CHAR = /[^\p{L}\p{M}\p{Nd}_-]/gu;
const SPACE = /[\s\p{Zs}]/gu;
const LEADING_NON_LETTERS = /^\P{L}+/u;
const HYPHEN_RUNS = /-{2,}/g;
const EDGE_HYPHENS = /^-+|-+$/g;
const TRAILING_HYPHENS = /-+$/;

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const length = (s: string): number => {
  let n = 0;
  for (const _ of s) n++;
  return n;
};

/** Cuts `s` to at most `max` code points, dropping whole grapheme clusters only, so no letter loses its marks. */
function cut(s: string, max: number): string {
  if (length(s) <= max) return s;
  let out = '';
  let used = 0;
  for (const { segment } of graphemes.segment(s)) {
    const size = length(segment);
    if (used + size > max) break;
    out += segment;
    used += size;
  }
  return out;
}

/**
 * The commit conversion for a typed name: spaces become `-`, disallowed characters are removed, leading
 * non-letters are removed, runs of `-` become one, leading and trailing `-` are removed, and the result is cut
 * to 64 characters on grapheme clusters (a cut never leaves a trailing `-`). Returns NFC, or '' when nothing
 * remains.
 */
export function normalise(typed: string): string {
  const converted = typed
    .normalize('NFC')
    .replace(SPACE, '-')
    .replace(DISALLOWED_CHAR, '')
    .replace(LEADING_NON_LETTERS, '')
    .replace(HYPHEN_RUNS, '-')
    .replace(EDGE_HYPHENS, '');
  return cut(converted, MAX_NAME_LENGTH).replace(TRAILING_HYPHENS, '');
}

/**
 * The comparison key for uniqueness: NFC plus a locale-independent case fold, `toLowerCase(toUpperCase())`
 * repeated until stable. One pass is not enough for R-12's own example: `ẞ` upper-cases to itself and
 * lower-cases to `ß`, which only the second pass takes to `ss`, where `ß` lands after one.
 */
export function fold(name: string): string {
  let key = name.normalize('NFC');
  for (let i = 0; i < 3; i++) {
    const next = key.toUpperCase().toLowerCase();
    if (next === key) break;
    key = next;
  }
  return key.normalize('NFC');
}

/** Allowed characters, starts with a letter, 1 to 64 characters. NFC is checked separately (`nameStatus`). */
export function isAllowed(name: string): boolean {
  return ALLOWED.test(name) && length(name) <= MAX_NAME_LENGTH;
}

/**
 * A block's name status against the names of every other block (unnamed ones may be passed as `null`).
 * When several apply, the first of `notAllowed`, `notNormalised`, `duplicate` is reported.
 */
export function nameStatus(name: string | null, others: Iterable<string | null>): NameStatus {
  if (name === null || name === '') return 'unnamed';
  if (!isAllowed(name)) return 'notAllowed';
  if (name !== name.normalize('NFC')) return 'notNormalised';
  return findConflict(name, others) === null ? 'valid' : 'duplicate';
}

function findConflict(name: string, others: Iterable<string | null>): string | null {
  const key = fold(name);
  for (const other of others) {
    if (other !== null && other !== '' && fold(other) === key) return other;
  }
  return null;
}

/**
 * Commits a typed name against the names of every other block. An empty conversion is refused (the caller keeps
 * the previous name), and so is a name equal to another block's after NFC and case folding.
 */
export function commitName(typed: string, others: Iterable<string | null>): CommitResult {
  const name = normalise(typed);
  if (name === '') return { ok: false, reason: 'empty' };
  const conflictsWith = findConflict(name, others);
  return conflictsWith === null ? { ok: true, name } : { ok: false, reason: 'duplicate', conflictsWith };
}

/**
 * A generated name, never refused (FR-011/AC13): `Screen-n` with the lowest unused n for a new screen,
 * `Screen-flow` for the flow, the converted label for a screen made from a step label (else `Screen-n`), and
 * `Copy-of-<name>` for a duplicate (else `Screen-n`). A collision with `taken` (compared after folding) adds
 * `-2`, `-3`, …, and the result, suffix included, is at most 64 characters, allowed and NFC.
 */
export function generate(base: GenerateBase, taken: ReadonlySet<string>): string {
  const used = new Set<string>();
  for (const t of taken) used.add(fold(t));

  let stem: string;
  if (base === 'screen') return nextScreen(used);
  if (base === 'flow') stem = 'Screen-flow';
  else if ('fromLabel' in base) stem = normalise(base.fromLabel);
  else stem = base.copyOf === null ? '' : normalise(`Copy-of-${base.copyOf}`);
  if (stem === '') return nextScreen(used);

  const first = cut(stem, MAX_NAME_LENGTH).replace(TRAILING_HYPHENS, '');
  if (!used.has(fold(first))) return first;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = cut(stem, MAX_NAME_LENGTH - suffix.length).replace(TRAILING_HYPHENS, '') + suffix;
    if (!used.has(fold(candidate))) return candidate;
  }
}

function nextScreen(used: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const candidate = `Screen-${n}`;
    if (!used.has(fold(candidate))) return candidate;
  }
}
