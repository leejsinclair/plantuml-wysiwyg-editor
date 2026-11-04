// The Salt parser (R-3, spec sections 4 and 4.1, data-model §5.2). It reads one block's text (from its
// `@start…` line to its `@end…` line) into
//   - a lossless syntax tree: every token of `lexSalt` is a leaf, in order, so the leaves reproduce the text;
//   - the screen model the visual editor works on (`model.ts`), or `null` when the block is invalid
//     (category 3) or source-only (category 2 that cannot be isolated);
//   - diagnostics: syntax errors with their line, and the block-level reasons that make it source-only;
//   - the locked parts inside the model: valid content the editor does not support, isolated at the smallest
//     unit (a cell, a row or a nested container).
//
// The grammar follows PlantUML 1.2026.9 as checked with the command-line jar:
//   - A row is one line of cells separated by `|`. A `|` that ends a line continues the row on the next line.
//     A blank cell (`| |`, or a `|` that starts a line) collapses, so it is not a cell; `.` keeps a position.
//   - A nested container is one cell; on several lines, the row continues after its `}`.
//   - Elements are recognised from a cell's whole text: `[X] Label` (upper-case X only), `( ) Label`,
//     `[Label]`, `"value   "`, `^Value^^Option^`; anything else is text, as PlantUML draws it.
//   - Text before the root grid fails in PlantUML (a syntax error here); text or a second grid after the root
//     is silently dropped (ignored content, source-only).
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { Diagnostic, DiagnosticKind, MessageParams, TextRange } from '../types.ts';
import { isFormattedSaltText, unescapeSaltText } from './escape.ts';
import { lexSalt, type SaltToken } from './lexer.ts';
import {
  LOCKED_REASONS,
  SOURCE_ONLY_REASONS,
  STYLE_MODIFIERS,
  type Cell,
  type CellContent,
  type Grid,
  type LockedPart,
  type MenuBar,
  type Row,
  type SaltScreen,
  type ScrollArea,
  type SeparatorKind,
  type TabBar,
  type TextValue,
  type Tree,
  type TreeItem,
} from './model.ts';

/** A node of the lossless tree. Leaves are tokens (their kind is the token kind, or `title`). */
export interface SaltNode {
  readonly kind: string;
  readonly start: number;
  readonly end: number;
  readonly children: readonly SaltNode[];
}

/** A syntax error (category 3), with its 1-based line within the block (contracts/core-api.md §3). */
export interface ParseError {
  readonly line: number;
  readonly messageKey: string;
  readonly params?: MessageParams;
}

export interface SaltParseResult {
  readonly tree: SaltNode;
  /** `null` when there are syntax errors or a source-only reason. */
  readonly model: SaltScreen | null;
  /** Syntax errors only. */
  readonly errors: readonly ParseError[];
  /** Every block-level problem in source order: syntax, ignored content and unsupported (source-only). */
  readonly diagnostics: readonly Diagnostic[];
  /** Every locked part in the model, in source order. Empty when `model` is `null`. */
  readonly lockedParts: readonly LockedPart[];
}

export const SYNTAX = {
  invalidLine: 'diagnostic.syntax.invalidLine',
  missingEndLine: 'diagnostic.syntax.missingEndLine',
  noRootGrid: 'diagnostic.syntax.noRootGrid',
  unclosedContainer: 'diagnostic.syntax.unclosedContainer',
  unexpectedClose: 'diagnostic.syntax.unexpectedClose',
  spanInFirstColumn: 'diagnostic.syntax.spanInFirstColumn',
  unclosedComment: 'diagnostic.syntax.unclosedComment',
} as const;

// ------------------------------------------------------------------------------------------ raw structure

type Item = { readonly kind: 'text'; readonly tok: SaltToken } | { readonly kind: 'container'; readonly pc: ParsedContainer };

interface RawCell {
  readonly items: readonly Item[];
  readonly start: number;
  readonly end: number;
}

interface RawRow {
  /** Cells with content; blank cells are dropped. */
  readonly cells: readonly RawCell[];
  readonly start: number;
  readonly end: number;
  readonly leadingComments: readonly TextRange[];
}

interface ParsedContainer {
  readonly open: SaltToken;
  readonly modifier: string;
  close: SaltToken | null;
  title: SaltToken | null;
  /** A group box whose title line also holds cells. */
  titleConflict: boolean;
  /** `{` followed directly by one letter that is not a modifier, such as `{Q`. */
  unknownModifier: boolean;
  readonly rows: RawRow[];
  node: SaltNode;
}

const leaf = (t: SaltToken, kind: string = t.kind): SaltNode => ({ kind, start: t.start, end: t.end, children: [] });
const branch = (kind: string, children: SaltNode[]): SaltNode => ({
  kind,
  start: children[0]!.start,
  end: children.at(-1)!.end,
  children,
});

/** A single letter (or symbol) touching `{` that PlantUML would take as the start of the first cell. */
function isUnknownModifier(text: string): boolean {
  const word = /^\S+/u.exec(text)?.[0] ?? '';
  return [...word].length === 1 && /[\p{L}%&$@?;:,]/u.test(word);
}

function containerKind(modifier: string): 'grid' | 'scrollArea' | 'tree' | 'tabBar' | 'menuBar' {
  if (modifier.startsWith('S')) return 'scrollArea';
  if (modifier.startsWith('T')) return 'tree';
  if (modifier === '*') return 'menuBar';
  if (modifier === '/') return 'tabBar';
  return 'grid';
}

// ----------------------------------------------------------------------------------------------- parser

class Parser {
  private i = 0;
  private readonly lineStarts: number[] = [0];
  readonly diagnostics: Diagnostic[] = [];

  constructor(
    private readonly src: string,
    private readonly toks: readonly SaltToken[],
  ) {
    for (let k = 0; k < src.length; k++) {
      const c = src[k];
      if (c === '\n' || (c === '\r' && src[k + 1] !== '\n')) this.lineStarts.push(k + 1);
    }
  }

  line(offset: number): number {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  diag(kind: DiagnosticKind, messageKey: string, range: TextRange, params?: MessageParams): void {
    this.diagnostics.push({ kind, line: this.line(range.start), range, messageKey, ...(params ? { params } : {}) });
  }

  /** The text from `offset` to the end of its line, trimmed: names ignored content in its message. */
  private lineText(offset: number): string {
    const m = /^[^\r\n]*/.exec(this.src.slice(offset));
    return (m?.[0] ?? '').trim();
  }

  private peek(k = 0): SaltToken | undefined {
    return this.toks[this.i + k];
  }

  /** A comment, block comment or preprocessor leaf, with its diagnostics. */
  private trivia(t: SaltToken): SaltNode {
    if (t.kind === 'blockComment' && t.unterminated) this.diag('syntax', SYNTAX.unclosedComment, t);
    if (t.kind === 'preprocessor') this.diag('unsupported', SOURCE_ONLY_REASONS.preprocessor, t);
    return leaf(t);
  }

  /** A comment is a full-line comment when only spaces follow it on its line. */
  private endsLine(): boolean {
    let k = 0;
    while (this.peek(k)?.kind === 'whitespace') k++;
    const next = this.peek(k);
    return next === undefined || next.kind === 'newline';
  }

  parseBlock(): { tree: SaltNode; root: ParsedContainer | null } {
    const children: SaltNode[] = [];
    let root: ParsedContainer | null = null;
    let seenStart = false;
    let seenEnd = false;
    let seenSecondRoot = false;
    let seenTextAfter = false;
    let pendingComments: TextRange[] = [];
    let rootComments: TextRange[] = [];
    let lineHasContent = false;

    while (this.i < this.toks.length) {
      const t = this.peek()!;
      switch (t.kind) {
        case 'whitespace':
          children.push(leaf(t));
          this.i++;
          continue;
        case 'newline':
          if (!lineHasContent) pendingComments = [];
          lineHasContent = false;
          children.push(leaf(t));
          this.i++;
          continue;
        case 'comment':
        case 'blockComment':
        case 'preprocessor': {
          lineHasContent = true;
          this.i++;
          children.push(this.trivia(t));
          if (t.kind !== 'preprocessor' && this.endsLine()) pendingComments.push({ start: t.start, end: t.end });
          continue;
        }
        default:
          break;
      }

      lineHasContent = true;
      if (seenEnd) {
        this.diag('syntax', SYNTAX.invalidLine, t);
        children.push(leaf(t));
        this.i++;
        continue;
      }

      switch (t.kind) {
        case 'start':
          if (seenStart || root) this.diag('syntax', SYNTAX.invalidLine, t);
          seenStart = true;
          children.push(leaf(t));
          this.i++;
          pendingComments = [];
          break;
        case 'end':
          seenEnd = true;
          children.push(leaf(t));
          this.i++;
          break;
        case 'open': {
          const comments = pendingComments;
          pendingComments = [];
          const pc = this.parseContainer();
          children.push(pc.node);
          if (!root) {
            root = pc;
            rootComments = comments;
          } else if (!seenSecondRoot) {
            seenSecondRoot = true;
            this.diag('ignoredContent', SOURCE_ONLY_REASONS.severalRootGrids, pc.node, { content: this.lineText(pc.node.start) });
          }
          break;
        }
        case 'close':
          this.diag('syntax', SYNTAX.unexpectedClose, t);
          children.push(leaf(t));
          this.i++;
          break;
        default:
          // Text or `|` outside any grid.
          if (!root) this.diag('syntax', SYNTAX.invalidLine, t);
          else if (!seenTextAfter) {
            seenTextAfter = true;
            this.diag('ignoredContent', SOURCE_ONLY_REASONS.textAfterRoot, t, { content: this.lineText(t.start) });
          }
          children.push(leaf(t));
          this.i++;
      }
    }

    if (!seenEnd) {
      const last = [...this.toks].reverse().find((t) => t.kind !== 'whitespace' && t.kind !== 'newline');
      const at = last?.start ?? 0;
      this.diag('syntax', SYNTAX.missingEndLine, { start: at, end: last?.end ?? 0 });
    }
    if (!root && !this.diagnostics.some((d) => d.kind === 'syntax')) {
      this.diag('syntax', SYNTAX.noRootGrid, { start: 0, end: this.toks[0]?.end ?? 0 });
    }

    const tree: SaltNode = children.length > 0 ? branch('block', children) : { kind: 'block', start: 0, end: 0, children: [] };
    if (root) this.rootComments = rootComments;
    return { tree, root };
  }

  rootComments: readonly TextRange[] = [];

  /** Parses the container whose `{` is the current token. */
  private parseContainer(): ParsedContainer {
    const open = this.toks[this.i++]!;
    const children: SaltNode[] = [leaf(open)];
    const pc: ParsedContainer = {
      open,
      modifier: open.modifier ?? '',
      close: null,
      title: null,
      titleConflict: false,
      unknownModifier: false,
      rows: [],
      node: leaf(open),
    };

    if (pc.modifier === '') {
      const next = this.peek();
      if (next?.kind === 'text' && next.start === open.end) {
        pc.unknownModifier = isUnknownModifier(this.src.slice(next.start, next.end));
      }
    }

    if (pc.modifier.endsWith('^')) {
      let k = 0;
      while (this.peek(k)?.kind === 'whitespace') k++;
      if (this.peek(k)?.kind === 'text') {
        for (let j = 0; j < k; j++) children.push(leaf(this.toks[this.i++]!));
        const title = this.toks[this.i++]!;
        children.push(leaf(title, 'title'));
        pc.title = title;
        let m = 0;
        while (this.peek(m)?.kind === 'whitespace') m++;
        if (this.peek(m)?.kind === 'pipe') pc.titleConflict = true;
      }
    }

    interface CellBuilder {
      children: SaltNode[];
      items: Item[];
    }
    interface RowBuilder {
      children: SaltNode[];
      cells: RawCell[];
      cell: CellBuilder;
      pendingWs: SaltNode[];
      lastWasPipe: boolean;
      leadingComments: TextRange[];
    }

    let row: RowBuilder | null = null;
    let pendingComments: TextRange[] = [];
    let lineHasContent = true;

    const startRow = (): RowBuilder => {
      row = { children: [], cells: [], cell: { children: [], items: [] }, pendingWs: [], lastWasPipe: false, leadingComments: pendingComments };
      pendingComments = [];
      return row;
    };
    const flushCell = (r: RowBuilder): void => {
      if (r.cell.items.length === 0) return;
      const n = branch('cell', r.cell.children);
      r.children.push(n);
      r.cells.push({ items: r.cell.items, start: n.start, end: n.end });
      r.cell = { children: [], items: [] };
    };
    const addItem = (n: SaltNode, item: Item): void => {
      const r: RowBuilder = row ?? startRow();
      if (r.cell.items.length > 0) r.cell.children.push(...r.pendingWs);
      else r.children.push(...r.pendingWs);
      r.pendingWs = [];
      r.cell.children.push(n);
      r.cell.items.push(item);
      r.lastWasPipe = false;
    };
    const endRow = (): void => {
      const r = row;
      if (!r) return;
      flushCell(r);
      const n = branch('row', r.children);
      children.push(n);
      pc.rows.push({ cells: r.cells, start: n.start, end: n.end, leadingComments: r.leadingComments });
      children.push(...r.pendingWs);
      row = null;
    };

    loop: while (this.i < this.toks.length) {
      const t = this.peek()!;
      const current = row as RowBuilder | null;
      switch (t.kind) {
        case 'start':
        case 'end':
          break loop;
        case 'close':
          endRow();
          children.push(leaf(t));
          pc.close = t;
          this.i++;
          break loop;
        case 'whitespace':
          this.i++;
          if (current) current.pendingWs.push(leaf(t));
          else children.push(leaf(t));
          break;
        case 'newline':
          this.i++;
          if (current?.lastWasPipe) {
            current.pendingWs.push(leaf(t));
          } else {
            if (current) endRow();
            else if (!lineHasContent) pendingComments = [];
            children.push(leaf(t));
          }
          lineHasContent = false;
          break;
        case 'comment':
        case 'blockComment':
        case 'preprocessor': {
          this.i++;
          lineHasContent = true;
          const n = this.trivia(t);
          if (current) current.pendingWs.push(n);
          else {
            children.push(n);
            if (t.kind !== 'preprocessor' && this.endsLine()) pendingComments.push({ start: t.start, end: t.end });
          }
          break;
        }
        case 'pipe': {
          this.i++;
          lineHasContent = true;
          const r: RowBuilder = current ?? startRow();
          flushCell(r);
          r.children.push(...r.pendingWs, leaf(t));
          r.pendingWs = [];
          r.lastWasPipe = true;
          break;
        }
        case 'open': {
          lineHasContent = true;
          const nested = this.parseContainer();
          addItem(nested.node, { kind: 'container', pc: nested });
          break;
        }
        case 'text':
          this.i++;
          lineHasContent = true;
          addItem(leaf(t), { kind: 'text', tok: t });
          break;
      }
    }

    if (!pc.close) {
      endRow();
      this.diag('syntax', SYNTAX.unclosedContainer, open);
    }
    pc.node = branch(containerKind(pc.modifier), children);
    return pc;
  }
}

// ------------------------------------------------------------------------------------------ the model

const SEPARATOR = /^(?:\.\.+|==+|~~+|--+)$/;
const SEPARATOR_KINDS: Readonly<Record<string, SeparatorKind>> = { '.': 'dotted', '=': 'double', '~': 'wavy', '-': 'single' };

class ModelBuilder {
  readonly locked: LockedPart[] = [];

  constructor(
    private readonly src: string,
    private readonly p: Parser,
  ) {}

  private text(r: TextRange): string {
    return this.src.slice(r.start, r.end);
  }

  private value(start: number, end: number, firstCellOfRow = false): TextValue {
    const raw = this.src.slice(start, end);
    return { text: unescapeSaltText(raw), raw: { start, end }, formatted: isFormattedSaltText(raw, { firstCellOfRow }) };
  }

  private lock(range: TextRange, reason: string): LockedPart {
    const part: LockedPart = { type: 'locked', range: { start: range.start, end: range.end }, reason, excerpt: this.text(range) };
    this.locked.push(part);
    return part;
  }

  /** The model of a container, or a locked part when it cannot be edited visually. */
  container(pc: ParsedContainer): CellContent {
    const range = { start: pc.node.start, end: pc.node.end };
    const m = pc.modifier;
    if (pc.unknownModifier) return this.lock(range, LOCKED_REASONS.unknownModifier);
    switch (containerKind(m)) {
      case 'scrollArea':
        return m === 'S' ? this.scrollArea(pc) : this.lock(range, LOCKED_REASONS.scrollVariant);
      case 'tree':
        return m === 'T' ? this.tree(pc) : this.lock(range, LOCKED_REASONS.treeTable);
      case 'menuBar':
        return this.menuBar(pc);
      case 'tabBar':
        return this.tabBar(pc);
      case 'grid':
        break;
    }
    if (m.length > 1) this.p.diag('unsupported', SOURCE_ONLY_REASONS.multipleStyles, pc.open);
    if (pc.titleConflict) return this.lock(range, LOCKED_REASONS.groupBoxTitleRow);
    return this.grid(pc, []);
  }

  grid(pc: ParsedContainer, leadingComments: readonly TextRange[]): Grid {
    const style = STYLE_MODIFIERS[pc.modifier[0] ?? ''] ?? 'plain';
    let title: TextValue | null = null;
    if (style === 'groupBox' && pc.title) {
      const raw = this.text(pc.title);
      const quoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"');
      title = quoted ? this.value(pc.title.start + 1, pc.title.end - 1) : this.value(pc.title.start, pc.title.end);
    }
    return { type: 'grid', style, title, leadingComments, ...this.body(pc) };
  }

  private scrollArea(pc: ParsedContainer): ScrollArea {
    return { type: 'scrollArea', ...this.body(pc) };
  }

  private body(pc: ParsedContainer): Pick<Grid, 'range' | 'open' | 'close' | 'rows' | 'layout'> {
    const close = pc.close ?? pc.open;
    const range = { start: pc.node.start, end: pc.node.end };
    const multi = /[\r\n]/.test(this.src.slice(pc.open.start, close.end));
    return {
      range,
      open: { start: pc.open.start, end: pc.open.end },
      close: { start: close.start, end: close.end },
      rows: pc.rows.flatMap((r) => this.row(r)),
      layout: multi ? 'multiLine' : 'singleLine',
    };
  }

  private row(raw: RawRow): Row[] {
    const range = { start: raw.start, end: raw.end };
    if (raw.cells.length === 0) return [];
    const only = raw.cells.length === 1 ? singleText(raw.cells[0]!) : null;
    if (only && SEPARATOR.test(this.text(only))) {
      const kind = SEPARATOR_KINDS[this.src[only.start]!]!;
      return [{ type: 'separator', range, leadingComments: raw.leadingComments, separatorKind: kind }];
    }

    interface Building {
      start: number;
      end: number;
      content: CellContent;
      span: number;
      spanRanges: TextRange[];
      column: number;
    }
    const cells: Building[] = [];
    for (const rawCell of raw.cells) {
      const tok = singleText(rawCell);
      if (tok && this.text(tok) === '*') {
        const prev = cells.at(-1);
        if (!prev) {
          this.p.diag('syntax', SYNTAX.spanInFirstColumn, tok);
          continue;
        }
        prev.span++;
        prev.spanRanges.push({ start: tok.start, end: tok.end });
        prev.end = tok.end;
        continue;
      }
      const content = this.cell(rawCell, cells.length === 0, raw.cells.length > 1);
      const prev = cells.at(-1);
      cells.push({ start: rawCell.start, end: rawCell.end, content, span: 1, spanRanges: [], column: prev ? prev.column + prev.span : 0 });
    }
    const out: Cell[] = cells.map((c) => ({
      range: { start: c.start, end: c.end },
      content: c.content,
      span: c.span,
      spanRanges: c.spanRanges,
      column: c.column,
    }));
    return [{ type: 'cells', range, leadingComments: raw.leadingComments, cells: out }];
  }

  private cell(raw: RawCell, firstCellOfRow: boolean, sharedRow: boolean): CellContent {
    const range = { start: raw.start, end: raw.end };
    if (raw.items.length > 1) return this.lock(range, LOCKED_REASONS.mixedCell);
    const item = raw.items[0]!;
    if (item.kind === 'container') return this.container(item.pc);
    if (sharedRow && SEPARATOR.test(this.text(item.tok))) return this.lock(range, LOCKED_REASONS.separatorInRow);
    return this.element(item.tok, firstCellOfRow);
  }

  /** The element a cell's whole text stands for (A.1). */
  private element(tok: SaltToken, firstCellOfRow: boolean): CellContent {
    const range = { start: tok.start, end: tok.end };
    const s = this.text(tok);
    if (s === '.') return { type: 'empty', range };

    const box = /^([[(])([X ])([\])])([^\S\r\n]*)/.exec(s);
    if (box && ((box[1] === '[' && box[3] === ']') || (box[1] === '(' && box[3] === ')'))) {
      const label = this.value(tok.start + box[0].length, tok.end);
      const on = box[2] === 'X';
      return box[1] === '['
        ? { type: 'checkbox', range, checked: on, label }
        : { type: 'radioButton', range, selected: on, label };
    }
    if (s.length >= 2 && s.startsWith('[') && s.endsWith(']')) {
      return { type: 'button', range, label: this.value(tok.start + 1, tok.end - 1) };
    }
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
      const inner = s.slice(1, -1);
      const value = inner.replace(/ +$/, '');
      return { type: 'textField', range, value: this.value(tok.start + 1, tok.start + 1 + value.length), width: [...inner].length };
    }
    if (s.length >= 2 && s.startsWith('^') && s.endsWith('^')) {
      const parts = s.slice(1, -1).split('^^');
      if (parts.every((p) => !p.includes('^'))) {
        const values: TextValue[] = [];
        let at = tok.start + 1;
        for (const part of parts) {
          values.push(this.value(at, at + part.length));
          at += part.length + 2;
        }
        const [value, ...options] = values;
        return { type: 'dropDown', range, value: value!, options, open: options.length > 0 };
      }
    }
    return { type: 'text', range, text: this.value(tok.start, tok.end, firstCellOfRow) };
  }

  private tree(pc: ParsedContainer): Tree | LockedPart {
    const range = { start: pc.node.start, end: pc.node.end };
    const items: TreeItem[] = [];
    let previous = 0;
    for (const row of pc.rows) {
      const tok = row.cells.length === 1 ? singleText(row.cells[0]!) : null;
      const m = tok ? /^(\++)([^\S\r\n]*)/.exec(this.text(tok)) : null;
      if (!tok || !m) return this.lock(range, LOCKED_REASONS.treeShape);
      const depth = m[1]!.length;
      if (depth > previous + 1) return this.lock(range, LOCKED_REASONS.treeShape);
      previous = depth;
      items.push({ range: { start: tok.start, end: tok.end }, depth, text: this.value(tok.start + m[0].length, tok.end) });
    }
    return { type: 'tree', range, ...this.ends(pc), items };
  }

  private tabBar(pc: ParsedContainer): TabBar | LockedPart {
    const range = { start: pc.node.start, end: pc.node.end };
    const names = this.namesRow(pc.rows.length === 1 ? pc.rows[0] : pc.rows.length === 0 ? { cells: [] } : null);
    if (!names) return this.lock(range, LOCKED_REASONS.tabBarShape);
    let selectedIndex: number | null = null;
    const tabs = names.map((tok, index) => {
      const s = this.text(tok);
      const bold = /^<b>/i.exec(s);
      if (bold && selectedIndex === null) {
        selectedIndex = index;
        const close = /<\/b>$/i.exec(s);
        return this.value(tok.start + 3, close ? tok.end - 4 : tok.end);
      }
      return this.value(tok.start, tok.end);
    });
    return { type: 'tabBar', range, ...this.ends(pc), tabs, selectedIndex };
  }

  private menuBar(pc: ParsedContainer): MenuBar | LockedPart {
    const range = { start: pc.node.start, end: pc.node.end };
    const [first, ...rest] = pc.rows;
    const names = this.namesRow(first ?? { cells: [] });
    if (!names) return this.lock(range, LOCKED_REASONS.menuBarShape);
    const items = names.map((tok) => this.value(tok.start, tok.end));
    const openMenus = rest.filter((r) => r.cells.length > 0).map((r) => this.lock(r, LOCKED_REASONS.openMenu));
    return { type: 'menuBar', range, ...this.ends(pc), items, openMenus };
  }

  /** A row of plain names (tabs or menu items), or `null` when it holds anything else. */
  private namesRow(row: Pick<RawRow, 'cells'> | null | undefined): SaltToken[] | null {
    if (!row) return null;
    const out: SaltToken[] = [];
    for (const cell of row.cells) {
      const tok = singleText(cell);
      if (!tok) return null;
      out.push(tok);
    }
    return out;
  }

  private ends(pc: ParsedContainer): { open: TextRange; close: TextRange } {
    const close = pc.close ?? pc.open;
    return { open: { start: pc.open.start, end: pc.open.end }, close: { start: close.start, end: close.end } };
  }
}

function singleText(cell: RawCell): SaltToken | null {
  const only = cell.items.length === 1 ? cell.items[0]! : null;
  return only?.kind === 'text' ? only.tok : null;
}

// --------------------------------------------------------------------------------------------- entry

/** Parses one Salt block's text, from its `@start…` line to its `@end…` line, into tree, model and diagnostics. */
export function parseSalt(blockText: string): SaltParseResult {
  const parser = new Parser(blockText, lexSalt(blockText));
  const { tree, root } = parser.parseBlock();

  const builder = new ModelBuilder(blockText, parser);
  let model: SaltScreen | null = null;
  if (root) {
    const plainGrid = containerKind(root.modifier) === 'grid' && !root.unknownModifier && !root.titleConflict;
    const content: CellContent = plainGrid ? builder.grid(root, parser.rootComments) : builder.container(root);
    if (plainGrid && root.modifier.length > 1) parser.diag('unsupported', SOURCE_ONLY_REASONS.multipleStyles, root.open);
    if (content.type === 'grid') model = { root: content };
    else if (root.close) parser.diag('unsupported', SOURCE_ONLY_REASONS.rootNotGrid, root.open);
  }

  const diagnostics = [...parser.diagnostics].sort((a, b) => a.range.start - b.range.start);
  const errors: ParseError[] = diagnostics
    .filter((d) => d.kind === 'syntax')
    .map((d) => ({ line: d.line, messageKey: d.messageKey, ...(d.params ? { params: d.params } : {}) }));
  if (diagnostics.length > 0) model = null;
  return { tree, model, errors, diagnostics, lockedParts: model ? builder.locked : [] };
}

