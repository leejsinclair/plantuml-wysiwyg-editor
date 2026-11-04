// Lossless Salt lexer (R-3): every character of a block's text belongs to exactly one token, whitespace and
// comments included, so the parser can build a tree whose ranges reproduce the source byte for byte.
//
// Line-level forms, recognised only as the first thing on a line (after indentation), as PlantUML does:
//   `@start…` / `@end…` lines, `!` preprocessor lines, `'` full-line comments, and `/'` … `'/` block comments.
//   A block comment closes on its first line if `'/` appears there (the rest of that line is lexed normally);
//   otherwise it runs to the first later line that ends with `'/`, or to the end of the text (`unterminated`).
//   A `'` or `/'` after other text on a line is ordinary text (for example "Don't").
// Content: `{` (with its container modifier), `}`, `|`, whitespace runs, newlines, and cell text. `{`, `}` and `|`
// are structural wherever they appear. Cell text runs to the next structural character or line end and keeps
// its inner spaces; spaces before and after it are separate whitespace tokens.
//
// Container modifiers must touch the brace, as in PlantUML 1.2026.9 (checked with the command-line jar):
//   `S`, `SI`, `S-` scroll area; `*` menu bar; `/` tab bar; a run of `+ # ! -` styles, optionally ending in `^`
//   (group box, its title is the text that follows). Several styles are kept in one modifier so the parser can
//   flag them (EC-09). `T` and the tree-table variants `T# T! T- T+` are a tree only when nothing but spaces
//   follows on the line; PlantUML reads `{Total | 5}` or `{T a | b}` as a grid whose first cell starts with `T`.
//   Any other character after `{` (for example `{Z`) is cell text.

export type SaltTokenKind =
  | 'start' // an `@start…` line, without its newline
  | 'end' // an `@end…` line, without its newline
  | 'preprocessor' // a line starting with `!`
  | 'comment' // a full line starting with `'`
  | 'blockComment' // `/'` … `'/`, possibly over several lines
  | 'open' // `{` plus its modifier
  | 'close' // `}`
  | 'pipe' // `|`
  | 'text' // cell text
  | 'whitespace' // spaces and tabs (never newlines)
  | 'newline'; // `\n`, `\r\n` or `\r`

export interface SaltToken {
  kind: SaltTokenKind;
  /** Offset of the first character. */
  start: number;
  /** Offset after the last character; always greater than `start`. */
  end: number;
  /** For `open`: the characters after `{` that form its modifier ('' for a plain grid). */
  modifier?: string;
  /** For `blockComment`: no closing `'/` was found, so the comment runs to the end of the text. */
  unterminated?: true;
}

const HSPACE = /[^\S\r\n]/;
const isHSpace = (c: string | undefined): boolean => c !== undefined && HSPACE.test(c);
const isNewline = (c: string | undefined): boolean => c === '\n' || c === '\r';
const isStructural = (c: string): boolean => c === '{' || c === '}' || c === '|' || c === '\n' || c === '\r';

const SCROLL = /^S[I-]?/;
const TREE = /^T[#!+-]?(?=[^\S\r\n]*(?:\r|\n|$))/;
const NAV = /^[*/]/;
const STYLES = /^(?:[+#!-]+\^?|\^)/;

/** Offset of the end of the line containing `from` (the next newline character, or the end of the text). */
function lineEnd(src: string, from: number): number {
  let i = from;
  while (i < src.length && !isNewline(src[i])) i++;
  return i;
}

function modifierAt(src: string, from: number): string {
  const rest = src.slice(from, lineEnd(src, from));
  for (const re of [SCROLL, TREE, NAV, STYLES]) {
    const m = re.exec(rest);
    if (m) return m[0];
  }
  return '';
}

/** Splits a Salt block's text (or any part of it) into tokens that cover it exactly and in order. */
export function lexSalt(src: string): SaltToken[] {
  const tokens: SaltToken[] = [];
  const push = (kind: SaltTokenKind, start: number, end: number, extra?: Partial<SaltToken>): void => {
    tokens.push({ kind, start, end, ...extra });
  };

  let i = 0;
  let atLineStart = true;

  while (i < src.length) {
    const c = src[i]!;

    if (isNewline(c)) {
      const end = c === '\r' && src[i + 1] === '\n' ? i + 2 : i + 1;
      push('newline', i, end);
      i = end;
      atLineStart = true;
      continue;
    }

    if (isHSpace(c)) {
      let end = i + 1;
      while (isHSpace(src[end])) end++;
      push('whitespace', i, end);
      i = end;
      continue;
    }

    if (atLineStart) {
      atLineStart = false;
      const eol = lineEnd(src, i);
      if (c === "'") {
        push('comment', i, eol);
        i = eol;
        continue;
      }
      if (c === '!') {
        push('preprocessor', i, eol);
        i = eol;
        continue;
      }
      if (c === '@') {
        const word = src.slice(i, i + 6).toLowerCase();
        if (word.startsWith('@start') || word.startsWith('@end')) {
          push(word.startsWith('@start') ? 'start' : 'end', i, eol);
          i = eol;
          continue;
        }
      }
      if (c === '/' && src[i + 1] === "'") {
        i = blockComment(src, i, eol, push);
        continue;
      }
    }

    if (c === '{') {
      const modifier = modifierAt(src, i + 1);
      push('open', i, i + 1 + modifier.length, { modifier });
      i += 1 + modifier.length;
      continue;
    }
    if (c === '}') {
      push('close', i, i + 1);
      i++;
      continue;
    }
    if (c === '|') {
      push('pipe', i, i + 1);
      i++;
      continue;
    }

    // Cell text: up to the next structural character, without the spaces before it.
    let end = i + 1;
    while (end < src.length && !isStructural(src[end]!)) end++;
    let textEnd = end;
    while (textEnd > i && isHSpace(src[textEnd - 1])) textEnd--;
    push('text', i, textEnd);
    i = textEnd;
  }

  return tokens;
}

/** Lexes a block comment opening at `start` (a line's first `/'`) and returns the offset after it. */
function blockComment(
  src: string,
  start: number,
  eol: number,
  push: (kind: SaltTokenKind, start: number, end: number, extra?: Partial<SaltToken>) => void,
): number {
  const sameLine = src.indexOf("'/", start + 2);
  if (sameLine !== -1 && sameLine + 2 <= eol) {
    push('blockComment', start, sameLine + 2);
    return sameLine + 2;
  }
  // Later lines: the comment ends on the first line whose content ends with `'/`.
  let lineStart = eol;
  while (lineStart < src.length) {
    lineStart += src[lineStart] === '\r' && src[lineStart + 1] === '\n' ? 2 : 1;
    const end = lineEnd(src, lineStart);
    let last = end;
    while (last > lineStart && isHSpace(src[last - 1])) last--;
    if (last - lineStart >= 2 && src[last - 2] === "'" && src[last - 1] === '/') {
      push('blockComment', start, last);
      return last;
    }
    lineStart = end;
  }
  push('blockComment', start, src.length, { unterminated: true });
  return src.length;
}
