// The activity parser (R-3, data-model §5.3, section 4 and 4.1, contracts/core-api.md §3).
//
// It builds a lossless syntax tree over the lexer's tokens (every character belongs to exactly one leaf, in
// order) and derives the flow model from it, synchronously and without the renderer:
//
// - Supported: start, stop and end, steps and linked steps, `if`/`elseif`/`else`, `repeat` and `while`, lanes
//   with the effective lane per element, notes attached to their owner or to the start of a path, and the
//   full-line comments directly above each node (`leadingComments`).
// - Locked parts (category 2, isolable): fork, split, switch, partition and group, detach and kill, `{{salt`
//   inside a step, arrows and arrow labels, SDL step shapes, and well-formed forms the editor does not model.
//   Each is the smallest complete statement or block and keeps its lane and notes.
// - Source-only (category 2, not isolable): legacy syntax, `goto`/`label` and preprocessor lines. They give
//   `unsupported` diagnostics and no model.
// - Invalid (category 3): structurally malformed source gives `syntax` diagnostics with their line and no model.
import type { Diagnostic, MessageParams, TextRange } from '../types.ts';
import { escapeStepLabel, unescapeStepLabel } from './escape.ts';
import { lexActivity, type ActivityToken, type ActivityTokenKind } from './lexer.ts';
import type {
  Branch,
  Decision,
  FlowElement,
  FlowLockReason,
  Lane,
  LaneSwitch,
  LockedPart,
  Loop,
  LoopLabels,
  Note,
  Path,
  ScreenFlow,
  Step,
  TextValue,
} from './model.ts';

/** A node of the lossless syntax tree. Leaves are tokens; a parent spans its children exactly. */
export interface Node {
  readonly kind: string;
  start: number;
  end: number;
  readonly children: Node[];
}

export interface ParseError {
  /** 1-based line within the block. */
  readonly line: number;
  readonly messageKey: string;
  readonly params?: MessageParams;
}

export interface ActivityParse {
  readonly tree: Node;
  /** `null` when the block has syntax errors or source-only content. */
  readonly model: ScreenFlow | null;
  /** Syntax errors (category 3), in source order. */
  readonly errors: ParseError[];
  /** Syntax errors and source-only reasons, with block-relative ranges. */
  readonly diagnostics: Diagnostic[];
}

const TRIVIA: ReadonlySet<ActivityTokenKind> = new Set(['whitespace', 'newline', 'comment']);
/** Lines that may come before the first lane switch: trivia, the start line, preprocessor and settings. */
const BEFORE_FIRST_LANE: ReadonlySet<ActivityTokenKind> = new Set([...TRIVIA, 'startDirective', 'preprocessor', 'unknown']);

/** Closing and continuing keywords: outside their construct they have nothing to close. */
const CLOSERS: ReadonlySet<ActivityTokenKind> = new Set([
  'elseif', 'else', 'endif', 'repeatWhile', 'endwhile', 'forkAgain', 'endFork', 'splitAgain', 'endSplit',
  'case', 'endSwitch', 'closeBrace', 'endGroup',
]);

const KEYWORD: Partial<Record<ActivityTokenKind, string>> = {
  if: 'if', elseif: 'elseif', else: 'else', endif: 'endif', repeat: 'repeat', repeatWhile: 'repeat while',
  while: 'while', endwhile: 'endwhile', fork: 'fork', forkAgain: 'fork again', endFork: 'end fork',
  split: 'split', splitAgain: 'split again', endSplit: 'end split', switch: 'switch', case: 'case',
  endSwitch: 'endswitch', closeBrace: '}', endGroup: 'end group', startDirective: '@startuml',
  endDirective: '@enduml',
};

const SOURCE_ONLY: Partial<Record<ActivityTokenKind, string>> = {
  legacy: 'diagnostic.unsupported.legacyActivity',
  goto: 'diagnostic.unsupported.gotoLabel',
  label: 'diagnostic.unsupported.gotoLabel',
  preprocessor: 'diagnostic.unsupported.preprocessor',
};

/** Valid statements the lexer does not name; they are kept as locked parts. */
const OTHER_STATEMENT = /^(?:backward|break)\b/i;

// ------------------------------------------------------------------------------------- header clauses

type Clause = { type: 'word'; value: string } | { type: 'paren'; inner: TextRange };

/**
 * The words and bracketed groups after a keyword, e.g. `(a) then (b)` → paren, word, paren. Positions are
 * relative to `text`. `null` when a bracket is not closed.
 */
function clauses(text: string, from: number, to: number): Clause[] | null {
  const out: Clause[] = [];
  let i = from;
  while (i < to) {
    const c = text[i]!;
    if (c === ' ' || c === '\t') {
      i += 1;
    } else if (c === '(') {
      let depth = 0;
      let j = i;
      for (; j < to; j += 1) {
        if (text[j] === '(') depth += 1;
        else if (text[j] === ')' && --depth === 0) break;
      }
      if (j >= to) return null;
      out.push({ type: 'paren', inner: { start: i + 1, end: j } });
      i = j + 1;
    } else {
      let j = i;
      while (j < to && !/[\s(]/.test(text[j]!)) j += 1;
      out.push({ type: 'word', value: text.slice(i, j).toLowerCase() });
      i = j;
    }
  }
  return out;
}

/**
 * Matches clauses against a pattern of optional `word (paren)` pairs. `parens[i]` is the bracketed text
 * after `words[i]` (the first word may be `''` for a leading group), or `null` when absent. Returns `null`
 * when the clauses do not fit the pattern.
 */
function matchClauses(
  list: readonly Clause[],
  pattern: readonly { word: string; requireParen?: boolean }[],
): (TextRange | null)[] | null {
  const result: (TextRange | null)[] = pattern.map(() => null);
  let k = 0;
  for (let p = 0; p < pattern.length; p += 1) {
    const { word, requireParen } = pattern[p]!;
    if (word !== '') {
      const c = list[k];
      if (c?.type !== 'word' || c.value !== word) continue;
      k += 1;
    }
    const c = list[k];
    if (c?.type === 'paren') {
      result[p] = c.inner;
      k += 1;
    } else if (requireParen) {
      return null;
    }
  }
  return k === list.length ? result : null;
}

// ------------------------------------------------------------------------------------------- parser

interface Frame {
  readonly closers: ReadonlySet<ActivityTokenKind>;
}

class ActivityParser {
  private readonly tokens: ActivityToken[];
  private i = 0;
  private readonly lineStarts: number[] = [0];
  readonly errors: Diagnostic[] = [];
  readonly unsupported: Diagnostic[] = [];
  private readonly lanes: Lane[] = [];
  private readonly laneSwitches: LaneSwitch[] = [];
  private currentLane: string | null = null;
  private readonly stack: Frame[] = [];

  // Leading comments: full-line comments since the last statement, reset by a blank line.
  private pending: TextRange[] = [];
  private taken: TextRange[] = [];
  private lineHasContent = false;
  private lineHasComment = false;

  constructor(private readonly text: string) {
    this.tokens = lexActivity(text);
    for (let k = 0; k < text.length; k += 1) {
      const c = text[k];
      if (c === '\n' || (c === '\r' && text[k + 1] !== '\n')) this.lineStarts.push(k + 1);
    }
  }

  // ------------------------------------------------------------------------------------------ helpers

  private line(offset: number): number {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  private slice(r: TextRange): string {
    return this.text.slice(r.start, r.end);
  }

  private syntax(range: TextRange, messageKey: string, params?: MessageParams): void {
    this.errors.push({
      kind: 'syntax',
      line: this.line(range.start),
      range: { start: range.start, end: range.end },
      messageKey,
      ...(params ? { params } : {}),
    });
  }

  private sourceOnly(token: ActivityToken, messageKey: string): void {
    this.unsupported.push({
      kind: 'unsupported',
      line: this.line(token.start),
      range: { start: token.start, end: token.end },
      messageKey,
    });
  }

  private textValue(raw: TextRange, linked = false): TextValue {
    const source = this.slice(raw);
    const text = unescapeStepLabel(source);
    return { text, raw, formatted: escapeStepLabel(text, linked) !== source };
  }

  /** The name a lane switch token sets, or `null` when it is malformed. */
  private laneName(token: ActivityToken): { name: string; nameRange: TextRange } | null {
    const t = this.text.slice(token.start, token.end);
    const match = /^\|(?:[^|]*\|)?([^|]+)\|$/.exec(t);
    if (!match) return null;
    const segment = match[1]!;
    const lead = segment.length - segment.trimStart().length;
    const name = segment.trim();
    if (name === '') return null;
    const start = token.start + t.length - 1 - segment.length + lead;
    return { name, nameRange: { start, end: start + name.length } };
  }

  // ----------------------------------------------------------------------------------------- tokens

  private leaf(token: ActivityToken): Node {
    return { kind: token.kind, start: token.start, end: token.end, children: [] };
  }

  /** Moves trivia into `node`, tracking full-line comments for the next statement. */
  private skipTrivia(node: Node): void {
    while (this.i < this.tokens.length) {
      const token = this.tokens[this.i]!;
      if (!TRIVIA.has(token.kind)) return;
      node.children.push(this.leaf(token));
      this.i += 1;
      if (token.kind === 'newline') {
        if (!this.lineHasContent && !this.lineHasComment) this.pending = [];
        this.lineHasContent = false;
        this.lineHasComment = false;
      } else if (token.kind === 'comment') {
        if (token.unterminated) this.syntax(token, 'diagnostic.syntax.unclosedComment');
        if (!this.lineHasContent) this.pending.push({ start: token.start, end: token.end });
        this.lineHasComment = true;
      }
    }
  }

  /** The next significant token, after moving trivia into `node`. */
  private peek(node: Node): ActivityToken | null {
    this.skipTrivia(node);
    return this.tokens[this.i] ?? null;
  }

  /** Consumes the next significant token into `node`. The comments above it become `takeComments()`. */
  private next(node: Node): ActivityToken {
    this.skipTrivia(node);
    const token = this.tokens[this.i]!;
    node.children.push(this.leaf(token));
    this.i += 1;
    this.lineHasContent = true;
    this.taken = this.pending;
    this.pending = [];
    return token;
  }

  private takeComments(): TextRange[] {
    const comments = this.taken;
    this.taken = [];
    return comments;
  }

  private open(parent: Node, kind: string): Node {
    const node: Node = { kind, start: 0, end: 0, children: [] };
    parent.children.push(node);
    return node;
  }

  private close(node: Node): TextRange {
    finish(node);
    return { start: node.start, end: node.end };
  }

  private enclosingCloses(kind: ActivityTokenKind): boolean {
    return this.stack.some((f) => f.closers.has(kind));
  }

  // ------------------------------------------------------------------------------------------- block

  parse(): ActivityParse {
    const root: Node = { kind: 'activity', start: 0, end: this.text.length, children: [] };
    let first = this.peek(root);
    let hasStart = false;
    if (first?.kind === 'startDirective') {
      this.next(root);
      hasStart = true;
    }
    const main = this.parsePath(root);
    let hasEnd = false;
    first = this.peek(root);
    if (first?.kind === 'endDirective') {
      this.next(root);
      hasEnd = true;
    }
    while (this.peek(root) !== null) {
      const token = this.next(root);
      this.syntax(token, 'diagnostic.syntax.invalidLine');
    }
    if (hasStart && !hasEnd) this.syntax({ start: 0, end: 0 }, 'diagnostic.syntax.missingEndLine');
    root.end = this.text.length;

    const errors = this.errors.map(({ line, messageKey, params }) => ({ line, messageKey, ...(params ? { params } : {}) }));
    const diagnostics = [...this.errors, ...this.unsupported];
    const model = diagnostics.length === 0 ? { lanes: this.lanes, laneSwitches: this.laneSwitches, main } : null;
    return { tree: root, model, errors, diagnostics };
  }

  // -------------------------------------------------------------------------------------------- paths

  /** Statements until a closer of this or an enclosing construct, `@end…` or the end of the text. */
  private parsePath(parent: Node, closers: ReadonlySet<ActivityTokenKind> = new Set()): Path {
    const elements: FlowElement[] = [];
    const leadingNotes: Note[] = [];
    this.stack.push({ closers });
    for (;;) {
      const token = this.peek(parent);
      if (token === null || token.kind === 'endDirective' || closers.has(token.kind)) break;
      if (CLOSERS.has(token.kind)) {
        if (this.enclosingCloses(token.kind)) break;
        this.next(parent);
        this.syntax(token, 'diagnostic.syntax.unmatchedKeyword', { keyword: KEYWORD[token.kind] ?? token.kind });
        continue;
      }
      if (token.kind === 'note') {
        const owner = elements[elements.length - 1];
        const note = this.parseNote(parent);
        if (note === null) continue;
        if ('kind' in note && note.kind === 'locked') elements.push(note);
        else if (owner) (owner.notes as Note[]).push(note as Note);
        else leadingNotes.push(note as Note);
        continue;
      }
      const element = this.parseStatement(parent, token);
      if (element) elements.push(element);
    }
    this.stack.pop();
    return { leadingNotes, elements };
  }

  private parseStatement(parent: Node, token: ActivityToken): FlowElement | null {
    const lane = this.currentLane;
    switch (token.kind) {
      case 'start': {
        this.next(parent);
        return { kind: 'start', range: span(token), leadingComments: this.takeComments(), notes: [] };
      }
      case 'stop':
      case 'end': {
        this.next(parent);
        return {
          kind: 'stop',
          keyword: token.kind,
          range: span(token),
          leadingComments: this.takeComments(),
          notes: [],
        };
      }
      case 'step':
        return this.parseStep(parent, token);
      case 'lane': {
        this.next(parent);
        this.laneSwitch(token);
        return null;
      }
      case 'if':
        return this.parseDecision(parent);
      case 'repeat':
        return this.parseRepeat(parent);
      case 'while':
        return this.parseWhile(parent);
      case 'fork':
        return this.parseLockedBlock(parent, 'locked.fork', ['forkAgain'], 'endFork');
      case 'split':
        return this.parseLockedBlock(parent, 'locked.split', ['splitAgain'], 'endSplit');
      case 'switch':
        return this.parseLockedBlock(parent, 'locked.switch', ['case'], 'endSwitch');
      case 'partition':
        return this.parseLockedBlock(parent, 'locked.partition', [], 'closeBrace', 'endGroup');
      case 'detach':
      case 'kill':
        this.next(parent);
        return this.locked(span(token), token.kind === 'detach' ? 'locked.detach' : 'locked.kill', lane);
      case 'arrow': {
        this.next(parent);
        const rest = this.slice(token).replace(/^-+(?:\[[^\]]*\])?-*>/, '').replace(/;$/, '').trim();
        return this.locked(span(token), rest === '' ? 'locked.arrow' : 'locked.arrowLabel', lane);
      }
      case 'startDirective':
        this.next(parent);
        this.syntax(token, 'diagnostic.syntax.misplacedKeyword', { keyword: '@startuml' });
        return null;
      default: {
        this.next(parent);
        const sourceOnly = SOURCE_ONLY[token.kind];
        if (sourceOnly) {
          this.sourceOnly(token, sourceOnly);
          return null;
        }
        if (token.kind === 'unknown' && OTHER_STATEMENT.test(this.slice(token))) {
          return this.locked(span(token), 'locked.statement', lane);
        }
        this.syntax(token, 'diagnostic.syntax.invalidLine');
        return null;
      }
    }
  }

  private locked(range: TextRange, reason: FlowLockReason, lane: string | null, comments?: TextRange[]): LockedPart {
    return {
      kind: 'locked',
      reason,
      excerpt: this.slice(range),
      range,
      leadingComments: comments ?? this.takeComments(),
      notes: [],
      lane,
    };
  }

  private laneSwitch(token: ActivityToken): void {
    const comments = this.takeComments();
    const parsed = this.laneName(token);
    if (!parsed) {
      this.syntax(token, 'diagnostic.syntax.invalidLine');
      return;
    }
    // PlantUML rejects a first lane that follows any statement ("This swimlane must be defined at the start").
    if (this.lanes.length === 0 && this.tokens.some((t) => t.start < token.start && !BEFORE_FIRST_LANE.has(t.kind))) {
      this.syntax(token, 'diagnostic.syntax.laneNotFirst');
      return;
    }
    // Lanes are the same after NFC normalisation; the first spelling names the lane (data-model §5.3 Lane).
    const nfc = parsed.name.normalize('NFC');
    let lane = this.lanes.find((l) => l.name.normalize('NFC') === nfc);
    if (!lane) {
      lane = { name: parsed.name, raw: span(token) };
      this.lanes.push(lane);
    }
    this.laneSwitches.push({ lane: lane.name, range: span(token), nameRange: parsed.nameRange, leadingComments: comments });
    this.currentLane = lane.name;
  }

  // -------------------------------------------------------------------------------------- statements

  private parseStep(parent: Node, token: ActivityToken & { kind: 'step' }): FlowElement | null {
    const lane = this.currentLane;
    if (token.embeddedSalt && !token.unterminated) return this.parseSaltStep(parent, lane);
    this.next(parent);
    if (token.unterminated) {
      this.syntax(token, 'diagnostic.syntax.unclosedStep');
      return null;
    }
    if (token.terminator !== ';') return this.locked(span(token), 'locked.stepShape', lane);

    const source = this.slice(token);
    const raw: TextRange = { start: token.start + source.indexOf(':') + 1, end: token.end - 1 };
    const label = this.slice(raw);
    const link = /^\[\[#([^\s\]]+)([\s\S]*)\]\]$/.exec(label);
    let step: Step;
    if (link) {
      const target = link[1]!;
      const targetStart = raw.start + 3;
      const rest = link[2]!;
      const labelStart = targetStart + target.length + (rest.length - rest.trimStart().length);
      step = {
        kind: 'step',
        label: this.textValue({ start: Math.min(labelStart, raw.end - 2), end: raw.end - 2 }, true),
        link: { target, raw: { start: targetStart, end: targetStart + target.length } },
        range: span(token),
        leadingComments: this.takeComments(),
        notes: [],
        lane,
      };
    } else {
      step = {
        kind: 'step',
        label: this.textValue(raw),
        link: null,
        range: span(token),
        leadingComments: this.takeComments(),
        notes: [],
        lane,
      };
    }
    return step;
  }

  /** A step with `{{salt … }}` inside: a locked part. */
  private parseSaltStep(parent: Node, lane: string | null): LockedPart {
    const node = this.open(parent, 'locked');
    this.next(node);
    const comments = this.takeComments();
    return this.locked(this.close(node), 'locked.embeddedSalt', lane, comments);
  }

  /** A note, or a locked part for a note form the editor does not model; `null` when it is malformed. */
  private parseNote(parent: Node): Note | LockedPart | null {
    const lane = this.currentLane;
    const token = this.next(parent) as ActivityToken & { kind: 'note' };
    const comments = this.takeComments();
    if (token.unterminated) {
      this.syntax(token, 'diagnostic.syntax.unclosedNote');
      return null;
    }
    const source = this.slice(token);
    const head = /^(floating\s+)?note\s+(left|right)\b/i.exec(source);
    if (!head || head[1] !== undefined) {
      return this.locked(span(token), 'locked.note', lane, comments);
    }
    const side = head[2]!.toLowerCase() as 'left' | 'right';
    let raw: TextRange;
    if (token.form === 'singleLine') {
      const colon = source.indexOf(':');
      let start = token.start + colon + 1;
      while (start < token.end && (this.text[start] === ' ' || this.text[start] === '\t')) start += 1;
      raw = { start, end: token.end };
    } else {
      const firstBreak = source.search(/[\r\n]/);
      const bodyStart = token.start + firstBreak + (source.startsWith('\r\n', firstBreak) ? 2 : 1);
      const lastBreak = Math.max(source.lastIndexOf('\n'), source.lastIndexOf('\r'));
      let bodyEnd = token.start + lastBreak;
      if (source[lastBreak] === '\n' && source[lastBreak - 1] === '\r') bodyEnd -= 1;
      raw = bodyEnd < bodyStart ? { start: bodyStart, end: bodyStart } : { start: bodyStart, end: bodyEnd };
      if (raw.start > token.end) raw = { start: token.end, end: token.end };
    }
    return { kind: 'note', side, text: this.textValue(raw), form: token.form, range: span(token), leadingComments: comments };
  }

  // ----------------------------------------------------------------------------------- constructs

  private parseDecision(parent: Node): FlowElement {
    const lane = this.currentLane;
    const node = this.open(parent, 'decision');
    const branches: Branch[] = [];
    let comments: TextRange[] = [];
    let seenElse = false;
    let unsupportedForm = false;
    let end: TextRange | null = null;
    const ifToken = this.tokens[this.i]!;
    const closers = new Set<ActivityTokenKind>(['elseif', 'else', 'endif']);

    for (;;) {
      const token = this.peek(node);
      if (token === null) break;
      if (token.kind === 'endif') {
        this.next(node);
        end = span(token);
        break;
      }
      if (branches.length > 0 && token.kind !== 'elseif' && token.kind !== 'else') break;
      const branchNode = this.open(node, 'branch');
      this.next(branchNode);
      if (branches.length === 0) comments = this.takeComments();
      else this.takeComments();
      const kind = token.kind as 'if' | 'elseif' | 'else';
      if (kind !== 'if' && seenElse) {
        this.syntax(token, 'diagnostic.syntax.misplacedKeyword', { keyword: KEYWORD[kind]! });
      }
      if (kind === 'else') seenElse = true;
      const header = this.branchHeader(token, kind);
      if (header === 'unsupported') unsupportedForm = true;
      const path = this.parsePath(branchNode, closers);
      this.close(branchNode);
      const range = { start: branchNode.start, end: significantEnd(branchNode) };
      branches.push({
        branchKind: kind,
        condition: header === 'unsupported' ? null : header.condition,
        label: header === 'unsupported' ? null : header.label,
        path,
        header: span(token),
        range,
      });
    }
    const range = this.close(node);
    if (end === null) {
      this.syntax(ifToken, 'diagnostic.syntax.unclosedKeyword', { keyword: 'if' });
      end = { start: range.end, end: range.end };
    }
    if (unsupportedForm) return this.locked(range, 'locked.decisionForm', lane, comments);
    const decision: Decision = { kind: 'decision', branches, end, range, leadingComments: comments, notes: [], lane };
    return decision;
  }

  private branchHeader(
    token: ActivityToken,
    kind: 'if' | 'elseif' | 'else',
  ): { condition: TextValue | null; label: TextValue | null } | 'unsupported' {
    const source = this.slice(token);
    const keyword = kind === 'if' ? /^if\s*/i : kind === 'elseif' ? /^(?:elseif|else\s+if)\s*/i : /^else\s*/i;
    const list = clauses(this.text, token.start + keyword.exec(source)![0].length, token.end);
    if (list === null) {
      this.syntax(token, 'diagnostic.syntax.missingCondition', { keyword: KEYWORD[kind]! });
      return { condition: null, label: null };
    }
    const parts =
      kind === 'else'
        ? matchClauses(list, [{ word: '' }])
        : matchClauses(list, [{ word: '', requireParen: true }, { word: 'then' }]);
    if (parts === null) return 'unsupported';
    if (kind === 'else') return { condition: null, label: parts[0] ? this.textValue(parts[0]) : null };
    return {
      condition: parts[0] ? this.textValue(parts[0]) : null,
      label: parts[1] ? this.textValue(parts[1]) : null,
    };
  }

  private parseRepeat(parent: Node): FlowElement {
    const lane = this.currentLane;
    const node = this.open(parent, 'loop');
    const open = this.next(node);
    const comments = this.takeComments();
    let unsupportedForm = !/^repeat$/i.test(this.slice(open));
    const body = this.parsePath(node, new Set(['repeatWhile']));
    const token = this.peek(node);
    let condition: TextValue | null = null;
    let labels: LoopLabels = { is: null, exit: null };
    let end: TextRange | null;
    if (token?.kind === 'repeatWhile') {
      this.next(node);
      end = span(token);
      const source = this.slice(token);
      const list = clauses(this.text, token.start + /^repeat\s+while\s*/i.exec(source)![0].length, token.end);
      if (list === null) {
        this.syntax(token, 'diagnostic.syntax.missingCondition', { keyword: 'repeat while' });
      } else {
        const parts = matchClauses(list, [{ word: '' }, { word: 'is', requireParen: true }, { word: 'not', requireParen: true }]);
        if (parts === null) unsupportedForm = true;
        else {
          condition = parts[0] ? this.textValue(parts[0]) : null;
          labels = { is: parts[1] ? this.textValue(parts[1]) : null, exit: parts[2] ? this.textValue(parts[2]) : null };
        }
      }
    } else {
      this.syntax(open, 'diagnostic.syntax.unclosedKeyword', { keyword: 'repeat' });
      end = null;
    }
    const range = this.close(node);
    end ??= { start: range.end, end: range.end };
    if (unsupportedForm) return this.locked(range, 'locked.loopForm', lane, comments);
    const loop: Loop = {
      kind: 'loop', loopKind: 'repeat', condition, labels, body, header: span(open), end,
      range, leadingComments: comments, notes: [], lane,
    };
    return loop;
  }

  private parseWhile(parent: Node): FlowElement {
    const lane = this.currentLane;
    const node = this.open(parent, 'loop');
    const open = this.next(node);
    const comments = this.takeComments();
    let unsupportedForm = false;
    let condition: TextValue | null = null;
    let isLabel: TextValue | null = null;
    let exit: TextValue | null = null;

    const source = this.slice(open);
    const list = clauses(this.text, open.start + /^while\s*/i.exec(source)![0].length, open.end);
    if (list === null) {
      this.syntax(open, 'diagnostic.syntax.missingCondition', { keyword: 'while' });
    } else {
      const parts = matchClauses(list, [{ word: '', requireParen: true }, { word: 'is', requireParen: true }]);
      if (parts === null) unsupportedForm = true;
      else {
        condition = parts[0] ? this.textValue(parts[0]) : null;
        isLabel = parts[1] ? this.textValue(parts[1]) : null;
      }
    }

    const body = this.parsePath(node, new Set(['endwhile']));
    const token = this.peek(node);
    let end: TextRange | null;
    if (token?.kind === 'endwhile') {
      this.next(node);
      end = span(token);
      const closeSource = this.slice(token);
      const closeList = clauses(this.text, token.start + /^(?:endwhile|end\s+while)\s*/i.exec(closeSource)![0].length, token.end);
      const parts = closeList === null ? null : matchClauses(closeList, [{ word: '' }]);
      if (parts === null) unsupportedForm = true;
      else exit = parts[0] ? this.textValue(parts[0]) : null;
    } else {
      this.syntax(open, 'diagnostic.syntax.unclosedKeyword', { keyword: 'while' });
      end = null;
    }
    const range = this.close(node);
    end ??= { start: range.end, end: range.end };
    if (unsupportedForm) return this.locked(range, 'locked.loopForm', lane, comments);
    const loop: Loop = {
      kind: 'loop', loopKind: 'while', condition, labels: { is: isLabel, exit }, body, header: span(open), end,
      range, leadingComments: comments, notes: [], lane,
    };
    return loop;
  }

  /**
   * fork, split, switch and partition: parsed in full so errors inside are found, then kept as one locked
   * part. `again` keywords separate the inner paths; any of `ends` closes the block.
   */
  private parseLockedBlock(
    parent: Node,
    reason: FlowLockReason,
    again: readonly ActivityTokenKind[],
    ...ends: ActivityTokenKind[]
  ): FlowElement {
    const lane = this.currentLane;
    const node = this.open(parent, 'locked');
    const open = this.next(node);
    const comments = this.takeComments();
    const closers = new Set<ActivityTokenKind>([...again, ...ends]);
    for (;;) {
      this.parsePath(node, closers);
      const token = this.peek(node);
      if (token !== null && again.includes(token.kind)) {
        this.next(node);
        this.takeComments();
        continue;
      }
      if (token !== null && ends.includes(token.kind)) {
        this.next(node);
        this.takeComments();
      } else {
        const keyword = KEYWORD[open.kind] ?? this.slice(open).split(/\s/)[0]!.toLowerCase();
        this.syntax(open, 'diagnostic.syntax.unclosedKeyword', { keyword });
      }
      break;
    }
    return this.locked(this.close(node), reason, lane, comments);
  }
}

function span(token: ActivityToken): TextRange {
  return { start: token.start, end: token.end };
}

/** The end of the last leaf that is not whitespace, a line ending or a comment. */
function significantEnd(node: Node): number {
  for (let k = node.children.length - 1; k >= 0; k -= 1) {
    const child = node.children[k]!;
    if (child.children.length > 0) return significantEnd(child);
    if (!TRIVIA.has(child.kind as ActivityTokenKind)) return child.end;
  }
  return node.start;
}

/** Sets a node's range from its first and last leaves. */
function finish(node: Node): void {
  if (node.children.length === 0) return;
  for (const child of node.children) finish(child);
  node.start = node.children[0]!.start;
  node.end = node.children[node.children.length - 1]!.end;
}

/** Parses one activity block's text (from `@startuml` to `@enduml`, or a fragment of it). */
export function parseActivity(blockText: string): ActivityParse {
  return new ActivityParser(blockText).parse();
}
