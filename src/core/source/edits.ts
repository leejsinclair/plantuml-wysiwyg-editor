// Applying and inverting text edits (contracts/core-api.md §1, data-model §4.2). Every operation in the
// editor returns `TextEdit[]` rather than a new source string, so edits stay minimal (FR-020) and every
// change can be undone exactly (history keeps the inverse). Pure TypeScript, no DOM (constitution 9).

import type { TextEdit } from '../types.ts';

/**
 * The edits in application order: ascending by start, an insertion before a replacement that starts at the
 * same offset, otherwise the order given. Throws a `RangeError` when an edit is out of bounds, has its start
 * after its end, or overlaps another; a refused list changes nothing.
 */
function ordered(source: string, edits: readonly TextEdit[]): TextEdit[] {
  const sorted = edits
    .map((edit, index) => ({ edit, index }))
    .sort((a, b) => a.edit.start - b.edit.start || a.edit.end - b.edit.end || a.index - b.index)
    .map(({ edit }) => edit);
  let previousEnd = 0;
  let previousStart = -1;
  let previousEmpty = true;
  for (const { start, end } of sorted) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > source.length || start > end) {
      throw new RangeError(`Edit ${start}–${end} is outside the source (length ${source.length})`);
    }
    // Touching is allowed (end === next start), and so are several insertions at one offset. Two
    // non-empty edits starting at one offset overlap, as does any edit starting inside a previous one.
    const sameStartNonEmpty = start === previousStart && !previousEmpty && start !== end;
    if (start < previousEnd || sameStartNonEmpty) {
      throw new RangeError(`Edit ${start}–${end} overlaps another edit`);
    }
    previousEnd = end;
    previousStart = start;
    previousEmpty = start === end;
  }
  return sorted;
}

/**
 * Applies non-overlapping edits whose offsets all refer to `source` as given. They are applied from the
 * highest offset down, so no edit moves the offsets of one still to be applied. Insertions at the same
 * offset keep the order given.
 */
export function applyEdits(source: string, edits: readonly TextEdit[]): string {
  const sorted = ordered(source, edits);
  let result = source;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const { start, end, text } = sorted[i]!;
    result = result.slice(0, start) + text + result.slice(end);
  }
  return result;
}

/**
 * The edits that undo `edits`: applied to `applyEdits(source, edits)`, they restore `source` exactly.
 * Offsets refer to the edited text; each inverse edit covers the inserted text and holds the replaced text.
 * Returned in ascending order.
 */
export function invertEdits(source: string, edits: readonly TextEdit[]): TextEdit[] {
  const sorted = ordered(source, edits);
  const inverse: TextEdit[] = [];
  let shift = 0;
  for (const { start, end, text } of sorted) {
    const newStart = start + shift;
    inverse.push({ start: newStart, end: newStart + text.length, text: source.slice(start, end) });
    shift += text.length - (end - start);
  }
  return inverse;
}
