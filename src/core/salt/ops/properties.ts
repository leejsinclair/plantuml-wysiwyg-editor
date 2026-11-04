// Component properties (FR-003, section 3.4, Supported Constructs A.1, data-model §5.1–§5.2).
//
// `propertiesOf` lists exactly the properties a construct supports: there is no placeholder and no enabled or
// disabled state, and nothing is offered that cannot be written to the source (FR-003/AC4, AC7). `setProperty`
// changes one property with a minimal text patch:
// - text is literal: it is escaped only where Salt would interpret it (section 3.4);
// - imported formatted text needs a choice: "Keep formatting" writes the markers as typed (braces, bars and
//   characters that would change the element's type are still escaped) and "Remove formatting" makes it literal;
// - a text field keeps its width when its value changes, and a longer value widens it (FR-003/AC8);
// - closing a drop-down drops its options, and the result says how many (FR-003/AC10, EC-07);
// - the selected tab is written bold (OD-7); a container has exactly one style.
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { OpResult, Path, TextEdit } from '../../types.ts';
import { INDENT, salt } from '../../project/house-style.ts';
import { escapeSaltText } from '../escape.ts';
import { parseSalt } from '../parser.ts';
import type { CellContent, Grid, GridStyle, SeparatorKind, TextValue } from '../model.ts';
import { locate, type ScreenDoc } from '../destinations.ts';
import { eolOf, escapeTitle, indentAt } from './presets.ts';
import { setSpan, spanInfo } from './span.ts';

export type PropertyName =
  | 'text'
  | 'label'
  | 'value'
  | 'width'
  | 'checked'
  | 'selected'
  | 'options'
  | 'open'
  | 'items'
  | 'tabs'
  | 'selectedTab'
  | 'style'
  | 'title'
  | 'kind'
  | 'span';

/** A text property's new value: plain text, or text with the choice made for imported formatted text. */
export type TextInput = string | { readonly text: string; readonly formatting: 'keep' | 'remove' };

export const GRID_STYLES: readonly GridStyle[] = ['plain', 'border', 'tableLines', 'verticalLines', 'horizontalLines', 'groupBox'];
export const SEPARATOR_KINDS: readonly SeparatorKind[] = ['single', 'double', 'dotted', 'wavy'];
const SEPARATOR_SOURCE: Record<SeparatorKind, string> = { single: '--', double: '==', dotted: '..', wavy: '~~' };
const STYLE_OPENER: Record<Exclude<GridStyle, 'groupBox'>, string> = {
  plain: '{',
  border: '{+',
  tableLines: '{#',
  verticalLines: '{!',
  horizontalLines: '{-',
};

/** The properties the element at `target` supports, in the order the properties panel shows them. */
export function propertiesOf(model: ScreenDoc['model'], target: Path): PropertyName[] {
  const at = locate(model, target);
  if (!at) return [];
  if (at.kind === 'container') return gridProps(at.container.type === 'grid' ? at.container : null);
  if (at.kind === 'separator') return ['kind'];
  if (at.kind === 'row') return [];
  const own = contentProps(at.cell.content);
  return spanInfo(model, target).offered ? [...own, 'span'] : own;
}

function gridProps(grid: Grid | null): PropertyName[] {
  if (!grid) return [];
  return grid.style === 'groupBox' ? ['style', 'title'] : ['style'];
}

function contentProps(c: CellContent): PropertyName[] {
  switch (c.type) {
    case 'text':
      return ['text'];
    case 'button':
      return ['label'];
    case 'textField':
      return ['value', 'width'];
    case 'checkbox':
      return ['label', 'checked'];
    case 'radioButton':
      return ['label', 'selected'];
    case 'dropDown':
      return ['value', 'options', 'open'];
    case 'tree':
    case 'menuBar':
      return ['items'];
    case 'tabBar':
      return ['tabs', 'selectedTab'];
    case 'grid':
      return gridProps(c);
    default:
      return [];
  }
}

// ------------------------------------------------------------------------------------------------ writing text

/** Where a text is written, which decides the extra characters to escape. */
type TextPlace = 'cell' | 'label' | 'dropDown' | 'title' | 'item';

const ZWS = '​';
const u = (c: string): string => `<U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}>`;

function extraEscapes(written: string, place: TextPlace): string {
  if (place === 'dropDown') return written.replace(/\^/g, u('^'));
  if (place === 'title') return written.replace(/"/g, u('"'));
  return written;
}

/** The type a cell of exactly this source would have. */
function cellType(source: string): CellContent['type'] | null {
  const m = parseSalt(`@startsalt\n{\n${source}\n}\n@endsalt\n`).model;
  const row = m?.root.rows[0];
  if (!m || m.root.rows.length !== 1 || row?.type !== 'cells' || row.cells.length !== 1) return null;
  return row.cells[0]!.content.type;
}

/** "Keep formatting": markers as typed; braces, bars and characters that would change the element's type escaped. */
function keepFormatting(text: string, place: TextPlace, firstCellOfRow: boolean): string {
  let written = extraEscapes(text.replace(/[{}|]/g, (c) => u(c)), place);
  if (place === 'cell') {
    if (cellType(written) !== 'text') {
      const lead = written.search(/\S/);
      written = lead < 0 ? written : written.slice(0, lead) + u(written[lead]!) + written.slice(lead + 1);
    }
    if (cellType(written) !== 'text') written = escapeSaltText(text, { firstCellOfRow });
  }
  const literal = escapeSaltText(text, { firstCellOfRow });
  if (firstCellOfRow && literal.startsWith(ZWS) && !written.startsWith(ZWS)) written = ZWS + written;
  return written;
}

/** The source for a new text value, or a refusal when imported formatted text needs a choice first. */
function writeText(old: TextValue | null, input: TextInput, place: TextPlace, firstCellOfRow = false): string | { refused: string } {
  const text = typeof input === 'string' ? input : input.text;
  const formatting = typeof input === 'string' ? null : input.formatting;
  if (old?.formatted && formatting === null && text !== old.text) return { refused: 'screen.refuse.formattingChoice' };
  if (formatting === 'keep') return keepFormatting(text, place, firstCellOfRow);
  return extraEscapes(escapeSaltText(text, { firstCellOfRow }), place);
}

const textOf = (input: unknown): TextInput | null => {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && typeof (input as { text?: unknown }).text === 'string') {
    const f = (input as { formatting?: unknown }).formatting;
    if (f === 'keep' || f === 'remove') return input as TextInput;
  }
  return null;
};

const plain = (input: TextInput): string => (typeof input === 'string' ? input : input.text);

// ---------------------------------------------------------------------------------------------- setProperty

const ok = (edits: TextEdit[], select: Path, prop: PropertyName, params?: Record<string, string | number>): OpResult => ({
  ok: true,
  edits,
  select,
  announceKey: `screen.announce.changed.${prop}`,
  ...(params ? { announceParams: params } : {}),
  historyName: `screen.history.property.${prop}`,
});
const refuse = (messageKey: string, params?: Record<string, string | number>): OpResult => ({ ok: false, messageKey, ...(params ? { params } : {}) });
const unchanged = (): OpResult => refuse('screen.refuse.noChange');

/** Reuses an existing item's source when its text is unchanged, so imported formatting survives list edits. */
function listItem(existing: readonly TextValue[], text: string, docText: string, place: TextPlace, first = false): string {
  const same = existing.find((e) => e.text === text);
  if (same) return docText.slice(same.raw.start, same.raw.end);
  return extraEscapes(escapeSaltText(text, { firstCellOfRow: first }), place);
}

export function setProperty(doc: ScreenDoc, target: Path, prop: string, value: unknown): OpResult {
  const at = locate(doc.model, target);
  if (!at) return refuse('screen.refuse.notFound');
  if (!(propertiesOf(doc.model, target) as string[]).includes(prop)) return refuse('screen.refuse.noSuchProperty');
  const p = prop as PropertyName;
  const { text } = doc;

  if (p === 'span') return typeof value === 'number' ? setSpan(doc, target, value) : refuse('screen.refuse.invalidValue');

  if (at.kind === 'separator') {
    const kind = value as SeparatorKind;
    if (!SEPARATOR_KINDS.includes(kind)) return refuse('screen.refuse.invalidValue');
    if (kind === at.row.separatorKind) return unchanged();
    return ok([{ start: at.row.range.start, end: at.row.range.end, text: SEPARATOR_SOURCE[kind] }], target, p);
  }

  const content: CellContent | null = at.kind === 'container' ? at.container : at.kind === 'cell' ? at.cell.content : null;
  if (!content) return refuse('screen.refuse.noSuchProperty');
  const firstCellOfRow = at.kind === 'cell' && at.cellIndex === 0;

  const replaceText = (old: TextValue, place: TextPlace, first = false): OpResult => {
    const input = textOf(value);
    if (input === null) return refuse('screen.refuse.invalidValue');
    if (plain(input) === old.text && (typeof input === 'string' || !old.formatted)) return unchanged();
    const written = writeText(old, input, place, first);
    if (typeof written !== 'string') return refuse(written.refused);
    if (written === text.slice(old.raw.start, old.raw.end)) return unchanged();
    // A label with no space after its box gets one, so `[X]` becomes `[X] Label`.
    const pad = place === 'label' && old.raw.start === old.raw.end && /[\])]$/.test(text.slice(0, old.raw.start)) ? ' ' : '';
    return ok([{ start: old.raw.start, end: old.raw.end, text: pad + written }], target, p);
  };

  switch (content.type) {
    case 'text':
      return replaceText(content.text, 'cell', firstCellOfRow);
    case 'button':
    case 'checkbox':
    case 'radioButton': {
      if (p === 'label') return replaceText(content.label, 'label');
      const on = value === true;
      if (typeof value !== 'boolean') return refuse('screen.refuse.invalidValue');
      const current = content.type === 'checkbox' ? content.checked : content.type === 'radioButton' ? content.selected : false;
      if (on === current) return unchanged();
      const at1 = content.range.start + 1;
      return ok([{ start: at1, end: at1 + 1, text: on ? 'X' : ' ' }], target, p);
    }
    case 'textField': {
      const valueRaw = text.slice(content.value.raw.start, content.value.raw.end);
      const field = (raw: string, width: number): TextEdit => ({
        start: content.range.start,
        end: content.range.end,
        text: `"${raw}${' '.repeat(Math.max(0, width - [...raw].length))}"`,
      });
      if (p === 'width') {
        if (typeof value !== 'number' || !Number.isFinite(value)) return refuse('screen.refuse.invalidValue');
        const width = Math.max(Math.floor(value), [...valueRaw].length);
        if (width === content.width) return unchanged();
        return ok([field(valueRaw, width)], target, p, { width });
      }
      const input = textOf(value);
      if (input === null) return refuse('screen.refuse.invalidValue');
      const trimmed: TextInput = typeof input === 'string' ? input.replace(/ +$/, '') : { ...input, text: input.text.replace(/ +$/, '') };
      if (plain(trimmed) === content.value.text && (typeof trimmed === 'string' || !content.value.formatted)) return unchanged();
      const written = writeText(content.value, trimmed, 'label');
      if (typeof written !== 'string') return refuse(written.refused);
      return ok([field(written, Math.max(content.width, [...written].length))], target, p);
    }
    case 'dropDown': {
      const valueRaw = (): string => text.slice(content.value.raw.start, content.value.raw.end);
      const rebuild = (v: string, options: readonly string[]): TextEdit => ({ start: content.range.start, end: content.range.end, text: salt.dropDown(v, options) });
      if (p === 'value') return replaceText(content.value, 'dropDown');
      if (p === 'options') {
        if (!Array.isArray(value) || !value.every((o) => typeof o === 'string')) return refuse('screen.refuse.invalidValue');
        const options = (value as string[]).map((o) => listItem(content.options, o, text, 'dropDown'));
        return ok([rebuild(valueRaw(), options)], target, p);
      }
      if (typeof value !== 'boolean') return refuse('screen.refuse.invalidValue');
      if (value === content.open) return unchanged();
      if (!value) {
        const count = content.options.length;
        return { ...ok([rebuild(valueRaw(), [])], target, p), announceKey: 'screen.announce.optionsRemoved', announceParams: { count } } as OpResult;
      }
      return ok([rebuild(valueRaw(), [escapeSaltText('Option 1', { firstCellOfRow: false })])], target, p);
    }
    case 'tree': {
      if (!Array.isArray(value)) return refuse('screen.refuse.invalidValue');
      const items = value as { text?: unknown; depth?: unknown }[];
      let previous = 0;
      for (const item of items) {
        if (typeof item?.text !== 'string' || !Number.isInteger(item.depth) || (item.depth as number) < 1 || (item.depth as number) > previous + 1) {
          return refuse('screen.refuse.treeDepth');
        }
        previous = item.depth as number;
      }
      const base = indentAt(text, content.range.start);
      const eol = eolOf(text);
      const existing = content.items.map((i) => i.text);
      const lines = items.map((i) => `${base}${INDENT}${'+'.repeat(i.depth as number)} ${listItem(existing, i.text as string, text, 'item')}`);
      return ok([{ start: content.range.start, end: content.range.end, text: ['{T', ...lines, `${base}}`].join(eol) }], target, p);
    }
    case 'tabBar': {
      let tabs = content.tabs.map((t) => text.slice(t.raw.start, t.raw.end));
      let selected = content.selectedIndex;
      if (p === 'tabs') {
        if (!Array.isArray(value) || !value.every((o) => typeof o === 'string')) return refuse('screen.refuse.invalidValue');
        tabs = (value as string[]).map((t, i) => listItem(content.tabs, t, text, 'item', i === 0));
        if (selected !== null && selected >= tabs.length) selected = null;
      } else {
        if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= tabs.length)) {
          return refuse('screen.refuse.invalidValue');
        }
        if (value === selected) return unchanged();
        selected = value as number | null;
      }
      const cells = tabs.map((t, i) => (i === selected ? `<b>${t}` : t));
      return ok([{ start: content.range.start, end: content.range.end, text: salt.inlineGrid('{/', cells) }], target, p);
    }
    case 'menuBar': {
      if (!Array.isArray(value) || !value.every((o) => typeof o === 'string')) return refuse('screen.refuse.invalidValue');
      const written = (value as string[]).map((t, i) => listItem(content.items, t, text, 'item', i === 0)).join(' | ');
      const first = content.items[0];
      const last = content.items.at(-1);
      if (first && last) return ok([{ start: first.raw.start, end: last.raw.end, text: written }], target, p);
      return ok([{ start: content.open.end, end: content.open.end, text: ` ${written}` }], target, p);
    }
    case 'grid': {
      const title = content.title;
      const headEnd = title ? title.raw.end + (text[title.raw.end] === '"' ? 1 : 0) : content.open.end;
      if (p === 'title') {
        if (!title) return refuse('screen.refuse.noSuchProperty');
        return replaceText(title, 'title');
      }
      const style = value as GridStyle;
      if (!GRID_STYLES.includes(style)) return refuse('screen.refuse.invalidValue');
      if (style === content.style) return unchanged();
      const head =
        style === 'groupBox' ? salt.opener({ style: 'groupBox', title: escapeTitle(salt.DEFAULTS.groupTitle) }) : STYLE_OPENER[style];
      return ok([{ start: content.open.start, end: headEnd, text: head }], target, p);
    }
    default:
      return refuse('screen.refuse.noSuchProperty');
  }
}

/** The text a user edits in place for an element: its main text property, or `null` when it has none. */
export function mainTextProperty(content: CellContent): { prop: PropertyName; value: TextValue } | null {
  switch (content.type) {
    case 'text':
      return { prop: 'text', value: content.text };
    case 'button':
    case 'checkbox':
    case 'radioButton':
      return { prop: 'label', value: content.label };
    case 'textField':
    case 'dropDown':
      return { prop: 'value', value: content.value };
    case 'grid':
      return content.title ? { prop: 'title', value: content.title } : null;
    default:
      return null;
  }
}
