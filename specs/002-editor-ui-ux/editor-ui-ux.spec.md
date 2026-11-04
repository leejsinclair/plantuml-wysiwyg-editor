# Feature Specification: Editor UI and UX Improvements

**Feature Directory**: `specs/002-editor-ui-ux`
**Created**: 2026-10-28
**Status**: Draft

> **Decision**: A business analyst designates a navigation trigger by right-clicking any element on the canvas and choosing **"Link to screen…"** from the context menu. A popover lists the other screens in the project; selecting one creates a directed connection in the flow view. As a secondary affordance, hovering an element reveals a link icon in its corner that opens the same popover. Linked elements display a small chain badge on the canvas so connections are visible without opening the flow view. See User Story 5 for full acceptance scenarios.

## Overview

The canvas is the business analyst's primary workspace. It must show what the wireframe screen actually looks like — not a summary or outline, but a live WYSIWYG representation that updates as edits are made, so users never need to switch to a separate preview panel to see whether a change looks right.

Several parts of the current editor do not meet this standard. Multiple canvas toolbar controls are non-functional (row/column insert/delete, wrap/unwrap), element dragging does not work, layout guide lines have no visible effect, and panels (Preview, Source, Outline) are always shown even when the user does not need them. The screen flow view is completely broken — connections cannot be created or navigated and the feature is currently unusable. The canvas also lacks the sketch-style aesthetic that signals to stakeholders that wireframes are intentionally rough.

This spec covers making the canvas a first-class WYSIWYG surface, restoring correct toolbar and drag behaviour, fixing screen flow interactions, hiding panels by default, and applying a unified sketch-style visual theme.

---

## User Scenarios & Testing

### User Story 1 - Manipulate canvas structure with toolbar controls (Priority: P1)

A business analyst selects an element on the canvas—a cell inside a grid—and uses the toolbar buttons to insert a row above or below it, delete its row, insert a column to its left or right, or delete its column. They also wrap a selection in a group box or unwrap it. Each action immediately updates the canvas and the Salt source. Currently these buttons do nothing.

**Why this priority**: Structural editing is the core editing action in the canvas. Without working insert/delete controls, users cannot build or modify any layout beyond the initial insertion.

**Independent Test**: Starting from a two-row, two-column grid with one cell selected, click Insert row, Delete row, Insert column, Delete column in sequence. Confirm the grid's dimensions change correctly after each click and the Salt source reflects the updated structure. Then wrap the selected cell in a group box and confirm it nests correctly; unwrap it and confirm the group box is removed.

**Acceptance Scenarios**:

1. **Given** a cell is selected inside a grid, **When** the user clicks Insert row, **Then** a new empty row is inserted below the selected cell's row, the selection moves to the new row's corresponding cell, and the canvas updates immediately.
2. **Given** a row in a grid is selected, **When** the user clicks Delete row, **Then** that row is removed from the grid, focus moves to the adjacent row, and the Salt source reflects one fewer row.
3. **Given** a cell is selected inside a grid, **When** the user clicks Insert column, **Then** a new empty column is inserted to the right of the selected cell's column and the canvas updates immediately.
4. **Given** a column in a grid is selected, **When** the user clicks Delete column, **Then** that column is removed, focus moves to the adjacent column, and the Salt source reflects one fewer column.
5. **Given** an element is selected, **When** the user clicks Wrap in group box, **Then** the element is wrapped in a named group box, the group box appears in the outline and breadcrumb, and the source is updated.
6. **Given** an element inside a group box is selected, **When** the user clicks Unwrap, **Then** the group box is removed and the element moves up to the parent container.
7. **Given** a grid has one row remaining, **When** the user attempts to delete that row, **Then** the action is blocked and the user is told the grid must have at least one row.
8. **Given** a grid has one column remaining, **When** the user attempts to delete that column, **Then** the action is blocked and the user is told the grid must have at least one column.

---

### User Story 2 - Drag elements to reorder them (Priority: P1)

A business analyst drags a button from one position in a row to another position in the same row, or drags a row to a different row in a column. It is also possible to drag elements in and out of grid cells, and to drag elements from the element palette onto the canvas into a specific position. The element moves to the new position, the canvas reflects the updated order, and the source is updated. The drag works with a standard pointer drag; no keyboard-only substitute is required here (keyboard move is handled by existing "Move to…").

**Why this priority**: Drag reordering is the most natural way for non-technical users to rearrange wireframe elements and is called out as broken. Its absence forces users through the "Move to…" dialog for every positional change.

**Independent Test**: Build a row with three buttons. Drag the first button to the last position and confirm the order is reversed in both the canvas and the source. Drag a row in a multi-row column above another row and confirm row order updates. Then drag an element out of a grid cell into a row and confirm both containers update. Finally, drag a button from the element palette onto the canvas between two existing elements and confirm it is inserted at the correct position.

**Acceptance Scenarios**:

1. **Given** an element in a row, **When** the user drags it over a different position in the same row and releases, **Then** the element moves to that position and the other elements shift to fill the gap.
2. **Given** a row inside a column, **When** the user drags it to a different row position and releases, **Then** the rows reorder in both the canvas and the source.
3. **Given** a drag is in progress, **When** the user releases the pointer over an incompatible drop target, **Then** the element returns to its original position and no change is made.
4. **Given** a drag is in progress, **When** the user presses Escape, **Then** the drag is cancelled and the element returns to its original position.
5. **Given** an element is being dragged, **When** the pointer moves over valid drop zones, **Then** visual indicators show where the element would land before the user releases.
6. **Given** an element is inside a grid cell, **When** the user drags it to a position outside that grid cell (into a sibling cell or a parent row), **Then** the element moves to the new container and both the source cell and the destination update accordingly.
7. **Given** an element is outside a grid, **When** the user drags it into a grid cell, **Then** the element is inserted into that cell and the source updates accordingly.
8. **Given** the element palette is visible, **When** the user drags an element type from the palette and releases it at a specific position on the canvas, **Then** a new instance of that element is inserted at the target position and the source is updated.

---

### User Story 3 - See layout guide lines on the canvas (Priority: P1)

When the user enables "Show layout lines", faint guide lines appear on the canvas outlining the boundaries of rows, columns and grids. This helps users understand the structure of nested containers without reading the outline. Currently toggling this setting has no visible effect.

**Why this priority**: Layout lines are a core canvas affordance for understanding nested structure. Their absence makes it difficult to understand and edit complex wireframes.

**Independent Test**: Create a grid with two rows and two columns. Toggle "Show layout lines" on and confirm dashed outlines appear around each row, column and cell. Toggle it off and confirm they disappear.

**Acceptance Scenarios**:

1. **Given** layout lines are off, **When** the user enables Show layout lines, **Then** faint dashed outlines appear around each container boundary (rows, columns, grids, group boxes) within one frame.
2. **Given** layout lines are on, **When** the user disables Show layout lines, **Then** the outlines disappear immediately.
3. **Given** layout lines are on and the user inserts a new row, **Then** layout lines update to include the new row's boundary.
4. **Given** an empty canvas with no elements, **When** layout lines are enabled, **Then** no outlines appear (nothing to outline).

---

### User Story 4 - See wireframe layout directly on the canvas (Priority: P1)

A business analyst builds and edits a wireframe entirely on the canvas without opening the Preview panel. Each element on the canvas renders with enough visual fidelity — representative sizing, spacing, labelling, and widget appearance — that the analyst can judge the layout at a glance. The canvas is the source of truth for what the screen looks like; the Preview panel exists for final polish checks, not for everyday editing.

**Why this priority**: The canvas is where a BA spends most of their time. If the canvas does not show a recognisable representation of the screen, users must constantly switch to the Preview to understand what they have built. That context switch slows down work and breaks the editing flow.

**Independent Test**: Build a screen with a heading, two input fields, a button, and a data table. Without opening the Preview panel, assess whether the canvas layout clearly conveys the relative positions and visual weight of each element. Resize a column in the table on the canvas and confirm the canvas immediately reflects the new proportions without requiring a preview refresh.

**Acceptance Scenarios**:

1. **Given** a wireframe with mixed widget types, **When** a user views the canvas, **Then** each widget renders with a representative visual form (e.g. buttons look like buttons, input fields have an input border, tables show rows and columns) rather than a generic placeholder box.
2. **Given** an element is edited (label changed, column resized, row added), **When** the edit is confirmed, **Then** the canvas updates immediately to reflect the new appearance without requiring a Preview open.
3. **Given** the canvas is the only open panel, **When** a user judges the layout of a screen, **Then** they can correctly identify the spatial relationship between elements without needing any supplementary panel.
4. **Given** a nested container (e.g. a grid inside a group box), **When** a user views the canvas, **Then** nesting depth is visually apparent from indentation or framing on the canvas itself.
5. **Given** a user has never opened the Preview panel, **When** they export the project, **Then** the exported output matches what they saw on the canvas.

---

### User Story 5 - Create and navigate a screen flow (Priority: P1)

A business analyst creates a multi-screen project and draws connections between screens to show the user journey: pressing a button on Screen A takes the user to Screen B, and pressing Back returns them. They designate a navigation trigger by right-clicking any element on the canvas and choosing **"Link to screen…"**, then picking the target screen from a popover list. Linked elements show a chain badge on the canvas. The BA can see the full flow at a glance in the flow view, click a connection to edit or delete it, and navigate to a linked screen by double-clicking its node. The flow view is currently completely non-functional; this story covers restoring it to a usable state with a clear, non-technical interaction model.

**Why this priority**: Screen flow is a first-class output of wireframe work — stakeholders use it to understand the user journey, not just individual screens. A broken flow view means users cannot communicate navigation intent at all.

**Independent Test**: Create three screens. In the flow view, draw a connection from a button on Screen 1 to Screen 2, then from a button on Screen 2 to Screen 3, then a Back connection from Screen 3 to Screen 2. Confirm all three connections are visible and labelled. Click the Screen 2 node in the flow view and confirm the canvas switches to Screen 2. Delete the Screen 3 → Screen 2 connection and confirm it is removed from the flow.

**Acceptance Scenarios**:

1. **Given** a project with at least two screens, **When** the user opens the flow view, **Then** all screens appear as labelled nodes and any existing connections appear as directed arrows between them.
2. **Given** the user right-clicks an element on the canvas and chooses "Link to screen…", **When** they select a target screen from the popover, **Then** a directed connection is created between the current screen and the target screen, the connection is labelled with the source element's name, and it appears immediately in the flow view.
3. **Given** an element has been linked to a screen, **When** the user views the canvas, **Then** the element displays a small chain badge indicating it has a navigation action.
4. **Given** the user hovers over an element on the canvas, **When** the link icon appears in the element's corner, **Then** clicking it opens the same "Link to screen…" popover as the right-click menu.
5. **Given** an element already has a link, **When** the user right-clicks it, **Then** the context menu offers "Edit link…" and "Remove link" in addition to "Link to screen…".
6. **Given** a connection exists in the flow view, **When** the user clicks it, **Then** it becomes selected and the user can rename or delete it.
7. **Given** a connection is selected, **When** the user presses Delete or clicks the Delete control, **Then** the connection is removed from the flow and the Salt source is updated.
8. **Given** a screen node is visible in the flow view, **When** the user double-clicks it, **Then** the canvas switches to that screen for editing.
9. **Given** a screen is deleted from the project, **When** the flow view is shown, **Then** all connections to and from that screen are also removed and no dangling arrows remain.
10. **Given** the flow view contains several screens, **When** the user pans or zooms the flow view, **Then** all nodes and connections remain legible and correctly positioned.

---

### User Story 6 - Sketch-style visual aesthetic (Priority: P2)

The canvas, toolbar and controls adopt a sketch-style visual treatment: slightly rough edges, a hand-drawn feel on borders, and clear button hierarchy distinguishing primary actions (e.g. Insert row) from secondary or destructive ones (e.g. Delete row, Delete column). The aesthetic signals to stakeholders that wireframes are intentionally rough and not production designs.

**Why this priority**: Without this, stakeholders may mistake wireframe layouts for final designs. It also improves readability of the toolbar by making button hierarchy visible.

**Independent Test**: Open the canvas with a populated wireframe and confirm: buttons have visible hierarchy (primary actions visually distinct from secondary and destructive ones), borders and containers have a hand-drawn sketch quality, and the overall look reads as a rough mockup tool rather than a polished application.

**Acceptance Scenarios**:

1. **Given** the canvas is open, **When** a user views the toolbar, **Then** primary action buttons (insert operations) are visually distinct from secondary (wrap) and destructive (delete) ones.
2. **Given** a wireframe with nested containers, **When** a user views the canvas, **Then** container borders have a sketch-style appearance (slightly irregular or dashed) that reads as intentionally rough.
3. **Given** the sketch style is applied, **When** the canvas is viewed in the same browser at 1× and 2× zoom, **Then** the sketch effect remains legible at both sizes.

---

### User Story 8 - Refined app shell (Priority: P2)

The Toolbar, CommandBar and panel header controls use Mantine components to present a clean, professional tool aesthetic that deliberately contrasts with the sketch-style canvas interior. The app shell — everything outside `.salt-canvas` — reads like a professional design tool; the canvas reads like an intentional wireframe. Currently all shell controls are unstyled divs with inline CSS, giving an inconsistent, unpolished appearance.

**Why this priority**: The tension between a rough canvas and polished chrome is intentional. When the chrome looks as unfinished as the canvas, stakeholders cannot tell which parts are the wireframe and which are the editor UI. Clear visual separation makes the tool easier to use and easier to present.

**Independent Test**: Open the editor. Without any action, check that the Toolbar Undo/Redo controls look like buttons in a professional tool (clear hit target, icon, tooltip). Open the CommandBar and confirm insert, wrap and delete buttons are visually distinct from each other. Expand a panel and confirm its header has a consistent, polished toggle control.

**Acceptance Scenarios**:

1. **Given** the editor is open, **When** a user views the Toolbar, **Then** Undo and Redo render as Mantine ActionIcon buttons with tooltips and the autosave status uses Mantine typography.
2. **Given** the CommandBar is visible, **When** a user views the structural commands, **Then** insert operations (Insert row, Insert column) are visually distinct from wrap operations (Wrap, Wrap group, Unwrap) and from delete operations (Delete row, Delete column), using Mantine Button variant differences rather than custom CSS alone.
3. **Given** a panel region has a header toggle, **When** a user views the header, **Then** the toggle control uses Mantine ActionIcon and the panel label uses Mantine Text, producing a consistent appearance across all panels.
4. **Given** Mantine is installed, **When** the canvas interior is viewed, **Then** no Mantine component styles override the roughjs sketch borders or Salt grid CSS classes inside `.salt-canvas`.
5. **Given** the operating system or browser is set to dark mode, **When** the editor opens, **Then** the app shell renders correctly in a dark colour scheme without manual CSS overrides.

---

### User Story 7 - Show panels only when needed (Priority: P2)

The Preview, Source and Outline panels are hidden by default. The user opens each one with a toggle button or keyboard shortcut. This keeps the canvas area large by default and lets each user decide which panels they need for their current task.

**Why this priority**: Panels shown at all times reduce canvas space and create visual noise for users focused on structural editing rather than source review.

**Independent Test**: Open the editor to a project. Confirm Preview, Source and Outline are hidden. Click each toggle in turn and confirm it opens the corresponding panel. Click again to close. Confirm the canvas reclaims the full available area when all panels are closed.

**Acceptance Scenarios**:

1. **Given** the editor opens a project, **When** the initial view loads, **Then** Preview, Source and Outline panels are all hidden and the canvas takes the full available area.
2. **Given** all panels are hidden, **When** the user clicks the Outline toggle, **Then** the Outline panel appears and the canvas shrinks to accommodate it.
3. **Given** the Outline panel is open, **When** the user clicks its toggle again, **Then** the panel closes and the canvas expands to fill the space.
4. **Given** the user has opened a panel and then refreshes the page, **When** the project reopens, **Then** the panel's open/closed state is restored.
5. **Given** a panel is open and the user resizes the browser window to mobile width, **Then** the panel collapses automatically and the canvas is shown in full.

---

## Edge Cases

- **Deleting the last row or column**: the action must be blocked with a clear message; the grid must always have at least one row and one column.
- **Dragging into an incompatible container**: a row dragged onto a grid cell (rather than a row slot) must be rejected and the element returned to its origin with no source change.
- **Layout lines with no elements**: toggling layout lines on an empty canvas should silently show nothing, not throw an error.
- **Panel state across projects**: each project remembers its own panel open/closed state; switching projects restores that project's panel configuration.
- **Undo after structural operations**: each insert/delete row/column and wrap/unwrap is a single undoable step; undo reverses it exactly.
- **Wrap on a container element**: wrapping a row (not just a leaf element) in a group box must nest the whole row inside the group box.
- **Drag during an active keyboard operation**: if a "Move to…" dialog is open, drag must be disabled until it closes.

---

## Requirements

### Functional Requirements

- **FR-001**: The Insert row button MUST insert one new empty row immediately below the selected row (or the row containing the selected cell) in the enclosing grid and move focus to the corresponding cell in the new row.
- **FR-002**: The Delete row button MUST remove the selected row from its grid and move focus to the adjacent row; it MUST be blocked with a user-visible message when the grid has only one row.
- **FR-003**: The Insert column button MUST insert one new empty column immediately to the right of the selected column in the enclosing grid.
- **FR-004**: The Delete column button MUST remove the selected column from its grid and move focus to the adjacent column; it MUST be blocked with a user-visible message when the grid has only one column.
- **FR-005**: The Wrap in group box button MUST wrap the selected element in a new named group box; the group box MUST appear in the outline, breadcrumb and source.
- **FR-006**: The Unwrap button MUST remove the enclosing group box of the selected element and move the element to the group box's parent container.
- **FR-007**: Drag-and-drop MUST allow reordering elements within a compatible container (row within column, element within row), moving elements in and out of grid cells, and dragging new elements from the element palette onto the canvas at a specific position; releasing over an incompatible target MUST cancel the drag.
- **FR-008**: During a drag, valid drop zones MUST be highlighted and an insertion indicator MUST show the expected landing position.
- **FR-009**: Pressing Escape during a drag MUST cancel the drag and restore the element to its original position.
- **FR-010**: The Show layout lines toggle MUST render faint dashed outlines on all container boundaries (rows, columns, grids, group boxes) while active and remove them immediately when toggled off.
- **FR-011**: The canvas, toolbar and controls MUST adopt a sketch-style visual theme: hand-drawn-style borders on containers, and visually distinct button tiers (primary, secondary, destructive).
- **FR-012**: The Preview, Source and Outline panels MUST be hidden on initial load; each MUST have a toggle control that opens or closes it.
- **FR-013**: Panel open/closed state MUST be persisted per project and restored on project open.
- **FR-014**: Each structural edit (insert/delete row, insert/delete column, wrap, unwrap, drag reorder) MUST be a single undoable step that fully reverses the change.
- **FR-015**: Each widget type rendered on the canvas MUST display a representative visual form (button, input field, table, etc.) that conveys its appearance without requiring the Preview panel to be open.
- **FR-016**: The canvas MUST update its visual representation immediately (within one rendered frame) when any element property or structural edit is confirmed.
- **FR-017**: The flow view MUST display all screens in the current project as labelled, draggable nodes connected by directed arrows that represent navigation transitions.
- **FR-018**: The user MUST be able to create a navigation connection by right-clicking any element on the canvas and choosing "Link to screen…", then selecting a target screen from a popover list; the connection is labelled with the source element's name and appears immediately in the flow view.
- **FR-018a**: A hover affordance (link icon) on any canvas element MUST open the same "Link to screen…" popover as the right-click menu.
- **FR-018b**: Any element that has a navigation link MUST display a small chain badge on the canvas so the BA can identify linked elements without opening the flow view.
- **FR-018c**: Right-clicking a linked element MUST offer "Edit link…" (to change the target screen) and "Remove link" in its context menu.
- **FR-019**: Selecting a connection in the flow view MUST allow the user to rename or delete it; deleting a connection MUST update the Salt source.
- **FR-020**: Double-clicking a screen node in the flow view MUST navigate the canvas to that screen.
- **FR-021**: Deleting a screen MUST automatically remove all connections to and from that screen from the flow view.
- **FR-022**: The flow view MUST support pan and zoom so that projects with many screens remain navigable.
- **FR-023**: The app root MUST be wrapped in a `MantineProvider` with a project-scoped theme; Mantine's CSS MUST be imported before any project stylesheet to preserve the cascade layer ordering.
- **FR-024**: Toolbar Undo and Redo controls MUST use Mantine `ActionIcon`; the autosave status indicator MUST use Mantine `Text`.
- **FR-025**: CommandBar structural command buttons MUST use Mantine `Button` with `variant="filled"` for insert operations, `variant="light"` for wrap operations, and `variant="subtle"` with `color="red"` for delete operations.
- **FR-026**: Panel header toggle controls MUST use Mantine `ActionIcon`; panel section labels MUST use Mantine `Text`; elements inside `.salt-canvas` and its descendants MUST remain unaffected by Mantine component styles.

---

## Key Entities

- **Canvas element**: a leaf widget (button, text field, label, etc.) or container (row, column, grid, group box) rendered on the canvas.
- **Container**: a canvas element that holds other elements; types are row, column, grid and group box.
- **Toolbar action**: a labelled button in the canvas toolbar that applies a structural operation to the currently selected element; each action is enabled only when the selection makes it applicable.
- **Layout guide line**: a faint dashed overlay drawn on the canvas to mark the boundary of each container; toggled globally by the Show layout lines setting.
- **Panel**: a collapsible sidebar or pane (Preview, Source, Outline) that supplements the canvas; each is independently toggled and its state is persisted per project.
- **Widget representation**: the visual rendering of a Salt widget on the canvas that conveys its type and content without requiring preview; e.g. a button renders as a labelled rounded rectangle, an input field as a bordered text entry.
- **Flow view**: the project-level view that shows all screens as nodes and navigation connections as directed arrows; distinct from the single-screen canvas editor.
- **Navigation connection**: a directed link between a specific source element (button, link, etc.) on one screen and a target screen, representing a user journey transition; created via the "Link to screen…" context menu on the canvas and displayed as a directed arrow in the flow view.
- **Link badge**: a small chain icon rendered in the corner of any canvas element that has a navigation connection, visible without opening the flow view.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: All fourteen toolbar structural actions (Insert row, Delete row, Insert column, Delete column, Wrap, Wrap in group box, Unwrap and their guard conditions) execute the correct structural change within 200 ms of the button click in a project with up to 50 elements.
- **SC-002**: Drag-and-drop reordering completes successfully (element reaches its intended new position without a page reload) in 100% of attempts on a project with up to 50 elements.
- **SC-003**: Layout guide lines appear and disappear within one rendered frame of the toggle.
- **SC-004**: Each panel (Preview, Source, Outline) opens and closes within 150 ms of its toggle being activated.
- **SC-005**: The sketch-style theme passes a visual review: container borders have a clearly non-production, hand-drawn appearance, and at least three visually distinct button states (primary, secondary, destructive) are identifiable without reading button labels.
- **SC-006**: Panel state (open/closed) is correctly restored for 100% of project open operations after a page reload.
- **SC-007**: A user who has never opened the Preview panel can correctly describe the layout of a populated screen from the canvas alone, as verified by a five-minute usability walkthrough.
- **SC-008**: The flow view renders a project with up to 20 screens and 40 connections without layout overlap or illegible labels at the default zoom level.
- **SC-009**: Connection create, rename, and delete operations in the flow view complete within 200 ms and are immediately reflected in the Salt source.

---

## Assumptions

- The sketch-style borders on the canvas are implemented with `roughjs`; the app shell (Toolbar, CommandBar, panels) uses Mantine components for a refined, professional appearance. The canvas interior (`.salt-canvas`) is explicitly excluded from Mantine component styles.
- Panel toggle state is stored in the existing browser-storage layer alongside the project, not in a separate settings store.
- Drag-and-drop is implemented or re-implemented using the browser's Pointer Events API (the existing `dnd.tsx` file is the target); no third-party DnD library is added unless already present.
- "Show layout lines" is an existing toggle that already has a UI control; this spec covers making it functional, not adding the control.
- Mobile-width breakpoint for auto-collapse of panels is 768 px or the nearest existing breakpoint in the project's CSS.
- The sketch-style theme applies to the canvas and editor chrome only; the project library view and exported output are not affected.
- Widget representations on the canvas are CSS-rendered approximations of the Salt output; pixel-perfect fidelity with the PlantUML-rendered preview is not required, but proportions and widget types must be clearly distinguishable.
- The flow view is an existing feature in the project; this spec covers restoring it to a functional state, not building it from scratch.
- Navigation connections in the flow view are stored as PlantUML activity-diagram arrows or an equivalent project-file annotation; the exact storage format is to be confirmed during implementation.
