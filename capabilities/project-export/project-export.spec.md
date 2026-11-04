# Project Export — Living Spec

> [DRAFT] Adopted from the code's surface and the project's conventions. Review before trusting.

## Purpose

Project export lets a person get their work out of the editor as a standard `.puml` file and get diagrams out as images, and lets them bring an existing `.puml` file in. Without it projects are stranded in the browser's IndexedDB and diagrams cannot be used anywhere else.

## Requirements

### A project is downloaded as a .puml file
<!-- touches: src/ui/storage/**, src/services/storage/** -->
<!-- adopted: src/ui/storage/DownloadCommand.tsx -->

A person SHALL be able to download the open or library-listed project as a `.puml` file. Downloading records a "last downloaded" timestamp on the project.

#### Scenario: download succeeds
- **WHEN** a person activates "Download"
- **THEN** a `.puml` file is saved to the person's device and the project's last-downloaded time is updated

#### Scenario: project downloaded then changed
- **WHEN** a person edits a project after downloading it
- **THEN** the library shows a "not downloaded" indicator until the project is downloaded again

### A .puml file is imported as a new project
<!-- touches: src/ui/storage/**, src/services/files/** -->
<!-- adopted: src/ui/storage/ImportCommand.tsx -->

A person SHALL be able to import a `.puml` file from their device. The import creates a new project named after the file, opens it, and shows a notice.

#### Scenario: valid UTF-8 .puml file
- **WHEN** a person picks a valid `.puml` file
- **THEN** a new project is created named after the file, the project opens on its first editable screen, and a notice confirms the import

#### Scenario: name already in use
- **WHEN** the filename matches an existing project name
- **THEN** the import date is appended to make the name unique

#### Scenario: file is not valid UTF-8 text
- **WHEN** the file cannot be read as UTF-8
- **THEN** the import is refused with an explanation and no project is created

### The open block's image is exported as SVG or PNG
<!-- touches: src/ui/export/**, src/services/render/** -->
<!-- adopted: src/ui/export/ExportCommands.tsx -->

A person SHALL be able to export the open block's current render as an SVG file or a PNG file.

#### Scenario: block has a current successful render
- **WHEN** a person activates "Export SVG" or "Export PNG" for a rendered block
- **THEN** the image file is saved to the person's device

#### Scenario: block is invalid, depends on !include, or has not rendered
- **WHEN** a person activates image export for a block that cannot be exported
- **THEN** the export button shows a plain explanation and no file is saved

### The open block's source can be copied to the clipboard
<!-- touches: src/ui/export/** -->
<!-- adopted: src/ui/export/ExportCommands.tsx -->

A person SHALL be able to copy the open block's source to the clipboard. A confirmation or failure message is shown.

#### Scenario: copy succeeds
- **WHEN** a person activates "Copy source"
- **THEN** the block's source is on the clipboard and a confirmation appears

#### Scenario: browser refuses clipboard access
- **WHEN** the browser does not allow the clipboard write
- **THEN** a failure message is shown

### The whole project source can be copied to the clipboard
<!-- touches: src/ui/export/** -->
<!-- adopted: src/ui/export/ExportCommands.tsx -->

A person SHALL be able to copy the entire project source (all blocks) to the clipboard.

#### Scenario: copy project source
- **WHEN** a person activates "Copy project source"
- **THEN** the full project source is on the clipboard and a confirmation appears

### Image export does not update the last-downloaded timestamp
<!-- touches: src/ui/export/**, src/services/render/** -->
<!-- adopted: src/ui/export/ExportCommands.tsx -->

Exporting an SVG or PNG SHALL not change the project's last-downloaded timestamp. Only a `.puml` download updates it.

#### Scenario: export SVG then check library
- **WHEN** a person exports the current block as SVG
- **THEN** the project's last-downloaded time in the library is unchanged

## Uncovered

- Tab persistence across page reloads (`src/services/storage/tabs.ts`): keeps the open block key in sessionStorage so the correct block reopens after a reload. This is an implementation detail of startup, not export behaviour.
