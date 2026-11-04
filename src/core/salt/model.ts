// The screen model (data-model §5.2): what the visual editor sees of a Salt block. It is derived from the
// lossless syntax tree by `parseSalt` and never stored (data-model §1). Every node keeps the block-relative
// `TextRange` of its source, so operations can turn a change into a minimal text patch (R-3).
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { TextRange } from '../types.ts';

/** User-visible text on a component (data-model §5.1). */
export interface TextValue {
  /** The literal text the user sees and types (escapes removed). */
  readonly text: string;
  /** Where the text lives in the block's source. */
  readonly raw: TextRange;
  /** The source differs from the editor's own escaped form of `text` (imported creole or markup, section 3.4). */
  readonly formatted: boolean;
}

/** The six container styles (section 3.2); exactly one per container. */
export type GridStyle = 'plain' | 'border' | 'tableLines' | 'verticalLines' | 'horizontalLines' | 'groupBox';

/** Salt modifier character for each style (`{+`, `{#`, `{!`, `{-`, `{^`). */
export const STYLE_MODIFIERS: Readonly<Record<string, GridStyle>> = {
  '+': 'border',
  '#': 'tableLines',
  '!': 'verticalLines',
  '-': 'horizontalLines',
  '^': 'groupBox',
};

export type GridLayout = 'singleLine' | 'multiLine';

interface ContainerBase {
  readonly range: TextRange;
  /** The `{` token with its modifier. */
  readonly open: TextRange;
  /** The matching `}`. */
  readonly close: TextRange;
  readonly rows: readonly Row[];
  /** As written: the container opens and closes on one line, or on several. Both render. */
  readonly layout: GridLayout;
}

/** A grid container (`{` … `}`), possibly styled. */
export interface Grid extends ContainerBase {
  readonly type: 'grid';
  readonly style: GridStyle;
  /** Only for `groupBox`: the title written after `{^`. */
  readonly title: TextValue | null;
  /** Full-line comments directly before the container. Set on the root grid; nested grids carry theirs on their row. */
  readonly leadingComments: readonly TextRange[];
}

/** A scrollable area (`{S` … `}`): the same rows as a grid, no style. `{SI` and `{S-` are locked parts. */
export interface ScrollArea extends ContainerBase {
  readonly type: 'scrollArea';
}

export type Container = Grid | ScrollArea;

/** A row of cells separated by `|`. Ragged rows are valid and never padded (EC-02). */
export interface CellsRow {
  readonly type: 'cells';
  readonly range: TextRange;
  /** Full-line comments directly above the row, with no blank line between; they move and delete with it. */
  readonly leadingComments: readonly TextRange[];
  readonly cells: readonly Cell[];
}

export type SeparatorKind = 'dotted' | 'double' | 'wavy' | 'single';

/** A whole-row separator: `..` dotted, `==` double, `~~` wavy, `--` single (longer runs read the same). */
export interface SeparatorRow {
  readonly type: 'separator';
  readonly range: TextRange;
  readonly leadingComments: readonly TextRange[];
  readonly separatorKind: SeparatorKind;
}

export type Row = CellsRow | SeparatorRow;

/** One grid cell. A blank cell (`| |`) collapses in PlantUML, so it is not a cell: only `.` keeps a position. */
export interface Cell {
  /** From the cell's first content character to its last, or to the last `*` of its span. */
  readonly range: TextRange;
  readonly content: CellContent;
  /** Columns covered: 1 plus the `*` cells that follow it. */
  readonly span: number;
  /** The `*` continuation cells, in order. */
  readonly spanRanges: readonly TextRange[];
  /** 0-based start column, counting earlier spans. */
  readonly column: number;
}

/** `.`: the only form that keeps an empty cell's position. */
export interface Empty {
  readonly type: 'empty';
  readonly range: TextRange;
}

/** Valid content the editor does not support, kept exactly and shown as a labelled placeholder (section 4.1). */
export interface LockedPart {
  readonly type: 'locked';
  readonly range: TextRange;
  /** Message key of the reason (see `LOCKED_REASONS`). */
  readonly reason: string;
  /** The source of the part, shown on the placeholder. */
  readonly excerpt: string;
}

export interface Text {
  readonly type: 'text';
  readonly range: TextRange;
  readonly text: TextValue;
}

/** `[Label]` */
export interface Button {
  readonly type: 'button';
  readonly range: TextRange;
  readonly label: TextValue;
}

/** `"value   "`: the quoted length is the width in characters, never less than the value. */
export interface TextField {
  readonly type: 'textField';
  readonly range: TextRange;
  /** The quoted text without its trailing spaces. */
  readonly value: TextValue;
  /** Characters between the quotes, trailing spaces included. */
  readonly width: number;
}

/** `[X] Label` or `[ ] Label` */
export interface Checkbox {
  readonly type: 'checkbox';
  readonly range: TextRange;
  readonly checked: boolean;
  readonly label: TextValue;
}

/** `(X) Label` or `( ) Label`; set independently, Salt has no grouping (A-6). */
export interface RadioButton {
  readonly type: 'radioButton';
  readonly range: TextRange;
  readonly selected: boolean;
  readonly label: TextValue;
}

/** `^Value^` closed, `^Value^^Option 1^^Option 2^` open. Options exist only while open. */
export interface DropDown {
  readonly type: 'dropDown';
  readonly range: TextRange;
  readonly value: TextValue;
  readonly options: readonly TextValue[];
  readonly open: boolean;
}

export interface TreeItem {
  readonly range: TextRange;
  /** Number of `+` markers, ≥ 1, at most one more than the item before. */
  readonly depth: number;
  readonly text: TextValue;
}

/** `{T` with `+` depth markers. Tree-table variants are locked parts. */
export interface Tree {
  readonly type: 'tree';
  readonly range: TextRange;
  readonly open: TextRange;
  readonly close: TextRange;
  readonly items: readonly TreeItem[];
}

/** `{/ Tab 1 | Tab 2 }`: the bar only. The selected tab is written bold, `<b>Tab</b>` (OD-7). */
export interface TabBar {
  readonly type: 'tabBar';
  readonly range: TextRange;
  readonly open: TextRange;
  readonly close: TextRange;
  readonly tabs: readonly TextValue[];
  readonly selectedIndex: number | null;
}

/** `{*` first row. Later rows (open menus) are locked parts, one per row. */
export interface MenuBar {
  readonly type: 'menuBar';
  readonly range: TextRange;
  readonly open: TextRange;
  readonly close: TextRange;
  readonly items: readonly TextValue[];
  readonly openMenus: readonly LockedPart[];
}

export type Element = Text | Button | TextField | Checkbox | RadioButton | DropDown | Tree | TabBar | MenuBar | Grid | ScrollArea;

export type CellContent = Element | Empty | LockedPart;

/** One Salt block's screen: exactly one root grid (section 4.1). */
export interface SaltScreen {
  readonly root: Grid;
}

/** Message keys of locked-part reasons (section 4.1, data-model §5.2 LockedPart). */
export const LOCKED_REASONS = {
  /** `{T#`, `{T!`, `{T-`, `{T+` */
  treeTable: 'locked.treeTable',
  /** Rows after a menu bar's first row. */
  openMenu: 'locked.openMenu',
  /** `{SI`, `{S-` */
  scrollVariant: 'locked.scrollVariant',
  /** A character after `{` that is not a container modifier, such as `{Q`. */
  unknownModifier: 'locked.unknownModifier',
  /** A tree whose lines are not all `+` items, or whose depth jumps by more than one. */
  treeShape: 'locked.treeShape',
  /** A tab bar with more than one row, or with something other than tab names. */
  tabBarShape: 'locked.tabBarShape',
  /** A menu bar whose first row holds something other than item names. */
  menuBarShape: 'locked.menuBarShape',
  /** A cell holding more than one thing, such as a nested grid followed by text. */
  mixedCell: 'locked.mixedCell',
  /** A separator in a row with other cells. */
  separatorInRow: 'locked.separatorInRow',
  /** A group box whose title line also holds cells. */
  groupBoxTitleRow: 'locked.groupBoxTitleRow',
} as const;

/**
 * Message keys of block-level reasons that make a screen source-only (section 4.1). The `ignored.*` keys are
 * `ignoredContent` diagnostics: they say which content will not appear in the image and are worded differently
 * from syntax errors (FR-008/AC8, EC-08). Their `content` parameter is the first line of that content.
 */
export const SOURCE_ONLY_REASONS = {
  preprocessor: 'sourceOnly.preprocessor',
  multipleStyles: 'sourceOnly.multipleStyles',
  /** The root is a tree, tab bar, menu bar, scroll area or locked container rather than a grid. */
  rootNotGrid: 'sourceOnly.rootNotGrid',
  severalRootGrids: 'ignored.severalRootGrids',
  textAfterRoot: 'ignored.textAfterRoot',
} as const;

/** The number of columns: the widest row, counting spans (data-model §5.2 Grid). */
export function columnCount(container: Container): number {
  let max = 0;
  for (const row of container.rows) {
    if (row.type !== 'cells') continue;
    const last = row.cells.at(-1);
    if (last) max = Math.max(max, last.column + last.span);
  }
  return max;
}
