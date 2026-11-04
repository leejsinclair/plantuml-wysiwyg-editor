# Block Management — Living Spec

> [DRAFT] Adopted from the code's surface and the project's conventions. Review before trusting.

## Purpose

Block management lets a person navigate between, add, rename and delete the screens and other content blocks that make up a project. Without it a person could not reach different screens, grow the project or clean it up.

## Requirements

### Every block in the project is listed in the project panel
<!-- touches: src/ui/project-panel/**, src/core/project/** -->
<!-- adopted: src/ui/project-panel/ProjectPanel.tsx -->

The project panel SHALL list every block: screens in file order, then the screen flow if one exists, then other blocks in file order. Each entry shows the block's name, its render status and any name flag.

#### Scenario: project with several screens and a flow
- **WHEN** a person opens a project with screens and a screen flow
- **THEN** all screens appear in file order, the screen flow follows, and "other" blocks come last

#### Scenario: unnamed screen
- **WHEN** a screen has no name
- **THEN** it is labelled "Untitled screen N" where N is its sequential number among unnamed screens

### Choosing an entry in the project panel opens that block
<!-- touches: src/ui/project-panel/**, src/ui/workspace/**, src/ui/app/** -->
<!-- adopted: src/ui/project-panel/ProjectPanel.tsx, src/ui/app/App.tsx -->

Activating a block entry in the project panel SHALL open that block in the workspace and update the URL.

#### Scenario: person clicks a block entry
- **WHEN** a person activates a block in the project panel
- **THEN** that block opens in the canvas and source view, and the URL reflects the open block

### A screen is added to the project
<!-- touches: src/ui/project-panel/**, src/core/project/** -->
<!-- adopted: src/ui/project-panel/screen-commands.tsx -->

A person SHALL be able to add a new screen to the project from the project panel header. The new screen opens immediately.

#### Scenario: add screen
- **WHEN** a person activates "Add screen"
- **THEN** a new empty screen appears in the panel and opens in the workspace

### A block is renamed
<!-- touches: src/ui/project-panel/**, src/core/project/** -->
<!-- adopted: src/ui/project-panel/RenameField.tsx -->

A person SHALL be able to rename any screen or named block. The new name is validated and a flag appears if it is invalid or a duplicate.

#### Scenario: rename to a valid unique name
- **WHEN** a person renames a block to a name not already in use
- **THEN** the block appears with the new name in the panel and source

#### Scenario: rename to a duplicate name
- **WHEN** a person renames a block to a name already used in the project
- **THEN** a duplicate-name flag appears on both blocks

### An unknown or deleted project opens the library with a notice
<!-- touches: src/ui/app/**, src/ui/notices/** -->
<!-- adopted: src/ui/app/App.tsx -->

When a URL names a project that does not exist in storage, the application SHALL show the library and display a notice.

#### Scenario: navigate to an unknown project URL
- **WHEN** a person opens a URL whose project ID is not in storage
- **THEN** the library opens and a notice explains the project was not found

### The open block key is reflected in the URL
<!-- touches: src/ui/app/** -->
<!-- adopted: src/ui/app/App.tsx -->

The URL SHALL always reflect the open block so a person can bookmark or share a link to a specific block.

#### Scenario: person opens a block
- **WHEN** a person opens a block
- **THEN** the URL updates to include the block key without adding a browser history entry

#### Scenario: a stale block key in the URL
- **WHEN** a person arrives at a URL with a block key that no longer exists
- **THEN** the project opens at its first block

### The outline shows the structure of the open screen
<!-- touches: src/ui/outline/**, src/core/salt/** -->
<!-- adopted: src/ui/outline/screen-outline.tsx -->

For screen blocks, the outline panel SHALL display the hierarchy of components and follow the current canvas selection.

#### Scenario: component selected on canvas
- **WHEN** a person selects a component
- **THEN** the outline panel expands to show that component and it is highlighted

#### Scenario: flow block open
- **WHEN** the open block is a screen flow, not a screen
- **THEN** the outline panel shows the flow outline, not the screen hierarchy

## Uncovered

- Block conversion (screen ↔ other) is implemented in `src/core/blocks/` and triggered via the project panel slot. The observable behaviour is not yet detailed here.
- The breadcrumb (`src/ui/workspace/Breadcrumb.tsx`) shows the project name and the open block name. No separate requirement is written because it is a display-only summary of state already covered above.
- `src/core/**` layer isolation is enforced by the linter, not a management requirement.
