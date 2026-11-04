// Palette items and presets (section 3.2 "Presets", section 3.3, FR-020/AC5 house style, data-model §5.2).
// Each palette item is written as the source of one cell (or, for a separator, one row) in the house style of
// core/project/house-style.ts. Placeholder text follows the same escaping rules as user text.
//
// This module also holds the small text helpers every screen operation shares: line boundaries, indentation and
// the block's line ending. Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution 9).

import { INDENT, salt, type LineEnding } from '../../project/house-style.ts';
import { escapeSaltText } from '../escape.ts';

/** The palette labels (contracts/ui.md §6); they identify the items. */
export const PALETTE_ITEMS = [
  'Text',
  'Separator',
  'Spacing',
  'Text field',
  'Text area',
  'Button',
  'Checkbox',
  'Radio button',
  'Drop-down',
  'Grid',
  'Row',
  'Column',
  'Form',
  'Button bar',
  'Table',
  'Group box',
  'Tree',
  'Tab bar',
  'Menu bar',
  'Scrollable area',
] as const;

export type PaletteItem = (typeof PALETTE_ITEMS)[number];

/** A palette choice. Only Grid asks for rows and columns (section 3.2). */
export interface PaletteChoice {
  readonly item: PaletteItem;
  readonly rows?: number;
  readonly columns?: number;
}

/** The five palette categories in order (section 3.3), with their items. */
export const PALETTE_CATEGORIES: readonly { readonly id: string; readonly items: readonly PaletteItem[] }[] = [
  { id: 'basic', items: ['Text', 'Separator', 'Spacing'] },
  { id: 'form', items: ['Text field', 'Text area', 'Button', 'Checkbox', 'Radio button', 'Drop-down'] },
  { id: 'layout', items: ['Grid', 'Row', 'Column', 'Form', 'Button bar', 'Group box'] },
  { id: 'data', items: ['Table', 'Tree'] },
  { id: 'navigation', items: ['Tab bar', 'Menu bar', 'Scrollable area'] },
];

export const DEFAULT_GRID_SIZE = { rows: 2, columns: 2 } as const;
export const MAX_GRID_SIZE = 20;

/** A separator fills a whole row; every other item is the content of one cell. */
export const isRowItem = (item: PaletteItem): boolean => item === 'Separator';

export interface WriteContext {
  /** The leading whitespace of the line the element starts on. */
  readonly indent: string;
  readonly eol: string;
  /** The element is the first cell of its row (command words are escaped there, section 3.4). */
  readonly firstCellOfRow: boolean;
}

const text = (t: string, firstCellOfRow: boolean): string => escapeSaltText(t, { firstCellOfRow });
const row = (cells: readonly string[]): string[] => cells.map((c, i) => text(c, i === 0));

/** A multi-line container: opener, rows one level in, `}` at the element's own indentation. */
function grid(opener: string, rows: readonly (readonly string[])[], ctx: WriteContext): string {
  const inner = ctx.indent + INDENT;
  return [opener, ...rows.map((cells) => inner + cells.join(' | ')), `${ctx.indent}}`].join(ctx.eol);
}

const clampSize = (n: number | undefined, fallback: number): number =>
  Number.isInteger(n) && n! >= 1 ? Math.min(n!, MAX_GRID_SIZE) : fallback;

/** The source of a new element in the house style. */
export function elementSource(choice: PaletteChoice, ctx: WriteContext): string {
  const D = salt.DEFAULTS;
  switch (choice.item) {
    case 'Text':
      return text(D.text, ctx.firstCellOfRow);
    case 'Separator':
      return salt.separator('--');
    case 'Spacing':
      return salt.emptyCell();
    case 'Text field':
      return salt.textField('');
    case 'Text area':
      return grid(salt.opener({ style: 'border' }), [['Line 1'], ['Line 2'], ['Line 3']].map(row), ctx);
    case 'Button':
      return salt.button(text(D.button, false));
    case 'Checkbox':
      return salt.checkbox(text(D.checkbox, false), false);
    case 'Radio button':
      return salt.radio(text(D.radio, false), false);
    case 'Drop-down':
      return salt.dropDown(text(D.dropDown, false));
    case 'Grid': {
      const rows = clampSize(choice.rows, DEFAULT_GRID_SIZE.rows);
      const columns = clampSize(choice.columns, DEFAULT_GRID_SIZE.columns);
      return grid('{', Array.from({ length: rows }, () => Array.from({ length: columns }, () => salt.emptyCell())), ctx);
    }
    case 'Row':
      return grid('{', [row(['Item 1', 'Item 2'])], ctx);
    case 'Column':
      return grid('{', [row(['Item 1']), row(['Item 2'])], ctx);
    case 'Form': {
      const field = salt.textField('');
      return grid('{', [[text('Label', true), field], [text('Label', true), field]], ctx);
    }
    case 'Button bar':
      return grid('{', [[salt.button(text('Button 1', false)), salt.button(text('Button 2', false))]], ctx);
    case 'Table':
      return grid(salt.opener({ style: 'tableLines' }), [row(['Column 1', 'Column 2']), ['.', '.']], ctx);
    case 'Group box':
      return grid(salt.opener({ style: 'groupBox', title: escapeTitle(D.groupTitle) }), [row([D.text])], ctx);
    case 'Tree': {
      const inner = ctx.indent + INDENT;
      const items = [
        [1, 'Item 1'],
        [2, 'Item 1.1'],
        [1, 'Item 2'],
      ] as const;
      return [salt.opener({ style: 'tree' }), ...items.map(([depth, t]) => `${inner}${'+'.repeat(depth)} ${text(t, false)}`), `${ctx.indent}}`].join(
        ctx.eol,
      );
    }
    case 'Tab bar':
      return salt.inlineGrid(salt.opener({ style: 'tabBar' }), [`<b>${text('Tab 1', false)}`, text('Tab 2', false)]);
    case 'Menu bar':
      return salt.inlineGrid(salt.opener({ style: 'menuBar' }), row(['File', 'Edit', 'Help']));
    case 'Scrollable area':
      return grid(salt.opener({ style: 'scroll' }), [row([D.text])], ctx);
  }
}

/** A group box title is written in quotes, so every quote in it is escaped as well. */
export function escapeTitle(title: string): string {
  return escapeSaltText(title, { firstCellOfRow: false }).replace(/"/g, '<U+0022>');
}

// ------------------------------------------------------------------------------------------- text helpers

/** The block's own line ending, else LF. */
export function eolOf(text: string): LineEnding {
  const m = /\r\n|\n|\r/.exec(text);
  return (m?.[0] as LineEnding | undefined) ?? '\n';
}

const isNl = (c: string | undefined): boolean => c === '\n' || c === '\r';

/** Offset of the start of the line containing `offset`. */
export function lineStart(text: string, offset: number): number {
  let i = offset;
  while (i > 0 && !isNl(text[i - 1])) i--;
  return i;
}

/** Offset of the end of the line containing `offset`, before its line ending. */
export function lineEnd(text: string, offset: number): number {
  let i = offset;
  while (i < text.length && !isNl(text[i])) i++;
  return i;
}

/** Offset just after the line ending of the line containing `offset`. */
export function lineEndWithEol(text: string, offset: number): number {
  const e = lineEnd(text, offset);
  if (text[e] === '\r' && text[e + 1] === '\n') return e + 2;
  return isNl(text[e]) ? e + 1 : e;
}

/** The leading whitespace of the line containing `offset`. */
export function indentAt(text: string, offset: number): string {
  const s = lineStart(text, offset);
  return /^[^\S\r\n]*/.exec(text.slice(s))![0];
}

/** True when only spaces and tabs come before `start` on its line. */
export function startsLine(text: string, start: number): boolean {
  return /^[^\S\r\n]*$/.test(text.slice(lineStart(text, start), start));
}

/** True when only spaces and tabs come after `end` on its line. */
export function endsLine(text: string, end: number): boolean {
  return /^[^\S\r\n]*$/.test(text.slice(end, lineEnd(text, end)));
}

/** Moves every line after the first from indentation `from` to `to`. */
export function reindent(source: string, from: string, to: string): string {
  if (from === to) return source;
  return source.replace(/(\r\n|\n|\r)([^\S\r\n]*)/g, (_m, nl: string, ws: string) =>
    nl + (ws.startsWith(from) ? to + ws.slice(from.length) : ws),
  );
}
