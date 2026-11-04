// House style: how the editor writes new source (FR-020/AC5, project-file.md §3 and §4).
//
// Only new text follows the house style; existing text is never reformatted (FR-020/AC1).
// Templates take text that is already escaped (core/salt/escape.ts, core/activity/escape.ts):
// escaping depends on context, so the caller applies it before calling a template.

export type LineEnding = '\n' | '\r\n' | '\r';

/** A new project uses LF (project-file.md §1). */
export const NEW_PROJECT_LINE_ENDING: LineEnding = '\n';

/** One indentation level. */
export const INDENT = '  ';

export function indent(depth: number): string {
  if (!Number.isInteger(depth) || depth < 0) throw new RangeError(`Invalid indentation depth: ${depth}`);
  return INDENT.repeat(depth);
}

/** The first line ending in `text`, or null when it has none. */
export function firstLineEnding(text: string): LineEnding | null {
  const match = /\r\n|\n|\r/.exec(text);
  return match ? (match[0] as LineEnding) : null;
}

/** New lines use the block's own line ending, else the file's first, else LF (data-model §4.2). */
export function chooseLineEnding(context: { block?: string | null; file?: string | null }): LineEnding {
  return (
    (context.block != null ? firstLineEnding(context.block) : null) ??
    (context.file != null ? firstLineEnding(context.file) : null) ??
    NEW_PROJECT_LINE_ENDING
  );
}

// ---------------------------------------------------------------------------------------------
// Blocks

/** A new screen: an empty one-column root grid, ending with a line ending. */
export function newScreenBlock(name: string, eol: LineEnding): string {
  return `@startsalt ${name}${eol}${salt.grid('{', [], 0, eol)}${eol}@endsalt${eol}`;
}

/** A new screen flow: start and stop, ending with a line ending. */
export function newFlowBlock(name: string, eol: LineEnding): string {
  return [`@startuml ${name}`, flow.start(), flow.stop(), '@enduml'].join(eol) + eol;
}

// ---------------------------------------------------------------------------------------------
// Salt (Supported Constructs A.1)

export type SeparatorKind = '..' | '==' | '~~' | '--';

export type ContainerStyle =
  | { style: 'plain' }
  | { style: 'border' }
  | { style: 'tableLines' }
  | { style: 'verticalLines' }
  | { style: 'horizontalLines' }
  | { style: 'groupBox'; title: string }
  | { style: 'tree' }
  | { style: 'tabBar' }
  | { style: 'menuBar' }
  | { style: 'scroll' };

export interface TreeItem {
  /** 1 for a top-level item. */
  depth: number;
  text: string;
}

function saltOpener(container: ContainerStyle): string {
  switch (container.style) {
    case 'plain': return '{';
    case 'border': return '{+';
    case 'tableLines': return '{#';
    case 'verticalLines': return '{!';
    case 'horizontalLines': return '{-';
    case 'groupBox': return `{^"${container.title}"`;
    case 'tree': return '{T';
    case 'tabBar': return '{/';
    case 'menuBar': return '{*';
    case 'scroll': return '{S';
  }
}

const CELL_SEPARATOR = ' | ';

/** Width in characters of a new, empty text field. */
const DEFAULT_FIELD_WIDTH = 10;

export const salt = {
  /** Placeholder text for new elements; presets use the texts the spec names (section 3.2). */
  DEFAULTS: {
    text: 'Text',
    button: 'Button',
    checkbox: 'Checkbox',
    radio: 'Option',
    dropDown: 'Select',
    groupTitle: 'Group',
    tab: 'Tab',
    menuItem: 'Menu',
    treeItem: 'Item',
  },
  DEFAULT_FIELD_WIDTH,

  text: (text: string): string => text,
  emptyCell: (): string => '.',
  button: (label: string): string => `[${label}]`,
  checkbox: (label: string, checked: boolean): string => `[${checked ? 'X' : ' '}] ${label}`,
  radio: (label: string, selected: boolean): string => `(${selected ? 'X' : ' '}) ${label}`,
  /** Closed `^Value^`, or an open list `^Value^^Option 1^^Option 2^`. */
  dropDown: (value: string, options: readonly string[] = []): string =>
    [value, ...options].map((item) => `^${item}^`).join(''),
  /** The quoted text sets the width, so the value is padded with spaces and never trimmed. */
  textField: (value: string, width: number = DEFAULT_FIELD_WIDTH): string => `"${value.padEnd(width, ' ')}"`,
  separator: (kind: SeparatorKind): string => kind,
  opener: saltOpener,

  /** One row of cells at `depth`. */
  row: (cells: readonly string[], depth: number): string => indent(depth) + cells.join(CELL_SEPARATOR),

  /** A multi-line grid; the opener is not indented (it follows the cell's own position). */
  grid: (opener: string, rows: readonly (readonly string[])[], depth: number, eol: LineEnding): string =>
    [opener, ...rows.map((cells) => salt.row(cells, depth + 1)), `${indent(depth)}}`].join(eol),

  /** A single-line grid, such as a tab bar `{/ Tab 1 | Tab 2 }`. */
  inlineGrid: (opener: string, cells: readonly string[]): string =>
    cells.length === 0 ? `${opener} }` : `${opener} ${cells.join(CELL_SEPARATOR)} }`,

  /** A tree `{T` with `+` depth markers. */
  tree: (items: readonly TreeItem[], depth: number, eol: LineEnding): string => {
    for (const item of items) {
      if (!Number.isInteger(item.depth) || item.depth < 1) throw new RangeError(`Invalid tree depth: ${item.depth}`);
    }
    return [
      saltOpener({ style: 'tree' }),
      ...items.map((item) => `${indent(depth + 1)}${'+'.repeat(item.depth)} ${item.text}`),
      `${indent(depth)}}`,
    ].join(eol);
  },
} as const;

// ---------------------------------------------------------------------------------------------
// Activity (Supported Constructs A.2)

export interface DecisionTemplate {
  condition: string;
  thenLabel: string;
  elseLabel: string;
}

export const flow = {
  DEFAULTS: {
    step: 'Step',
    condition: 'Condition?',
    thenLabel: 'yes',
    elseLabel: 'no',
    loopCondition: 'Repeat?',
    note: 'Note',
  },

  /** One statement line at `depth`. */
  line: (statement: string, depth: number): string => indent(depth) + statement,

  start: (): string => 'start',
  stop: (): string => 'stop',
  step: (label: string): string => `:${label};`,
  linkedStep: (target: string, label: string): string => `:[[#${target} ${label}]];`,
  lane: (name: string): string => `|${name}|`,

  /** A decision with two empty branches. */
  decision: (d: DecisionTemplate, depth: number, eol: LineEnding): string =>
    [`if (${d.condition}) then (${d.thenLabel})`, `else (${d.elseLabel})`, 'endif']
      .map((statement) => flow.line(statement, depth))
      .join(eol),

  repeatLoop: (condition: string, depth: number, eol: LineEnding): string =>
    ['repeat', `repeat while (${condition})`].map((statement) => flow.line(statement, depth)).join(eol),

  whileLoop: (condition: string, depth: number, eol: LineEnding): string =>
    [`while (${condition})`, 'endwhile'].map((statement) => flow.line(statement, depth)).join(eol),

  /** One line of text: `note left: text`; several: a block ending with `end note`. */
  note: (side: 'left' | 'right', lines: readonly string[], depth: number, eol: LineEnding): string =>
    lines.length === 1
      ? flow.line(`note ${side}: ${lines[0]}`, depth)
      : [
          flow.line(`note ${side}`, depth),
          ...lines.map((text) => flow.line(text, depth + 1)),
          flow.line('end note', depth),
        ].join(eol),
} as const;
