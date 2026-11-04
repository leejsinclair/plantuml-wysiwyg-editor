# Wireframe Canvas — Living Spec

> [DRAFT] Adopted from the code's surface and the project's conventions. Review before trusting.

## Purpose

The wireframe canvas lets a person build Salt UI layouts visually without writing PlantUML. It renders a screen as a grid of cells, each of which holds a UI component, and it keeps the underlying source in sync with every visual change. Without it a person would need to write and maintain Salt syntax by hand.

## Requirements

### A screen renders as a grid of selectable cells
<!-- touches: src/ui/canvas/**, src/core/salt/** -->
<!-- adopted: src/ui/canvas/SaltCanvas.tsx -->

The canvas SHALL render a Salt screen as a grid and let a person select any cell by click or keyboard.

#### Scenario: screen with components
- **WHEN** a person opens a screen that has content
- **THEN** each component appears in its cell and one cell can be selected at a time

#### Scenario: empty screen
- **WHEN** a person opens a screen with no components
- **THEN** a prompt is shown to add the first component

### Layout guides reveal the grid structure when turned on
<!-- touches: src/ui/canvas/** -->
<!-- adopted: src/ui/canvas/SaltCanvas.tsx -->

When "Show layout guides" is on, empty cells SHALL be outlined so the grid structure is visible.

#### Scenario: layout guides enabled
- **WHEN** a person turns on "Show layout guides"
- **THEN** empty cells are visible as outlines in the grid

#### Scenario: layout guides disabled
- **WHEN** "Show layout guides" is off
- **THEN** empty cells are not shown

### A component is added by drag from the palette
<!-- touches: src/ui/canvas/**, src/ui/palette/**, src/core/salt/** -->
<!-- adopted: src/ui/canvas/SaltCanvas.tsx -->

A person SHALL be able to drag a component from the palette and drop it into a valid cell.

#### Scenario: drop on a valid cell
- **WHEN** a person drags a component from the palette onto a valid cell
- **THEN** the component appears in that cell and the source updates

#### Scenario: drop on an invalid destination
- **WHEN** a person drops a component onto a cell that cannot accept it
- **THEN** the drop is ignored and the canvas is unchanged

### A selected component is deleted
<!-- touches: src/ui/canvas/**, src/core/salt/** -->
<!-- adopted: src/ui/canvas/canvas-keys.ts -->

A person SHALL be able to remove the selected component with the keyboard.

#### Scenario: delete selected component
- **WHEN** a component is selected and the person presses the delete key
- **THEN** the component is removed from the canvas and the source updates

### A selected component's properties are edited in the properties panel
<!-- touches: src/ui/canvas/**, src/ui/properties/**, src/core/salt/** -->
<!-- adopted: src/ui/properties/PropertiesPanel.tsx -->

When a component is selected, the properties panel SHALL show its editable properties and apply changes immediately.

#### Scenario: change a text property
- **WHEN** a person selects a component and edits its label in the properties panel
- **THEN** the component's label updates on the canvas and in the source

#### Scenario: no component selected
- **WHEN** nothing is selected on the canvas
- **THEN** the properties panel shows no component-specific fields

### A component is moved to another cell
<!-- touches: src/ui/canvas/**, src/core/salt/** -->
<!-- adopted: src/ui/canvas/SaltCanvas.tsx, src/ui/workspace/MoveToDialog.tsx -->

A person SHALL be able to move a selected component by drag-and-drop or via the "Move to" dialog.

#### Scenario: move by drag-and-drop
- **WHEN** a person drags a selected component to a valid target cell
- **THEN** the component moves to that cell

#### Scenario: move via the "Move to" dialog
- **WHEN** a person uses the "Move to" dialog and confirms a destination
- **THEN** the component moves to the chosen cell

### The selected component's source range is highlighted in the source view
<!-- touches: src/ui/canvas/**, src/core/salt/** -->
<!-- adopted: src/ui/canvas/SaltCanvas.tsx -->
<!-- aligns: source-editing#The selected canvas element is highlighted in the source view -->

When a component is selected on the canvas, its corresponding range in the source view SHALL be highlighted.

#### Scenario: component selected
- **WHEN** a person selects a component
- **THEN** the source view highlights the component's source text

### Locked content is visible but not editable
<!-- touches: src/ui/canvas/** -->
<!-- adopted: src/ui/canvas/SaltCanvas.tsx, src/ui/workspace/LockedPlaceholder.tsx -->

Content the editor cannot parse SHALL appear as a locked placeholder that a person can see but not edit.

#### Scenario: screen contains locked content
- **WHEN** a screen has content the editor does not understand
- **THEN** a locked placeholder appears and no editing operations apply to it

### Canvas edits can be undone and redone
<!-- touches: src/ui/canvas/**, src/core/history/** -->
<!-- adopted: src/ui/canvas/SaltCanvas.tsx -->

A person SHALL be able to undo and redo any canvas edit with the standard keyboard shortcuts.

#### Scenario: undo a deletion
- **WHEN** a person deletes a component and then undoes
- **THEN** the component is restored

#### Scenario: redo after undo
- **WHEN** a person undoes and then redoes
- **THEN** the edit is re-applied

## Uncovered

- `src/core/salt/**` has no browser or UI imports; enforced by the linter (`eslint.config.js`). This is an architecture rule, not a canvas requirement.
- Accessibility: every canvas operation must have a keyboard alternative (constitution principle 7). Keyboard bindings live in `src/ui/canvas/canvas-keys.ts`.
