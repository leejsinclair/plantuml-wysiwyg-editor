# Source Editing — Living Spec

> [DRAFT] Adopted from the code's surface and the project's conventions. Review before trusting.

## Purpose

The source view shows the raw PlantUML text for the open block and lets a person edit it directly when the block supports it. Without it a person cannot inspect or manually correct the generated source.

## Requirements

### The source for the open block is always visible and readable
<!-- touches: src/ui/source-view/** -->
<!-- adopted: src/ui/source-view/SourceView.tsx -->

The source view SHALL always display the full PlantUML text of the open block, with syntax highlighting, even when the block is read-only.

#### Scenario: block is open
- **WHEN** a person opens any block
- **THEN** its full source text is visible in the source view

#### Scenario: read-only block
- **WHEN** the block is read-only
- **THEN** the source is visible and can be focused and navigated, but typing is ignored

### Typing in the source view updates the block
<!-- touches: src/ui/source-view/** -->
<!-- adopted: src/ui/source-view/SourceView.tsx -->

When the block supports source editing, every keystroke SHALL update the block's text after a short pause.

#### Scenario: person types in the source view
- **WHEN** a person types in the source view
- **THEN** the block's text is updated after a brief delay and the canvas reflects the change

### Pressing Esc returns focus to the canvas
<!-- touches: src/ui/source-view/** -->
<!-- adopted: src/ui/source-view/SourceView.tsx -->

Pressing Esc in the source view SHALL end the source edit and move focus back to the canvas selection.

#### Scenario: Esc pressed during source editing
- **WHEN** a person presses Esc in the source view
- **THEN** the source edit ends and focus moves to the canvas

### Tab never traps focus in the source view
<!-- touches: src/ui/source-view/** -->
<!-- adopted: src/ui/source-view/SourceView.tsx -->

The Tab key SHALL never be consumed by the source editor; it always moves focus to the next focusable element outside.

#### Scenario: Tab pressed in source view
- **WHEN** a person presses Tab while the source view is focused
- **THEN** focus moves to the next element in the page tab order, not inside the editor

### The selected canvas element is highlighted in the source view
<!-- touches: src/ui/source-view/**, src/core/salt/** -->
<!-- adopted: src/ui/source-view/SourceView.tsx -->
<!-- aligns: wireframe-canvas#The selected component's source range is highlighted in the source view -->

When a canvas element is selected, its corresponding text range in the source view SHALL be highlighted.

#### Scenario: canvas element selected
- **WHEN** a person selects a component on the canvas
- **THEN** the source view scrolls to and highlights that component's text

#### Scenario: nothing selected
- **WHEN** no canvas element is selected
- **THEN** no range is highlighted in the source view

### A visual edit flashes its changed lines in the source view
<!-- touches: src/ui/source-view/**, src/core/source/** -->
<!-- adopted: src/ui/source-view/SourceView.tsx -->

When the canvas applies a change, the affected lines in the source view SHALL flash briefly to show what changed.

#### Scenario: component moved on the canvas
- **WHEN** a person moves a component on the canvas
- **THEN** the lines that changed in the source view flash for a short moment

## Uncovered

- "Fix in source" (jump to a specific line from an error message) is implemented in `SourceView.focusLine` but the command that calls it is registered elsewhere. Observable behaviour of "Fix in source" belongs to whichever capability surfaces the error.
