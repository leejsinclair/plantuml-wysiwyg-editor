# Contract: User interface

Strings in double quotes are the exact English values of `src/ui/messages/en.ts` and the accessible names tests query by role. `<…>` marks a substituted value. Items marked **(plan)** are not spec text.

## 1. Routes (plan)

The app is static files with no server routing, so it uses hash routes.

| Route | View |
| ----- | ---- |
| `#/` | Project library |
| `#/project/<projectId>` | Workspace for one project (editing, or read-only when another tab holds the edit lock) |
| `#/project/<projectId>/block/<blockKey>` | Workspace with that block open (`blockKey` is the runtime key, R-4; not stable across reloads) |

An unknown or deleted `projectId` shows the library with a notice. In an unsupported browser every route shows only the unsupported-browser message (FR-019).

## 2. Project library

| Element | Role | Accessible name / text |
| ------- | ---- | ---------------------- |
| Create | button | "Create project" |
| Import | button | "Import .puml file" |
| Project row | listitem | project name, last-modified time, last-downloaded time or "never downloaded", a "not downloaded" indicator when it has changes since |
| Row commands | button / menuitem | "Open", "Rename", "Duplicate", "Delete" **(plan labels)** |
| Delete confirmation | alertdialog | says whether there are changes not downloaded; offers "Download and delete" |
| Statement | text | projects are not synchronised between browsers or devices |

Names: a new project is "Untitled project"; a duplicate is "Copy of <name>"; an import is named after the file, with the import date appended if the name is already used.

## 3. Workspace regions

The region-focus shortcut moves focus between these regions in this order (FR-016/AC3). Each is a landmark (`region` or `complementary`) with this accessible name **(plan names, from the spec's region terms)**:

| Region | Accessible name |
| ------ | --------------- |
| Project panel | "Project panel" |
| Component palette | "Palette" |
| Structured editing canvas | "Canvas" |
| Outline | "Outline" |
| Properties panel | "Properties" |
| Source view | "Source" |
| Rendered-output pane (labelled read-only) | "Preview" |

Always-visible toolbar controls (FR-016/AC1): "Import .puml file", "Download", "Undo", "Redo" and the autosave status. The Undo and Redo controls name the action they will undo or redo (FR-007/AC9). Panel visibility is remembered per browser.

## 4. Status strings

| Where | Exact values |
| ----- | ------------ |
| Autosave status | "All changes saved", "Saving…" |
| Block status (project panel) | "Editable", "Has locked parts", "Source only", "Error", "Older format", "Cannot be rendered" |
| Render status | "Not yet checked" |
| Download state | "never downloaded" |
| Unnamed imported screen | "Untitled screen <n>" |

## 5. Project panel

Lists every screen in file order, the screen flow (or "Add screen flow" with a one-line explanation), then every block of other content, each with its status. Each screen shows how many flow steps link to it.

| Command | Exact label |
| ------- | ----------- |
| Add a screen | "Add screen" (creates "Screen-<n>") |
| Add the flow | "Add screen flow" (creates "Screen-flow" with start and stop) |
| Rename, duplicate, reorder, delete | **(plan labels)** "Rename", "Duplicate", "Move up", "Move down", "Delete" |
| Rename preview while typing | "Will be saved as <name>" (example "Will be saved as Sign-in") |
| Older-format conversion | "Convert to current format" (per block), "Convert all" (one notice per import) |
| Delete announcement | carries an "Undo" action |

## 6. Palette

Categories, in order: "Basic elements", "Form controls", "Layout elements", "Data presentation", "Navigation and advanced".

Item labels use the construct names from Supported Constructs A.1 and the grid presets: "Text", "Separator", "Spacing" **(plan)**, "Text field", "Text area" **(plan)**, "Button", "Checkbox", "Radio button", "Drop-down", "Grid", "Row", "Column", "Form", "Button bar", "Table", "Group box", "Tree", "Tab bar", "Menu bar", "Scrollable area". Each item has a description stating any material limit of how Salt draws it (FR-008/AC7). Enter on a focused item inserts it.

In the flow, the palette offers "Step", "Decision", "Loop" and "Stop" **(plan labels)**.

## 7. Canvas, outline and selection

| Item | Contract |
| ---- | -------- |
| Outline | ARIA `tree`; selection follows focus; Right/Left expand/collapse |
| Canvas element announcement | "<Type> '<text>', row <r> column <c> of <container>" (example "Text field 'Email', row 2 column 2 of Form") |
| Breadcrumb | `navigation`; parts separated by " › " (example "Screen › Form › Row 2 › Button"); each part selectable |
| Layout toggle | "Show layout guides" |
| Empty screen | prompt explaining how to add the first component; the screen is an insertion target |
| Preset labels | canvas and outline show "Form", "Button bar", "Table" (and "Row", "Column", "Grid") before and after reload |

Structural commands, each a visible pointer-operable control showing its shortcut (section 3.2):

"Select parent", "Move to…", "Wrap", "Unwrap", "Delete", "Insert row", "Delete row", "Insert column", "Delete column" **(row/column labels plan)**, "Open screen".

"Move to…" opens a tree of valid destinations: for each valid container its empty cells and "at the end", and for single-row or single-column containers "before" or "after" each element.

## 8. Properties panel

| Context | Controls and exact strings |
| ------- | -------------------------- |
| Nothing selected | the open screen's or flow's own properties |
| Cell span | span property with its limit, e.g. "Span limited by 'Password' in column 3" |
| Container style | plain, border, table lines, vertical lines, horizontal lines, group box with title |
| Imported formatted text | "Keep formatting", "Remove formatting" |
| Flow element | lane property; "Add note" (each note has text and side left/right) |
| Linked step | link control; "Open screen" |
| Unlinked step | link control offering existing screens and "Create screen" |
| Broken link | "Link to another screen", "Create screen", "Remove link" |
| Flow properties | lane list: add, rename, reorder, delete |

No placeholder or enabled/disabled property exists (FR-003/AC7).

## 9. Source view and errors

| Item | Exact strings |
| ---- | ------------- |
| Source problem actions | "Fix in source", "Revert to last working version" (no revert when never valid) |
| Source problem message | names the block, the line and the problem; labelled as a source problem |
| Rendering problem | shown only in the preview pane, labelled as a rendering problem, with the renderer's message; last render stays, marked out of date |
| Source-view rename notice | e.g. "Updated 3 steps"; otherwise a notice with "Undo" stating cause and broken-link count |
| Whole-file view | read-only, for copying |

## 10. Flow navigation

| Item | Exact strings |
| ---- | ------------- |
| Open linked screen | "Open screen" (also its shortcut); focus goes to the screen's root grid |
| Return | "Back to flow" (step re-selected) |
| Deletion announcement | names what was removed, e.g. "Deleted decision and 4 steps" |
| Clicking a linked step in the rendered flow | opens the screen; a missing screen shows the broken-link message |

## 11. Storage, tabs and notices

| Situation | Exact strings |
| --------- | ------------- |
| Storage write failed | prominent non-blocking message with advice and "Download a backup" |
| Project open in another tab | read-only with "Edit here instead"; the prompt says undo history is not carried over |
| Undo-able deletion | "Undo" |
| Persistent storage refused | one non-blocking notice |
| Private window detected | warning |
| Download with unrenderable or unchecked blocks | non-blocking notice listing them and the count not yet checked |
| Download with invalid or source-only flow | non-blocking notice that it will be imported as other content |
| Clipboard copy | confirmation that it was copied |
| Image export of an unrenderable block | prevented with an explanation |

## 12. Keys

One meaning per key on the canvas and in the outline, for screens and the flow (section 3.2):

| Key | Meaning |
| --- | ------- |
| Esc | Cancel the innermost temporary state (inline edit, drag, menu or dialog); otherwise select the parent. In the source view, move focus to the canvas selection |
| Enter | Into a container (grid; decision → first branch; branch; loop → body); on another element start inline editing; while editing, commit. In the palette, insert |
| F2 | Always start inline editing (including a decision's condition or a loop's labels) |
| Space | Toggle a selected checkbox or radio button |
| Arrows | Move between cells of the current grid; in the flow Up/Down along the path, Left/Right between branches |

Bindings for the move shortcut, "Open screen", the region-focus shortcut, undo and redo are defined once in `src/ui/keys.ts` and tests import them from there. They must avoid combinations reserved by Chrome, Edge and common screen readers, including Alt+Left and Alt+Right (FR-009/AC16). **(plan)** Proposed: move Alt+Shift+Arrow; "Open screen" Ctrl+Enter; undo Ctrl+Z; redo Ctrl+Y and Ctrl+Shift+Z.

## 13. Accessibility

- WCAG 2.2 AA for the editor interface, rendered diagrams excluded (SC-003). `@axe-core/playwright` reports no violations.
- One polite live region announces structural changes (insert, delete, move, undo, redo, revert).
- Canvas elements are exposed as wireframe items with type and text, never as live form controls.
