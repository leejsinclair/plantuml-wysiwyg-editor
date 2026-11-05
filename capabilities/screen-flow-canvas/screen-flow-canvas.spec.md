# Screen Flow Canvas — Living Spec

> [DRAFT] Adopted from the code's surface and the project's conventions. Review before trusting.

## Purpose

The screen flow canvas lets a person build activity diagrams visually, showing how screens connect, without writing PlantUML activity syntax. Without it a person would need to author and maintain activity diagram syntax by hand.

## Requirements

### A screen flow renders as a top-to-bottom list of steps
<!-- touches: src/ui/flow-canvas/**, src/core/activity/** -->
<!-- adopted: src/ui/flow-canvas/FlowCanvas.tsx -->

The flow canvas SHALL render the screen flow as an ordered sequence of elements — steps, decisions, loops and swimlane markers — from top to bottom, with each element selectable.

#### Scenario: flow with content
- **WHEN** a person opens a screen flow block
- **THEN** every flow element appears in order and one can be selected at a time

#### Scenario: empty screen flow
- **WHEN** the screen flow has no elements
- **THEN** an empty-state prompt is shown

### A flow step links to a screen and shows its link status
<!-- touches: src/ui/flow-canvas/**, src/ui/flow-links/**, src/core/activity/**, src/core/project/** -->
<!-- adopted: src/ui/flow-canvas/FlowCanvas.tsx, src/ui/flow-links/LinkControl.tsx -->
<!-- aligns: block-management#A block is listed in the project panel with its status -->

Each step in the flow that names a screen SHALL display a badge showing whether that screen exists and is unambiguous (linked), does not exist (broken), or matches more than one screen (ambiguous).

#### Scenario: step linked to an existing, unique screen
- **WHEN** a step names a screen that exists once in the project
- **THEN** the step shows a "linked" badge

#### Scenario: step names a screen that does not exist
- **WHEN** a step names a screen that is not in the project
- **THEN** the step shows a "broken" badge

#### Scenario: step names a screen that matches more than one block
- **WHEN** a step names a string that matches more than one screen
- **THEN** the step shows an "ambiguous" badge

### Flow elements are added, moved and deleted
<!-- touches: src/ui/flow-canvas/**, src/core/activity/** -->
<!-- adopted: src/ui/flow-canvas/FlowCanvas.tsx -->

A person SHALL be able to add new flow elements, move them up or down, and delete them with keyboard commands.

#### Scenario: add a step after the selection
- **WHEN** a person adds a step while one is selected
- **THEN** the new step appears after the selected element

#### Scenario: move an element up
- **WHEN** a person moves a selected element up
- **THEN** the element swaps with the one above it

#### Scenario: delete an element
- **WHEN** a person deletes a selected element
- **THEN** the element is removed and the source updates

### Swimlane markers show when an element's lane changes
<!-- touches: src/ui/flow-canvas/**, src/core/activity/** -->
<!-- adopted: src/ui/flow-canvas/FlowCanvas.tsx -->

The canvas SHALL insert a lane label before each element whose lane differs from the preceding one.

#### Scenario: two adjacent elements in different lanes
- **WHEN** consecutive elements belong to different swimlanes
- **THEN** a lane marker appears between them naming the new lane

### Notes are shown beside their owner
<!-- touches: src/ui/flow-canvas/**, src/core/activity/** -->
<!-- adopted: src/ui/flow-canvas/FlowCanvas.tsx, src/ui/flow-canvas/NotesEditor.tsx -->

Notes attached to a flow element SHALL appear beside that element, not in the step sequence.

#### Scenario: step with an attached note
- **WHEN** a flow step has a note
- **THEN** the note appears alongside that step, not as a separate sequential item

### Locked content is visible but not editable
<!-- touches: src/ui/flow-canvas/**, src/ui/workspace/** -->
<!-- adopted: src/ui/flow-canvas/FlowCanvas.tsx, src/ui/workspace/LockedPlaceholder.tsx -->

Content the editor cannot parse SHALL appear as a locked placeholder.

#### Scenario: flow contains locked content
- **WHEN** the flow has content the editor does not understand
- **THEN** a locked placeholder is shown and no editing operations apply to it

### Flow edits can be undone and redone
<!-- touches: src/ui/flow-canvas/**, src/core/history/** -->
<!-- adopted: src/ui/flow-canvas/FlowCanvas.tsx -->

A person SHALL be able to undo and redo any flow edit with the standard keyboard shortcuts.

#### Scenario: undo a deletion
- **WHEN** a person deletes a step and then undoes
- **THEN** the step is restored in its original position

### Screens are added to a flow from the palette
<!-- touches: src/ui/flow-canvas/**, src/core/activity/** -->
<!-- adopted: src/ui/flow-canvas/FlowPalette.tsx, src/ui/flow-canvas/flow-dnd.tsx -->

The flow palette SHALL list every named screen under "Screens". Clicking one SHALL insert a step linked to it after the selected element, or before the final stop when nothing is selected; dragging it onto the flow SHALL insert the step at the drop position. With no screens the palette SHALL say so.

#### Scenario: click a screen
- **WHEN** a person clicks "Home" in the palette with nothing selected
- **THEN** a step linked to Home appears before the flow's final stop

#### Scenario: drag a screen
- **WHEN** a person drags "Home" onto the flow
- **THEN** a linked step appears at the drop position

### An empty flow explains how to build one
<!-- touches: src/ui/flow-canvas/** -->

A flow with no steps SHALL show guidance on adding steps and linking them to screens.

## Uncovered

- `src/core/activity/**` has no browser or UI imports; enforced by the linter. This is an architecture rule, not a flow requirement.
- Accessibility: every flow editing operation must have a keyboard alternative (constitution principle 7). Bindings live in `src/ui/flow-canvas/flow-keys.ts`.
