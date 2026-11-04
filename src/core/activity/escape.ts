// Activity step label escaping (section 3.4, contracts/project-file.md §8, FR-013/AC5).
// `<U+hhhh>` is the one escape that renders literally everywhere and keeps a link intact;
// `~` would break a linked step (spike-renderer.md, Escaping results).

const CREOLE_PAIR_CHARS = new Set(['*', '/', '_', '"', '-', '~']);
const LINK_CHARS = new Set(['[', ']', '|']);

const hex = (ch: string) => `<U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}>`;

/**
 * Escapes a step label so it renders exactly as typed. Ordinary text is written unchanged.
 * A linked label (`:[[#<screen-id> <label>]];`) also escapes every `[`, `]` and `|`.
 */
export function escapeStepLabel(label: string, linked: boolean): string {
  let out = '';
  for (let i = 0; i < label.length; i++) {
    const ch = label[i]!;
    const next = label[i + 1];
    if (ch === '<' && /^[Uu]\+/.test(label.slice(i + 1, i + 3))) {
      out += hex(ch); // a typed `<U+` must not read as an escape
    } else if (linked && LINK_CHARS.has(ch)) {
      out += hex(ch);
    } else if (!linked && ch === '[' && next === '[') {
      out += hex(ch); // `[[` would start a link
    } else if (CREOLE_PAIR_CHARS.has(ch) && next === ch) {
      out += hex(ch); // the first of a creole pair; the next character is checked in turn
    } else {
      out += ch;
    }
  }
  return out;
}

/** Decodes `<U+hhhh>` escapes. `unescapeStepLabel(escapeStepLabel(t, linked)) === t`. */
export function unescapeStepLabel(source: string): string {
  return source.replace(/<[Uu]\+([0-9A-Fa-f]{4,6})>/g, (whole, digits: string) => {
    const cp = parseInt(digits, 16);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
  });
}
