# Feature Specification: PlantUML Wireframe and Screen Flow Editor

**Feature Branch**: `main` (no feature branch created; spec directory `specs/001-wireframe-flow-editor`)

**Created**: 2026-10-26

**Status**: Draft

**Grilled on**: 2026-10-26

**Input**: User description: "product-spec.md" (the reviewed product specification for the PlantUML Wireframe and Screen Flow Editor, with product-owner decisions OD-1 to OD-16 confirmed on 2026-10-26)

## Overview

A browser-based visual editor that lets business analysts and product owners design low-fidelity user-interface wireframes ("screens") as PlantUML Salt, and describe how people move between those screens as a **screen flow** (a PlantUML activity diagram whose steps link to screens). Users never need to know Salt or activity syntax. A project of screens plus one screen flow is kept in the browser and exchanged as one standard `.puml` file that renders in standard PlantUML tooling.

The product principles in [constitution.md](../../constitution.md) govern this specification: visual-first, structured by design, standards-based output, never lose user work, predictable editing, local and private, accessible to non-developers, developer-friendly handover and a testable core. [product-spec.md](../../product-spec.md) is the source document; where this specification summarises it, the requirements here are authoritative for planning, and the source document holds the review history and rationale.

**Reference product (user experience only)**: [mermaid-editor-wysiwyg](https://github.com/leejsinclair/mermaid-editor-wysiwyg) for interaction patterns, panel layout, terminology and presentation of feedback. Its technical implementation and rendering pipeline are not assumed reusable.

## Clarifications

### Session 2026-10-26

- Q: Where do "Add screen" and "Add screen flow" write the new block in the file, and how does reordering move a screen when other blocks sit between screens? → A: A new screen is written after the last screen block (at the end of the file if there are none); a new screen flow is written at the end of the file. Reordering exchanges the file positions of screen blocks only; other blocks and text between blocks stay in place, except comment lines directly above a block (no blank line between), which move with it.
- Q: How are flow notes modelled? → A: A note is attached to the element it follows (a step, decision, loop or start, or the beginning of a branch or loop body); it moves and is deleted with that element, undoably, is added and edited from that element's properties ("Add note"), and is shown beside that element on the canvas.
- Q: What happens to undo history when editing moves to another tab with "Edit here instead"? → A: The tab that takes over editing starts with an empty undo history, and the tab that gives up editing clears its history; the "Edit here instead" prompt says that undo history is not carried over.
- Q: May the application send usage analytics, error reports or other data over the network? → A: No. After loading, the application makes no network requests other than fetching its own files; there is no analytics, no error reporting and no third-party request, and errors are shown only to the user.
- Q: Which languages is the editor's interface in? → A: English only in the initial release, with all interface text kept separate from the code so that it can be translated later; diagram content in any language remains fully supported.
- Q: How does reordering other content move its blocks in the file? → A: The same as screens: reordering exchanges the file positions of other-content blocks only; screens, the screen flow and text between blocks stay in place, except comment lines directly above a moved block, which move with it.
- Q: Can a flow element carry more than one note? → A: Yes. An element (or the beginning of a branch or loop body) can carry several notes, kept in order, each with its own text and side; "Add note" adds another.
- Q: How long must the user stop typing before the editor treats it as a "pause"? → A: 300 ms without a keystroke in the source view; the pause triggers re-parsing and ends the current typing undo step.
- Q: How long can a single render run before it is abandoned and reported as "Not yet checked"? → A: 10 seconds per block.
- Q: Is there a limit on how many steps of undo history each project keeps during a session? → A: At least the 200 most recent steps per project are kept; beyond that the oldest step is dropped.
- Q: When a project is open read-only in a second tab, should that tab update automatically as the editing tab saves changes? → A: No. A read-only tab shows the version stored when it was opened and does not update until it is reloaded; choosing "Edit here instead" loads the latest stored version (after the other tab's pending edits are saved) before editing starts. Library-level renames and deletions still apply in every tab (FR-006/AC16).
- Q: At what size should PNG exports be drawn, compared with the diagram's natural (SVG) size? → A: Always 2× the natural SVG size, regardless of the viewer's screen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a screen wireframe visually (Priority: P1)

A business analyst creates a project and builds a screen, such as a login form, by choosing components from a palette and arranging them in rows, columns, grids and group boxes on a structured canvas. They set labels, values and states in a properties panel, see the Salt source the editor writes, and confirm the result in a rendered preview. Every operation works by keyboard and by visible pointer controls; nothing requires dragging.

**Why this priority**: This is the core value of the product. Without it there is nothing to store, link or export. It alone lets a user produce a portable Salt wireframe.

**Independent Test**: In an empty library, create a project and build the reference login form (section "Success Criteria") using only the palette, canvas, outline and properties panel; check that the generated source renders in the in-browser renderer and in the PlantUML command-line tool at the minimum supported version, with all text shown as typed.

**Acceptance Scenarios**:

1. **Given** an empty project library, **When** the user creates a project, **Then** it opens on one empty screen showing a prompt that explains how to add the first component, and the empty screen accepts insertions.
2. **Given** a selected element in a single-row grid, **When** the user chooses "Button" in the palette, **Then** a button is inserted after the selected element in the same row, becomes selected and focused, and the change is announced.
3. **Given** a selected text field, **When** the user changes its label and value in the properties panel, **Then** the canvas, the source and the preview update, and the field keeps its width.
4. **Given** a selected element in a multi-row, multi-column grid, **When** the user deletes it, **Then** an empty cell remains, the source lines of the other rows are unchanged, and focus moves to the empty cell.
5. **Given** a selected element, **When** the user presses the keyboard move shortcut at the edge of its container, **Then** nothing moves and the user is told to use "Move to…".
6. **Given** a selected field, **When** the user chooses "Select parent" (or presses Esc with nothing temporary open), **Then** the containing grid is selected and the breadcrumb shows the path.
7. **Given** the user types `{`, `|`, `**` or "Title" as the first cell of a row, **When** the screen is rendered, **Then** the text appears exactly as typed with no visible escape characters.
8. **Given** a Form, Button bar or Table preset is inserted, **When** the project is reloaded, **Then** the canvas and outline still label it "Form", "Button bar" or "Table".

---

### User Story 2 - Keep work safe in the browser and exchange it as a file (Priority: P1)

The user's projects are saved automatically in the browser. The project library lists them with last-modified and last-downloaded times. The user can create, open, rename, duplicate and delete projects, download a project as one `.puml` file, and import a `.puml` file as a new project. The application protects against browser storage loss by reminding the user to download backups.

**Why this priority**: The "never lose user work" principle and the usability goal (build, then download) both depend on it. With Story 1 it forms the minimum viable product.

**Independent Test**: Build a screen, refresh the page and confirm it reopens exactly as stored; download it, import the file, and confirm screens, layout and properties are identical; simulate a storage-quota failure and confirm it is reported within 1 second with "Download a backup", while editing continues.

**Acceptance Scenarios**:

1. **Given** an open project, **When** the user makes an edit, **Then** it is committed to browser storage within 2 seconds and the status shows "All changes saved".
2. **Given** a storage write fails, **When** the failure occurs, **Then** a prominent, non-blocking message appears within 1 second with advice and "Download a backup"; the previous stored version is intact; the application retries and the status returns to "All changes saved" when a retry succeeds.
3. **Given** a project with changes that have not been downloaded, **When** the user deletes it, **Then** the confirmation says so and offers "Download and delete".
4. **Given** a project open for editing in one tab, **When** it is opened in a second tab, **Then** the second tab is read-only with "Edit here instead"; the second tab does not update as the first tab saves; choosing "Edit here instead" saves the first tab's pending edits, loads the latest stored version and moves editing to the second tab.
5. **Given** a downloaded project file, **When** it is imported, **Then** a new project is created with the same screens, flow, layout and properties, named after the file (with the date appended if the name is already used), and marked "never downloaded".
6. **Given** a non-UTF-8 or binary file, **When** the user imports it, **Then** it is rejected with an explanation and nothing is created.

---

### User Story 3 - Open existing PlantUML files without losing anything (Priority: P2)

A user imports a `.puml` file produced outside the application: it may contain several Salt screens, an activity diagram, other diagram types, comments, text between blocks, unsupported constructs or invalid source. The editor classifies every block, makes everything it supports visually editable, shows unsupported parts as locked parts, keeps everything else exactly as written, and downloads an identical file when nothing was edited.

**Why this priority**: Existing Salt files are a stated use case, and source fidelity is a constitution principle. It builds on Stories 1 and 2.

**Independent Test**: Import each file of the test corpus; confirm each block's status in the project panel and that downloading without edits produces a byte-identical file (including CRLF line endings, byte-order mark, missing final newline, comments and text between blocks).

**Acceptance Scenarios**:

1. **Given** a file containing a screen with an unsupported tree-table variant, **When** it is imported, **Then** the screen shows "Has locked parts", the variant appears as a labelled locked placeholder with its reason and a source excerpt, and the rest of the screen is editable.
2. **Given** a screen using `!define`, **When** it is imported, **Then** it opens in source-only mode with an explanation.
3. **Given** a Salt block written as `salt` inside `@startuml`, **When** it is imported, **Then** it is listed as other content with status "Older format", and one notice offers "Convert all"; converting is undoable and the result renders.
4. **Given** a file whose only screen is invalid, **When** it is imported, **Then** the screen shows "Error" with the problem and its line, has no revert action, and other blocks remain editable.
5. **Given** a file with a sequence diagram and two activity diagrams, **When** it is imported, **Then** the first supported activity diagram becomes the screen flow, and the sequence diagram and second activity diagram are listed as other content.
6. **Given** any imported file, **When** the user edits one element and downloads, **Then** only that element's source text has changed.

---

### User Story 4 - Edit source and see the real render (Priority: P2)

A developer or experienced analyst edits a screen's or the flow's source directly. While they type, the block's canvas is read-only; when they pause, the canvas updates. If the source becomes invalid, the canvas shows the last working version with a plain-language message naming the line, and offers "Fix in source" and "Revert to last working version". The rendered preview shows the actual PlantUML output, renders in the background without ever blocking editing, and keeps the last good render (marked out of date) when rendering fails.

**Why this priority**: Required for secondary users and for recovering imported content; the preview is the authoritative view of the output. The core visual editing in Story 1 does not depend on it.

**Independent Test**: Type a valid change in the source and confirm the canvas updates within 500 ms of pausing; introduce an error and confirm the message, line, "Fix in source" and revert; confirm the preview shows "Not yet checked" until rendered and keeps the last render, marked out of date, after a failure.

**Acceptance Scenarios**:

1. **Given** the source view of a screen has focus, **When** the user types, **Then** that screen's canvas is read-only while other screens remain editable.
2. **Given** the user pauses after typing valid source, **When** the block is re-parsed, **Then** the canvas reflects it within 500 ms and the selection stays on the same element or its nearest surviving container.
3. **Given** the user leaves the source view with invalid source, **When** focus moves elsewhere, **Then** the text stays exactly as typed, is autosaved, and the block stays locked with "Fix in source" and "Revert to last working version".
4. **Given** the user deletes a block's `@endsalt` line while typing and then leaves the source view, **When** the file no longer forms one block, **Then** the editor re-divides it once as one undoable step and reports what it did; if this would remove a screen that steps link to, the user is warned first and can cancel.
5. **Given** a rendering failure, **When** the preview updates, **Then** the renderer's message appears in the preview pane labelled as a rendering problem, separate from source problems, and the last successful render remains visible, marked out of date.

---

### User Story 5 - Manage several screens in a project (Priority: P2)

The user adds, renames, duplicates, reorders and deletes screens in the project panel. Names are safe identifiers derived from what the user types. The editor warns before renaming or deleting a screen that flow steps link to.

**Why this priority**: Multi-screen projects are a core use case and a prerequisite for meaningful screen flows.

**Independent Test**: Create three screens, rename one to "Sign in" (saved as `Sign-in`), duplicate it, reorder and delete screens; download and re-import; confirm order and names are preserved.

**Acceptance Scenarios**:

1. **Given** a project, **When** the user adds a screen, **Then** a new empty screen named "Screen-n" (the lowest unused number) is created and opened.
2. **Given** the user renames a screen to "Sign in", **When** they commit, **Then** it is saved as `Sign-in`; while typing, a preview shows "Will be saved as Sign-in".
3. **Given** a name that matches another block's name ignoring case, **When** the user commits it, **Then** it is refused with a message naming that block and the previous name is kept.
4. **Given** a screen that three steps link to, **When** the user renames it from the project panel and proceeds, **Then** the three steps are updated in one undoable step.
5. **Given** a screen that no step links to, **When** the user deletes it, **Then** it is deleted without confirmation, the deletion is announced with "Undo", and its neighbour opens.
6. **Given** the only block in a project, **When** the user tries to delete it, **Then** the deletion is refused with an explanation.

---

### User Story 6 - Describe a screen flow (Priority: P3)

The user adds a screen flow to the project and builds it from steps, decisions (with `elseif`), loops, swimlanes and notes on a structured, top-to-bottom canvas, without drawing free-form arrows. Each element's lane is a property; the editor writes lane switches so every element appears in its own lane in the render.

**Why this priority**: Screen flows are the second major capability, valuable once screens exist.

**Independent Test**: Add a screen flow, insert a step, a decision with two labelled branches and a loop; assign lanes "User" and "System"; confirm the render shows each element in its lane and that the source renders in the command-line tool.

**Acceptance Scenarios**:

1. **Given** a project with no screen flow, **When** the user chooses "Add screen flow", **Then** a flow named "Screen-flow" with start and stop is created and opened.
2. **Given** a decision is selected, **When** the user presses Enter, **Then** focus moves to its first branch; Left and Right move between branches; an empty branch can be selected and receives insertions.
3. **Given** a decision containing four steps, **When** the user deletes it, **Then** its contents are deleted, the deletion is undoable, and it is announced as "Deleted decision and 4 steps".
4. **Given** a step inside a branch, **When** the user changes its lane, **Then** only that step's rendered lane changes.
5. **Given** the initial start or the final stop of the main path, **When** the user tries to move or delete it, **Then** the operation is refused with an explanation.
6. **Given** a lane in use, **When** the user deletes it, **Then** they are asked which lane its elements move to, and the deletion is undoable.

---

### User Story 7 - Link flow steps to screens and walk through a journey (Priority: P3)

The user links steps to screens (or creates a screen from a step), opens a linked screen from a step, and returns to the flow. With panels collapsed, they walk stakeholders through a journey by following links from the flow, including by clicking steps in the rendered flow preview.

**Why this priority**: Connects the two editors and supports stakeholder walkthroughs; depends on Stories 5 and 6.

**Independent Test**: Link a step to a screen, open it with "Open screen", return with "Back to flow"; delete the screen and confirm the step shows a broken link with "Link to another screen", "Create screen" and "Remove link"; click a linked step in the rendered preview and confirm the screen opens.

**Acceptance Scenarios**:

1. **Given** an unlinked step "Enter credentials", **When** the user chooses "Create screen" from its link control, **Then** a screen `Enter-credentials` is created and linked to the step in one action.
2. **Given** a linked step, **When** the user activates "Open screen" or its shortcut, **Then** the screen opens with focus on its root grid, and "Back to flow" returns with the step selected.
3. **Given** a linked step whose screen has been deleted, **When** the user views the flow, **Then** the step is flagged as broken and its properties offer "Link to another screen", "Create screen" and "Remove link".
4. **Given** a step label containing `[x]`, `]]` and `|`, **When** the project is downloaded and re-imported, **Then** the link and the label are preserved.
5. **Given** all panels are collapsed, **When** the user clicks a linked step in the flow's rendered preview, **Then** the linked screen opens and "Back to flow" returns.

---

### User Story 8 - Export images and copy source (Priority: P3)

The user exports the open screen or flow as SVG or PNG for documentation and copies PlantUML source (of the open block or the whole project) to the clipboard.

**Why this priority**: Useful for sharing but not required to create, store or exchange projects.

**Independent Test**: Export a screen as SVG and PNG and compare them with the preview; copy the whole project's source and confirm the clipboard matches the downloaded file; try to export an invalid block and confirm the export is prevented with an explanation.

**Acceptance Scenarios**:

1. **Given** a screen that renders, **When** the user exports PNG, **Then** the image is a rasterisation of the same SVG shown in the preview, at 2× its natural size.
2. **Given** a block that is invalid, in the older format or depends on `!include`, **When** the user tries to export it as an image, **Then** the export is prevented with an explanation, and source download and copy remain available.
3. **Given** the user copies source, **When** the copy succeeds, **Then** a confirmation says it was copied.

---

### Edge Cases

- **EC-01 Empty and degenerate projects**: an empty file creates a project with one new screen; a file with no screen or flow creates a project with only other content and a status explaining why; no deletion or re-division may remove a project's last block.
- **EC-02 Ragged grids**: rows of different lengths are valid; rows the user did not edit are never padded or normalised.
- **EC-03 Column spans**: never offered on the first cell of a row; limited to empty cells to the right, with the limiting element named; deleting the column a span starts from turns the rest of the span into empty cells; inserting a column inside a span extends it; a moved cell keeps its span, reduced to fit.
- **EC-04 1 × 1 grids**: insertion after the only element grows the grid downward, except when that element is a button, when it grows across.
- **EC-05 Text that looks like syntax**: `.`, `...`, separators, leading `*`, `[`, `(`, `^`, `"` or `==`, braces and bars, creole pairs, and diagram command words such as "Title" or "Legend" as a row's first cell are shown and rendered literally.
- **EC-06 Imported formatted text**: kept exactly until edited; on editing the user chooses "Keep formatting" or "Remove formatting".
- **EC-07 Drop-downs switched to closed**: the other options are removed from the source, with an undoable notice stating how many.
- **EC-08 Content PlantUML silently ignores**: several root grids, or text after the root grid, make the block source-only, and the message says which content will not appear in the image (worded differently from syntax errors).
- **EC-09 Container with more than one style modifier, preprocessor directives, legacy activity syntax, `goto`/`label`**: block opens source-only.
- **EC-10 Fork/join, `switch`, partitions, `detach`/`kill`, Salt inside a step**: preserved as locked parts.
- **EC-11 Names**: non-English letters allowed; names that convert to nothing keep the previous name; imported names that are not allowed, not normalised or duplicated are flagged, not changed; a link differing only in letter case is broken with a suggested fix; imported unnamed screens keep no name until renamed or linked.
- **EC-12 Screen flow becomes invalid**: it remains the screen flow after edits and reloads; downloading warns that on re-import it will become other content.
- **EC-13 Renderer**: a render that runs longer than 10 seconds is abandoned and reported "Not yet checked"; blocks depending on `!include` or URLs are never resolved and are shown as unrenderable.
- **EC-14 Multiple tabs**: a project deleted in another tab is reported, with an offer to download its content; renames apply in every tab.
- **EC-15 Storage**: persistent storage refused, private windows and quota failures are each reported without blocking editing.
- **EC-16 Unsupported browser**: detected and reported rather than failing silently.
- **EC-17 Narrow windows**: below 1024 px editing is not required, but the application must not break and should allow viewing.
- **EC-18 Touch**: taps never cause accidental deletion or unintended movement.
- **EC-19 Undo across blocks**: undo opens the affected screen or flow first; undo may restore invalid source, which is then shown as invalid.

## Requirements *(mandatory)*

Acceptance criteria are numbered within each requirement and referenced as, for example, FR-004/AC3. Numbering matches [product-spec.md](../../product-spec.md) section 5 so that existing traceability is kept; FR-016 onward capture requirements the source document states outside section 5. "Section n" references below point to the Business Rules in this document, whose headings carry the same section numbers as the source document.

### Terminology

These terms are used consistently in the user interface and in this specification.

| Term | Meaning |
| ---- | ------- |
| Project | A set of screens, at most one screen flow and any other content, stored in the browser and exchanged as one `.puml` file. |
| Screen (wireframe) | One Salt diagram, written as one `@startsalt` block. |
| Screen flow | The project's activity diagram, whose steps may link to screens. |
| Step / decision / loop / lane | Elements of a screen flow (action, `if`, `repeat`/`while`, swimlane). |
| Block | One diagram in the project file (a screen, the screen flow or other content). Internal term; user-facing text says "screen", "screen flow" or "other content". |
| Locked part | Valid content inside a screen or flow that the visual editor does not support. It is preserved exactly and edited only in source. |
| Other content | Diagram blocks that are neither a supported screen nor the screen flow (for example a sequence diagram, or Salt in an older format). Preserved exactly; edited only in source. |
| Last working version | The most recent source of a block that the editor could parse. |

### Functional Requirements

#### FR-001: Create a wireframe

**FR-001**: Users can start a new project or screen and build a screen visually.

- **AC1** Given an empty library, when the user creates a new project, the project opens on one empty screen, ready for editing.
- **AC2** The user can add supported components from the palette.
- **AC3** The user can configure component properties using visible controls.
- **AC4** The application generates Salt source corresponding to the current wireframe.
- **AC5** The generated source renders successfully in the in-browser renderer and in standard PlantUML tooling at the minimum supported version (FR-017).
- **AC6** Given an open project, when the user adds a screen, a new empty screen with a generated name (section 3.6) is created and opened.
- **AC7** An empty screen shows a prompt explaining how to add the first component, and is itself a valid insertion target.

#### FR-002: Construct structured layouts

**FR-002**: Users can organise components through Salt-native layout structures (rules in section 3.2).

- **AC1** The user can create and edit supported rows, columns, grids and nested containers.
- **AC2** The user can insert components into a selected container; the component is placed at the insertion point defined in section 3.2, and becomes selected and focused.
- **AC3** The user can reorder components within a container.
- **AC4** The user can move a component between compatible containers.
- **AC5** The application displays the resulting hierarchy so that a user who does not know Salt can identify, without help, which container a selected component belongs to and select that container. Assessed in the usability sessions: met when at least 4 of 5 participants succeed (A-7).
- **AC6** Every supported layout operation generates source consistent with the resulting structure.
- **AC7** Invalid operations are prevented as described in FR-008/AC3, without corrupting the existing wireframe.
- **AC8** Removing or moving an element out of a single-row or single-column grid closes the gap; doing so in a multi-row and multi-column grid leaves an empty cell (`.`); in both cases, source lines of other rows are unchanged.
- **AC9** The user can insert and delete rows and columns and set a cell's column span; a span is never offered on the first cell of a row, can extend only over empty cells, and no column operation leaves a span in the first column or misaligns other rows (verified with the command-line oracle).
- **AC10** Importing and editing a grid with rows of different lengths leaves rows the user did not edit unchanged.
- **AC11** The user can wrap a selected element in a new grid or group box, and can unwrap a grid that contains a single element and has no style.
- **AC12** Clicking selects the innermost element; "Select parent" (and Esc, when nothing temporary is open) selects its container; the breadcrumb shows the selection path and each part can be selected.
- **AC13** The keyboard move shortcut moves the selected element along the axis of a single-row or single-column grid, swaps it with the neighbouring cell in a multi-row and multi-column grid, and at a container edge moves nothing and says how to leave the container.
- **AC14** Inserting a Form, Button bar or Table preset produces placeholder content that the canvas and outline label with the preset's name, before and after reload.

#### FR-003: Edit component properties

**FR-003**: Users can configure supported UI components without writing Salt syntax (rules in section 3.4).

- **AC1** Selecting a component displays its relevant properties.
- **AC2** Changing a property updates the visual representation, generated source and rendered preview.
- **AC3** Form-control states and options are preserved after reload, and after download and re-import (for drop-downs, the options of an open drop-down).
- **AC4** Unsupported property combinations cannot silently generate invalid source.
- **AC5** Component-specific property controls use the terms in the terminology table and the palette; no property name requires knowledge of Salt syntax.
- **AC6** Text entered by the user appears literally in the canvas and the render, and re-imports as the same text. The test corpus includes at least: `{`, `}`, `|`, a leading `[`, `(`, `^`, `"`, `*` or `==`, a whole cell of `.` or `...`, the pairs `**`, `//`, `__`, `""`, `--` and `~~`, ordinary text such as `a.b` and `5 * 3` (which must be written unchanged), "Title", "Header 1" and "Legend" as the first cell of a row (the text must appear in the render), and a linked step label containing `[x]`, `]]` and `|`. Each case is verified with the command-line oracle, with no visible escape characters.
- **AC7** No placeholder or enabled/disabled property is offered.
- **AC8** Changing a text field's value keeps its width unless the user changes the width. Width is measured in characters and can never be less than the value's length, because Salt sets a field's width from its quoted text; a value longer than the current width widens the field to fit.
- **AC9** On the canvas, clicking a control selects it and never toggles or edits it. With a checkbox or radio button selected, Space toggles its checked state. Enter (on a non-container element), F2 or double-click starts editing the selected element's label or value in place; Esc cancels and restores the text.
- **AC10** Drop-down options can be edited, and the drop-down can be set to show its options open or closed; the canvas shows the same form as the render. Switching a drop-down with options to closed removes the other options from the source, with an undoable notice saying how many.
- **AC11** Editing imported formatted text offers "Keep formatting" and "Remove formatting"; with either choice, the element's structure and type are unchanged.

#### FR-004: Synchronise visual editing and source

**FR-004**: The application maintains a consistent relationship between the structured visual model and the source of screens and the screen flow (rules in sections 4.1 and 4.2).

- **AC1** A visual edit updates the source, changing only the text of the affected element(s).
- **AC2** A valid source edit using supported constructs updates the visual model.
- **AC3** The rendered preview reflects the latest source that could be rendered, and indicates when it is out of date.
- **AC4** Invalid source produces an error message that names the block, the line (from the editor's parser) and the problem in plain language, offers "Fix in source" (which focuses the source on that line) and "Revert to last working version", and locks only the affected block.
- **AC5** Switching between visual and source editing never changes the source.
- **AC6** Opening and downloading a project without edits produces byte-identical source, including for files with CRLF line endings, a byte-order mark, no final newline, comments, and text between blocks.
- **AC7** Synchronisation failures are visible and recoverable.
- **AC8** While the source view of a block has focus, that block's canvas cannot be edited; other blocks can.
- **AC9** After the user pauses typing valid source (a pause is 300 ms without a keystroke), the canvas reflects it within the performance target (SC-006), and the selection stays on the same element or moves to its nearest surviving container.
- **AC10** Deleting a block's opening or closing line while typing makes the block invalid without changing any other block; on leaving the source view, the editor re-divides the file into blocks once, as one undoable step, and reports the result. If this would remove a screen that steps link to, the user is warned first and can cancel.

#### FR-005: Render the wireframe

**FR-005**: Users can inspect the actual PlantUML output of screens and the screen flow (rules in FR-017).

- **AC1** The preview displays the result produced by the in-browser PlantUML renderer.
- **AC2** Supported visual changes are reflected in the preview.
- **AC3** Rendering failures display the renderer's message, the affected block, and a plain-language explanation.
- **AC4** A rendering failure does not destroy the editable wireframe or its source.
- **AC5** Preview errors are shown in the preview pane and labelled as rendering problems; source errors are shown with the source and canvas and labelled as source problems. The two never share a message area.
- **AC6** The user can continue editing while the last successful preview remains visible, marked as out of date.
- **AC7** Rendering never blocks interaction with the canvas, outline or source view.
- **AC8** Opening a project does not wait for the renderer. Once the renderer is available, every block (except as in section 4.2 "Preview") is rendered in the background, one at a time, with the open block taking priority, and its render status appears in the project panel.

#### FR-006: Store, download and import projects

**FR-006**: Projects persist automatically in browser storage and can be exchanged as standard PlantUML files (rules in section 3.6).

- **AC1** Every edit is saved to browser storage automatically within 2 seconds, and the save status is visible.
- **AC2** After a page refresh or browser restart, all projects in the library reopen exactly as last stored; after a crash, no more than the last 2 seconds of edits are lost.
- **AC3** The user can create, open, rename, duplicate and delete projects from the project library; deletion requires confirmation. The confirmation says whether the project has changes that have not been downloaded and offers "Download and delete".
- **AC4** The user can download any project as a single `.puml` file.
- **AC5** A downloaded file can be imported as a new project without losing screens, flow, layout structures or component properties (a flow that was invalid or source-only when downloaded is kept as other content).
- **AC6** Importing a file classifies its content (section 4) and applies the source fidelity policy (section 4.1) before any visual editing, without waiting for the renderer.
- **AC7** Storage failures (for example quota exceeded) are reported within 1 second, prominently, with advice and an action to download a backup; editing continues, the application retries, and when a retry succeeds the status returns to "All changes saved".
- **AC8** Each project shows when it was last downloaded and whether it has changes since then; duplicated and imported projects start as "never downloaded".
- **AC9** Where the browser reports that persistent storage was not granted, a single non-blocking notice explains the risk; where private browsing is detectable, a warning is shown.
- **AC10** The library shows each project's last-modified time, and the application states that projects are not synchronised between browsers or devices.
- **AC11** When a project has changes that have not been downloaded, a non-blocking reminder appears once per session.
- **AC12** Opening a project that is already being edited in another tab opens it read-only with "Edit here instead"; the read-only tab shows the version stored when it was opened and does not update until it is reloaded. Choosing "Edit here instead" saves the other tab's pending edits, then loads the latest stored version before editing moves. Edits from one tab never silently overwrite another tab's edits.
- **AC13** Importing a non-UTF-8 or binary file is rejected with an explanation and creates nothing; cancelling the file picker does nothing.
- **AC14** Importing a file uses as the screen flow the first activity block in the current syntax that is in category 1 or 2 (including one with locked parts); further activity blocks, and source-only or invalid activity blocks, are kept as other content.
- **AC15** After reloading a project that contains an invalid block, the block shows its last working version, and "Revert to last working version" still works.
- **AC16** Renaming or deleting a project from the library applies in every open tab; a tab showing a project deleted elsewhere says so and offers to download its content.
- **AC17** After import, the first screen that can be edited visually opens (else the flow, else the first block).
- **AC18** After reload, the same block is the screen flow as before, even if it is invalid or source-only.

#### FR-007: Undo and redo

**FR-007**: Users can reverse and restore editing operations.

- **AC1** Adding, deleting, moving or reordering a component can be undone and redone.
- **AC2** Changing component properties can be undone and redone.
- **AC3** Supported source edits participate in the undo/redo history.
- **AC4** Continuous typing in the source view is grouped into a single undo step, ending when the user pauses (300 ms without a keystroke) or leaves the source view; it is not undone one keystroke at a time.
- **AC5** Undo and redo restore the corresponding structure, properties and generated source.
- **AC6** Each project has its own undo history; switching projects does not mix histories. Each history keeps at least the 200 most recent steps; beyond that the oldest step is dropped.
- **AC7** Undo history lasts for the current session only; after a reload, the project opens with its autosaved content and an empty history. When editing moves to another tab ("Edit here instead", FR-006/AC12), the tab that takes over starts with an empty history and the tab that gives up editing clears its history.
- **AC8** The application does not lose unrelated changes when reverting an operation.
- **AC9** The available undo/redo actions are clearly indicated, including the name of the action that will be undone or redone.
- **AC10** Every operation within a project can be undone and redone, including adding, renaming, duplicating, reordering and deleting screens (with any link updates), changing links, flow edits (including lane changes and deleting the flow), row and column operations, deleting locked parts, converting older-format blocks and re-dividing blocks.
- **AC11** Undo and redo first open the affected screen or flow and select the affected element, then announce what changed.
- **AC12** Undo or redo may restore a block to an invalid state; the block is then shown as invalid (section 4.1).
- **AC13** Typing in a property field is one undo step, ending when the field loses focus or the user presses Enter. While a text field has focus, the undo shortcut first undoes typing within that field.

#### FR-008: Provide understandable feedback

**FR-008**: The application supports non-technical users with clear guidance and feedback.

- **AC1** Components and layout operations are labelled using the terms in the terminology table and palette.
- **AC2** Selection, insertion, reordering and nesting are visually apparent.
- **AC3** Visual operations that would produce invalid or unsupported source are prevented: invalid targets are not offered and dragging over them shows that they are not allowed. If such an operation is attempted by keyboard or command, a message next to the target and in a screen-reader announcement explains what is wrong and how to resolve it. An operation is never accepted and then reversed.
- **AC4** Source and rendering errors are distinguishable (FR-005/AC5).
- **AC5** Keyboard focus and interaction states are visible.
- **AC6** The core editing workflow is usable without requiring knowledge of Salt syntax.
- **AC7** Each palette item's description states any material limit of how Salt draws it (Supported Constructs, A.1).
- **AC8** Messages about content PlantUML would silently ignore state which content will not appear in the image, and are worded differently from syntax errors.

#### FR-009: Support keyboard and touch interaction

**FR-009**: The editor provides accessible alternatives to pointer-driven editing. Every editing operation can be performed with a keyboard (key model in section 3.2 "Keys").

- **AC1** Every editing operation, including component selection and property editing, can be performed using a keyboard.
- **AC2** Every drag-and-drop operation has a keyboard-accessible alternative: the keyboard move shortcut (FR-002/AC13); "Move to…", which lists every valid destination as a tree and moves the element there; and "Wrap" and "Unwrap", which nest and un-nest. The same commands work on the canvas, in the outline and in the flow editor.
- **AC3** Interactive controls have meaningful accessible labels; canvas elements are announced as wireframe items with their type and text, not as live form controls.
- **AC4** Focus indicators are visible.
- **AC5** All editing features are fully usable at viewport widths of 1024 px and above, with the palette, outline, properties panel and preview collapsing as needed.
- **AC6** Below 1024 px, editing is not required; the application must not break, and should at least allow projects to be viewed.
- **AC7** Touch support does not introduce accidental component deletion or unintended movement. Touch is supported on touchscreen devices running a supported browser, using taps and the visible commands; no touch-only gestures are required (OD-13).
- **AC8** After an insert, focus moves to the new element; after a delete that leaves an empty cell, to that cell; after any other delete, to the next element, else the previous one, else the container; after a move, it stays on the moved element; after undo or redo, to the affected element (after undoing an insert, to the element selected before it); after a source re-parse, as in FR-004/AC9; after opening a linked screen, to that screen's root grid.
- **AC9** Structural changes (insert, delete, move, undo, redo, revert) are announced to assistive technology through a polite status message. Canvas elements are announced with their type, text, cell position and container (for example "Text field 'Email', row 2 column 2 of Form").
- **AC10** The outline behaves as an accessible tree with selection following focus. On the wireframe canvas, arrow keys move between cells of the current grid, Enter moves into a container and Esc moves to its container.
- **AC11** The two usability tasks (SC-001) can be completed using only a keyboard, and with a screen reader.
- **AC12** Esc and Enter follow section 3.2 "Keys" everywhere: Esc first cancels an inline edit (restoring the text), a drag (returning the element) or an open menu or dialog, and only otherwise moves to the container.
- **AC13** On the flow canvas, Up and Down move along the path, Left and Right move between branches, Enter on a decision or loop moves into its first branch or body and Esc moves out; empty branches and loop bodies can be selected and receive insertions.
- **AC14** Every structural command is available from a visible pointer-operable control for the selection, showing its keyboard shortcut; no operation requires dragging.
- **AC15** No region traps keyboard focus: in the source view, Esc moves focus to the canvas selection and ends the source edit; a shortcut moves focus between workspace regions.
- **AC16** Keyboard shortcuts do not use combinations reserved by the supported browsers, and the canvas key model works with a screen reader in focus mode (verified in the AC11 screen-reader run).

#### FR-010: Handle unsupported and invalid source

**FR-010**: The application protects user-authored source that cannot be represented completely in the visual model (rules in section 4).

- **AC1** Each of the four source categories (section 4) is detected and reported distinctly: each screen, the flow and each block of other content shows a status in the project panel (Editable, Has locked parts, Source only, Error, Older format, or Cannot be rendered), with a plain-language reason; render status shows "Not yet checked" until the block has been rendered.
- **AC2** Unsupported content is shown as a locked part at the smallest unit that can be isolated, with its reason and a source excerpt, and remains byte-identical after visual edits elsewhere and after download.
- **AC3** Where unsupported content cannot be isolated (the cases listed in section 4.1), the affected block opens in source-only mode with an explanation.
- **AC4** The user can revert a block to its last working version in a single action, including after a reload.
- **AC5** The supported source subset is defined explicitly (Supported Constructs).
- **AC6** A test corpus covers every category in section 4 and every supported construct, including ragged grids, spans affected by column operations, CRLF and byte-order-mark files, text between blocks, Salt in the older `@startuml` form, multiple root grids, preprocessor use, unsupported activity constructs, lane switches inside branches, non-English block names and the escaping cases in FR-003/AC6. Every corpus file round-trips byte-identically, and every generated block renders without error in the command-line oracle with no content silently dropped.
- **AC7** A Salt block written in the older `@startuml` form is preserved as other content with the status "Older format", and an import containing such blocks shows one notice offering "Convert all". "Convert to current format" replaces its opening and closing lines with `@startsalt`/`@endsalt` (keeping any name) and removes the `salt` keyword line, leaves all other lines unchanged, is undoable, and the result renders in the command-line oracle (OD-5).
- **AC8** A block that has never been valid is shown in the source view with the status "Error", its error, and no revert action.
- **AC9** Source-only blocks and other content show "Cannot be rendered", with the renderer's message, when the renderer fails on them, and are otherwise not reported as errors.
- **AC10** A well-formed imported block that uses constructs outside the supported subset (for example an unknown container modifier or activity arrow labels) is reported as having locked parts or as source only, never as "Error".

#### FR-011: Manage screens in a project

**FR-011**: Users can create and manage several wireframe screens within one project file (naming rules in section 3.6).

- **AC1** The user can add, rename, reorder and delete screens.
- **AC2** Every screen the editor creates or renames has a unique, stable identifier that is written to the project file and follows the naming rules. Imported exceptions are handled as in AC10 and AC11.
- **AC3** Downloading and re-importing a project preserves all screens, their order and their identifiers.
- **AC4** Opening a file with a single `@startsalt` block produces a single-screen project without conversion.
- **AC5** Deleting or renaming a screen that a flow step references warns the user and shows the affected steps before proceeding. Renames made by editing the name line in the source view follow AC14 and are not confirmed (OD-4).
- **AC6** The exported file renders in standard PlantUML tooling outside the application, apart from blocks the user authored that cannot be rendered, which are listed when downloading (FR-014/AC6).
- **AC7** When renaming, the typed text is not altered until the user commits; on commit it is converted under the naming rules and the result is shown. An empty result keeps the previous name with a message; a name that duplicates another block's name (after normalisation and case folding) is refused with a message naming that block.
- **AC8** Proceeding with a rename updates every step that links to the screen, in one undoable step. Proceeding with a delete keeps the linked steps and flags their links as broken (FR-013/AC4); the delete is undoable. Cancelling either leaves the project unchanged.
- **AC9** Deleting a screen that no step references needs no confirmation; it is announced with an "Undo" action. After deleting the open screen, its neighbour in the project panel opens.
- **AC10** An imported unnamed screen keeps no name, and the file stays byte-identical, until the user renames it or a step first links to it; it then receives a generated name.
- **AC11** Imported block names that are not allowed or are duplicated are flagged in the project panel and are not renamed automatically; steps linking to them show their links as broken or ambiguous until the screen is renamed.
- **AC12** The user can duplicate a screen; the copy is placed after the original with a generated name, has no incoming links, and the duplication is undoable (OD-15).
- **AC13** Generated names (new screens, screens created from step labels, duplicates, the flow) are never refused: a name already in use gets "-2", "-3" and so on.
- **AC14** Changing a screen's name line in the source view never asks for confirmation and never rewrites the typed name. On leaving the source view, an allowed, unique name updates the links in the same undo step with a notice; any other name is flagged as in AC11, and a notice with "Undo" states the cause and how many links are now broken (OD-4).
- **AC15** No deletion or re-division removes the last block of a project; the user is told why.
- **AC16** A link whose target differs from a screen's name only in letter case is shown as broken, with a suggested fix.

#### FR-012: Edit screen flows visually

**FR-012**: Users can build and edit a screen flow without writing activity diagram syntax (rules in section 3.7).

- **AC1** The user can add, edit, move and delete steps, decisions, loops and swimlanes, and add, edit and delete notes on them, using the structured flow editor; a note moves and is deleted with the element it is attached to.
- **AC2** Every flow the editor allows can be expressed in PlantUML activity syntax; operations that would produce an unrepresentable flow are prevented as in FR-008/AC3.
- **AC3** Visual flow edits update the generated activity source and rendered preview.
- **AC4** Supported source edits to the activity block update the visual flow.
- **AC5** Unsupported or invalid activity source is handled according to section 4.1.
- **AC6** Flow edits participate in undo/redo (FR-007).
- **AC7** Every drag-and-drop flow operation has a keyboard-accessible alternative (FR-009).
- **AC8** Adding a screen flow creates start and stop; the user can add decisions with two or more labelled branches (including `elseif` conditions), and empty branches and loop bodies are allowed.
- **AC9** Deleting a decision or loop deletes its contents, is undoable, and is announced naming what was removed.
- **AC10** Each step, decision and loop has a swimlane property that can be changed from the properties panel and by keyboard. Changing one element's swimlane changes the rendered lane of that element only (verified with the command-line oracle), including where lanes change inside decision branches (OD-8).
- **AC11** Imported flows containing fork/join, `switch`, partitions or `detach`/`kill` are preserved, with those parts shown as locked parts (OD-6).
- **AC12** The user can add, rename, reorder and delete lanes in the flow's properties. A new element takes the lane of the element before it; moving an element keeps its lane; renaming a lane updates every element in it; deleting a lane in use asks which lane its elements move to and is undoable; the render shows lanes in list order.
- **AC13** The initial start and the final stop of the main path cannot be deleted or moved. Deleting the screen flow asks for confirmation, is undoable, and returns the project panel entry to "Add screen flow". Deleting the only lane returns the flow to having no lanes.

#### FR-013: Link flow steps to screens

**FR-013**: Users can connect steps in a screen flow to wireframes and navigate between them.

- **AC1** The user can link a step to an existing screen, change the link or remove it.
- **AC2** Linked steps are visually distinguishable from unlinked steps.
- **AC3** Activating a linked step's "Open screen" control (or its shortcut) opens the referenced wireframe, and "Back to flow" returns to the flow with the step selected.
- **AC4** Steps whose linked screen no longer exists are flagged and are not silently removed; the step's properties offer "Link to another screen", "Create screen" and "Remove link".
- **AC5** Links survive autosave and reload, and download and re-import, and are written as `:[[#<screen-id> <step label>]];`, with `[`, `]` and `|` in the label escaped so the link is kept (verified).
- **AC6** From a step's link control, the user can create a new screen named after the step (a generated name) and link the step to it in one action.

#### FR-014: Export and copy

**FR-014**: Users can share their work outside the application.

- **AC1** The user can download the whole project as a single `.puml` file.
- **AC2** The user can export the current screen or screen flow as SVG and as PNG.
- **AC3** Exported images match the rendered-output pane; PNG is a rasterisation of the same SVG at exactly 2× its natural size, whatever the viewer's screen density.
- **AC4** The user can copy the PlantUML source of the current screen or flow, or of the whole project, to the clipboard, with confirmation that it was copied.
- **AC5** Export of a block that cannot be rendered (invalid, older format, or dependent on `!include`) is prevented with an explanation; source download and copy remain available.
- **AC6** Downloading a project that contains blocks that cannot be rendered always succeeds and includes every block unchanged; a non-blocking notice lists those blocks (those the editor detects and those the renderer has reported), says how many blocks have not yet been checked by the renderer, and explains that standard PlantUML will report errors for them. Whenever the screen flow is invalid or source-only, a download shows a non-blocking notice that it will be imported as other content if the file is re-imported (OD-2).

#### FR-015: Navigate the project

**FR-015**: Users can see and move between all parts of a project.

- **AC1** The project panel lists every screen in file order, the screen flow (or "Add screen flow", with a one-line explanation, if there is none) and every block of other content, each with its status (FR-010/AC1).
- **AC2** For each screen, the project panel shows how many flow steps link to it.
- **AC3** Selecting a screen, the flow or other content opens it, and the palette, outline, properties, source view and preview switch to it.
- **AC4** Other content can be opened in the source view and reordered or deleted as a unit (undoably), but not edited visually.
- **AC5** All panels can be collapsed so that the rendered preview or the canvas fills the workspace; with panels collapsed the user can still follow links from flow steps to screens and back (supports the stakeholder walkthrough; no presentation mode, OD-11).
- **AC6** In the screen flow's rendered preview, clicking a step that links to a screen opens that screen, and "Back to flow" returns; a link to a missing screen shows the broken-link message.

#### FR-016: Provide an integrated workspace

**FR-016**: The workspace brings every editing region together.

- **AC1** The workspace contains a project panel, a component palette organised by category, a structured editing canvas, an outline, a contextual properties panel, an optional collapsible rendered-output pane labelled read-only, a source view of the open block, a project library, and visible import, download, undo, redo and autosave-status controls.
- **AC2** The palette, outline, properties panel, source view and rendered-output pane are contextual to the open screen or flow; with nothing selected, the properties panel shows the open screen's or flow's own properties.
- **AC3** A keyboard shortcut moves focus between the workspace regions (project panel, palette, canvas, outline, properties, source, preview).
- **AC4** At the minimum supported width the default arrangement places the project panel and palette/outline on the left, the canvas in the centre, properties on the right, and source and rendered output in a shared collapsible pane; panel visibility is remembered per browser.
- **AC5** The canvas presents wireframe elements as pictures of the wireframe with a Salt-like appearance: clicking selects, typing changes a value only after the user starts editing that element, and constructs Salt draws in a limited way (for example a tab bar without tab contents, a drop-down shown as an open list) are shown the same way, never as richer working widgets.
- **AC6** The canvas offers no arbitrary coordinates, free positioning or pixel-level placement.
- **AC7** The source view shows the open block's source, with syntax highlighting where practical; a read-only view of the whole project file is available for copying.
- **AC8** All interface text (labels, commands, messages, status names and screen-reader announcements) is in English and is kept separate from the code, so that it can be translated later without changing editing behaviour. Diagram content in any language is fully supported.

#### FR-017: Render locally and privately

**FR-017**: All rendering happens inside the user's browser.

- **AC1** No diagram content is sent to any server; the application can be deployed as static files.
- **AC2** The renderer is started in the background only after the editor is interactive, whether or not the preview pane is open, and never delays editing.
- **AC3** The renderer never resolves `!include`, URLs or local file references; every asset it needs is bundled with the application.
- **AC4** Rendered output is sanitised before display: scripts, event handlers and external references are removed; links within the document and embedded images are kept.
- **AC5** A render of one block that runs longer than 10 seconds is abandoned and reported as not checked, without blocking other renders; render requests are handled one at a time.
- **AC6** The renderer can be replaced or upgraded without changing editing behaviour.
- **AC7** The minimum supported version of standard PlantUML tooling is the version of the pinned in-browser renderer; the command-line tool at that version is the second test oracle for all rendering criteria.
- **AC8** After loading, the application makes no network requests other than fetching its own application and renderer files: no usage analytics, no error or crash reporting and no third-party requests. Errors are shown only to the user.

#### FR-018: Work offline

**FR-018**: Work offline.

- **AC1** After the first successful online visit, the application and all renderer files are kept available locally, so the application, including the preview and image export, works offline, including after a reload or browser restart.

#### FR-019: Detect unsupported browsers

**FR-019**: Detect unsupported browsers.

- **AC1** In a browser other than the latest two major versions of Chromium-based desktop browsers (Google Chrome and Microsoft Edge), the application says that the browser is not supported rather than failing silently.

#### FR-020: Preserve source fidelity

**FR-020**: The source fidelity policy (section 4.1) applies equally to screens and the screen flow.

- **AC1** A visual edit rewrites only the source of the element(s) it changes; comments, whitespace, blank lines, ordering, formatting elsewhere and text between or around blocks are preserved byte-for-byte.
- **AC2** The file's encoding, byte-order mark, line endings and presence or absence of a final newline are preserved.
- **AC3** Whitespace inside quoted text is preserved (it sets field width).
- **AC4** A full-line comment immediately before an element moves and is deleted with that element, undoably, and a deletion announcement mentions it; other comments stay where they are (A-3).
- **AC5** Newly created elements are written in a consistent, readable house style.
- **AC6** Invalid source text is never replaced or discarded unless the user explicitly asks.

### Business Rules

Section numbers match [product-spec.md](../../product-spec.md).

#### 3.2 Structured layout rules

**Grid model.** Salt has one layout construct, the grid. The editor presents one Grid concept (rows × columns, column spans and empty cells) and presets that are preconfigured grids: Grid (choose rows and columns), Row (1 × N), Column (N × 1), Form (N × 2 of label and field), Button bar (1 × N buttons), Table (table lines, first row as header) and group boxes, borders and line styles as container modifiers.

- **Cells.** A grid cell holds exactly one element. An empty cell is written as `.`, the only Salt form that keeps its position.
- **Insertion point.** Choosing a palette item (click or Enter) inserts:
  - after the selected element, in the same container: along the axis in a single-row or single-column grid; a 1 × 1 grid grows down, except one whose only element is a button, which grows across; in a multi-row and multi-column grid, as a new full-width row below, with the new element in the selected element's column and empty cells elsewhere;
  - into the selected cell, if an empty cell is selected;
  - as the last child, if a container is selected (in a multi-row and multi-column grid, a new full-width row at the bottom with the new element in the first column and empty cells elsewhere);
  - at the end of the screen's root grid, if nothing is selected.
  An occupied cell is never an insertion target. While dragging, only valid targets are offered.
- **Removal.** Removing from a single-row or single-column grid closes the gap; removing from a multi-row and multi-column grid leaves an empty cell. The cell an element is moved out of follows the same rule. Empty rows and columns are removed explicitly.
- **Keyboard move.** The move shortcut (for example Alt+Arrow) moves one position: along the axis in a single-row or single-column grid, or by swapping with the neighbouring cell (empty or occupied) in a multi-row and multi-column grid. At the container edge nothing moves and the user is told to use "Move to…". "Move to…" lists, for each valid container, its empty cells and "at the end", and for single-row or single-column containers "before" or "after" each element.
- **Rows and columns.** Inserting a row or column adds it across the grid. Deleting a row or column with content is allowed, undoable and announced.
- **Ragged rows** are valid; rows the user did not edit are never padded or normalised; editing a missing cell adds cells to that row only.
- **Spans.** A column span is a property of a cell, never offered on the first cell of a row (no row spans exist). It extends only over empty cells to its right; the property explains what limits it (for example "Span limited by 'Password' in column 3"). Deleting the column a span starts from turns the rest of the span into empty cells; a column inserted inside a span extends it (other rows get an empty cell). A span stays with its cell when moved, reduced to fit.
- **Container style.** A container has exactly one style: plain, border, table lines, vertical lines, horizontal lines, or group box with title. Combinations are made by wrapping, which adds a visible parent in the outline.
- **Presets** insert at a default size with recognisable placeholder content (a Form of two "Label" and text-field rows, a Button bar of "Button 1" and "Button 2", a Table with a header row "Column 1", "Column 2"); placeholder text follows the same escaping rules as user text; only Grid asks for rows and columns and inserts empty cells.

**Selection and hierarchy.** Clicking selects the innermost element; "Select parent" selects the container. A breadcrumb shows the selection path (for example "Screen › Form › Row 2 › Button"), each part selectable. The selected element's container and a container under the pointer are outlined; empty cells are always lightly visible and selectable; "Show layout guides" shows every cell boundary. The outline follows and expands to the selection. Selection is single-element.

**Keys** (one meaning per key, on the canvas and in the outline, for screens and the flow):

- **Esc** first cancels the innermost temporary state (an inline edit, restoring the text; a drag, returning the element; an open menu or dialog); otherwise it selects the parent.
- **Enter** on a container moves into it (a grid; a decision, to its first branch; a branch; a loop, to its body). On any other element it starts editing its text in place; while editing it commits. **F2** always starts editing, including a decision's condition or a loop's labels.
- In the outline (accessible tree pattern), selection follows focus: arrows move and select, Right and Left expand and collapse; Enter, Esc and F2 as above. In the palette, Enter inserts the focused item.
- A linked step's "Open screen" control has its own shortcut (for example Ctrl+Enter).
- In the source view, Esc (after closing any editor pop-up) moves focus to the canvas selection and ends the source edit; for a block with no visual canvas, to the canvas region's status message. The source view never traps focus.
- In the flow, the move shortcut moves along the path (Up or Down); at the start or end of a branch or loop body nothing moves and the user is told to use "Move to…"; it never moves elements sideways between branches.
- Shortcuts avoid combinations reserved by supported browsers (for example Alt+Left and Alt+Right) and common screen readers.

**Grid labels** (fixed precedence, so files reopen with the same labels without metadata): (1) any grid with table lines is a "Table"; (2) a one-row grid whose cells are all buttons is a "Button bar"; (3) a two-column grid where at least one row has text in the first column and a control in the second, and no row breaks that pattern other than with empty cells, is a "Form"; (4) a one-row grid is a "Row", a one-column grid a "Column"; (5) otherwise "Grid". Labels describe shape and content and may change when the shape changes.

**Structural commands.** Every structural command (insert, delete, move to, wrap, unwrap, select parent, insert or delete row or column, open linked screen) is available as a visible, pointer-operable control for the current selection, showing its shortcut. Drag-and-drop is never the only pointer method.

#### 3.3 Palette

Categories: **Basic elements** (text and labels; horizontal separators; spacing as an empty cell); **Form controls** (text fields; multiline text areas as a preset bordered grid of text lines; buttons; checkboxes; radio buttons, each set independently because Salt has no grouping; drop-down lists); **Layout elements** (the grid presets above); **Data presentation** (tables; trees); **Navigation and advanced** (tab bars, drawn as the bar of tab names only, each tab's contents modelled as separate screens; menu bars; scrollable areas). Every palette item corresponds to a supported construct, and its description states any material limit of how Salt draws it. Components that cannot be faithfully represented in Salt are deferred or given an explicit limitation; no incompatible syntax is invented.

#### 3.4 Properties and text

- Properties, where the construct supports them: display label or text; initial value and field width; checked or selected state (checkboxes, radio buttons, the selected tab); drop-down options and open/closed form; table headers and representative rows (as cells); tree items and depth; tab and menu items and order; a grid's rows, columns and container style; a cell's column span; membership (via outline and breadcrumb).
- No setting is exposed that cannot be represented in the generated source; in particular there is no placeholder style and no enabled/disabled state.
- **Text is literal.** Text appears in the canvas and render exactly as typed and re-imports as the same text. Escaping is applied only where Salt or activity syntax would otherwise interpret the text: a whole cell that is `.`, `...` or a separator; text starting with `*`, `[`, `(`, `^`, `"` or `==`; any `{`, `}` or `|`; creole pairs `**`, `//`, `__`, `""`, `--`, `~~`; the first cell of a row beginning with a PlantUML command word (for example `title`, `header`, `footer`, `caption`, `legend`, `mainframe`, `skinparam`, `scale`), which PlantUML would otherwise silently remove; and `[`, `]` or `|` in a linked step's label. Ordinary text such as `a.b` or `5 * 3` is written unchanged. Users never see or type escapes outside the source view. Each escape is verified to render without visible escape characters.
- Labels do not support formatting, except the selected tab, which the editor marks using Salt's convention (OD-7).
- **Imported formatted text** (source that differs from the editor's own escaped form of the displayed text) is preserved exactly until edited; when edited the user chooses "Keep formatting" (markup visible; markers written as typed, but `{`, `}`, `|` and characters that would change the element's type still escaped) or "Remove formatting" (text becomes literal; undoable).

#### 3.6 Storage, files and names

- **Storage model.** Projects are stored in the browser, not as files on disk; files are used only for exchange (download and import). There is no save-to-file or save-in-place. The stored form is the project's `.puml` source plus minimal metadata (name, timestamps, which block is the screen flow, last working version of each block), so storage introduces no proprietary format. The last working version is not part of downloads.
- **New projects.** An empty library offers "Create project" and "Import .puml file". A new project is named "Untitled project" (A-9), contains one empty screen (a one-column root grid) and opens on it. A screen flow is added with "Add screen flow", shown in the project panel with a one-line explanation (OD-12). A project always has at least one block.
- **Autosave.** No manual save step. Commit within 2 seconds (A-1); pending writes are flushed when the page is hidden or closed; a write either completes or leaves the previous stored version intact. Status is visible ("All changes saved", "Saving…"). Storage failures are reported within 1 second, prominently and non-blocking; the application retries and, while writes fail, offers "Download a backup". Source is stored exactly as typed, including invalid source.
- **One editing tab per project** (A-2): further tabs are read-only with "Edit here instead", which flushes the first tab's pending writes, loads the latest stored version and moves editing; read-only tabs show the version stored when they were opened and do not update until reloaded. Undo history is not carried over: both tabs' histories are empty after the handover, and the prompt says so.
- **Protecting against storage loss.** Request persistent storage and, if refused, say so once with a non-blocking notice; show per project when it was last downloaded and whether it has changes since (only a `.puml` download counts; duplicates and imports start "never downloaded"); a persistent "not downloaded" indicator and one non-blocking reminder per session (A-5); warn in private windows where detectable; state that projects are not synchronised between browsers or devices.
- **Project names** (A-4) need not be unique. Imports are named after the file, with the import date appended if the name is already in the library; duplicates are named "Copy of …"; the downloaded file is named after the project.
- **Import.** Accepts UTF-8 text with or without a byte-order mark; classifies every block without waiting for the renderer; chooses the screen flow as in FR-006/AC14; creates a project with only other content (and an explanatory status) if there is no screen or flow, or one new screen if the file is empty; opens as in FR-006/AC17; shows one "Convert all" notice for older-format Salt; does nothing if the picker is cancelled. Once a block is the screen flow it remains so after edits and reloads; re-importing a downloaded file applies the import rules afresh.
- **Project file format.** One named Salt block per screen, `@startsalt <screen-id>` … `@endsalt`; at most one screen-flow block, written by the editor as `@startuml <flow-id>` … `@enduml` (default name "Screen-flow", A-10); a linked step is written `:[[#<screen-id> <step label>]];` and an unlinked step `:<step label>;`. A file with a single `@startsalt` block is a valid single-screen project.
- **Block placement.** A new screen is written after the last screen block, or at the end of the file if there is none; a duplicated screen is written directly after the original; a new screen flow is written at the end of the file. Reordering screens exchanges the file positions of screen blocks only, and reordering other content exchanges the file positions of other-content blocks only: all other blocks and text between blocks stay where they are, except comment lines directly above a moved block with no blank line between, which move with that block. The project panel's order of screens, and of other content, therefore always equals file order.
- **Block names** (OD-3). A screen's identifier is its displayed name; the same rules apply to the flow's name. A name consists of letters (including non-English letters), combining marks, decimal digits, `-` and `_`, starts with a letter, and has at most 64 characters (A-8); names the editor writes are in Unicode NFC, and shortening never splits a letter from its combining marks. Names are unique across all named blocks, compared after NFC normalisation and locale-independent case folding.
  - **Typed names**: not altered while typing; a preview shows "Will be saved as …". On commit: spaces become `-`, disallowed characters are removed, leading non-letters are removed, repeated `-` reduced to one, leading and trailing `-` removed, cut to 64 characters. Empty results keep the previous name with a message; duplicates are refused with a message naming the other block.
  - **Generated names** are never refused: new screens "Screen-n" (lowest unused n); a screen from a step label uses the converted label, or "Screen-n" if empty; a duplicate is `Copy-of-<name>` (or "Screen-n" if the original has no name); collisions get "-2", "-3", …; results including suffix are at most 64 characters.
  - **Imported names**: an unnamed block keeps no name (shown as "Untitled screen n") until renamed or first linked; names that are not allowed, not in NFC or duplicated are flagged, not changed.
  - **Link matching**: a link target matches a screen when identical after NFC normalisation; a case-only difference is a broken link with a suggested fix.

#### 3.7 Screen flow rules

- The flow is presented as structured blocks (steps, decision branches, loops) arranged top to bottom with simple connectors; free-form node-and-arrow drawing is not supported. Lane columns appear only in the rendered preview.
- **Elements**: start and stop (added automatically; the initial start and final stop of the main path cannot be deleted or moved; `stop`, or an imported `end`, is also allowed at the end of a branch); steps, optionally linked to one screen (a screen may be linked from many steps; only steps can be linked); decisions with labelled branches including `elseif`; loops (`repeat`, `while`); swimlanes; notes.
- **Notes** are attached to the element they follow: a step, decision, loop or start, or the beginning of a branch or loop body (PlantUML draws a note beside whatever precedes it). A note has text and a side (left or right); an element can carry several notes, kept in order (PlantUML draws them all). A note is added with "Add note" and edited from its element's properties, shown beside that element on the canvas, and moves and is deleted with that element, undoably. A note is never a separate element on the path.
- **Insertion point**: after the selected element on its path; as the first element of a selected branch or loop body (empty ones are selectable slots); at the end of the main path before the final stop if nothing is selected. Insertion points between elements are offered while dragging. The new element is selected and focused.
- A decision has at least two branches; removing a branch, decision or loop deletes its contents undoably, and the announcement names what was removed.
- **Swimlanes** (OD-8): lanes are a list in the flow's properties (add, rename, reorder, delete). Each step, decision and loop has a lane, shown as a labelled marker; a new element takes the lane of the element before it; moving keeps its lane; adding the first lane places every element in it; a flow with no lanes writes no lane switches. Because a lane switch in source applies to every following statement, including across branches, the editor writes switches so that changing one element's lane never changes another element's rendered lane.
- **Screens and links**: create, rename, duplicate, reorder and delete screens; link, change or remove a step's link; create a screen from a step's link control; open a linked screen and return; see which steps reference a screen; be warned before deleting or renaming a referenced screen (except source-view renames, OD-4); identify steps whose screen no longer exists.

#### 4. Source categories

1. Valid source that the visual editor fully supports.
2. Valid source containing unsupported constructs.
3. Invalid or incomplete source.
4. Source that is valid but cannot currently be rendered.

Categories 1 to 3 for screens and the flow are decided by the editor's own grammar, synchronously and without the renderer, because PlantUML silently renders some malformed Salt, crashes on other input without a line, and reports some failing input as valid. The grammar recognises the full structure of Salt and activity blocks; well-formed structure containing constructs outside the supported subset is category 2; only structurally malformed source is category 3. Blocks whose structure cannot be analysed (source-only blocks and other content) are checked only for block boundaries and dependence on external resources; their validity is reported by the renderer ("Cannot be rendered" with its message). Category 4 is a separate renderer signal; dependence on `!include` or other external resources is detected without rendering.

#### 4.1 Source fidelity policy

- Source is authoritative; the visual model is derived from it; edits are minimal (FR-020). Inserting or deleting a grid column changes only the affected cell in each row, and the continuation cells of an affected span. Opening and downloading without edits produces an identical file.
- **Locked parts.** Valid unsupported content is shown as a labelled, locked placeholder at the smallest unit that can be isolated (a cell, row or nested container in Salt; a statement or complete block, such as a whole `fork` … `end fork`, in activity source), stating the reason and showing a source excerpt. It can be selected, moved and deleted as a unit; its text is preserved exactly and changed only in source; content around it remains editable.
- **Source-only.** If unsupported content cannot be isolated, the block opens source-only with an explanation. This applies to: preprocessor directives anywhere in the block; Salt with more than one root grid or text after the root grid (the explanation says which content will not appear in the image); a container with more than one style modifier; activity source in the legacy syntax or using `goto`/`label`.
- **Invalid source.** Only the affected block is locked: its canvas shows the last working version read-only with a plain-language message and line; other blocks stay editable; the user can fix the source or revert with one action; the last working version is stored and survives reload. A never-valid block shows "Error" in the source view with no revert action; it may still be previewed, labelled as not checked by the editor.
- **Other content.** Other diagram types, Salt embedded in other diagrams and preprocessor-dependent content are kept exactly as written, listed in the project panel as other content, edited only in source, and included unchanged in downloads and copies. Salt written as `salt` inside `@startuml` is other content with status "Older format"; the explicit, undoable "Convert to current format" (per block or "Convert all") replaces `@startuml [name]` with `@startsalt [name]`, `@enduml` with `@endsalt`, removes the `salt` line and changes nothing else (OD-5). The editor never converts automatically and writes Salt only as `@startsalt`.

#### 4.2 Editing source alongside the visual editor

- Source editing is per block; text between blocks is shown only in the read-only whole-file view and always preserved.
- **Starting**: typing in a block's source starts a source edit; while the source view has focus, that block's canvas is read-only.
- **While typing**: on a pause (300 ms without a keystroke) the block is re-parsed and classified; if supported, the canvas updates (read-only) and keeps the selection on the element at the same structural position or its nearest surviving container; otherwise the canvas shows the last working version with the message.
- **Preview**: every block is rendered except one that is invalid under the editor's grammar or depends on `!include`, for which the last render is kept, marked out of date. A block with no previous render may be rendered, labelled as not checked by the editor.
- **Block boundaries are fixed during the edit**: adding or deleting block start/end lines makes the block invalid; it is not re-divided while typing. On leaving the source view, if the text forms more or fewer than one block, it is re-divided once, as one undoable step, with a report. New blocks are classified and named as on import; if the flow's source is re-divided, the block that keeps the flow's name (else the first resulting activity block) stays the flow. If re-division would remove a screen that steps link to, the user is warned; cancelling keeps the text and leaves the block invalid.
- **Renaming in source** (OD-4): handled on leaving the source view, never confirmed, never rewrites the typed name. An allowed, unique name updates links in the same undo step with a notice ("Updated 3 steps"); otherwise the screen is flagged, links keep the previous name and show as broken, and a notice with "Undo" states cause and effect.
- **Leaving**: moving focus elsewhere ends the edit; the block is parsed immediately, the typing becomes one undo step, and the canvas becomes editable if the source is valid. Leaving never changes the typed text. "Fix in source" focuses the source view on the problem line.
- **Selection mapping**: selecting an element highlights its source; placing the cursor in the source selects the corresponding element on leaving or pausing. A visual edit while the source view is visible but unfocused updates the source and briefly highlights the changed lines without moving the scroll position.

### Supported Constructs

Verified against PlantUML 1.2026.8 (command line) unless marked "reasoned". The in-browser renderer must be checked by the feasibility spike.

**A.1 Salt (screens)**

| Construct | Salt form | Editable properties | Limits and notes |
| --------- | --------- | ------------------- | ---------------- |
| Screen | `@startsalt <id>` … `@endsalt` containing one root grid | Name | `salt` inside `@startuml` does not render in current PlantUML (other content). Only one root grid; anything after it is ignored by PlantUML (source-only). |
| Grid | `{` … `}` rows of cells separated by `\|` | Rows, columns, style | Rows may have different lengths. An empty grid renders. |
| Container style | `{+` border, `{#` table lines, `{!` vertical lines, `{-` horizontal lines, `{^"Title"` group box | Style, group title | One style per container; combinations silently mis-render, so they are made by nesting. |
| Empty cell | `.` | — | The only form that keeps a cell's position; a blank cell (`\| \|`) collapses. |
| Column span | `*` in the following cell | Span | Never in the first column (PlantUML fails). No row spans. |
| Nested grid | `{` … `}` inside a cell, on one line or several | As grid | Both forms render. |
| Text | plain text | Text | Escaped only where it would otherwise be interpreted. |
| Button | `[Label]` | Label | |
| Text field | `"value   "` | Value, width | Width is set by the quoted text including trailing spaces. No placeholder or disabled state. |
| Checkbox | `[X] Label` / `[ ] Label` | Label, checked | |
| Radio button | `(X) Label` / `( ) Label` | Label, selected | No grouping. |
| Drop-down | `^Value^` (closed); `^Value^^Option 1^^Option 2^` (open list) | Value, options, open/closed | Options are visible, and stored, only as an open list. |
| Separator | `..`, `==`, `~~`, `--` as a whole row | Kind | |
| Tree | `{T` with `+` depth markers | Items, depth | Tree-table variants (`{T#`, `{T!`, `{T-`, `{T+`) are preserved as locked parts. |
| Tab bar | `{/ Tab 1 \| Tab 2 }` | Tabs, order, selected tab | Bar only, no tab contents. Selected tab shown in bold by convention. |
| Menu bar | `{*` first row | Items, order | Open menus (later rows) preserved as locked parts. |
| Scrollable area | `{S` | Contents | Variants `{SI`, `{S-` preserved as locked parts. |
| Comment | full line starting `'`, or `/'` … `'/` | — | Not rendered; preserved. |
| Preprocessor | `!define`, `!$var`, `!procedure`, `!include`, `!theme` | — | Forces source-only; `!include` makes the block unrenderable. |
| Icons and images | `<&icon>`, `<img:…>` | — | Preserved as text; rendering depends on bundled assets (reasoned; confirm in spike). |

**A.2 Activity (screen flow)**

| Construct | Form | Editable properties | Limits and notes |
| --------- | ---- | ------------------- | ---------------- |
| Flow block | `@startuml <id>` … `@enduml` | Name | The first activity block in the current syntax that is fully supported or has only isolatable locked parts is the flow; which block is the flow is stored with the project. |
| Start / end | `start`, `stop`, `end` | — | `stop` and `end` allowed at the end of a branch; the palette offers `stop`; `end` is preserved when imported. |
| Step | `:Label;` | Label, lane | |
| Linked step | `:[[#<screen-id> Label]];` | Label, linked screen, lane | A space ends the link target, so names have no spaces. `[`, `]` and `\|` in the label are escaped. |
| Decision | `if (…) then (…)` … `elseif (…) then (…)` … `else (…)` … `endif` | Condition, branch labels, lane | Empty branches valid. |
| Loop | `repeat` … `repeat while (…)`; `while (…)` … `endwhile` | Condition, labels, lane | Empty bodies valid. |
| Swimlane | `\|Lane\|` | (element property) | A lane switch applies to all following statements, including across branches; the editor writes switches so each element's lane is as shown. |
| Note | `note left` / `note right`, single line or ending with `end note` | Text, side | Drawn beside the statement before it (verified after a step, `start`, `endif`, and first in a branch or loop body); attached to that element. |
| Fork, switch, partition, detach/kill | as PlantUML | — | Preserved as locked parts (OD-6). |
| Salt inside a step | `{{salt` … `}}` | — | Locked part. |
| Legacy syntax, goto/label | `(*) -->`, `goto`, `label` | — | Block opens source-only and is not chosen as the flow on import. |

### Key Entities *(include if feature involves data)*

- **Project**: a named collection of blocks kept in the browser; has a name (not necessarily unique), last-modified time, last-downloaded time (or "never downloaded"), a "changes not downloaded" flag, which block is the screen flow, and the last working version of each block. Exchanged as one `.puml` file whose text is the project's source.
- **Block**: one diagram in the project file, in file order, with its exact source text, an optional name, a source category (1–4), a status (Editable, Has locked parts, Source only, Error, Older format, Cannot be rendered) and a render status ("Not yet checked" until rendered). A block is a screen, the screen flow or other content.
- **Screen**: a block holding one Salt root grid; its name is its identifier and displayed name. Referenced by zero or more steps.
- **Screen flow**: at most one per project; an activity block containing a main path of elements, a list of lanes, and links to screens.
- **Grid / cell / component**: the screen's structure. A grid has rows of cells, a single container style and an optional group title; a cell holds exactly one element (a component, a nested grid, an empty cell or a locked part) and may carry a column span. Components are the palette constructs with their properties.
- **Flow element**: start, stop/end, step (label, lane, optional link to one screen), decision (condition, two or more labelled branches, lane), loop (kind, condition/labels, body, lane). Branches and loop bodies are ordered paths and may be empty.
- **Note**: text and side (left or right), attached to the flow element it follows or to the beginning of a branch or loop body; it has no position of its own on the path. An element can carry several notes, in order.
- **Lane**: a named entry in the flow's ordered lane list; each step, decision and loop belongs to one lane when lanes exist.
- **Link**: the reference from a step to a screen name; can be valid, broken (no matching screen, or case-only mismatch) or ambiguous (duplicate imported names).
- **Locked part**: a preserved, uneditable fragment of a screen or flow, with its exact text and the reason it is unsupported.
- **Last working version**: the most recent parseable source of a block, stored with the project metadata and not downloaded.
- **Undo history**: per project, per session; ordered named entries (at least the 200 most recent are kept), each restoring structure, properties and source together.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (Usability): In a task-based test with at least 5 business analysts or product owners with no PlantUML knowledge, at least 4 of 5 participants, unaided and without writing source, complete within 15 minutes both: (1) building the reference login form (a "Sign in" group box containing a form with "Username" and "Password" text fields, a "Remember me" checkbox, and a button bar with "Sign in" and "Cancel"); and (2) creating a three-screen project with a screen flow containing one decision, and downloading it.
- **SC-002** (Hierarchy comprehension): In the same sessions, at least 4 of 5 participants identify, without help, which container a selected field belongs to and select it (A-7).
- **SC-003** (Accessibility): Both SC-001 tasks can be completed using only a keyboard and with a screen reader; the editor interface conforms to WCAG 2.2 level AA (rendered diagram images excluded) (OD-10).
- **SC-004** (Correctness): 100% of blocks the editor generates in the test corpus render without error, with no content silently dropped, in both the in-browser renderer and the PlantUML command-line tool at the minimum supported version.
- **SC-005** (Fidelity): 100% of test-corpus files round-trip byte-identically when opened and downloaded without edits, and after a visual edit only the edited element's source text differs.
- **SC-006** (Responsiveness): Measured on the reference project (10 screens of about 50 components each, plus a screen flow of about 30 steps with decisions and swimlanes) on a mid-range laptop (a recent four-core CPU, 8 GB memory, supported browser): canvas feedback for select, insert, move and property change ≤ 100 ms; source view updated after a visual edit ≤ 200 ms; visual model updated ≤ 500 ms after the user pauses typing in the source (a pause being 300 ms without a keystroke); rendered preview updated (renderer loaded) ≤ 3 s.
- **SC-007** (Durability): Every edit is committed to browser storage within 2 seconds; after a crash no more than the last 2 seconds of edits are lost; storage failures are reported within 1 second; no test scenario of parsing, editing, rendering or storage failure results in loss of user-authored content.
- **SC-008** (Privacy and offline): During any editing, rendering or export session, zero diagram content is sent over the network, and the only network requests made are for the application's own files; after one online visit, all features including preview and image export work with the network disconnected, including after a browser restart.
- **SC-009** (Traceability): Every decision branch in the flow diagrams and every transition in the block state diagram maps to at least one acceptance criterion, and every error, warning or recovery criterion appears on at least one diagram.

## Assumptions

Working assumptions, not approved decisions; each can change without restructuring this specification.

- **A-1**: Autosave commits within 2 seconds; storage-failure reporting within 1 second.
- **A-2**: One editing tab per project, with "Edit here instead".
- **A-3**: A full-line comment immediately before an element moves and is deleted with it.
- **A-4**: Project names need not be unique; imports on a name clash append the date.
- **A-5**: Backup reminder: a persistent indicator plus one non-blocking reminder per session.
- **A-6**: Radio buttons are set independently, because Salt has no grouping.
- **A-7**: The reference login form definition, the container-identification question and its threshold (at least 4 of 5), and the definition of "mid-range laptop".
- **A-8**: Maximum block-name length is 64 characters.
- **A-9**: A new project is named "Untitled project".
- **A-10**: The screen flow's default name is "Screen-flow".
- Target users work on desktop or touchscreen laptops at 1024 px wide or more, in the latest two major versions of Chrome or Edge; other browsers are out of scope.
- No largest supported project size is set; the reference project is the tested size (OD-14).

### Dependencies

- **Renderer feasibility gate** (OD-1). The candidate is the official in-browser PlantUML build, pinned to a version no earlier than 1.2026.9 (the first with Salt support, per its documentation) and served with the application. Before implementation planning is approved, a spike must confirm that the candidate: (1) renders the shared test corpus, including non-English names and the escaping cases, with the same success or failure per block as the command-line tool at the same version; (2) has its download size and initialisation time recorded, and meets the preview target per block of the reference project; (3) runs with all assets bundled and all network, file and include loading disabled; (4) renders without blocking editing, with requests handled one at a time; (5) reports failures in an identifiable way; (6) can have all its files, including on-demand ones, kept for offline use. If it fails, the renderer decision is revisited before planning continues.
- **Syntax verification**. The supported constructs were verified on the command line at 1.2026.8; the corpus must be re-run on the command-line tool at the pinned version and on the in-browser build, and the escape table confirmed against the corpus.
- **Representative examples** ([setup.md](../../setup.md)) must include forms, tables, nested layouts, navigation, a multi-screen project with a decision flow, and the performance reference project.
- **Constitution** principle 3 was amended on 2026-10-26 to read "content the editor generates always renders" (OD-2).
- **Parsing approach**. The implementation plan must select a parsing strategy and source representation capable of meeting the source fidelity policy (section 4.1).

### Confirmed product decisions

Confirmed by the product owner on 2026-10-26; full rationale and alternatives in [product-spec.md](../../product-spec.md) section 9.3.

| ID | Decision |
| -- | -------- |
| OD-1 | Renderer candidate: official in-browser PlantUML build, pinned (≥ 1.2026.9), self-hosted. |
| OD-2 | Downloads always include every block; blocks that cannot be rendered are listed in a non-blocking notice. |
| OD-3 | A screen's name is its identifier; non-English letters allowed; spaces become `-` on commit; unique ignoring case. |
| OD-4 | Renames from the project panel or properties of a referenced screen are confirmed; source-view renames are not, and are reported with an undoable notice. |
| OD-5 | Older-format Salt can be converted by an explicit, undoable action, per block or for all. |
| OD-6 | Trees, scrollable areas, tab and menu bars (static) and `elseif` included; fork/join, `switch`, partitions, `detach`/`kill` preserved as locked parts. |
| OD-7 | All text literal; selected tab marked by the editor; imported formatting preserved with keep/remove choice. |
| OD-8 | Lane is a per-element property shown as a marker; lane columns only in the preview. |
| OD-9 | Required diagrams delivered as `.puml` files with this specification. |
| OD-10 | WCAG 2.2 AA for the editor interface. |
| OD-11 | Stakeholder walkthrough via flow-to-screen navigation with collapsible panels; no presentation mode. |
| OD-12 | New projects have no screen flow until the user adds one. |
| OD-13 | Touch supported on touchscreen devices with a supported browser, using taps and visible commands. |
| OD-14 | No largest project size; the reference project is the tested size. |
| OD-15 | Duplicating a screen is in scope. |
| OD-16 | Review clarifications inside decision sections accepted. |

## Out of Scope

Moving any item into scope requires a product-owner decision.

- Freeform pixel-positioned canvas editing; high-fidelity visual design and styling.
- Production application code generation; interactive prototypes with working business logic.
- Collaborative real-time editing; cloud project management and user accounts.
- Server-side rendering, or sending diagram content to any remote service.
- Full support for every PlantUML diagram type (activity diagrams only as screen flows, within the supported subset); free-form node-and-arrow flowcharts.
- More than one screen flow per project; projects split across multiple files or folders.
- Copying, pasting and duplicating individual components, grids or flow steps (duplicating projects and screens is in scope).
- Selecting several elements at once.
- Starter templates; named version snapshots; persisting undo history across reloads.
- Browsers other than Chromium-based desktop browsers.
- Interface languages other than English (diagram content in any language is supported).
- Automatic conversion of UI screenshots into Salt; guaranteed visual editing of every Salt construct.
- Label formatting beyond the selected tab (OD-7).
- Visual editing of fork/join, `switch`, partitions and `detach`/`kill` (OD-6).
- A dedicated presentation mode (OD-11).
- Automatic conversion of unsupported content (other than the explicit older-format conversion).

Possible later enhancements (not committed): an import summary dialog; removing all unsupported parts from a screen; a keyboard "pick up and drop" move mode; a "focus on this container" view; a presentation mode.

## Diagrams and Traceability

The UI flow diagrams and block state diagram required by [setup.md](../../setup.md) are stored as PlantUML source in [diagrams/](diagrams/). Each was rendered without errors with the PlantUML command-line tool 1.2026.8 on 2026-10-26. Swimlanes show who acts: User, Editor, Parser, Renderer and Storage.

### Insert and arrange components — [insert-and-arrange.puml](diagrams/insert-and-arrange.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Valid insertion point: yes | FR-002/AC2, FR-009/AC8, FR-009/AC9 |
| Valid insertion point: no | FR-002/AC7, FR-008/AC3 |
| Move: valid destination | FR-002/AC3, FR-002/AC4, FR-002/AC13, FR-009/AC2, FR-009/AC8 |
| Move: invalid destination | FR-008/AC3 |

### Edit source directly — [edit-source.puml](diagrams/edit-source.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Fully supported | FR-004/AC2, FR-004/AC9 |
| Unsupported parts that can be isolated | FR-010/AC2 |
| Valid but cannot be isolated | FR-010/AC3, FR-008/AC8 |
| Invalid or incomplete | FR-004/AC4 |
| Source can be rendered: no | FR-004/AC3, FR-005/AC6 |
| Render succeeds / fails | FR-005/AC1, FR-005/AC3, FR-005/AC6 |
| Revert | FR-010/AC4, FR-007/AC10 |
| Leave or keep typing | FR-004/AC5, FR-004/AC8, FR-006/AC15 |

### Navigate between the flow and screens — [navigate-flow-screens.puml](diagrams/navigate-flow-screens.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Linked, screen exists | FR-013/AC3, FR-015/AC6 |
| Linked, screen missing | FR-013/AC4, FR-015/AC6 |
| Not linked | FR-013/AC1, FR-013/AC6 |

### Block sync states — [block-sync-states.puml](diagrams/block-sync-states.puml)

A block is one screen or the screen flow. "Render failed" and "Storage failed" can occur together with other states.

| Transition | Acceptance criteria |
| ---------- | ------------------- |
| Opened: fully supported / locked parts / source-only | FR-006/AC6, FR-010/AC1, FR-010/AC2, FR-010/AC3, FR-010/AC10 |
| Opened or reopened with invalid source (including never valid) | FR-006/AC15, FR-010/AC8 |
| Visual edit; visual edit around locked parts | FR-004/AC1, FR-010/AC2 |
| User types in source | FR-004/AC8 |
| Pauses: fully supported | FR-004/AC2, FR-004/AC9 |
| Pauses: unsupported parts isolated | FR-010/AC2 |
| Pauses: cannot be isolated | FR-010/AC3 |
| Pauses: invalid | FR-004/AC4 |
| Revert to last working version | FR-010/AC4, FR-006/AC15 |
| Delete the last locked part | FR-010/AC2, FR-007/AC10 |
| Undo or redo restores invalid source | FR-007/AC12, FR-004/AC4 |
| Render fails / later render succeeds | FR-005/AC3, FR-005/AC4, FR-005/AC6, FR-010/AC9 |
| Autosave fails / retry succeeds | FR-006/AC7 |

### Create a new wireframe — [create-wireframe.puml](diagrams/create-wireframe.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Start from: empty library, Create project | FR-001/AC1 |
| Start from: open project, Add screen | FR-001/AC6, FR-011/AC13 |
| Empty-screen prompt and first insert | FR-001/AC7, FR-001/AC2, FR-002/AC2 |
| Change properties; update canvas and source | FR-001/AC3, FR-001/AC4, FR-003/AC2 |
| Render succeeds | FR-001/AC5, FR-005/AC1 |
| Render fails | FR-005/AC3, FR-005/AC6 |
| Share: download project | FR-014/AC1, FR-006/AC8 |
| Share: export image | FR-014/AC2 |
| Share: not yet (autosave) | FR-006/AC1 |

### Edit component properties — [edit-properties.puml](diagrams/edit-properties.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Properties panel | FR-003/AC1, FR-003/AC5 |
| Edit in place (Enter, F2, double-click) | FR-003/AC9 |
| Esc cancels in-place edit | FR-003/AC9, FR-009/AC12 |
| Space toggles checkbox or radio button | FR-003/AC9 |
| Imported formatted text: Keep / Remove formatting | FR-003/AC11 |
| Change can be written: yes | FR-003/AC2, FR-003/AC8 |
| Drop-down with options set to closed | FR-003/AC10 |
| Change can be written: no | FR-003/AC4, FR-003/AC7, FR-008/AC3 |

### Render preview — [render-preview.puml](diagrams/render-preview.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Open without waiting; background start | FR-005/AC8, FR-017/AC2 |
| "Not yet checked" until rendered | FR-010/AC1 |
| Block can be rendered: no | FR-004/AC3, FR-005/AC6 |
| Within 10 seconds: no | FR-017/AC5 |
| Render succeeded | FR-005/AC1, FR-005/AC2 |
| Render failed | FR-005/AC3, FR-005/AC4, FR-005/AC5, FR-005/AC6 |
| Loop: open block first, editing continues | FR-005/AC7, FR-005/AC8 |

### Import a file — [import-file.puml](diagrams/import-file.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| File chosen: no | FR-006/AC13 |
| UTF-8 text: no | FR-006/AC13 |
| Classify without waiting for the renderer | FR-006/AC6 |
| Screen: Editable / Has locked parts / Source only | FR-010/AC1, FR-010/AC2, FR-010/AC3, FR-010/AC10 |
| Screen: Error (never valid) | FR-010/AC8 |
| Salt in the older form | FR-010/AC7 |
| First supported activity block becomes the flow | FR-006/AC14 |
| Anything else: other content | FR-006/AC14, FR-015/AC4 |
| Block name: none | FR-011/AC10 |
| Block name: not allowed or duplicated | FR-011/AC11 |
| Any screen or flow: yes / file empty / only other content | FR-006/AC5, FR-001/AC1 |
| Older-format blocks: "Convert all" notice | FR-010/AC7 |
| Store which block is the flow | FR-006/AC18 |
| Open first editable screen, else flow, else first block | FR-006/AC17 |

### Project library and autosave — [library-autosave.puml](diagrams/library-autosave.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Restore library | FR-006/AC2 |
| Persistent storage not granted | FR-006/AC9 |
| Private window detectable | FR-006/AC9 |
| Library list with times; not synchronised | FR-006/AC10, FR-006/AC8 |
| Create | FR-006/AC3, FR-001/AC1 |
| Open: already edited in another tab / Edit here instead / stay read-only | FR-006/AC12, FR-007/AC7 |
| Rename or duplicate (applies in every tab) | FR-006/AC3, FR-006/AC16, FR-006/AC8 |
| Delete: confirm / cancel; other tabs notified | FR-006/AC3, FR-006/AC16 |
| Write succeeded | FR-006/AC1 |
| Write failed; retry until it succeeds | FR-006/AC7 |
| Backup reminder once per session | FR-006/AC11 |

### Download, export and copy — [download-export-copy.puml](diagrams/download-export-copy.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Download project | FR-014/AC1, FR-006/AC4 |
| Blocks that cannot be rendered or not yet checked | FR-014/AC6 |
| Flow invalid or source-only | FR-014/AC6 |
| Record last-downloaded time | FR-006/AC8 |
| Export: block can be rendered, render succeeds | FR-014/AC2, FR-014/AC3 |
| Export: render fails | FR-005/AC3 |
| Export: block cannot be rendered | FR-014/AC5 |
| Copy source | FR-014/AC4 |

### Undo / redo — [undo-redo.puml](diagrams/undo-redo.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Visual edit or project operation | FR-007/AC1, FR-007/AC2, FR-007/AC10 |
| Typing in a property field | FR-007/AC13 |
| Typing in the source | FR-007/AC3, FR-007/AC4 |
| Undo or Redo names the action | FR-007/AC9 |
| Typing in progress in a focused text field | FR-007/AC13 |
| Open affected block, restore, select and announce | FR-007/AC5, FR-007/AC11, FR-009/AC8, FR-009/AC9 |
| Restored source valid / invalid | FR-007/AC12 |

### Recover from errors — [recover-errors.puml](diagrams/recover-errors.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Source invalid: message with block, line, problem | FR-004/AC4, FR-004/AC7 |
| Fix in source: valid now / still invalid | FR-004/AC4, FR-004/AC2, FR-020/AC6 |
| Revert: has last working version | FR-010/AC4 |
| Revert: never valid | FR-010/AC8 |
| Reload later | FR-006/AC15 |
| Block start or end line changed while typing | FR-004/AC10 |
| Re-division would remove the last block | FR-011/AC15 |
| Re-division would remove a linked screen: proceed / cancel | FR-004/AC10 |
| Render failed | FR-005/AC3, FR-005/AC4, FR-005/AC6 |

### Manage screens — [manage-screens.puml](diagrams/manage-screens.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| Add | FR-011/AC1, FR-011/AC13, FR-001/AC6 |
| Duplicate | FR-011/AC12, FR-011/AC13 |
| Rename: preview while typing, convert on commit | FR-011/AC7 |
| Rename: converted name empty | FR-011/AC7 |
| Rename: duplicates another block's name | FR-011/AC7 |
| Rename: linked steps, proceed / cancel | FR-011/AC5, FR-011/AC8 |
| Rename: no links | FR-011/AC1, FR-007/AC10 |
| Source-view rename: allowed and unique / otherwise | FR-011/AC14 |
| Delete: last block | FR-011/AC15 |
| Delete: linked steps, proceed / cancel | FR-011/AC5, FR-011/AC8, FR-013/AC4 |
| Delete: no links; neighbour opens | FR-011/AC9 |
| Reorder | FR-011/AC1, FR-011/AC3 |
| Case-only link mismatch | FR-011/AC16 |

### Build a screen flow — [build-screen-flow.puml](diagrams/build-screen-flow.puml)

| Branch | Acceptance criteria |
| ------ | ------------------- |
| No flow: Add screen flow | FR-012/AC8, FR-015/AC1 |
| Keyboard navigation of the flow | FR-009/AC13 |
| Insert: representable / not representable | FR-012/AC2, FR-012/AC8, FR-012/AC12 |
| Move: initial start or final stop | FR-012/AC13 |
| Move: keyboard move at branch or body edge | FR-009/AC13, FR-012/AC7 |
| Add or edit a note (attached to the element) | FR-012/AC1 |
| Move: otherwise (keeps lane and notes) | FR-012/AC1, FR-012/AC12 |
| Delete: start or stop / decision or loop / other | FR-012/AC13, FR-012/AC9, FR-012/AC1 |
| Branch: would leave fewer than two / add or remove | FR-012/AC8, FR-012/AC2 |
| Lanes: first lane / delete lane in use / delete only lane / other changes | FR-012/AC10, FR-012/AC12, FR-012/AC13 |
| Delete the screen flow: confirm / cancel | FR-012/AC13 |
| Update flow, source and preview | FR-012/AC3, FR-012/AC6 |
