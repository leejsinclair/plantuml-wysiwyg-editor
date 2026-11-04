# Project Library — Living Spec

> [DRAFT] Adopted from the code's surface and the project's conventions. Review before trusting.

## Purpose

The project library is the entry point of the application. It lists every saved project so a person can open one or start a new one. Without it there is no way to reach a project or see what has and has not been downloaded.

## Requirements

### Every saved project is listed, most recently modified first
<!-- touches: src/ui/library/** -->
<!-- adopted: src/ui/library/Library.tsx -->

The library SHALL display all saved projects ordered from most recently modified to least, each showing its name, when it was last modified, and when it was last downloaded (or "never downloaded").

#### Scenario: several projects exist
- **WHEN** a person opens the library
- **THEN** all saved projects are listed, most recently modified first, each with a name and last-modified time

#### Scenario: no projects have been saved yet
- **WHEN** a person opens the library for the first time
- **THEN** an empty-state message is shown instead of a list

### A project that changed after its last download is flagged
<!-- touches: src/ui/library/** -->
<!-- adopted: src/ui/library/Library.tsx -->

When a project has been downloaded at least once and has changed since, the library SHALL show a "not downloaded" indicator on that row.

#### Scenario: edits made after a download
- **WHEN** a project was modified after its last download
- **THEN** a "not downloaded" indicator appears beside it

#### Scenario: project never downloaded
- **WHEN** a project has never been downloaded
- **THEN** no "not downloaded" indicator appears; the download column reads "never downloaded"

### A new project is created from the library
<!-- touches: src/ui/library/** -->
<!-- adopted: src/ui/library/Library.tsx -->

Activating "Create project" SHALL write a new project named "Untitled project" with one empty screen, then open it.

#### Scenario: successful creation
- **WHEN** a person activates "Create project"
- **THEN** a new project is saved and its workspace opens immediately

#### Scenario: storage write fails during creation
- **WHEN** the storage write fails
- **THEN** an error message appears and the person stays in the library

### The library tells the person projects are not synchronised
<!-- touches: src/ui/library/** -->
<!-- adopted: src/ui/library/Library.tsx -->

The library SHALL always display a notice that projects are stored locally and are not synchronised between browsers or devices.

#### Scenario: library is open
- **WHEN** the library is visible
- **THEN** a statement about local-only storage is present on the page

### The library recovers from a storage read failure
<!-- touches: src/ui/library/** -->
<!-- adopted: src/ui/library/Library.tsx -->

When reading the project list from storage fails, the library SHALL show an error message rather than an empty list.

#### Scenario: storage read fails on open
- **WHEN** the list cannot be read from storage
- **THEN** an alert is shown and no project rows are displayed

## Uncovered

- Per-row commands (rename, duplicate, delete) and the import button are registered via the `library` slot by separate commands. Their observable behaviour belongs to `block-management` (rename) and `project-export` (download, duplicate, delete, import).
