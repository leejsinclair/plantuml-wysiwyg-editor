# Data Model: PlantUML Wireframe and Screen Flow Editor

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md) | **Date**: 2026-10-27

This document defines the entities the feature introduces. The repository has no application code, so nothing is reshaped; every entity is new. Requirement references (FR-nnn/ACn, section n, EC-nn, R-nn) point to the spec and research.

## 1. Governing rules

These follow from R-3, R-4 and R-15 and shape every entity below.

1. **Source is the only truth.** The project's source text is the one stored value from which everything visual is derived. Grids, cells, components, flow elements, lanes, notes, links, block categories and statuses are all derived by parsing. Nothing visual is stored separately (constitution principle 4, section 3.6).
2. **Every change is a text patch.** Visual operations, typing, undo, redo, conversion and re-division all produce `TextEdit` lists that are applied to the source, after which the affected block is re-parsed (R-3, FR-007/AC5).
3. **Stored metadata is minimal.** Only the project name, timestamps, download state, which block is the screen flow, and the last working version of currently invalid blocks are stored beside the source (section 3.6). None of it is written into downloads.
4. **Positions, not names, identify blocks in storage.** Stored metadata refers to blocks by their index in file order. In a session, a block also has a runtime key that survives edits and reorders and is never stored (R-4).
5. **Status is derived, never stored** (R-15). See section 7.1.
6. **No coordinates.** No entity has a pixel position, size or free placement (constitution principle 2, FR-016/AC6).

## 2. Layers at a glance

| Layer | Entities | Lifetime | Where |
| ----- | -------- | -------- | ----- |
| Stored | `ProjectRecord`, `LastWorkingVersion`, `Settings` | Until deleted | IndexedDB (R-5) |
| Source | `ProjectSource`, `Segment`, `TextEdit`, `TextRange` | Derived from stored source on load; kept in memory | `src/core/source`, `src/core/blocks` |
| Block | `Block`, `BlockName`, `Diagnostic` | Re-derived on every change | `src/core/blocks`, `src/core/project`, `src/core/names` |
| Screen model | `SaltScreen`, `Grid`, `Row`, `Cell`, components, `LockedPart` | Re-derived per block on its text (memoised, R-14) | `src/core/salt` |
| Flow model | `ScreenFlow`, `Path`, flow elements, `Branch`, `Note`, `Lane`, `Link` | Re-derived per block on its text | `src/core/activity` |
| Session | `EditorSession`, `Selection`, `History`, `HistoryEntry`, `SourceEditSession`, `SaveState`, `TabRole`, `RenderResult`, `Notice` | Current tab and session only | `src/core/history`, `src/services`, `src/ui/app/store.ts` |

Relationships:

```text
ProjectRecord 1 ── 1 ProjectSource ── 1..* Segment (Block | BetweenText)
ProjectRecord 1 ── 0..* LastWorkingVersion ──> Block (by index)
ProjectRecord 1 ── 0..1 flowIndex ──> Block (kind = flow)
Block (screen) 1 ── 0..1 SaltScreen ── 1 root Grid ── 0..* Row ── 0..* Cell ── 0..1 Element
Block (flow)   1 ── 0..1 ScreenFlow ── 0..* Lane
                                   └─ 1 main Path ── 0..* FlowElement ── 0..* Note
                                                     Decision ── 2..* Branch ── 1 Path
                                                     Loop ── 1 body Path
Step 0..* ── 0..1 Link ──> Block (screen) by name
EditorSession 1 ── 1 History ── 0..200+ HistoryEntry ── 1..* TextEdit
```

## 3. Stored entities

### 3.1 ProjectRecord

One record per project in the `projects` object store, written whole in one transaction on every save (R-5, section 3.6).

| Field | Type | Rules |
| ----- | ---- | ----- |
| `id` | string (UUID from `crypto.randomUUID()`) | Primary key. Never shown. Also the Web Locks name (R-5). Never reused. |
| `name` | string | Project name. Need not be unique (A-4). New: "Untitled project" (A-9). Import: the file name without its extension, with the import date appended if a project of that name exists. Duplicate: "Copy of <name>". On rename, leading and trailing white space is trimmed; an empty result keeps the previous name. |
| `source` | string | The whole `.puml` text exactly as it would be downloaded, including a leading U+FEFF when the file had a byte-order mark, its original line endings and the presence or absence of a final newline (FR-020/AC2). Stored exactly as typed, including invalid source (section 3.6). |
| `flowIndex` | integer or `null` | Index, among blocks in file order, of the block that is the screen flow; `null` when there is none. Once set it is kept after edits and reloads even when the block becomes invalid or source-only (FR-006/AC18, EC-12). |
| `lastWorking` | `LastWorkingVersion[]` | See 3.2. |
| `createdAt` | ISO 8601 timestamp | Set once. |
| `modifiedAt` | ISO 8601 timestamp | Updated on every write that changes `source` or `name`. Shown in the library (FR-006/AC10). |
| `revision` | integer ≥ 1 | Incremented on every write that changes `source`. |
| `downloadedAt` | ISO 8601 timestamp or `null` | Time of the last `.puml` download; `null` means "never downloaded". Only a `.puml` download sets it; image export and copy do not (section 3.6). |
| `downloadedRevision` | integer or `null` | `revision` at the last download. |

Derived from the record:

- **Changes not downloaded** = `downloadedRevision === null || downloadedRevision !== revision` (FR-006/AC3, AC8, AC11).
- **Download file name** = `name` with characters that cannot appear in a file name replaced by `-`, plus `.puml` (R-9).

Validation:

- `source` must decode as UTF-8 and contain no NUL character; this is checked on import only, and a stored record is never rejected (FR-006/AC13).
- A project always has at least one block. Creation writes one; deletion and re-division refuse to remove the last block (EC-01, FR-011/AC15). An imported file with no blocks is given one new screen (section 3.6 "Import").
- `flowIndex`, when set, refers to an existing block index.
- Every operation that inserts, deletes, reorders or re-divides blocks rewrites `flowIndex` and each `lastWorking[].blockIndex` in the same transaction (R-4).

### 3.2 LastWorkingVersion

| Field | Type | Rules |
| ----- | ---- | ----- |
| `blockIndex` | integer | Block index in file order. Unique within the record. |
| `text` | string | The block's full text (from its `@start…` line to its `@end…` line) at the moment it last parsed as category 1 or 2. |

Rules:

- An entry exists only for a screen or the screen flow whose current text is category 3 and that was category 1 or 2 earlier in the project's life. For any other block, the current text is its own last working version, so nothing is stored (section 3.6 minimal metadata).
- When a block's text becomes category 3, the text it had before that change becomes the entry. When the block parses as category 1 or 2 again, the entry is removed.
- No entry for an invalid block means it has never been valid: status "Error" with no revert action (FR-010/AC8).
- The entry survives reload, so "Revert to last working version" works after a reload (FR-006/AC15, FR-010/AC4).
- Never part of a download or copy (section 3.6).
- Duplicating a project copies the entries; duplicating a screen does not (the copy is written from the original's current text).

### 3.3 Settings

One record in a `settings` object store, per browser (FR-016/AC4).

| Field | Type | Rules |
| ----- | ---- | ----- |
| `panels` | map of region name to `{ collapsed: boolean }` | Regions: project panel, palette, outline, properties, source, preview. Defaults to all expanded at 1024 px and wider. |

Once-per-session facts (the backup reminder per project, FR-006/AC11; the persistent-storage and private-window notices, FR-006/AC9) are held in memory for the session and are not stored.

## 4. Source layer

### 4.1 ProjectSource and Segment

`ProjectSource` is the in-memory `source` string plus its segmentation. `split` divides it into an ordered list of segments whose concatenation is always exactly the source (R-4, FR-004/AC6).

| Segment kind | Content | Rules |
| ------------ | ------- | ----- |
| `block` | From a line starting `@start<type>` to its matching `@end<type>` line, inclusive of that line's line ending | Becomes a `Block` (4.3). |
| `between` | Any text before the first block, between blocks, or after the last block | Never edited visually. Shown only in the read-only whole-file view. Always preserved (section 4.2). Comment lines directly above a block with no blank line between them belong to that block for moves and deletes (clarifications, section 3.6 "Block placement"). |

A line that starts a block with no matching end is treated per section 4.2: during a source edit the block stays one invalid block; re-division happens only on leaving the source view (FR-004/AC10).

### 4.2 TextEdit and TextRange

| Entity | Fields | Rules |
| ------ | ------ | ----- |
| `TextRange` | `start`, `end`: integer offsets in UTF-16 code units | `0 ≤ start ≤ end ≤ length`. Syntax nodes hold ranges relative to their block; segments hold file-absolute ranges. |
| `TextEdit` | `start`, `end` (file-absolute), `text` | A list of edits for one operation has non-overlapping ranges and is applied from the highest offset down. Its inverse is computed at apply time and stored for undo. |

Rules:

- A visual edit changes only the text of the affected elements (FR-004/AC1, FR-020/AC1). Inserting or deleting a column changes only the affected cell in each row and the continuation cells of an affected span (section 4.1).
- New text uses the house style and the line ending already used by the block (the file's first line ending if the block has none) (FR-020/AC2, AC5).
- Whitespace inside quoted text is never trimmed (FR-020/AC3).

### 4.3 Block

One diagram in the project file, derived from a `block` segment.

| Field | Type | Rules |
| ----- | ---- | ----- |
| `key` | string | Runtime only. Survives edits, reorders and reloads within a session; not stored (R-4). |
| `index` | integer | Position among blocks in file order. |
| `range` | `TextRange` | File-absolute. |
| `startKeyword` | `startsalt`, `startuml` or other `@start…` word | From the first line. |
| `name` | `BlockName` (4.4) or `null` | The text after the start keyword, as written. |
| `kind` | `screen`, `flow`, `other` | See classification below. |
| `category` | 1, 2, 3 or `null` | From the editor's grammar, synchronously, without the renderer (section 4). `null` for other content, whose structure is not analysed. |
| `isolable` | boolean | For category 2: whether every unsupported construct is a locked part. `false` means source-only. |
| `diagnostics` | `Diagnostic[]` | Problems found by the parser (4.5). |
| `dependsOnExternal` | boolean | The block uses `!include` or another URL or file reference; detected without rendering (section 4, EC-13). |
| `olderFormat` | boolean | Other content whose structure is `@startuml`, then a `salt` line, then Salt (FR-010/AC7). |
| `model` | `SaltScreen`, `ScreenFlow` or `null` | Present for category 1 and isolable category 2 screens and flows. |

**Classification** (FR-006/AC14, section 3.6 "Import", section 4.1):

| Block | `kind` |
| ----- | ------ |
| `@startsalt` … `@endsalt` | `screen`, whatever its category. |
| The block at `flowIndex` | `flow`, whatever its category. |
| On import or re-division when there is no flow: the first `@startuml` activity block in the current syntax that is category 1 or isolable category 2 | `flow`; `flowIndex` is set to it. |
| On re-division of the flow's own text | The resulting block that keeps the flow's name, else the first resulting activity block, stays `flow` (section 4.2). |
| Everything else: other diagram types, Salt inside `@startuml` (older format), further activity blocks, source-only or invalid activity blocks found on import, legacy activity syntax | `other`. |

Rules:

- Other content is checked only for block boundaries and external dependence; its validity comes from the renderer (section 4).
- Other content can be opened in the source view, reordered and deleted as a unit, never edited visually (FR-015/AC4).

### 4.4 BlockName

Applies to screens and the flow; one namespace for all named blocks (section 3.6 "Block names", OD-3).

| Aspect | Rule |
| ------ | ---- |
| Allowed characters | Letters `\p{L}` (including non-English), combining marks `\p{M}`, decimal digits `\p{Nd}`, `-`, `_` (R-12). No spaces, because a space ends a link target. |
| First character | A letter. |
| Length | 1 to 64 characters; shortening works on grapheme clusters, so a letter is never split from its marks (A-8, R-12). |
| Normal form | Names the editor writes are NFC. |
| Uniqueness | Unique across all named blocks after NFC and a locale-independent case fold (`toLowerCase(toUpperCase(s))`) (R-12). |
| Typed names | Not altered while typing; the preview shows "Will be saved as …". On commit: spaces become `-`; disallowed characters are removed; leading non-letters are removed; runs of `-` become one; leading and trailing `-` are removed; cut to 64. Empty result: previous name kept, with a message. Duplicate: refused, naming the other block (FR-011/AC7). |
| Generated names | Never refused (FR-011/AC13). New screen: `Screen-n`, lowest unused `n`. From a step label: the converted label, else `Screen-n`. Duplicate: `Copy-of-<name>`, else `Screen-n`. Flow: `Screen-flow` (A-10). Collisions add `-2`, `-3`, …, and the result including the suffix is at most 64 characters. |
| Imported names | Never changed automatically (FR-011/AC11). An unnamed screen keeps no name, is shown as "Untitled screen n" and stays byte-identical until renamed or first linked, when it receives a generated name (FR-011/AC10). |

Derived `nameStatus`: `valid`, `unnamed`, `notAllowed`, `notNormalised`, `duplicate`. Anything other than `valid` and `unnamed` is flagged in the project panel (FR-011/AC11).

### 4.5 Diagnostic

| Field | Type | Rules |
| ----- | ---- | ----- |
| `kind` | `syntax` (category 3), `ignoredContent` (several root grids or text after the root grid), `unsupported` (reason a block is source-only or a part is locked) | `ignoredContent` messages say which content will not appear in the image and are worded differently from syntax errors (FR-008/AC8, EC-08). |
| `line` | integer, 1-based within the block | Used by "Fix in source" (FR-004/AC4). |
| `range` | `TextRange` | Block-relative. |
| `messageKey`, `params` | message catalogue key and values | All text comes from the catalogue (R-11, FR-016/AC8). |

Rendering problems are not diagnostics; they are `RenderResult`s (6.7) and are shown in a separate message area (FR-005/AC5).

## 5. Editor models

Both models are derived from a lossless syntax tree in which every character belongs to one token (R-3). Every model node keeps the `TextRange` of its source and a list of `leadingComments`: full-line comments immediately before it, which move and are deleted with it (FR-020/AC4, A-3). A node's **structural path** (a list of indices from the root) identifies it for selection, destinations and undo.

### 5.1 Shared: TextValue

User-visible text on any component, step, branch, note or lane.

| Field | Type | Rules |
| ----- | ---- | ----- |
| `text` | string | The literal text the user sees and types. |
| `raw` | `TextRange` | Where it lives in the source. |
| `formatted` | boolean | `true` when the source differs from the editor's own escaped form of `text` (imported creole or other markup) (section 3.4). |

Rules:

- Writers escape only where Salt or activity syntax would otherwise interpret the text (section 3.4, FR-003/AC6, EC-05): a whole cell of `.`, `...` or a separator; a leading `*`, `[`, `(`, `^`, `"` or `==`; any `{`, `}` or `|`; the creole pairs `**`, `//`, `__`, `""`, `--`, `~~`; a row's first cell starting with a PlantUML command word (`title`, `header`, `footer`, `caption`, `legend`, `mainframe`, `skinparam`, `scale`); and `[`, `]` or `|` in a linked step's label. Ordinary text such as `a.b` and `5 * 3` is written unchanged.
- Parsing the written form gives back exactly `text` (round trip).
- A `formatted` value is preserved byte for byte until edited. Editing it requires a choice: "Keep formatting" (markers written as typed; `{`, `}`, `|` and type-changing characters still escaped) or "Remove formatting" (becomes literal). The element's type and structure never change (FR-003/AC11, EC-06).
- No formatting is offered except the selected tab's bold marker (OD-7).

### 5.2 Screen model (Salt)

#### SaltScreen

| Field | Type | Rules |
| ----- | ---- | ----- |
| `root` | `Grid` | Exactly one root grid. A second root grid or text after it makes the block source-only (section 4.1, EC-08). |

A new screen's root is a one-column grid with no rows; an empty screen is a valid insertion target (FR-001/AC7, section 3.6 "New projects").

#### Grid (container)

| Field | Type | Rules |
| ----- | ---- | ----- |
| `style` | `plain`, `border` (`{+`), `tableLines` (`{#`), `verticalLines` (`{!`), `horizontalLines` (`{-`), `groupBox` (`{^"Title"`) | Exactly one style. A source container with more than one style modifier makes the block source-only (EC-09). Combinations are made by wrapping. |
| `title` | `TextValue` or `null` | Only for `groupBox`. |
| `rows` | `Row[]` | Rows may have different lengths (ragged) (EC-02). |
| `layout` | `singleLine` or `multiLine` | As written; both forms render. New grids use the house style. |

Derived:

- `columnCount` = the widest row, counting spans.
- **Shape**: single-row (1 × N), single-column (N × 1) or multi-row and multi-column. It decides insertion, removal and the move shortcut (section 3.2).
- **Label** (fixed precedence, no stored metadata, FR-002/AC14): (1) `tableLines` → "Table"; (2) one row whose cells are all buttons → "Button bar"; (3) two columns where at least one row has text in column 1 and a control in column 2, and no row breaks that pattern other than with empty cells → "Form"; (4) one row → "Row", one column → "Column"; (5) otherwise "Grid". The label may change when the shape changes.

#### ScrollArea (container)

`{S` … `}` with the same `rows` body as a grid and no style. The variants `{SI` and `{S-` are locked parts.

#### Row

A row is either:

| Kind | Fields | Rules |
| ---- | ------ | ----- |
| `cells` | `cells: Cell[]` | Cells separated by `\|`. A row the user did not edit is never padded or normalised; editing a missing cell adds cells to that row only (FR-002/AC10). |
| `separator` | `separatorKind`: `dotted` (`..`), `double` (`==`), `wavy` (`~~`), `single` (`--`) | A whole row. It is an element: selectable, movable, deletable. |

#### Cell

| Field | Type | Rules |
| ----- | ---- | ----- |
| `content` | an `Element`, `Empty` (`.`) or `LockedPart` | Exactly one. An empty cell is written `.`, the only form that keeps its position (section 3.2). |
| `span` | integer ≥ 1 | Written as `span − 1` following `*` cells. |
| `column` | integer (derived) | Start column, counting earlier spans. |

Span rules (section 3.2, FR-002/AC9, EC-03):

- `span > 1` is never allowed on the first cell of a row (no `*` in column 1); there are no row spans.
- A span can extend only over empty cells to its right. The property states the limiting element (for example "Span limited by 'Password' in column 3").
- Deleting the column a span starts from turns the rest of the span into empty cells. Inserting a column inside a span extends it and gives other rows an empty cell.
- A moved cell keeps its span, reduced to fit the destination.
- No column operation may leave a span in the first column or misalign other rows.

#### Elements (cell contents)

| Element | Salt form | Editable properties | Rules |
| ------- | --------- | ------------------- | ----- |
| `Text` | plain text | `text` | Escaped per 5.1. |
| `Button` | `[Label]` | `label` | |
| `TextField` | `"value   "` | `value`, `width` | `width` is the quoted length in characters and is never less than the length of `value`; a longer value widens the field. Changing `value` keeps `width` (FR-003/AC8). No placeholder or disabled state (FR-003/AC7). |
| `Checkbox` | `[X] Label` / `[ ] Label` | `label`, `checked` | Space toggles when selected; a click only selects (FR-003/AC9). |
| `RadioButton` | `(X) Label` / `( ) Label` | `label`, `selected` | Set independently; Salt has no grouping (A-6). |
| `DropDown` | `^Value^`, or `^Value^^Option 1^^…^` when open | `value`, `options: TextValue[]`, `open` | Options exist only while `open`. Switching to closed removes the options from the source with an undoable notice stating how many (FR-003/AC10, EC-07). |
| `Tree` | `{T` with `+` depth markers | `items: { text, depth }[]` | Depth ≥ 1; an item's depth is at most one more than the item before it. Tree-table variants (`{T#`, `{T!`, `{T-`, `{T+`) are locked parts. |
| `TabBar` | `{/ Tab 1 \| Tab 2 }` | `tabs: TextValue[]`, `selectedIndex` (or none) | Bar only, no contents. The selected tab is marked bold by the editor (OD-7). |
| `MenuBar` | `{*` first row | `items: TextValue[]` | Later rows (open menus) are locked parts. |
| `Grid`, `ScrollArea` | nested `{` … `}` | as above | Containers: valid insertion and move targets. |

The multiline text area is a preset: a bordered grid of text lines, not a separate element. Icons and images (`<&icon>`, `<img:…>`) are kept as part of the text.

Presets (Form, Button bar, Table, Row, Column, Grid, Text area) are grids inserted with placeholder content (section 3.2); placeholder text follows the escaping rules. Nothing records that a grid came from a preset; its label is derived.

#### LockedPart (screen)

| Field | Type | Rules |
| ----- | ---- | ----- |
| `range` | `TextRange` | The smallest unit that can be isolated: a cell, row or nested container. |
| `reason` | message key | For example tree-table variant, open menu rows, scroll-area variant, unknown container modifier. |
| `excerpt` | string | Source excerpt shown on the placeholder. |

It can be selected, moved and deleted as a unit; its text is never changed except in the source view (section 4.1, FR-010/AC2). Deleting the last locked part makes the block category 1.

### 5.3 Flow model (activity)

#### ScreenFlow

| Field | Type | Rules |
| ----- | ---- | ----- |
| `lanes` | `Lane[]` | Ordered; the render shows lanes in list order (FR-012/AC12). Empty means the flow has no lanes and no lane switches are written. |
| `main` | `Path` | Begins with the initial `Start` and ends with the final `Stop`. |

A new flow (FR-012/AC8, US6-AS1) is `@startuml Screen-flow`, `start`, `stop`, `@enduml`, written at the end of the file (section 3.6 "Block placement").

#### Path

| Field | Type | Rules |
| ----- | ---- | ----- |
| `leadingNotes` | `Note[]` | Notes at the beginning of a branch or loop body (empty for the main path). |
| `elements` | `FlowElement[]` | May be empty for a branch or loop body; an empty path is a selectable insertion slot (FR-009/AC13). |

#### Flow elements

All except `Start` and `Stop` have `lane` (a lane name, or `null` only when `lanes` is empty) and `notes: Note[]`. `Start` also has `notes`.

| Element | Form | Fields | Rules |
| ------- | ---- | ------ | ----- |
| `Start` | `start` | `notes` | The initial start of the main path cannot be moved or deleted (FR-012/AC13). |
| `Stop` | `stop` or `end` | `keyword` | The final stop of the main path cannot be moved or deleted. `stop` (or an imported `end`) is also allowed as the last element of a branch. The palette writes `stop`; `end` is preserved. |
| `Step` | `:Label;` or `:[[#<screen-id> Label]];` | `label: TextValue`, `link: Link` or `null`, `lane`, `notes` | Only steps can be linked; a step links to at most one screen. |
| `Decision` | `if (…) then (…)` … `elseif (…) then (…)` … `else (…)` … `endif` | `branches: Branch[]`, `lane`, `notes` | At least two branches (FR-012/AC8). |
| `Loop` | `repeat` … `repeat while (…)`, or `while (…)` … `endwhile` | `loopKind`: `repeat` or `while`; `condition: TextValue`; `labels` (the `is (…)` and exit labels, as written); `body: Path`; `lane`, `notes` | Body may be empty. |
| `LockedPart` | `fork` … `end fork`, `switch` … `endswitch`, `partition`, `detach`, `kill`, `{{salt` … `}}` inside a step, arrow labels | `range`, `reason`, `excerpt` | The smallest isolable statement or complete block (section 4.1, EC-10, OD-6). Moved and deleted as a unit. |

#### Branch

| Field | Type | Rules |
| ----- | ---- | ----- |
| `branchKind` | `if`, `elseif`, `else` | Exactly one `if`, first; any number of `elseif`; at most one `else`, last. |
| `condition` | `TextValue` or `null` | Required for `if` and `elseif`; `null` for `else`. |
| `label` | `TextValue` or `null` | The `then (…)` or `else (…)` label. |
| `path` | `Path` | May be empty. |

Removing a branch that would leave fewer than two is refused (FR-012/AC2, AC8). Removing a branch, decision or loop removes its contents, undoably, and the announcement names what was removed (for example "Deleted decision and 4 steps") (FR-012/AC9).

#### Note

| Field | Type | Rules |
| ----- | ---- | ----- |
| `side` | `left` or `right` | |
| `text` | `TextValue` | May span several lines. |
| `form` | `singleLine` or `block` (`end note`) | As written; new multi-line notes use `block`. |

A note belongs to the element it follows (a step, decision, loop or start) or to the beginning of a branch or loop body. It has no position on the path, moves and is deleted with its owner, and an owner can carry several notes in order (section 3.7, clarifications).

#### Lane

| Field | Type | Rules |
| ----- | ---- | ----- |
| `name` | string | Non-empty, contains no `\|` and no line break, unique within the flow (exact match after NFC). These are syntax constraints from `\|Lane\|`, not block-name rules. |
| `raw` | `TextRange` or `null` | Imported lane decorations (for example a colour) are preserved. |

Derivation and writing rules (section 3.7, OD-8, FR-012/AC10, AC12):

- An element's lane is the lane switch in effect before it in source order.
- The editor writes switches so that changing one element's lane changes the rendered lane of that element only, including inside decision branches.
- A new element takes the lane of the element before it. Moving an element keeps its lane. Adding the first lane places every element in it. Renaming a lane updates every switch naming it. Deleting a lane in use requires a destination lane. Deleting the only lane removes all switches.

#### Link

| Field | Type | Rules |
| ----- | ---- | ----- |
| `target` | string | The screen name after `#`, as written. |

Written as `:[[#<screen-id> <label>]];` with `[`, `]` and `|` in the label escaped (FR-013/AC5).

Derived `linkStatus` (FR-011/AC11, AC16, FR-013/AC4, EC-11):

| Status | When |
| ------ | ---- |
| `valid` | Exactly one screen's name equals `target` after NFC normalisation. |
| `broken` | No screen matches. |
| `brokenCaseOnly` | No exact match, but one screen matches after case folding; that screen is offered as the fix. |
| `ambiguous` | More than one screen matches (imported duplicate names). |

Derived per screen: `incomingLinks` = steps whose `target` matches it; the count is shown in the project panel (FR-015/AC2).

## 6. Session entities

Held in memory for the open project in the current tab. None is stored.

### 6.1 EditorSession

| Field | Type | Rules |
| ----- | ---- | ----- |
| `projectId` | string | |
| `role` | `TabRole` (6.6) | |
| `blocks` | `Block[]` | Derived from the source; models memoised on block text (R-14). |
| `openBlockKey` | string | The block shown in the canvas, outline, properties, source and preview (FR-015/AC3). |
| `selection` | `Selection` or `null` | |
| `history` | `History` | |
| `sourceEdit` | `SourceEditSession` or `null` | |
| `save` | `SaveState` (6.5) | |
| `returnToFlow` | `{ stepPath }` or `null` | Set by "Open screen"; used by "Back to flow" (FR-013/AC3). |

### 6.2 Selection

| Field | Type | Rules |
| ----- | ---- | ----- |
| `blockKey` | string | |
| `path` | structural path | Points to one element, container, empty cell, branch or empty path slot. Single selection only. |

Rules: clicking selects the innermost element; "Select parent" moves one step up the path; the breadcrumb is the path's labels (FR-002/AC12). After a re-parse, the selection keeps the same structural path, or moves to the nearest surviving container (FR-004/AC9). Focus after each operation follows FR-009/AC8.

### 6.3 History and HistoryEntry

`History` is per project and per session: `undo: HistoryEntry[]`, `redo: HistoryEntry[]`. At least the 200 most recent entries are kept; the oldest is dropped beyond that (FR-007/AC6). It is empty after a reload, and both tabs' histories are emptied on an "Edit here instead" handover (FR-007/AC7).

| Field | Type | Rules |
| ----- | ---- | ----- |
| `nameKey`, `params` | message key and values | The action name shown on undo and redo controls (FR-007/AC9). |
| `edits` | `TextEdit[]` | As applied. |
| `inverse` | `TextEdit[]` | Restores the previous text exactly. |
| `metaBefore`, `metaAfter` | `{ flowIndex, lastWorking }` | Restored with the text, so flow choice and revert targets follow undo. |
| `blockKeys` | string[] | Blocks to open before applying (FR-007/AC11, EC-19). |
| `selectionBefore`, `selectionAfter` | `Selection` | |
| `group` | `visual`, `sourceTyping`, `propertyTyping` | Typing groups merge into one entry until a 300 ms pause or leaving the source view, or until the property field loses focus or Enter is pressed (FR-007/AC4, AC13). |

Rules: every project operation is one entry, including screen add, rename (with link updates), duplicate, reorder and delete; flow deletion; lane changes; conversion of older-format blocks; re-division (FR-007/AC10). Undo may restore invalid text; the block is then shown as invalid (FR-007/AC12). A new edit clears `redo`.

### 6.4 SourceEditSession

| Field | Type | Rules |
| ----- | ---- | ----- |
| `blockKey` | string | While set, that block's canvas is read-only; others stay editable (FR-004/AC8). |
| `textAtStart` | string | For the single typing history entry. |
| `lastKeystrokeAt` | timestamp | A pause is 300 ms without a keystroke. |
| `nameAtStart` | `BlockName` or `null` | For source-view rename handling on leave (FR-011/AC14, OD-4). |

### 6.5 SaveState

| Field | Type | Rules |
| ----- | ---- | ----- |
| `status` | `saved`, `pending`, `saving`, `failed` | Shown as "All changes saved" or "Saving…"; `failed` shows the prominent notice with "Download a backup" (FR-006/AC1, AC7). |
| `attempt` | integer | Retry count; backoff 1 s, 2 s, 4 s, then every 10 s (R-5). |
| `lastError` | message key or `null` | Reported within 1 second. |

A storage failure is a project-level status, not a block status (plan, "Block status").

### 6.6 TabRole

| Value | Meaning |
| ----- | ------- |
| `editing` | This tab holds the Web Lock named by the project id (R-5). |
| `readOnly` | Another tab holds the lock. Shows the version stored when opened; does not update (FR-006/AC12). |
| `handingOver` | "Edit here instead" chosen; waiting for the other tab to flush and release. |
| `deletedElsewhere` | The project was deleted in another tab; offers to download its content (FR-006/AC16, EC-14). |

### 6.7 RenderResult

| Field | Type | Rules |
| ----- | ---- | ----- |
| `blockKey` | string | |
| `text` | string | The block text that was rendered. |
| `outcome` | `ok`, `failed`, `timedOut` | `timedOut` after 10 s; the worker is terminated (R-1, FR-017/AC5). |
| `svg` | sanitised SVG string | For `ok` only (R-8). |
| `message` | string | The renderer's message for `failed`. |

Per block, the session keeps the latest result and the last `ok` result (shown marked out of date while newer text is not yet rendered or failed, FR-005/AC6). Results are not stored; after a reload every block is rendered again in the background.

### 6.8 Notice

| Field | Type | Rules |
| ----- | ---- | ----- |
| `kind` | for example storage failure, persistent storage refused, private window, backup reminder, older format "Convert all", source rename, re-division report, drop-down options removed, download with unrenderable blocks, flow will import as other content | Non-blocking (FR-006/AC7, AC9, AC11, FR-010/AC7, FR-014/AC6). |
| `messageKey`, `params`, `actions` | | Actions include "Undo", "Download a backup", "Convert all". |
| `oncePerSession` | key or `null` | Prevents repeats within the session. |

## 7. State transitions

### 7.1 Block status (derived)

Inputs: `kind`, `category`, `isolable`, `olderFormat`, `dependsOnExternal`, the presence of a `LastWorkingVersion`, the latest `RenderResult`, and whether the block has a `SourceEditSession` (R-15). The first matching row wins.

| Status shown | Condition |
| ------------ | --------- |
| Error | Screen or flow with `category = 3`. With a last working version: the canvas shows it read-only with "Fix in source" and "Revert to last working version". Without one: no revert (FR-010/AC8). |
| Older format | Other content with `olderFormat`. Export prevented (FR-014/AC5). |
| Cannot be rendered | `dependsOnExternal`, or a source-only screen or flow or other content whose latest render `failed` (FR-010/AC9). |
| Source only | Screen or flow with `category = 2` and not `isolable`, or other content. |
| Has locked parts | `category = 2` and `isolable`. |
| Editable | `category = 1`. |

Render status, shown separately: "Not yet checked" when there is no result for the current text, the renderer has not started, or the latest outcome is `timedOut` (FR-010/AC1, EC-13); otherwise rendered or rendering problem. Blocks that are category 3 or depend on `!include` are not sent to the renderer; their last render is kept, marked out of date (section 4.2 "Preview"). A block with no previous render may be rendered, labelled as not checked by the editor.

While a block has a `SourceEditSession`, its canvas is read-only whatever its status.

Mapping to [block-sync-states.puml](diagrams/block-sync-states.puml):

| Diagram state | Derived from |
| ------------- | ------------ |
| In sync | Editable, no source edit |
| Contains locked parts | Has locked parts, no source edit |
| Source-only | Source only, no source edit |
| Source invalid (locked) | Error |
| Source being edited | `SourceEditSession` present |
| Render failed | Latest render `failed` (shown with the status above) |
| Storage failed | `SaveState.status = failed` (project level) |

| Transition | Trigger | Effect on stored data |
| ---------- | ------- | --------------------- |
| Opened (any state) | Load or import; parse each block | None |
| Visual edit (In sync, Locked) | Operation produces `TextEdit[]` | `source` changes; history entry |
| User types in source | First keystroke | `SourceEditSession` created |
| User pauses typing | 300 ms without a keystroke | Block re-parsed and classified; `source` autosaved as typed |
| Becomes invalid | Parse gives category 3 | `LastWorkingVersion` added from the last valid text, if any |
| Becomes valid again | Parse gives category 1 or 2 | `LastWorkingVersion` removed |
| User reverts | "Revert to last working version" | Block text replaced by the entry, as one undoable edit; entry removed |
| User deletes the last locked part | Visual delete | Category 2 → 1 |
| Undo or redo restores invalid text | History | `LastWorkingVersion` per `metaBefore`/`metaAfter` |
| Renderer reports a failure / later success | `RenderResult` | None |
| Autosave fails / retry succeeds | `SaveState` | Previous stored record intact until success |

### 7.2 Source edit session

```text
idle ──keystroke──> typing ──300 ms pause──> paused (re-parse, canvas updates read-only) ──keystroke──> typing
typing | paused ──leave (blur or Esc)──> closing
closing: parse now → one history entry for the typing
         → if the text no longer forms exactly one block: re-divide once (one undoable step, report);
           warn first if a linked screen would be removed (cancel keeps the text, block stays invalid);
           refuse if the project's last block would be removed
         → if the name line changed: apply source-rename rules (allowed and unique: update links in the
           same entry, notice "Updated n steps"; otherwise flag, links break, notice with "Undo")
         → idle (canvas editable if valid)
```

Leaving never changes the typed text (section 4.2, FR-020/AC6).

### 7.3 Save state

```text
saved ──edit──> pending ──≤ 500 ms, or pagehide / visibilitychange──> saving
saving ──write committed──> saved
saving ──write failed──> failed (notice within 1 s; previous record intact)
failed ──backoff 1 s, 2 s, 4 s, then 10 s──> saving
failed ──further edits──> failed (pending text kept in memory; next retry writes the latest)
```

The whole record is written in one transaction, so a write completes or leaves the previous version (R-5).

### 7.4 Tab role

```text
open project ──lock acquired──> editing
open project ──lock held elsewhere──> readOnly
readOnly ──"Edit here instead" (prompt says undo history is not carried over)──> handingOver
handingOver ──other tab flushes pending writes, clears its history, releases lock──> load latest record ──> editing (empty history)
editing ──handover request received──> flush ──> readOnly (history cleared)
any ──deleted in another tab (BroadcastChannel)──> deletedElsewhere
any ──renamed in another tab──> same role, name updated
```

### 7.5 Download state

```text
never downloaded ──.puml download──> downloaded, up to date (downloadedAt, downloadedRevision = revision)
downloaded, up to date ──source change──> changes not downloaded
changes not downloaded ──.puml download──> downloaded, up to date
```

Created, imported and duplicated projects start as never downloaded (FR-006/AC8).

### 7.6 Project lifecycle (library)

| Action | Record effect |
| ------ | ------------- |
| Create | New `id`; name "Untitled project"; source is one empty screen (`@startsalt Screen-1`, an empty one-column root grid, `@endsalt`); no flow. |
| Import | New `id`; name from the file; `source` is the decoded file text unchanged; `flowIndex` chosen per FR-006/AC14; empty file gets one new screen. Rejected with nothing created if not UTF-8 or binary. |
| Duplicate | New `id`; name "Copy of …"; same `source`, `flowIndex` and `lastWorking`; never downloaded. |
| Rename | `name` changes; applied in every tab. |
| Delete | Record removed after confirmation, which says whether there are changes not downloaded and offers "Download and delete" (FR-006/AC3). |

### 7.7 Block-level operations and their metadata effects

| Operation | Source effect | Metadata effect |
| --------- | ------------- | --------------- |
| Add screen | New block after the last screen block, else at the end of the file | Indices after it shift |
| Duplicate screen | Copy written directly after the original, with a generated name and no incoming links | Indices after it shift |
| Reorder screens or other content | Exchanges file positions of blocks of that kind only, with their attached comment lines; all other blocks and between-text stay in place | Indices remapped |
| Delete screen, other content or flow | Block removed (with attached comment lines) | `flowIndex` cleared when the flow is deleted; indices shift; refused for the last block |
| Rename screen (panel or properties) | Name line changed, and every linked step's target changed, in one entry | None |
| Convert older format | `@startuml [name]` → `@startsalt [name]`, `@enduml` → `@endsalt`, `salt` line removed; nothing else changes | Block becomes a screen |
| Re-division | Text unchanged; segmentation changes | Indices remapped; flow kept as in 4.3 |

## 8. Validation summary

| Rule | Entity | Source |
| ---- | ------ | ------ |
| Download without edits is byte-identical | `ProjectSource` | FR-004/AC6, FR-020, SC-005 |
| A visual edit changes only the affected elements' text | `TextEdit` | FR-004/AC1, FR-020/AC1 |
| At least one block per project | `ProjectRecord` | EC-01, FR-011/AC15 |
| At most one screen flow; stays the flow once chosen | `ProjectRecord.flowIndex` | FR-006/AC14, AC18 |
| Block names: allowed characters, starts with a letter, ≤ 64, NFC, unique after case fold | `BlockName` | Section 3.6, OD-3, A-8 |
| One root grid per screen | `SaltScreen` | Section 4.1 |
| One style per container | `Grid` | Section 3.2 |
| One element per cell; empty cell is `.` | `Cell` | Section 3.2 |
| No span on a row's first cell; spans only over empty cells | `Cell.span` | FR-002/AC9, EC-03 |
| Text-field width ≥ value length | `TextField` | FR-003/AC8 |
| Drop-down options only when open | `DropDown` | FR-003/AC10 |
| No placeholder or enabled/disabled property | components | FR-003/AC7 |
| Text is literal; escapes only where needed | `TextValue` | Section 3.4, FR-003/AC6 |
| A decision has at least two branches; `if` first, `else` at most once and last | `Decision`, `Branch` | FR-012/AC8 |
| Initial start and final stop cannot move or be deleted | `Start`, `Stop` | FR-012/AC13 |
| Each step, decision and loop has a lane when lanes exist | flow elements | Section 3.7, OD-8 |
| Lane names non-empty, without `\|`, unique in the flow | `Lane` | Activity syntax |
| A note belongs to exactly one owner and has no path position | `Note` | Section 3.7 |
| Only steps carry links; one link per step | `Step.link` | Section 3.7 |
| History keeps at least 200 entries per project | `History` | FR-007/AC6 |
| Every operation is prevented, never accepted then reversed, when it would produce invalid or unsupported source | operations | FR-008/AC3 |
