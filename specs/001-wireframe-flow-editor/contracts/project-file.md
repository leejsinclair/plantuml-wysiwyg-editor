# Contract: Project file format (`.puml`)

A project is exchanged as one standard PlantUML text file. The format has no proprietary additions (section 3.6, R-4): everything the editor needs to reopen a file is in standard PlantUML syntax, and stored metadata (timestamps, which block is the flow, last working versions) is never written to a download.

## 1. Encoding and bytes

| Rule | Requirement |
| ---- | ----------- |
| Encoding | UTF-8, with or without a byte-order mark. Import decodes with `TextDecoder('utf-8', { fatal: true })`; a decode error or a NUL byte rejects the file and creates nothing (FR-006/AC13, R-9). |
| Round trip | Opening and downloading without edits produces a byte-identical file, including CRLF line endings, a byte-order mark, a missing final newline, comments and text between blocks (FR-004/AC6, FR-020/AC2, SC-005). |
| Minimal edits | A visual edit rewrites only the text of the element(s) it changes (FR-020/AC1). |
| New text **(plan)** | Lines the editor writes use the line ending already used by the file (LF for a new project). |
| File name | Download is named after the project with the extension `.puml`; characters that cannot appear in a file name are replaced with `-` (R-9). |

## 2. Segments

A file is an ordered list of segments. Concatenating them reproduces the file exactly (R-4).

- **Block**: from a line starting `@start…` to its matching `@end…` line.
- **Between-block text**: everything else (comments, blank lines, free text). Preserved byte-for-byte; shown only in the read-only whole-file view (section 4.2).

Each block is exactly one of: a **screen**, **the screen flow** (at most one), or **other content**.

## 3. Screen block

```text
@startsalt <screen-id>
{
  …one root grid…
}
@endsalt
```

- One named Salt block per screen: `@startsalt <screen-id>` … `@endsalt` (section 3.6).
- Exactly one root grid. Several root grids, or text after the root grid, make the block source-only (EC-08).
- A file with a single `@startsalt` block is a valid single-screen project (FR-011/AC4).
- An imported unnamed `@startsalt` block keeps no name until renamed or first linked (FR-011/AC10).
- The editor writes Salt only as `@startsalt`.

**New screen (house style, plan).** A new screen is an empty one-column root grid:

```text
@startsalt Screen-1
{
}
@endsalt
```

### Salt forms the editor reads and writes (Supported Constructs A.1)

| Construct | Salt form |
| --------- | --------- |
| Grid | `{` … `}` rows of cells separated by `\|` |
| Container style | `{+` border, `{#` table lines, `{!` vertical lines, `{-` horizontal lines, `{^"Title"` group box |
| Empty cell | `.` |
| Column span | `*` in the following cell (never in the first column) |
| Nested grid | `{` … `}` inside a cell, on one line or several |
| Text | plain text |
| Button | `[Label]` |
| Text field | `"value   "` (width set by the quoted text including trailing spaces) |
| Checkbox | `[X] Label` / `[ ] Label` |
| Radio button | `(X) Label` / `( ) Label` |
| Drop-down | `^Value^` (closed); `^Value^^Option 1^^Option 2^` (open list) |
| Separator | `..`, `==`, `~~`, `--` as a whole row |
| Tree | `{T` with `+` depth markers |
| Tab bar | `{/ Tab 1 \| Tab 2 }` |
| Menu bar | `{*` first row |
| Scrollable area | `{S` |
| Comment | full line starting `'`, or `/'` … `'/` |

Read but never written (locked parts or source-only): tree-table variants `{T#`, `{T!`, `{T-`, `{T+`; scrollable variants `{SI`, `{S-`; open menus; preprocessor `!define`, `!$var`, `!procedure`, `!include`, `!theme`; icons and images `<&icon>`, `<img:…>` (preserved as text).

### Grid labels (derived, never stored)

Precedence (section 3.2): (1) any grid with table lines is a "Table"; (2) a one-row grid whose cells are all buttons is a "Button bar"; (3) a two-column grid of text then control per row (empty cells allowed) is a "Form"; (4) a one-row grid is a "Row", a one-column grid a "Column"; (5) otherwise "Grid".

## 4. Screen-flow block

```text
@startuml <flow-id>
start
…
stop
@enduml
```

- At most one screen-flow block, written by the editor as `@startuml <flow-id>` … `@enduml`, default name "Screen-flow" (A-10).
- **New screen flow (house style, plan):** `@startuml Screen-flow`, `start`, `stop`, `@enduml`, written at the end of the file.
- On import, the flow is the first activity block in the current syntax in category 1 or 2; further activity blocks and source-only or invalid activity blocks are other content (FR-006/AC14). Legacy syntax (`(*) -->`), `goto` and `label` are never chosen as the flow.

### Activity forms (Supported Constructs A.2)

| Construct | Form |
| --------- | ---- |
| Start / end | `start`, `stop`, `end` (`end` preserved on import; the editor writes `stop`) |
| Step | `:<step label>;` |
| Linked step | `:[[#<screen-id> <step label>]];` |
| Decision | `if (…) then (…)` … `elseif (…) then (…)` … `else (…)` … `endif` |
| Loop | `repeat` … `repeat while (…)`; `while (…)` … `endwhile` |
| Swimlane | `\|Lane\|` |
| Note | `note left` / `note right`, single line or ending with `end note` |
| Locked parts | fork/join, `switch`, partitions, `detach`/`kill`, `{{salt` … `}}` inside a step |

- A link target ends at the first space, so screen names contain no spaces. `[`, `]` and `|` in a linked step's label are escaped so the link survives a round trip (FR-013/AC5).
- Lane switches are written so that each element renders in its own lane property's lane; a flow with no lanes writes no lane switches (section 3.7).
- A note is written directly after the element it is attached to (or first in a branch or loop body); several notes keep their order.

## 5. Other content

Any other block (other diagram types, Salt embedded in other diagrams, preprocessor-dependent content, extra activity blocks) is kept exactly as written and included unchanged in downloads and copies.

**Older format.** `@startuml [name]` + a `salt` line + `@enduml` is other content with status "Older format". "Convert to current format" (or "Convert all") replaces `@startuml [name]` with `@startsalt [name]`, `@enduml` with `@endsalt`, removes the `salt` line and changes nothing else (OD-5). The editor never converts automatically.

## 6. Block names

| Rule | Value |
| ---- | ----- |
| Allowed characters | Letters (`\p{L}`, including non-English), combining marks (`\p{M}`), decimal digits (`\p{Nd}`), `-`, `_` |
| First character | A letter |
| Length | At most 64 characters; shortening works on grapheme clusters |
| Form | Unicode NFC for names the editor writes |
| Uniqueness | Across all named blocks, compared after NFC and locale-independent case folding |
| Link match | Identical after NFC; a case-only difference is a broken link with a suggested fix |

**Typed name conversion on commit:** spaces become `-`; disallowed characters removed; leading non-letters removed; repeated `-` reduced to one; leading and trailing `-` removed; cut to 64 characters. Example: "Sign in" → `Sign-in`.

**Generated names** (never refused): new screens "Screen-n" (lowest unused n); a screen from a step label uses the converted label, or "Screen-n" if empty (example: "Enter credentials" → `Enter-credentials`); a duplicate is `Copy-of-<name>` (or "Screen-n" if the original has no name); the flow "Screen-flow"; collisions get "-2", "-3", …; the result including suffix is at most 64 characters.

**Imported names** that are not allowed, not in NFC or duplicated are flagged, never changed.

## 7. Block placement

- A new screen is written after the last screen block, or at the end of the file if there is none.
- A duplicated screen is written directly after the original.
- A new screen flow is written at the end of the file.
- Reordering screens exchanges the file positions of screen blocks only; reordering other content exchanges the file positions of other-content blocks only. Everything else stays in place, except comment lines directly above a moved block with no blank line between, which move with it.
- Project-panel order of screens, and of other content, always equals file order.
- No operation removes a project's last block.

## 8. Text escaping

Text is literal (section 3.4). The writer escapes only where Salt or activity syntax would otherwise interpret the text:

- a whole cell that is `.`, `...` or a separator;
- text starting with `*`, `[`, `(`, `^`, `"` or `==`;
- any `{`, `}` or `|`;
- the creole pairs `**`, `//`, `__`, `""`, `--`, `~~`;
- the first cell of a row beginning with a PlantUML command word (`title`, `header`, `footer`, `caption`, `legend`, `mainframe`, `skinparam`, `scale`);
- `[`, `]` or `|` in a linked step's label.
- **(plan, from the oracle)** `'`, `!` or `@` at the start of a row's first cell, where they would begin a comment, a preprocessor line or a block boundary; and `/'` anywhere, which opens a block comment.

Ordinary text such as `a.b` or `5 * 3` is written unchanged. The exact escape sequences are fixed by the corpus and verified with the command-line oracle (`plantuml-1.2026.9.jar`) to render with no visible escape characters (FR-003/AC6). Presets use the same rules for their placeholder text: Form rows "Label" + text field, Button bar "Button 1" and "Button 2", Table header row "Column 1", "Column 2".

## 9. Conformance

- Every block the editor generates renders without error, with nothing silently dropped, in `@plantuml/core` `1.2026.9` and in the command-line tool at the same version (SC-004, FR-017/AC7).
- Every corpus file in `tests/corpus/` round-trips byte-identically (SC-005).
