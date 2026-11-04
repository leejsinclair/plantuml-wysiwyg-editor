// Lossless activity-diagram lexer (R-3). Every character of the input belongs to exactly one
// token, in order, so concatenating the token texts reproduces the input byte for byte.
//
// Activity source is line-oriented: a line holds indentation, at most one statement, trailing
// whitespace and a line ending. Three kinds of token may span lines and then include their inner
// line endings: a step (`:` … `;`, including `{{salt … }}` content), a block note
// (`note left` … `end note`) and a block comment (`/'` … `'/`). Recognising a construct here does
// not mean the editor supports it: the parser decides what is editable, locked or source-only.

export type ActivityTokenKind =
  // Trivia
  | 'whitespace'
  | 'newline'
  | 'comment'
  // Block lines
  | 'startDirective'
  | 'endDirective'
  // Source-only markers
  | 'preprocessor'
  | 'legacy'
  | 'goto'
  | 'label'
  // Statements
  | 'start'
  | 'stop'
  | 'end'
  | 'detach'
  | 'kill'
  | 'step'
  | 'note'
  | 'lane'
  | 'arrow'
  | 'if'
  | 'elseif'
  | 'else'
  | 'endif'
  | 'repeat'
  | 'repeatWhile'
  | 'while'
  | 'endwhile'
  | 'fork'
  | 'forkAgain'
  | 'endFork'
  | 'split'
  | 'splitAgain'
  | 'endSplit'
  | 'switch'
  | 'case'
  | 'endSwitch'
  | 'partition'
  | 'closeBrace'
  | 'endGroup'
  | 'unknown';

/** Characters PlantUML accepts at the end of a step: `;` plus the SDL shapes `| < > / ] }`. */
export type StepTerminator = ';' | '|' | '<' | '>' | '/' | ']' | '}';

interface TokenBase {
  /** Offset in UTF-16 code units, relative to the lexed text. */
  readonly start: number;
  readonly end: number;
  /** Present and true when the text ended before the token's closing form. */
  readonly unterminated?: true;
}

export type ActivityToken =
  | (TokenBase & {
      readonly kind: 'step';
      /** null when unterminated. */
      readonly terminator: StepTerminator | null;
      /** The label contains `{{salt` (a locked part). */
      readonly embeddedSalt: boolean;
    })
  | (TokenBase & { readonly kind: 'note'; readonly form: 'singleLine' | 'block' })
  | (TokenBase & { readonly kind: Exclude<ActivityTokenKind, 'step' | 'note'> });

const STEP_TERMINATORS = ';|<>/]}';

/** Single-line statements, tested in order against the statement text (trimmed on the right). */
const STATEMENTS: readonly (readonly [RegExp, Exclude<ActivityTokenKind, 'step' | 'note'>])[] = [
  [/^@start/i, 'startDirective'],
  [/^@end/i, 'endDirective'],
  [/^!/, 'preprocessor'],
  [/\(\*(?:top)?\)/i, 'legacy'],
  [/^"/, 'legacy'],
  [/^===/, 'legacy'],
  [/^if\s*"/i, 'legacy'],
  [/^start$/i, 'start'],
  [/^stop$/i, 'stop'],
  [/^end$/i, 'end'],
  [/^detach$/i, 'detach'],
  [/^kill$/i, 'kill'],
  [/^if\s*\(/i, 'if'],
  [/^(?:elseif|else\s+if)\s*\(/i, 'elseif'],
  [/^else\b/i, 'else'],
  [/^(?:endif|end\s+if)\b/i, 'endif'],
  [/^repeat\s+while\b/i, 'repeatWhile'],
  [/^repeat\b/i, 'repeat'],
  [/^while\s*\(/i, 'while'],
  [/^(?:endwhile|end\s+while)\b/i, 'endwhile'],
  [/^fork\s+again\b/i, 'forkAgain'],
  [/^fork\b/i, 'fork'],
  [/^end\s*(?:fork|merge)\b/i, 'endFork'],
  [/^split\s+again\b/i, 'splitAgain'],
  [/^split\b/i, 'split'],
  [/^end\s*split\b/i, 'endSplit'],
  [/^switch\s*\(/i, 'switch'],
  [/^case\s*\(/i, 'case'],
  [/^(?:endswitch|end\s+switch)\b/i, 'endSwitch'],
  [/^(?:partition|group|package|rectangle|card)\b/i, 'partition'],
  [/^end\s*(?:group|partition)\b/i, 'endGroup'],
  [/^\}$/, 'closeBrace'],
  [/^goto\b/i, 'goto'],
  [/^label\b/i, 'label'],
  [/^\|/, 'lane'],
];

const ARROW = /^-+(?:\[[^\]]*\])?-*>/;
const STEP_START = /^(?:#[^\s:;]*\s*)?:/;
const NOTE_START = /^(?:floating\s+)?note\b/i;
const NOTE_END = /^end\s?note$/i;

const isSpace = (c: string | undefined): boolean => c === ' ' || c === '\t' || c === '﻿';
const isNewline = (c: string | undefined): boolean => c === '\n' || c === '\r';

/** Offset of the next line ending at or after `from`, or the text length. */
function lineEnd(text: string, from: number): number {
  let i = from;
  while (i < text.length && !isNewline(text[i])) i += 1;
  return i;
}

/** Offset just past the line ending at `at` (which must be a line ending). */
function afterNewline(text: string, at: number): number {
  return text.startsWith('\r\n', at) ? at + 2 : at + 1;
}

/** Offset just past the last non-whitespace character in [from, to), or `from` if none. */
function trimmedEnd(text: string, from: number, to: number): number {
  let i = to;
  while (i > from && isSpace(text[i - 1])) i -= 1;
  return i;
}

function lexStep(text: string, start: number, colon: number): ActivityToken {
  let depth = 0;
  let embeddedSalt = false;
  let from = colon + 1;
  for (;;) {
    const eol = lineEnd(text, from);
    for (let j = from; j < eol; j += 1) {
      if (text.startsWith('{{', j)) {
        if (/^\{\{\s*salt/i.test(text.slice(j, eol))) embeddedSalt = true;
        depth += 1;
        j += 1;
      } else if (text.startsWith('}}', j)) {
        depth = Math.max(0, depth - 1);
        j += 1;
      }
    }
    const last = trimmedEnd(text, from, eol);
    const lastChar = text[last - 1];
    // A line ending `}}` closes embedded Salt, not the step: the terminator follows (`:Form` … `}}` then `;`).
    const closesSalt = embeddedSalt && text.startsWith('}}', last - 2);
    if (depth === 0 && !closesSalt && last > from && lastChar !== undefined && STEP_TERMINATORS.includes(lastChar)) {
      return { kind: 'step', start, end: last, terminator: lastChar as StepTerminator, embeddedSalt };
    }
    if (eol >= text.length) {
      return { kind: 'step', start, end: text.length, terminator: null, embeddedSalt, unterminated: true };
    }
    from = afterNewline(text, eol);
  }
}

function lexNote(text: string, start: number, statementEnd: number): ActivityToken {
  if (text.slice(start, statementEnd).includes(':')) {
    return { kind: 'note', start, end: statementEnd, form: 'singleLine' };
  }
  let eol = lineEnd(text, statementEnd);
  while (eol < text.length) {
    const lineStart = afterNewline(text, eol);
    eol = lineEnd(text, lineStart);
    let contentStart = lineStart;
    while (contentStart < eol && isSpace(text[contentStart])) contentStart += 1;
    const contentEnd = trimmedEnd(text, contentStart, eol);
    if (NOTE_END.test(text.slice(contentStart, contentEnd))) {
      return { kind: 'note', start, end: contentEnd, form: 'block' };
    }
  }
  return { kind: 'note', start, end: text.length, form: 'block', unterminated: true };
}

/** Lex one block's text (from its `@start…` line to its `@end…` line, or any fragment of it). */
export function lexActivity(text: string): ActivityToken[] {
  const tokens: ActivityToken[] = [];
  let pos = 0;
  while (pos < text.length) {
    const c = text[pos];

    if (isNewline(c)) {
      const end = afterNewline(text, pos);
      tokens.push({ kind: 'newline', start: pos, end });
      pos = end;
      continue;
    }

    if (isSpace(c)) {
      let end = pos + 1;
      while (end < text.length && isSpace(text[end])) end += 1;
      tokens.push({ kind: 'whitespace', start: pos, end });
      pos = end;
      continue;
    }

    if (text.startsWith("/'", pos)) {
      const close = text.indexOf("'/", pos + 2);
      if (close < 0) {
        tokens.push({ kind: 'comment', start: pos, end: text.length, unterminated: true });
        pos = text.length;
      } else {
        tokens.push({ kind: 'comment', start: pos, end: close + 2 });
        pos = close + 2;
      }
      continue;
    }

    const eol = lineEnd(text, pos);
    if (c === "'") {
      tokens.push({ kind: 'comment', start: pos, end: eol });
      pos = eol;
      continue;
    }

    const statementEnd = trimmedEnd(text, pos, eol);
    const statement = text.slice(pos, statementEnd);
    let token: ActivityToken;

    const step = STEP_START.exec(statement);
    if (step) {
      token = lexStep(text, pos, pos + step[0].length - 1);
    } else if (NOTE_START.test(statement)) {
      token = lexNote(text, pos, statementEnd);
    } else {
      token = { kind: classifyStatement(statement), start: pos, end: statementEnd };
    }
    tokens.push(token);
    pos = token.end;
  }
  return tokens;
}

function classifyStatement(statement: string): Exclude<ActivityTokenKind, 'step' | 'note'> {
  for (const [pattern, kind] of STATEMENTS) {
    if (pattern.test(statement)) return kind;
  }
  const arrow = ARROW.exec(statement);
  if (arrow) {
    const rest = statement.slice(arrow[0].length).trim();
    return rest === '' || rest.endsWith(';') ? 'arrow' : 'legacy';
  }
  return 'unknown';
}
