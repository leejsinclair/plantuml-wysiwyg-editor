// Salt text escaping (spec section 3.4, contracts/project-file.md section 8, FR-003/AC6).
// Text is literal: the writer escapes only the characters Salt or creole would otherwise interpret.
// The forms are the ones the renderer spike confirmed in both renderers (spike-renderer.md, Escaping results):
// `<U+hhhh>` for an interpreted character, and a leading U+200B for a command word in a row's first cell.

export interface SaltTextContext {
  firstCellOfRow: boolean;
}

const ZWS = '​';
/** Characters that start another element type when they lead a cell. */
const LEADING = new Set(['*', '[', '(', '^', '"']);
/** Characters that form creole markup when doubled: `**`, `//`, `__`, `""`, `--`, `~~`. */
const CREOLE = new Set(['*', '/', '_', '"', '-', '~']);
/** A whole cell that Salt reads as an empty cell or a separator. */
const WHOLE_CELL = /^(?:\.+|==+|~~+|--+)$/;
/**
 * PlantUML commands that remove a row whose first cell starts with them. The spec names these words; the
 * alignment prefix and `end…` forms are matched too, since a zero-width space in front is invisible and harmless.
 */
const COMMAND_WORD =
  /^(?:(?:left|right|center)\s+)?(?:end\s*)?(?:title|header|footer|caption|legend|mainframe|skinparam|scale)(?![\p{L}\p{N}_-])/iu;

const isBlank = (c: string | undefined) => c === ' ' || c === '\t';

function unicodeEscape(c: string): string {
  return `<U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}>`;
}

/** Writes `text` as the source of a Salt cell's text, so that it renders and re-imports exactly as typed. */
export function escapeSaltText(text: string, ctx: SaltTextContext): string {
  const escape = new Array<boolean>(text.length).fill(false);
  let start = 0;
  while (isBlank(text[start])) start++;
  const trimmed = text.trim();

  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    // Braces and bars end or start a cell or a grid anywhere.
    if (c === '{' || c === '}' || c === '|') escape[i] = true;
    // A typed `<U+` would itself be read as an escape.
    if (c === '<' && (text[i + 1] === 'U' || text[i + 1] === 'u') && text[i + 2] === '+') escape[i] = true;
    // `/'` opens a block comment anywhere on a line.
    if (c === '/' && text[i + 1] === "'") escape[i] = true;
  }

  // A row's first cell starts the source line, where `'` is a comment, `!` a preprocessor line and `@` a block
  // boundary (checked against plantuml-1.2026.9.jar).
  if (ctx.firstCellOfRow && (text[start] === "'" || text[start] === '!' || text[start] === '@')) escape[start] = true;

  // Creole pairs: every character of a run of two or more of the same marker.
  for (let i = 0; i < text.length; ) {
    const c = text[i] ?? '';
    let j = i + 1;
    while (text[j] === c) j++;
    if (CREOLE.has(c) && j - i >= 2) for (let k = i; k < j; k++) escape[k] = true;
    i = j;
  }

  // Leading characters that would change the element's type.
  if (text.startsWith('==', start)) escape[start] = escape[start + 1] = true;
  else if (LEADING.has(text[start] ?? '')) escape[start] = true;

  // A whole cell of `.`, `...` or a separator.
  if (WHOLE_CELL.test(trimmed)) for (let i = start; i < start + trimmed.length; i++) escape[i] = true;

  let out = '';
  for (let i = 0; i < text.length; i++) out += escape[i] ? unicodeEscape(text[i] ?? '') : text[i];

  // Unescaping drops one leading U+200B, so text that starts with one keeps it by getting another.
  if (text.startsWith(ZWS) || (ctx.firstCellOfRow && COMMAND_WORD.test(text.slice(start)))) out = ZWS + out;
  return out;
}

/** Reads a Salt cell's source text back as the text it displays: the inverse of `escapeSaltText`. */
export function unescapeSaltText(source: string): string {
  const body = source.startsWith(ZWS) ? source.slice(1) : source;
  return body.replace(/<U\+([0-9A-Fa-f]{4,6})>/g, (match, hex: string) => {
    const cp = parseInt(hex, 16);
    return cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? match : String.fromCodePoint(cp);
  });
}

/**
 * Imported formatted text (section 3.4, EC-06): source that differs from the editor's own escaped form of the
 * text it displays. Such text is kept exactly until the user edits it and chooses how to keep it.
 */
export function isFormattedSaltText(source: string, ctx: SaltTextContext): boolean {
  return escapeSaltText(unescapeSaltText(source), ctx) !== source;
}
