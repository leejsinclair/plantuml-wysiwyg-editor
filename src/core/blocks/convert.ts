// "Convert to current format" (FR-010/AC7, OD-5, data-model §7.6, contracts/core-api.md §2).
// An older-format screen is `@startuml [name]`, a `salt` line, the grid, `@enduml`. Converting replaces the
// `@startuml` keyword with `@startsalt`, the `@enduml` keyword with `@endsalt`, and removes the `salt` line with
// its line ending. Everything else (the name, indentation, line endings, comments, preamble lines) stays as
// written. The editor never converts on its own; these edits are applied only on the user's command.
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { TextEdit } from '../types.ts';
import { classify } from './classify.ts';
import { split, type Segment } from './split.ts';

const START_KEYWORD = /^([ \t]*)(@startuml)\b/i;
const END_KEYWORD = /^([ \t]*)(@enduml)[ \t]*$/i;

interface Line {
  readonly start: number;
  readonly text: string;
  /** Just past the line ending. */
  readonly end: number;
}

function linesIn(source: string, start: number, end: number): Line[] {
  const out: Line[] = [];
  let at = start;
  while (at < end) {
    let i = at;
    while (i < end && source[i] !== '\n' && source[i] !== '\r') i++;
    let next = i;
    if (source[i] === '\r') next = source[i + 1] === '\n' ? i + 2 : i + 1;
    else if (source[i] === '\n') next = i + 1;
    out.push({ start: at, text: source.slice(at, i), end: Math.min(next, end) });
    at = next;
  }
  return out;
}

/** The `salt` line: the first body line that is not a comment, blank or preamble (as `classify` reads it). */
function saltLine(body: readonly Line[]): Line | null {
  let inComment = false;
  for (const line of body) {
    const text = line.text.trim();
    if (inComment) {
      if (text.endsWith("'/")) inComment = false;
      continue;
    }
    if (text.startsWith("/'")) {
      inComment = !text.endsWith("'/") || text.length < 4;
      continue;
    }
    if (/^salt$/i.test(text)) return line;
    // Any other line is either preamble (kept) or, since classify said older format, cannot come first.
  }
  return null;
}

/** The edits that convert one older-format block; none for any other block or one that is never closed. */
export function convertOlderFormat(source: string, block: Segment): TextEdit[] {
  if (block.type !== 'block') return [];
  if (!classify(source.slice(block.start, block.end)).olderFormat) return [];
  const lines = linesIn(source, block.start, block.end);
  const first = lines[0];
  const last = lines.at(-1);
  if (!first || !last || lines.length < 3) return [];
  const open = START_KEYWORD.exec(first.text);
  const close = END_KEYWORD.exec(last.text);
  const salt = saltLine(lines.slice(1, -1));
  if (!open || !close || !salt) return [];
  const openAt = first.start + open[1]!.length;
  const closeAt = last.start + close[1]!.length;
  return [
    { start: openAt, end: openAt + open[2]!.length, text: '@startsalt' },
    { start: salt.start, end: salt.end, text: '' },
    { start: closeAt, end: closeAt + close[2]!.length, text: '@endsalt' },
  ];
}

/** "Convert all": the edits for every older-format block in the file, applied together as one change. */
export function convertAllOlderFormat(source: string): TextEdit[] {
  return split(source).flatMap((segment) => convertOlderFormat(source, segment));
}
