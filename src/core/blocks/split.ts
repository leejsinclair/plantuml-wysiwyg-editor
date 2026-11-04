// Lossless block splitting (R-4, data-model §4.1, contracts/core-api.md §2).
// The segments cover the source exactly and in order; concatenating them gives the source back.

export type Segment =
  | {
      type: 'block';
      /** File-absolute offset of the `@start…` line. */
      start: number;
      /** File-absolute offset just past the matching `@end…` line, including its line ending. */
      end: number;
      /**
       * Start of the comment lines directly above the block (no blank line between), which move and
       * delete with it. Equals `start` when there are none. Those lines stay in the preceding text segment.
       */
      commentStart: number;
      /** The start keyword without `@`, as written: `startsalt`, `startuml`, … */
      opener: string;
      /** The text after the start keyword, trimmed; `null` when there is none. */
      name: string | null;
    }
  | { type: 'text'; start: number; end: number };

interface Line {
  start: number;
  /** End of the line's content, before its line ending. */
  contentEnd: number;
  /** End of the line including its line ending. */
  end: number;
  text: string;
}

const START = /^[ \t]*@start([A-Za-z0-9_]+)(.*)$/i;
const END = /^[ \t]*@end([A-Za-z0-9_]+)[ \t]*$/i;

function lines(source: string): Line[] {
  const out: Line[] = [];
  let at = 0;
  while (at < source.length) {
    let i = at;
    while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
    let end = i;
    if (source[i] === '\r') end = source[i + 1] === '\n' ? i + 2 : i + 1;
    else if (source[i] === '\n') end = i + 1;
    out.push({ start: at, contentEnd: i, end, text: source.slice(at, i) });
    at = end;
  }
  return out;
}

function startMatch(text: string): { word: string; rest: string } | null {
  const m = START.exec(text);
  if (!m) return null;
  const rest = m[2] ?? '';
  // `@startsalt` must be a whole word: `@startsalt-x` is not a start line.
  if (rest !== '' && !/^[ \t(]/.test(rest)) return null;
  return { word: m[1]!, rest };
}

const isBlank = (text: string) => text.trim() === '';
const isLineComment = (text: string) => text.trimStart().startsWith("'");

/** Index of the first line of the comment run directly above `blockLine`, not before `floor`. */
function commentRunStart(ls: Line[], blockLine: number, floor: number): number {
  let i = blockLine;
  while (i - 1 >= floor) {
    const prev = ls[i - 1]!.text;
    if (isBlank(prev)) break;
    if (isLineComment(prev)) {
      i--;
      continue;
    }
    if (prev.trimEnd().endsWith("'/")) {
      // A `/' … '/` block comment: find the line that opens it.
      let j = i - 1;
      while (j >= floor && !ls[j]!.text.includes("/'")) j--;
      if (j < floor || !ls[j]!.text.trimStart().startsWith("/'")) break;
      i = j;
      continue;
    }
    break;
  }
  return i;
}

export function split(source: string): Segment[] {
  const segments: Segment[] = [];
  const ls = lines(source);
  // A leading byte-order mark stays out of the first line so a block never starts with it.
  if (source.startsWith('﻿') && ls.length > 0) {
    const first = ls[0]!;
    ls[0] = { ...first, start: 1, text: first.text.slice(1) };
  }

  let textStart = 0; // start of the pending text segment
  let textLine = 0; // first line of the pending text segment
  let i = 0;
  while (i < ls.length) {
    const open = startMatch(ls[i]!.text);
    if (!open) {
      i++;
      continue;
    }
    const word = open.word.toLowerCase();
    let last = ls.length - 1; // unmatched: run to the end of the file …
    for (let j = i + 1; j < ls.length; j++) {
      const t = ls[j]!.text;
      const close = END.exec(t);
      if (close && close[1]!.toLowerCase() === word) {
        last = j;
        break;
      }
      if (startMatch(t)) {
        last = j - 1; // … or up to the next start line.
        break;
      }
    }
    const blockStart = ls[i]!.start;
    if (blockStart > textStart) segments.push({ type: 'text', start: textStart, end: blockStart });
    const commentLine = commentRunStart(ls, i, textLine);
    const name = open.rest.trim();
    const end = ls[last]!.end;
    segments.push({
      type: 'block',
      start: blockStart,
      end,
      commentStart: commentLine < i ? ls[commentLine]!.start : blockStart,
      opener: `start${open.word}`,
      name: name === '' ? null : name,
    });
    textStart = end;
    i = last + 1;
    textLine = i;
  }
  if (source.length > textStart) segments.push({ type: 'text', start: textStart, end: source.length });
  return segments;
}
