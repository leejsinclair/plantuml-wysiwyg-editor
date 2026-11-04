// Syntax highlighting for the source view (R-6): small stream tokenizers for Salt and activity source, run by
// CodeMirror's `StreamLanguage`, which builds a Lezer tree whose nodes carry `@lezer/highlight` tags. Highlighting
// is presentation only: losslessness and validity come from the core parsers, never from here.
//
// Token names are `@lezer/highlight` tag names, so the editor can style them with `classHighlighter`
// (`tok-keyword`, `tok-string`, …):
//   keyword      `@start…`/`@end…`, container modifiers (`{+`, `{T`), activity keywords
//   labelName    the block name, activity lanes `|Lane|`
//   comment      `'` lines and `/'` … `'/`
//   meta         preprocessor lines (`!define`, `!include`, …)
//   string       buttons, text fields, drop-downs, steps, conditions and note text
//   atom         checkboxes, radio buttons, separators and the empty cell `.`
//   operator     `|` between cells, the span marker `*`, arrows
//   punctuation  a plain `{` and every `}`
//   link         a linked step's `[[#Screen` and `]]`
//   escape       `<U+hhhh>` escapes

import { StreamLanguage, type StreamParser, type StringStream } from '@codemirror/language';

export type SourceLanguageKind = 'salt' | 'activity' | 'other';

interface CommonState {
  inBlockComment: boolean;
  /** Just after an `@start…` keyword: the rest of the line is the block name. */
  afterStart: boolean;
}

/** Line-start forms shared by both languages; `null` when none applies. */
function lineStart(stream: StringStream, state: CommonState): string | null {
  if (state.inBlockComment) {
    if (stream.match(/^.*?'\//)) state.inBlockComment = false;
    else stream.skipToEnd();
    return 'comment';
  }
  if (stream.sol()) state.afterStart = false;
  if (state.afterStart) {
    if (stream.eatSpace()) return null;
    stream.skipToEnd();
    state.afterStart = false;
    return 'labelName';
  }
  if (stream.column() !== stream.indentation()) return null;
  if (stream.match(/^'.*/)) return 'comment';
  if (stream.match(/^!.*/)) return 'meta';
  if (stream.match(/^\/'/)) {
    if (!stream.match(/^.*?'\//)) {
      stream.skipToEnd();
      state.inBlockComment = true;
    }
    return 'comment';
  }
  if (stream.match(/^@start\w*/i)) {
    state.afterStart = true;
    return 'keyword';
  }
  if (stream.match(/^@end\w*/i)) return 'keyword';
  return null;
}

// --------------------------------------------------------------------------------------------------- Salt

type SaltState = CommonState;

const saltParser: StreamParser<SaltState> = {
  name: 'salt',
  startState: () => ({ inBlockComment: false, afterStart: false }),
  copyState: (s) => ({ ...s }),
  token(stream, state) {
    if (stream.sol() && !state.inBlockComment && !state.afterStart && stream.eatSpace()) return null;
    const start = lineStart(stream, state);
    if (start !== null || stream.pos > stream.start) return start;
    if (stream.eatSpace()) return null;

    if (stream.match(/^\{(?:S[I-]?|T[#!+-]?|[*/]|[+#!-]+\^?|\^)/)) return 'keyword';
    if (stream.eat('{') || stream.eat('}')) return 'punctuation';
    if (stream.eat('|')) return 'operator';
    if (stream.match(/^<U\+[0-9A-Fa-f]{4,6}>/)) return 'escape';
    if (stream.match(/^(?:\.\.+|==+|~~+|--+|\.)[^\S\r\n]*(?=$|[|}])/)) return 'atom';
    if (stream.match(/^\*[^\S\r\n]*(?=$|[|}])/)) return 'operator';
    if (stream.match(/^(?:\[[X ]\]|\([X ]\))/)) return 'atom';
    if (stream.match(/^\[[^\]|{}]*\]/)) return 'string';
    if (stream.match(/^"[^"|{}]*"/)) return 'string';
    if (stream.match(/^\^[^|{}]*\^/)) return 'string';
    if (stream.match(/^[^|{}<[("^\s]+/) || stream.next() !== undefined) return null;
    return null;
  },
  languageData: { commentTokens: { line: "'" } },
};

// ----------------------------------------------------------------------------------------------- activity

interface ActivityState extends CommonState {
  /** Inside a step whose `;` is still to come. */
  inStep: boolean;
  /** Inside a multi-line note, until `end note`. */
  inNote: boolean;
}

const KEYWORD =
  /^(?:end\s*(?:fork|merge|switch|while|if|split|group|partition)|endif|endwhile|endfork|endswitch|elseif|else|if|then|repeat\s+while|repeat|while|backward|fork\s+again|fork|split\s+again|split|switch|case|partition|group|detach|kill|goto|label|start|stop|end|is|not|and|or)(?![\w-])/i;

const activityParser: StreamParser<ActivityState> = {
  name: 'activity',
  startState: () => ({ inBlockComment: false, afterStart: false, inStep: false, inNote: false }),
  copyState: (s) => ({ ...s }),
  token(stream, state) {
    if (state.inNote) {
      if (stream.match(/^\s*end\s*note\b/i)) {
        state.inNote = false;
        return 'keyword';
      }
      stream.skipToEnd();
      return 'string';
    }
    if (state.inStep) {
      if (stream.match(/^\[\[#?[^\s\]]*/) || stream.match(/^\]\]/)) return 'link';
      if (stream.eat(';')) {
        state.inStep = false;
        return 'string';
      }
      if (!stream.match(/^[^;[\]]+/)) stream.next();
      return 'string';
    }
    if (stream.sol() && !state.inBlockComment && !state.afterStart && stream.eatSpace()) return null;
    const start = lineStart(stream, state);
    if (start !== null || stream.pos > stream.start) return start;
    if (stream.eatSpace()) return null;

    if (stream.column() === stream.indentation() && stream.match(/^\|[^|]*\|/)) return 'labelName';
    if (stream.match(/^:(?:(?!\[\[)[^;])*;/)) return 'string';
    if (stream.eat(':')) {
      state.inStep = true;
      return 'string';
    }
    if (stream.match(/^(?:floating\s+)?note\s+(?:left|right)\b/i)) {
      if (!stream.match(/^\s*:/, false)) state.inNote = stream.match(/^\s*$/, false) !== null;
      return 'keyword';
    }
    if (stream.match(/^:\s*/)) return null;
    if (stream.match(KEYWORD)) return 'keyword';
    if (stream.match(/^\([^)]*\)/)) return 'string';
    if (stream.match(/^-+>|^<-+/)) return 'operator';
    if (stream.match(/^\{\{\w*/) || stream.match(/^\}\}/)) return 'punctuation';
    if (stream.match(/^[\w-]+/) || stream.next() !== undefined) return null;
    return null;
  },
  languageData: { commentTokens: { line: "'" } },
};

export const saltLanguage: StreamLanguage<SaltState> = StreamLanguage.define(saltParser);
export const activityLanguage: StreamLanguage<ActivityState> = StreamLanguage.define(activityParser);

/** The highlighter for a block: Salt for screens, activity for the flow, none for other content. */
export function languageFor(kind: SourceLanguageKind): StreamLanguage<SaltState> | StreamLanguage<ActivityState> | null {
  if (kind === 'salt') return saltLanguage;
  if (kind === 'activity') return activityLanguage;
  return null;
}
