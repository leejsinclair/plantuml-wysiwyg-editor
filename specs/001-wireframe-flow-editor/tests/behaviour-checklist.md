# Behaviour Checklist: 001-wireframe-flow-editor

**Specification**: [spec.md](../spec.md) | **Verification Plan**: [plan.md](../plan.md#verification-plan) | **Tasks**: [tasks.md](../tasks.md)

## US1-AS1

> **Given** an empty project library, **When** the user creates a project, **Then** it opens on one empty screen showing a prompt that explains how to add the first component, and the empty screen accepts insertions.

- **BI-001** Expresses: FR-001, US1-AS1. Verified by: VO-001.
  - **Given** an empty project library
  - **When** the user creates a project
  - **Then** it opens on one empty screen showing a prompt that explains how to add the first component, and the empty screen accepts insertions.

## US1-AS2

> **Given** a selected element in a single-row grid, **When** the user chooses "Button" in the palette, **Then** a button is inserted after the selected element in the same row, becomes selected and focused, and the change is announced.

- **BI-002** Expresses: FR-002, FR-009, US1-AS2. Verified by: VO-002.
  - **Given** a selected element in a single-row grid
  - **When** the user chooses "Button" in the palette
  - **Then** a button is inserted after the selected element in the same row, becomes selected and focused, and the change is announced.

## US1-AS3

> **Given** a selected text field, **When** the user changes its label and value in the properties panel, **Then** the canvas, the source and the preview update, and the field keeps its width.

- **BI-003** Expresses: FR-003, US1-AS3. Verified by: VO-003.
  - **Given** a selected text field
  - **When** the user changes its label and value in the properties panel
  - **Then** the canvas, the source and the preview update, and the field keeps its width.

## US1-AS4

> **Given** a selected element in a multi-row, multi-column grid, **When** the user deletes it, **Then** an empty cell remains, the source lines of the other rows are unchanged, and focus moves to the empty cell.

- **BI-004** Expresses: FR-002, US1-AS4. Verified by: VO-004.
  - **Given** a selected element in a multi-row, multi-column grid
  - **When** the user deletes it
  - **Then** an empty cell remains, the source lines of the other rows are unchanged, and focus moves to the empty cell.

## US1-AS5

> **Given** a selected element, **When** the user presses the keyboard move shortcut at the edge of its container, **Then** nothing moves and the user is told to use "Move to…".

- **BI-005** Expresses: FR-002, US1-AS5. Verified by: VO-005.
  - **Given** a selected element
  - **When** the user presses the keyboard move shortcut at the edge of its container
  - **Then** nothing moves and the user is told to use "Move to…".

## US1-AS6

> **Given** a selected field, **When** the user chooses "Select parent" (or presses Esc with nothing temporary open), **Then** the containing grid is selected and the breadcrumb shows the path.

- **BI-006** Expresses: FR-002, US1-AS6. Verified by: VO-006.
  - **Given** a selected field
  - **When** the user chooses "Select parent" (or presses Esc with nothing temporary open)
  - **Then** the containing grid is selected and the breadcrumb shows the path.

## US1-AS7

> **Given** the user types `{`, `|`, `**` or "Title" as the first cell of a row, **When** the screen is rendered, **Then** the text appears exactly as typed with no visible escape characters.

- **BI-007** Expresses: FR-003, US1-AS7. Verified by: VO-007.
  - **Given** the user types `{`, `|`, `**` or "Title" as the first cell of a row
  - **When** the screen is rendered
  - **Then** the text appears exactly as typed with no visible escape characters.

## US1-AS8

> **Given** a Form, Button bar or Table preset is inserted, **When** the project is reloaded, **Then** the canvas and outline still label it "Form", "Button bar" or "Table".

- **BI-008** Expresses: FR-002, US1-AS8. Verified by: VO-008.
  - **Given** a Form, Button bar or Table preset is inserted
  - **When** the project is reloaded
  - **Then** the canvas and outline still label it "Form", "Button bar" or "Table".

## US2-AS1

> **Given** an open project, **When** the user makes an edit, **Then** it is committed to browser storage within 2 seconds and the status shows "All changes saved".

- **BI-009** Expresses: FR-006, US2-AS1. Verified by: VO-009.
  - **Given** an open project
  - **When** the user makes an edit
  - **Then** it is committed to browser storage within 2 seconds and the status shows "All changes saved".

## US2-AS2

> **Given** a storage write fails, **When** the failure occurs, **Then** a prominent, non-blocking message appears within 1 second with advice and "Download a backup"; the previous stored version is intact; the application retries and the status returns to "All changes saved" when a retry succeeds.

- **BI-010** Expresses: FR-006, US2-AS2. Verified by: VO-010.
  - **Given** a storage write fails
  - **When** the failure occurs
  - **Then** a prominent, non-blocking message appears within 1 second with advice and "Download a backup"; the previous stored version is intact; the application retries and the status returns to "All changes saved" when a retry succeeds.

## US2-AS3

> **Given** a project with changes that have not been downloaded, **When** the user deletes it, **Then** the confirmation says so and offers "Download and delete".

- **BI-011** Expresses: FR-006, US2-AS3. Verified by: VO-011.
  - **Given** a project with changes that have not been downloaded
  - **When** the user deletes it
  - **Then** the confirmation says so and offers "Download and delete".

## US2-AS4

> **Given** a project open for editing in one tab, **When** it is opened in a second tab, **Then** the second tab is read-only with "Edit here instead"; the second tab does not update as the first tab saves; choosing "Edit here instead" saves the first tab's pending edits, loads the latest stored version and moves editing to the second tab.

- **BI-012** Expresses: FR-006, FR-007, US2-AS4. Verified by: VO-012.
  - **Given** a project open for editing in one tab
  - **When** it is opened in a second tab
  - **Then** the second tab is read-only with "Edit here instead"; the second tab does not update as the first tab saves; choosing "Edit here instead" saves the first tab's pending edits, loads the latest stored version and moves editing to the second tab.

## US2-AS5

> **Given** a downloaded project file, **When** it is imported, **Then** a new project is created with the same screens, flow, layout and properties, named after the file (with the date appended if the name is already used), and marked "never downloaded".

- **BI-013** Expresses: FR-006, US2-AS5. Verified by: VO-013.
  - **Given** a downloaded project file
  - **When** it is imported
  - **Then** a new project is created with the same screens, flow, layout and properties, named after the file (with the date appended if the name is already used), and marked "never downloaded".

## US2-AS6

> **Given** a non-UTF-8 or binary file, **When** the user imports it, **Then** it is rejected with an explanation and nothing is created.

- **BI-014** Expresses: FR-006, US2-AS6. Verified by: VO-014.
  - **Given** a non-UTF-8 or binary file
  - **When** the user imports it
  - **Then** it is rejected with an explanation and nothing is created.

## US3-AS1

> **Given** a file containing a screen with an unsupported tree-table variant, **When** it is imported, **Then** the screen shows "Has locked parts", the variant appears as a labelled locked placeholder with its reason and a source excerpt, and the rest of the screen is editable.

- **BI-015** Expresses: FR-010, US3-AS1. Verified by: VO-015.
  - **Given** a file containing a screen with an unsupported tree-table variant
  - **When** it is imported
  - **Then** the screen shows "Has locked parts", the variant appears as a labelled locked placeholder with its reason and a source excerpt, and the rest of the screen is editable.

## US3-AS2

> **Given** a screen using `!define`, **When** it is imported, **Then** it opens in source-only mode with an explanation.

- **BI-016** Expresses: FR-010, US3-AS2. Verified by: VO-016.
  - **Given** a screen using `!define`
  - **When** it is imported
  - **Then** it opens in source-only mode with an explanation.

## US3-AS3

> **Given** a Salt block written as `salt` inside `@startuml`, **When** it is imported, **Then** it is listed as other content with status "Older format", and one notice offers "Convert all"; converting is undoable and the result renders.

- **BI-017** Expresses: FR-010, US3-AS3. Verified by: VO-017.
  - **Given** a Salt block written as `salt` inside `@startuml`
  - **When** it is imported
  - **Then** it is listed as other content with status "Older format", and one notice offers "Convert all"; converting is undoable and the result renders.

## US3-AS4

> **Given** a file whose only screen is invalid, **When** it is imported, **Then** the screen shows "Error" with the problem and its line, has no revert action, and other blocks remain editable.

- **BI-018** Expresses: FR-010, US3-AS4. Verified by: VO-018.
  - **Given** a file whose only screen is invalid
  - **When** it is imported
  - **Then** the screen shows "Error" with the problem and its line, has no revert action, and other blocks remain editable.

## US3-AS5

> **Given** a file with a sequence diagram and two activity diagrams, **When** it is imported, **Then** the first supported activity diagram becomes the screen flow, and the sequence diagram and second activity diagram are listed as other content.

- **BI-019** Expresses: FR-006, US3-AS5. Verified by: VO-019.
  - **Given** a file with a sequence diagram and two activity diagrams
  - **When** it is imported
  - **Then** the first supported activity diagram becomes the screen flow, and the sequence diagram and second activity diagram are listed as other content.

## US3-AS6

> **Given** any imported file, **When** the user edits one element and downloads, **Then** only that element's source text has changed.

- **BI-020** Expresses: FR-004, FR-020, US3-AS6. Verified by: VO-020.
  - **Given** any imported file
  - **When** the user edits one element and downloads
  - **Then** only that element's source text has changed.

## US4-AS1

> **Given** the source view of a screen has focus, **When** the user types, **Then** that screen's canvas is read-only while other screens remain editable.

- **BI-021** Expresses: FR-004, US4-AS1. Verified by: VO-021.
  - **Given** the source view of a screen has focus
  - **When** the user types
  - **Then** that screen's canvas is read-only while other screens remain editable.

## US4-AS2

> **Given** the user pauses after typing valid source, **When** the block is re-parsed, **Then** the canvas reflects it within 500 ms and the selection stays on the same element or its nearest surviving container.

- **BI-022** Expresses: FR-004, US4-AS2. Verified by: VO-022.
  - **Given** the user pauses after typing valid source
  - **When** the block is re-parsed
  - **Then** the canvas reflects it within 500 ms and the selection stays on the same element or its nearest surviving container.

## US4-AS3

> **Given** the user leaves the source view with invalid source, **When** focus moves elsewhere, **Then** the text stays exactly as typed, is autosaved, and the block stays locked with "Fix in source" and "Revert to last working version".

- **BI-023** Expresses: FR-004, US4-AS3. Verified by: VO-023.
  - **Given** the user leaves the source view with invalid source
  - **When** focus moves elsewhere
  - **Then** the text stays exactly as typed, is autosaved, and the block stays locked with "Fix in source" and "Revert to last working version".

## US4-AS4

> **Given** the user deletes a block's `@endsalt` line while typing and then leaves the source view, **When** the file no longer forms one block, **Then** the editor re-divides it once as one undoable step and reports what it did; if this would remove a screen that steps link to, the user is warned first and can cancel.

- **BI-024** Expresses: FR-004, US4-AS4. Verified by: VO-024.
  - **Given** the user deletes a block's `@endsalt` line while typing and then leaves the source view
  - **When** the file no longer forms one block
  - **Then** the editor re-divides it once as one undoable step and reports what it did; if this would remove a screen that steps link to, the user is warned first and can cancel.

## US4-AS5

> **Given** a rendering failure, **When** the preview updates, **Then** the renderer's message appears in the preview pane labelled as a rendering problem, separate from source problems, and the last successful render remains visible, marked out of date.

- **BI-025** Expresses: FR-005, US4-AS5. Verified by: VO-025.
  - **Given** a rendering failure
  - **When** the preview updates
  - **Then** the renderer's message appears in the preview pane labelled as a rendering problem, separate from source problems, and the last successful render remains visible, marked out of date.

## US5-AS1

> **Given** a project, **When** the user adds a screen, **Then** a new empty screen named "Screen-n" (the lowest unused number) is created and opened.

- **BI-026** Expresses: FR-011, US5-AS1. Verified by: VO-026.
  - **Given** a project
  - **When** the user adds a screen
  - **Then** a new empty screen named "Screen-n" (the lowest unused number) is created and opened.

## US5-AS2

> **Given** the user renames a screen to "Sign in", **When** they commit, **Then** it is saved as `Sign-in`; while typing, a preview shows "Will be saved as Sign-in".

- **BI-027** Expresses: FR-011, US5-AS2. Verified by: VO-027.
  - **Given** the user renames a screen to "Sign in"
  - **When** they commit
  - **Then** it is saved as `Sign-in`; while typing, a preview shows "Will be saved as Sign-in".

## US5-AS3

> **Given** a name that matches another block's name ignoring case, **When** the user commits it, **Then** it is refused with a message naming that block and the previous name is kept.

- **BI-028** Expresses: FR-011, US5-AS3. Verified by: VO-028.
  - **Given** a name that matches another block's name ignoring case
  - **When** the user commits it
  - **Then** it is refused with a message naming that block and the previous name is kept.

## US5-AS4

> **Given** a screen that three steps link to, **When** the user renames it from the project panel and proceeds, **Then** the three steps are updated in one undoable step.

- **BI-029** Expresses: FR-011, US5-AS4. Verified by: VO-029.
  - **Given** a screen that three steps link to
  - **When** the user renames it from the project panel and proceeds
  - **Then** the three steps are updated in one undoable step.

## US5-AS5

> **Given** a screen that no step links to, **When** the user deletes it, **Then** it is deleted without confirmation, the deletion is announced with "Undo", and its neighbour opens.

- **BI-030** Expresses: FR-011, US5-AS5. Verified by: VO-030.
  - **Given** a screen that no step links to
  - **When** the user deletes it
  - **Then** it is deleted without confirmation, the deletion is announced with "Undo", and its neighbour opens.

## US5-AS6

> **Given** the only block in a project, **When** the user tries to delete it, **Then** the deletion is refused with an explanation.

- **BI-031** Expresses: FR-011, US5-AS6. Verified by: VO-031.
  - **Given** the only block in a project
  - **When** the user tries to delete it
  - **Then** the deletion is refused with an explanation.

## US6-AS1

> **Given** a project with no screen flow, **When** the user chooses "Add screen flow", **Then** a flow named "Screen-flow" with start and stop is created and opened.

- **BI-032** Expresses: FR-012, US6-AS1. Verified by: VO-032.
  - **Given** a project with no screen flow
  - **When** the user chooses "Add screen flow"
  - **Then** a flow named "Screen-flow" with start and stop is created and opened.

## US6-AS2

> **Given** a decision is selected, **When** the user presses Enter, **Then** focus moves to its first branch; Left and Right move between branches; an empty branch can be selected and receives insertions.

- **BI-033** Expresses: FR-012, FR-009, US6-AS2. Verified by: VO-033.
  - **Given** a decision is selected
  - **When** the user presses Enter
  - **Then** focus moves to its first branch; Left and Right move between branches; an empty branch can be selected and receives insertions.

## US6-AS3

> **Given** a decision containing four steps, **When** the user deletes it, **Then** its contents are deleted, the deletion is undoable, and it is announced as "Deleted decision and 4 steps".

- **BI-034** Expresses: FR-012, US6-AS3. Verified by: VO-034.
  - **Given** a decision containing four steps
  - **When** the user deletes it
  - **Then** its contents are deleted, the deletion is undoable, and it is announced as "Deleted decision and 4 steps".

## US6-AS4

> **Given** a step inside a branch, **When** the user changes its lane, **Then** only that step's rendered lane changes.

- **BI-035** Expresses: FR-012, US6-AS4. Verified by: VO-035.
  - **Given** a step inside a branch
  - **When** the user changes its lane
  - **Then** only that step's rendered lane changes.

## US6-AS5

> **Given** the initial start or the final stop of the main path, **When** the user tries to move or delete it, **Then** the operation is refused with an explanation.

- **BI-036** Expresses: FR-012, US6-AS5. Verified by: VO-036.
  - **Given** the initial start or the final stop of the main path
  - **When** the user tries to move or delete it
  - **Then** the operation is refused with an explanation.

## US6-AS6

> **Given** a lane in use, **When** the user deletes it, **Then** they are asked which lane its elements move to, and the deletion is undoable.

- **BI-037** Expresses: FR-012, US6-AS6. Verified by: VO-037.
  - **Given** a lane in use
  - **When** the user deletes it
  - **Then** they are asked which lane its elements move to, and the deletion is undoable.

## US7-AS1

> **Given** an unlinked step "Enter credentials", **When** the user chooses "Create screen" from its link control, **Then** a screen `Enter-credentials` is created and linked to the step in one action.

- **BI-038** Expresses: FR-013, US7-AS1. Verified by: VO-038.
  - **Given** an unlinked step "Enter credentials"
  - **When** the user chooses "Create screen" from its link control
  - **Then** a screen `Enter-credentials` is created and linked to the step in one action.

## US7-AS2

> **Given** a linked step, **When** the user activates "Open screen" or its shortcut, **Then** the screen opens with focus on its root grid, and "Back to flow" returns with the step selected.

- **BI-039** Expresses: FR-013, US7-AS2. Verified by: VO-039.
  - **Given** a linked step
  - **When** the user activates "Open screen" or its shortcut
  - **Then** the screen opens with focus on its root grid, and "Back to flow" returns with the step selected.

## US7-AS3

> **Given** a linked step whose screen has been deleted, **When** the user views the flow, **Then** the step is flagged as broken and its properties offer "Link to another screen", "Create screen" and "Remove link".

- **BI-040** Expresses: FR-013, US7-AS3. Verified by: VO-040.
  - **Given** a linked step whose screen has been deleted
  - **When** the user views the flow
  - **Then** the step is flagged as broken and its properties offer "Link to another screen", "Create screen" and "Remove link".

## US7-AS4

> **Given** a step label containing `[x]`, `]]` and `|`, **When** the project is downloaded and re-imported, **Then** the link and the label are preserved.

- **BI-041** Expresses: FR-013, US7-AS4. Verified by: VO-041.
  - **Given** a step label containing `[x]`, `]]` and `|`
  - **When** the project is downloaded and re-imported
  - **Then** the link and the label are preserved.

## US7-AS5

> **Given** all panels are collapsed, **When** the user clicks a linked step in the flow's rendered preview, **Then** the linked screen opens and "Back to flow" returns.

- **BI-042** Expresses: FR-015, US7-AS5. Verified by: VO-042.
  - **Given** all panels are collapsed
  - **When** the user clicks a linked step in the flow's rendered preview
  - **Then** the linked screen opens and "Back to flow" returns.

## US8-AS1

> **Given** a screen that renders, **When** the user exports PNG, **Then** the image is a rasterisation of the same SVG shown in the preview, at 2× its natural size.

- **BI-043** Expresses: FR-014, US8-AS1. Verified by: VO-043.
  - **Given** a screen that renders
  - **When** the user exports PNG
  - **Then** the image is a rasterisation of the same SVG shown in the preview, at 2× its natural size.

## US8-AS2

> **Given** a block that is invalid, in the older format or depends on `!include`, **When** the user tries to export it as an image, **Then** the export is prevented with an explanation, and source download and copy remain available.

- **BI-044** Expresses: FR-014, US8-AS2. Verified by: VO-044.
  - **Given** a block that is invalid, in the older format or depends on `!include`
  - **When** the user tries to export it as an image
  - **Then** the export is prevented with an explanation, and source download and copy remain available.

## US8-AS3

> **Given** the user copies source, **When** the copy succeeds, **Then** a confirmation says it was copied.

- **BI-045** Expresses: FR-014, US8-AS3. Verified by: VO-045.
  - **Given** the user copies source
  - **When** the copy succeeds
  - **Then** a confirmation says it was copied.

## Other behaviours

- **BI-046** Expresses: FR-001, SC-004. Verified by: VO-046.
  - **Given** the editor has generated every block of the test corpus
  - **When** each block is rendered by the in-browser renderer and by the command-line tool at the minimum supported version
  - **Then** every block renders without error and no content is silently dropped
- **BI-047** Expresses: FR-002, EC-04. Verified by: VO-047.
  - **Given** a screen with each kind of selection that section 3.2 lists
  - **When** the user chooses a palette item
  - **Then** the new element is inserted at the insertion point section 3.2 defines for that selection, and an occupied cell never receives it
- **BI-048** Expresses: FR-002. Verified by: VO-048.
  - **Given** an element in a single-row grid, a single-column grid and a multi-row multi-column grid
  - **When** the user removes it or moves it out
  - **Then** a single-row or single-column grid closes the gap, a multi-row and multi-column grid leaves an empty cell, and the source lines of other rows are unchanged
- **BI-049** Expresses: FR-002, FR-009. Verified by: VO-049.
  - **Given** a screen with several compatible and incompatible containers
  - **When** the user opens Move to, or drags the element
  - **Then** Move to lists every valid destination as a tree, dragging offers exactly the same destinations, and the element ends where the user chose
- **BI-050** Expresses: FR-002. Verified by: VO-050.
  - **Given** an element that is not at its container's edge
  - **When** the user presses the keyboard move shortcut
  - **Then** it moves one position along the axis of a single-row or single-column grid, or swaps with the neighbouring cell in a multi-row and multi-column grid
- **BI-051** Expresses: FR-002, EC-03. Verified by: VO-051.
  - **Given** a grid with column spans
  - **When** the user inserts or deletes rows and columns or sets a span
  - **Then** a span is never offered on the first cell of a row, extends only over empty cells with the limiting element named, and no operation leaves a span in the first column or misaligns other rows in the command-line oracle's render
- **BI-052** Expresses: FR-002, EC-02. Verified by: VO-052.
  - **Given** an imported grid with rows of different lengths
  - **When** the user edits one row
  - **Then** rows the user did not edit are unchanged, and editing a missing cell adds cells to that row only
- **BI-053** Expresses: FR-002. Verified by: VO-053.
  - **Given** a selected element, and a grid holding a single element with no style
  - **When** the user chooses Wrap or Unwrap
  - **Then** the element is wrapped in a new grid or group box, or the grid is removed and its element kept in place, and Unwrap is not offered for any other grid
- **BI-054** Expresses: FR-002. Verified by: VO-054.
  - **Given** imported grids of every shape the grid label precedence lists
  - **When** the project is opened
  - **Then** each grid is labelled Table, Button bar, Form, Row, Column or Grid as the fixed precedence gives
- **BI-055** Expresses: FR-003, EC-05. Verified by: VO-055.
  - **Given** every text listed in the escaping test corpus
  - **When** it is entered as a label, value or linked step label and the project is downloaded and re-imported
  - **Then** it appears exactly as typed in the canvas and the render with no visible escape characters, ordinary text such as a.b and 5 * 3 is written unchanged, and it re-imports as the same text
- **BI-056** Expresses: FR-003. Verified by: VO-056.
  - **Given** a text field with a set width
  - **When** the user changes its value
  - **Then** its width is kept unless the user changes it, and a value longer than the width widens the field to fit
- **BI-057** Expresses: FR-003. Verified by: VO-057.
  - **Given** a checkbox, a radio button and a text field on the canvas
  - **When** the user clicks, presses Space, Enter, F2 or Esc, or double-clicks
  - **Then** clicking selects without toggling or editing, Space toggles the selected checkbox or radio button, Enter, F2 or double-click starts editing in place, and Esc cancels and restores the text
- **BI-058** Expresses: FR-003, EC-07. Verified by: VO-058.
  - **Given** a drop-down with three options shown open
  - **When** the user switches it to closed
  - **Then** the other options are removed from the source, a notice states that two options were removed, undo restores them, and the canvas shows the same form as the render
- **BI-059** Expresses: FR-003, EC-06. Verified by: VO-059.
  - **Given** an imported label with formatting markup
  - **When** the user edits it and chooses Keep formatting or Remove formatting
  - **Then** the source is unchanged until the edit, the chosen option is applied, and the element's structure and type are unchanged
- **BI-060** Expresses: FR-003. Verified by: VO-060.
  - **Given** a screen with checked and unchecked checkboxes and radio buttons, a selected tab and an open drop-down with options
  - **When** the project is reloaded, and downloaded and re-imported
  - **Then** every state and option is the same as before
- **BI-061** Expresses: FR-003. Verified by: VO-061.
  - **Given** each supported component
  - **When** its properties are listed
  - **Then** no placeholder, enabled or disabled setting and no setting the source cannot represent is offered
- **BI-062** Expresses: FR-004, FR-020, FR-010, SC-005. Verified by: VO-062.
  - **Given** every file of the test corpus
  - **When** it is imported and downloaded without edits
  - **Then** the downloaded file is byte-identical to the imported file
- **BI-063** Expresses: FR-004. Verified by: VO-063.
  - **Given** an open screen
  - **When** the user moves between the canvas and the source view without typing
  - **Then** the source is unchanged
- **BI-064** Expresses: FR-020. Verified by: VO-064.
  - **Given** an element with a full-line comment directly above it
  - **When** the user moves or deletes the element
  - **Then** the comment moves or is deleted with it, undo restores both, the announcement mentions the comment, and other comments stay where they are
- **BI-065** Expresses: FR-020. Verified by: VO-065.
  - **Given** each kind of element the palette offers
  - **When** it is inserted
  - **Then** its source is written in the consistent house style
- **BI-066** Expresses: FR-020, SC-007. Verified by: VO-066.
  - **Given** a block whose source the user made invalid
  - **When** the project is autosaved, reloaded and other blocks are edited
  - **Then** the invalid text is kept exactly as typed
- **BI-067** Expresses: FR-005, FR-017. Verified by: VO-067.
  - **Given** a project with several blocks and a renderer that is still starting
  - **When** the project is opened and edited
  - **Then** editing works at once, blocks are rendered one at a time with the open block first, each block's render status appears in the project panel, and editing never waits for a render
- **BI-068** Expresses: FR-005. Verified by: VO-068.
  - **Given** a block that is invalid under the editor's grammar, and a block that depends on !include
  - **When** a render would be requested
  - **Then** it is not rendered, and its last render is kept and marked out of date
- **BI-069** Expresses: FR-017, EC-13. Verified by: VO-069.
  - **Given** a block whose render does not finish
  - **When** 10 seconds pass
  - **Then** the render is abandoned, the block is reported as Not yet checked, and the next render proceeds
- **BI-070** Expresses: FR-017. Verified by: VO-070.
  - **Given** blocks that use !include, a URL and a local file reference
  - **When** they are rendered
  - **Then** nothing is fetched or resolved, and the blocks are shown as unrenderable
- **BI-071** Expresses: FR-017. Verified by: VO-071.
  - **Given** rendered output containing scripts, event handlers, external references, internal links and embedded images
  - **When** it is displayed
  - **Then** scripts, event handlers and external references are removed, and internal links and embedded images are kept
- **BI-072** Expresses: FR-017. Verified by: VO-072.
  - **Given** the renderer is replaced by another one offering the same interface
  - **When** the core editing scenarios run
  - **Then** editing behaves the same
- **BI-073** Expresses: FR-017, SC-004. Verified by: VO-073.
  - **Given** the shared corpus
  - **When** it is rendered by the in-browser renderer and by the command-line tool at the pinned version
  - **Then** each block succeeds or fails in the same way in both
- **BI-074** Expresses: FR-017, FR-001, SC-008. Verified by: VO-074.
  - **Given** a recorded browser session
  - **When** the user edits, renders, exports and imports
  - **Then** the only requests are for the application's own files, and no diagram content is sent
- **BI-075** Expresses: FR-006, SC-007. Verified by: VO-075.
  - **Given** a library of projects with recent edits
  - **When** the page is reloaded, the browser restarted, or the page crashes
  - **Then** every project reopens exactly as last stored, and after a crash no more than the last 2 seconds of edits are lost
- **BI-076** Expresses: FR-006. Verified by: VO-076.
  - **Given** a project library
  - **When** the user creates, opens, renames, duplicates, deletes and downloads projects
  - **Then** each action works, a duplicate is named Copy of the original and starts never downloaded, and the download is one file named after the project
- **BI-077** Expresses: FR-006. Verified by: VO-077.
  - **Given** a project
  - **When** it is downloaded, then edited, then duplicated
  - **Then** the library shows its last downloaded time and whether it has changes since, and the duplicate shows never downloaded
- **BI-078** Expresses: FR-006, EC-15. Verified by: VO-078.
  - **Given** a browser that refuses persistent storage, a private window, and a full storage quota
  - **When** the user edits
  - **Then** a non-blocking notice explains each risk once and editing continues
- **BI-079** Expresses: FR-006. Verified by: VO-079.
  - **Given** a project with changes that have not been downloaded
  - **When** the user opens the library and the project twice in one session
  - **Then** last-modified times and the statement that projects are not synchronised are shown, and the reminder appears only once
- **BI-080** Expresses: FR-006. Verified by: VO-080.
  - **Given** a project with an invalid block
  - **When** it is reloaded
  - **Then** the block shows its last working version and reverting to it works
- **BI-081** Expresses: FR-006, EC-14. Verified by: VO-081.
  - **Given** a project open in two tabs
  - **When** it is renamed or deleted from the library in one tab
  - **Then** the rename appears in every tab, and the other tab says the project was deleted and offers to download its content
- **BI-082** Expresses: FR-006. Verified by: VO-082.
  - **Given** files with and without a visually editable screen or flow
  - **When** each is imported
  - **Then** the first screen that can be edited visually opens, else the flow, else the first block
- **BI-083** Expresses: FR-006, FR-014, EC-12. Verified by: VO-083.
  - **Given** a project whose screen flow is made invalid or source-only
  - **When** it is reloaded and then downloaded
  - **Then** the same block is still the screen flow, and a notice says it will be imported as other content
- **BI-084** Expresses: FR-006, FR-011, EC-01. Verified by: VO-084.
  - **Given** an empty file, a file with only other diagram types, and a project with one block
  - **When** the files are imported and the last block is deleted or re-divided away
  - **Then** the empty file gives one new screen, the other file gives a project of other content with a status explaining why, and removing the last block is refused with the reason
- **BI-085** Expresses: FR-007. Verified by: VO-085.
  - **Given** the source view of a block
  - **When** the user types, pauses for 300 ms, types again and then undoes
  - **Then** each run of typing up to a pause or leaving the view is undone as one step
- **BI-086** Expresses: FR-007. Verified by: VO-086.
  - **Given** two projects with edits, and a project open in two tabs
  - **When** the user switches projects, reloads, or chooses Edit here instead
  - **Then** each project's history holds only its own edits, and after a reload or a handover the history is empty in both tabs
- **BI-087** Expresses: FR-007. Verified by: VO-087.
  - **Given** a project
  - **When** the user performs 201 operations
  - **Then** the 200 most recent operations can be undone and the oldest cannot
- **BI-088** Expresses: FR-007. Verified by: VO-088.
  - **Given** each operation kind listed for undo, with unrelated edits before it
  - **When** it is undone and redone
  - **Then** structure, properties and source return exactly to the earlier and later states, and unrelated changes are kept
- **BI-089** Expresses: FR-007. Verified by: VO-089.
  - **Given** a completed operation
  - **When** the user looks at the undo and redo controls
  - **Then** they name the action that will be undone or redone
- **BI-090** Expresses: FR-007, EC-19. Verified by: VO-090.
  - **Given** an edit in one screen while another screen is open
  - **When** the user undoes it
  - **Then** the affected screen opens first, the affected element is selected, and the change is announced
- **BI-091** Expresses: FR-007. Verified by: VO-091.
  - **Given** a history that passes through invalid source
  - **When** the user undoes to that point
  - **Then** the block is restored and shown as invalid
- **BI-092** Expresses: FR-007. Verified by: VO-092.
  - **Given** a property field with typed text that still has focus
  - **When** the user presses the undo shortcut
  - **Then** the typing in that field is undone first, and the typing counts as one step ending on leaving the field or pressing Enter
- **BI-093** Expresses: FR-008. Verified by: VO-093.
  - **Given** an operation that would produce invalid or unsupported source
  - **When** the user drags to its target or attempts it by keyboard or command
  - **Then** the target is not offered while dragging, and a keyboard or command attempt is refused with a message next to the target and an announcement, and nothing is changed in the source
- **BI-094** Expresses: FR-008, EC-08. Verified by: VO-094.
  - **Given** a screen with two root grids, and a screen with text after the root grid
  - **When** it is imported
  - **Then** the block is source only and its message says which content will not appear in the image, in wording different from syntax errors
- **BI-095** Expresses: FR-009. Verified by: VO-095.
  - **Given** each operation that FR-009 AC8 lists
  - **When** it completes
  - **Then** keyboard focus is on the element that FR-009 AC8 names for that operation
- **BI-096** Expresses: FR-009. Verified by: VO-096.
  - **Given** a screen in a form grid
  - **When** the user inserts, deletes, moves, undoes, redoes, reverts and moves focus
  - **Then** each change is announced through a polite status message, and each element is announced with its type, text, cell position and container
- **BI-097** Expresses: FR-009. Verified by: VO-097.
  - **Given** an open screen with nested grids
  - **When** the user uses arrows, Enter and Esc in the outline and on the canvas
  - **Then** the outline behaves as a tree with selection following focus, and on the canvas arrows move between cells, Enter moves into a container and Esc moves to its container
- **BI-098** Expresses: FR-009. Verified by: VO-098.
  - **Given** an inline edit, a drag, an open menu, and a plain selection
  - **When** the user presses Esc or Enter
  - **Then** Esc cancels the inline edit restoring the text, returns the dragged element, or closes the menu, and only otherwise selects the container, while Enter moves into a container or starts editing
- **BI-099** Expresses: FR-009, EC-18. Verified by: VO-099.
  - **Given** a flow with decisions, loops and empty branches
  - **When** the user uses the arrow keys, Enter, Esc and the move shortcut
  - **Then** Up and Down move along the path, Left and Right move between branches, Enter moves into a branch or body, Esc moves out, and the move shortcut never moves an element sideways
- **BI-100** Expresses: FR-009. Verified by: VO-100.
  - **Given** a selection of each kind
  - **When** the user looks for each structural command
  - **Then** each command is available as a visible control that shows its keyboard shortcut and from the keyboard, and none needs dragging
- **BI-101** Expresses: FR-009, FR-016. Verified by: VO-101.
  - **Given** focus in each workspace region in turn
  - **When** the user presses Esc in the source view and the region shortcut everywhere
  - **Then** Esc moves from the source view to the canvas selection, the shortcut reaches every region, and focus is never trapped
- **BI-102** Expresses: FR-009. Verified by: VO-102.
  - **Given** the full list of keyboard shortcuts
  - **When** it is compared with the combinations reserved by the supported browsers and common screen readers
  - **Then** no shortcut uses a reserved combination
- **BI-103** Expresses: FR-009, EC-17. Verified by: VO-103.
  - **Given** the workspace at 1024, 1280 and 800 px wide
  - **When** the user edits and views a project
  - **Then** every editing feature works at 1024 px and wider, and below 1024 px the application does not break and the project can be viewed
- **BI-104** Expresses: FR-009, EC-18. Verified by: VO-104.
  - **Given** a supported browser with touch input
  - **When** the user taps elements and visible commands
  - **Then** taps select and run commands and never delete or move anything unintentionally
- **BI-105** Expresses: FR-009, SC-003. Verified by: VO-105.
  - **Given** the library, the workspace with a screen and with the flow, and each dialog
  - **When** they are scanned against WCAG 2.2 level AA
  - **Then** no violation is reported for the editor interface
- **BI-106** Expresses: FR-010. Verified by: VO-106.
  - **Given** blocks of each status FR-010 AC1 lists
  - **When** they are imported
  - **Then** each shows its status with a plain-language reason, and render status shows Not yet checked until rendered
- **BI-107** Expresses: FR-010, EC-10. Verified by: VO-107.
  - **Given** screens and flows containing fork/join, switch, partitions, detach or kill, Salt inside a step, and unsupported Salt variants
  - **When** they are imported and other elements are edited
  - **Then** each unsupported piece is a locked part at the smallest isolatable unit with its reason and a source excerpt, and it stays byte-identical after the edits and after download
- **BI-108** Expresses: FR-010, EC-09. Verified by: VO-108.
  - **Given** blocks with preprocessor directives, a container with more than one style modifier, legacy activity syntax, and goto or label
  - **When** they are imported
  - **Then** each opens in source-only mode with an explanation, and the legacy and goto flows are not chosen as the screen flow
- **BI-109** Expresses: FR-010. Verified by: VO-109.
  - **Given** an invalid block with a last working version
  - **When** the user chooses Revert to last working version, before and after reloading
  - **Then** the block returns to its last working version in one action
- **BI-110** Expresses: FR-010. Verified by: VO-110.
  - **Given** a source-only block and a block of other content that the renderer fails on
  - **When** they are rendered
  - **Then** each shows Cannot be rendered with the renderer's message and is otherwise not reported as an error
- **BI-111** Expresses: FR-010. Verified by: VO-111.
  - **Given** well-formed blocks using an unknown container modifier and activity arrow labels
  - **When** they are imported
  - **Then** they are reported as having locked parts or as source only, never as Error
- **BI-112** Expresses: FR-010. Verified by: VO-112.
  - **Given** a file with several Salt blocks in the older form
  - **When** the user chooses Convert all
  - **Then** each block's opening and closing lines become the current form keeping any name, the salt line is removed, no other line changes, and one undo restores them all
- **BI-113** Expresses: FR-011, EC-11. Verified by: VO-113.
  - **Given** typed names with spaces, disallowed characters, non-English letters, combining marks and over 64 characters, and generated names that collide
  - **When** they are committed or generated
  - **Then** they follow the naming rules of section 3.6, typed names that convert to nothing keep the previous name, and generated names receive -2, -3 and so on
- **BI-114** Expresses: FR-011. Verified by: VO-114.
  - **Given** a file with screens, the flow, other content, text between blocks and comments directly above blocks
  - **When** the user adds, duplicates and reorders screens and other content, then downloads and re-imports
  - **Then** new blocks are placed as section 3.6 Block placement says, reordering exchanges only blocks of that kind with comments directly above moving with them, the project panel order equals file order, and order and names survive re-import
- **BI-115** Expresses: FR-011. Verified by: VO-115.
  - **Given** a screen that two steps link to
  - **When** the user deletes or renames it, and proceeds or cancels
  - **Then** the warning lists both steps, proceeding with delete keeps the steps with broken links and can be undone, and cancelling leaves the project unchanged
- **BI-116** Expresses: FR-011, EC-11. Verified by: VO-116.
  - **Given** a file with unnamed screens, disallowed and duplicated names, and a link whose target differs only in letter case
  - **When** it is imported
  - **Then** unnamed screens keep no name and the file stays byte-identical, disallowed and duplicate names are flagged and not changed, and the case-only link shows as broken with a suggested fix
- **BI-117** Expresses: FR-011. Verified by: VO-117.
  - **Given** a screen that steps link to
  - **When** the user duplicates it
  - **Then** the copy is placed after the original with a generated name and no incoming links, and undo removes it
- **BI-118** Expresses: FR-011. Verified by: VO-118.
  - **Given** a screen that three steps link to
  - **When** the user edits its name line in the source view and leaves
  - **Then** no confirmation is asked, an allowed and unique name updates the links in the same undo step with a notice, and any other name is flagged with a notice offering Undo that states how many links are broken
- **BI-119** Expresses: FR-011. Verified by: VO-119.
  - **Given** a file containing one Salt block
  - **When** it is opened
  - **Then** it becomes a single-screen project without conversion
- **BI-120** Expresses: FR-012. Verified by: VO-120.
  - **Given** a flow with lanes and elements inside decision branches
  - **When** one element's lane is changed
  - **Then** the command-line oracle renders every element in its own lane, and no other element changes lane
- **BI-121** Expresses: FR-012. Verified by: VO-121.
  - **Given** a flow with and without lanes
  - **When** the user changes the lane list and inserts and moves elements
  - **Then** the lane rules of section 3.7 hold, and the render shows the lanes in list order
- **BI-122** Expresses: FR-012. Verified by: VO-122.
  - **Given** flow elements with one and several notes
  - **When** the user adds, edits and deletes notes, and moves and deletes the elements
  - **Then** each note stays attached to its element in order with its side, and moves and is deleted with it, and undo restores it
- **BI-123** Expresses: FR-012. Verified by: VO-123.
  - **Given** decisions with elseif branches, empty branches, and loops with empty bodies
  - **When** they are built and rendered
  - **Then** the command-line oracle renders each flow, and any operation that would give an unrepresentable flow is refused
- **BI-124** Expresses: FR-012. Verified by: VO-124.
  - **Given** each kind of flow selection
  - **When** the user inserts a step
  - **Then** it is placed after the selected element, first in the selected branch or body, or before the final stop when nothing is selected, and is selected and focused
- **BI-125** Expresses: FR-012. Verified by: VO-125.
  - **Given** a project with a screen flow
  - **When** the user deletes the flow and confirms
  - **Then** the flow is removed, undo restores it, and the project panel shows Add screen flow
- **BI-126** Expresses: FR-013. Verified by: VO-126.
  - **Given** a step and two screens
  - **When** the user links it, changes the link and removes it
  - **Then** each change is written to the source, and linked steps look different from unlinked steps
- **BI-127** Expresses: FR-014, SC-005. Verified by: VO-127.
  - **Given** a project with blocks that cannot be rendered and blocks not yet checked
  - **When** the user downloads it
  - **Then** the download contains every block unchanged, and a non-blocking notice lists those blocks and says how many have not yet been checked
- **BI-128** Expresses: FR-015. Verified by: VO-128.
  - **Given** a project with screens, a flow, other content and links
  - **When** the user views the project panel
  - **Then** every block is listed in file order with its status, each screen shows how many steps link to it, and a project without a flow shows Add screen flow with a one-line explanation
- **BI-129** Expresses: FR-015, FR-016. Verified by: VO-129.
  - **Given** a project with screens, a flow and other content
  - **When** the user selects each in turn
  - **Then** the palette, outline, properties, source view and preview switch to it, and with nothing selected the properties panel shows the block's own properties
- **BI-130** Expresses: FR-015. Verified by: VO-130.
  - **Given** a block of other content
  - **When** the user opens, reorders and deletes it
  - **Then** it opens in the source view and cannot be edited visually, and reordering and deleting work as units and can be undone
- **BI-131** Expresses: FR-015. Verified by: VO-131.
  - **Given** a flow with linked steps
  - **When** the user collapses every panel and follows links
  - **Then** the canvas or preview fills the workspace, and links can still be followed to screens and back
- **BI-132** Expresses: FR-016. Verified by: VO-132.
  - **Given** the workspace at 1024 px wide
  - **When** the user opens it, changes panel visibility and reloads
  - **Then** every region and control FR-016 AC1 lists is present in the default arrangement, and the changed panel visibility is remembered
- **BI-133** Expresses: FR-016. Verified by: VO-133.
  - **Given** a project with text between blocks
  - **When** the user opens the whole-file view
  - **Then** it shows the whole file, cannot be edited, and can be copied
- **BI-134** Expresses: FR-016. Verified by: VO-134.
  - **Given** the interface and a project with non-English diagram content
  - **When** every label, command, message, status and announcement is checked
  - **Then** all of them come from the separate English text collection, and the non-English content is shown and saved unchanged
- **BI-135** Expresses: FR-018, SC-008. Verified by: VO-135.
  - **Given** one completed online visit
  - **When** the network is disconnected and the browser reloaded and restarted
  - **Then** the application opens, and preview and image export work
- **BI-136** Expresses: FR-019, EC-16. Verified by: VO-136.
  - **Given** a browser other than the latest two versions of Chrome or Edge
  - **When** the application is opened
  - **Then** it says the browser is not supported
- **BI-137** Expresses: SC-006. Verified by: VO-137.
  - **Given** the reference project on a mid-range laptop
  - **When** the user selects, inserts, moves, changes properties, types and waits for the preview
  - **Then** canvas feedback takes 100 ms or less, the source updates within 200 ms, the visual model within 500 ms of a pause, and the preview within 3 s
- **BI-138** Expresses: SC-001, FR-008, FR-001. Verified by: MV-001.
  - **Given** the shipped editor
  - **When** run the two SC-001 tasks with at least 5 business analysts or product owners who do not know PlantUML
  - **Then** at least 4 of 5 complete both tasks unaided within 15 minutes without writing source
- **BI-139** Expresses: SC-002, FR-002. Verified by: MV-002.
  - **Given** the shipped editor
  - **When** in the same sessions, ask each participant which container a selected field belongs to and to select it
  - **Then** at least 4 of 5 succeed without help
- **BI-140** Expresses: SC-003, FR-009. Verified by: MV-003.
  - **Given** the shipped editor
  - **When** complete both SC-001 tasks using only a keyboard, then with a screen reader in focus mode on each supported browser
  - **Then** both tasks complete, every element is announced meaningfully, and the canvas key model works in focus mode
- **BI-141** Expresses: FR-008, FR-003. Verified by: MV-004.
  - **Given** the shipped editor
  - **When** review the palette, properties panel, statuses and messages against the terminology table, and each palette description for Salt limits
  - **Then** terms match the terminology table, no property needs Salt knowledge, each limited construct's description states its limit, and selection, insertion and focus states are clearly visible
- **BI-142** Expresses: FR-016, FR-009. Verified by: MV-005.
  - **Given** the shipped editor
  - **When** inspect the canvas, the flow canvas and the source view, and try a touchscreen device
  - **Then** the canvas looks like a Salt wireframe with no free positioning, limited constructs look as Salt draws them, source is highlighted, and touch uses taps and visible commands only
- **BI-143** Expresses: SC-009. Verified by: exemption SC-009.
  - **Given** the specification and its diagrams
  - **When** a requirement or diagram changes
  - **Then** every diagram branch and transition still maps to an acceptance criterion
