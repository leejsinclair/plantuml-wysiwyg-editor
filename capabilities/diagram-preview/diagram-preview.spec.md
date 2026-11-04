# Diagram Preview — Living Spec

> [DRAFT] Adopted from the code's surface and the project's conventions. Review before trusting.

## Purpose

The preview pane shows the rendered SVG of the open block so a person can see what the diagram looks like without leaving the editor. Without it a person would have to export and open the file in an external tool to see the result.

## Requirements

### The current block renders and its SVG is shown
<!-- touches: src/ui/preview/**, src/services/render/** -->
<!-- adopted: src/ui/preview/Preview.tsx, src/services/render/render-queue.ts -->

The preview pane SHALL render the open block's source and display the resulting SVG.

#### Scenario: block renders successfully
- **WHEN** the open block's source produces a valid diagram
- **THEN** the rendered SVG appears in the preview pane

#### Scenario: nothing has been rendered yet
- **WHEN** a block has never been rendered
- **THEN** the pane shows "Not yet checked" with no image

### An out-of-date render is shown while the current text is pending
<!-- touches: src/ui/preview/**, src/services/render/** -->
<!-- adopted: src/ui/preview/Preview.tsx -->

While the current text has not yet produced a result, the last successful render SHALL remain visible, marked as out of date.

#### Scenario: source edited since last render
- **WHEN** a person edits the block after a successful render
- **THEN** the previous render stays visible with an "out of date" label until the new render arrives

#### Scenario: rendering times out
- **WHEN** the renderer does not reply within 10 seconds
- **THEN** the status shows "Not yet checked", the last successful render (if any) stays visible, and rendering continues with a new worker

### A rendering failure shows a plain explanation
<!-- touches: src/ui/preview/**, src/services/render/** -->
<!-- adopted: src/ui/preview/Preview.tsx -->

When the renderer reports that it could not draw the diagram, the preview SHALL show the renderer's error message together with a plain explanation labelled as a rendering problem.

#### Scenario: PlantUML returns an error
- **WHEN** the renderer produces an error image or failure message
- **THEN** the preview shows a rendering-problem section with the renderer's message

### Blocks with external dependencies are never rendered
<!-- touches: src/services/render/** -->
<!-- adopted: src/services/render/render-queue.ts -->

A block that depends on `!include` or another external file SHALL never be sent to the renderer. Its last successful render, if any, is shown as out of date.

#### Scenario: block uses !include
- **WHEN** the open block contains an `!include` directive
- **THEN** the block is not sent to the renderer; any previous render is shown as out of date

### Diagram content never leaves the browser
<!-- touches: src/services/render/** -->
<!-- adopted: src/services/render/render-queue.ts -->

Rendering SHALL happen entirely within the browser. No diagram source or image is sent to a remote server.

#### Scenario: any render request
- **WHEN** a block is rendered
- **THEN** the work is done in a local Web Worker with no network request for the diagram content

### SVG is sanitised before it is shown
<!-- touches: src/ui/preview/**, src/services/render/** -->
<!-- adopted: src/ui/preview/Preview.tsx, src/services/render/sanitize.ts -->

The renderer's SVG SHALL be sanitised before it is placed in the page, so that script or external references in the SVG cannot affect the application.

#### Scenario: SVG with a script element
- **WHEN** the renderer returns SVG containing a script element
- **THEN** the script is stripped and the sanitised SVG is shown

### Clicking a link in the preview navigates within the editor
<!-- touches: src/ui/preview/** -->
<!-- adopted: src/ui/preview/Preview.tsx -->

A link in the rendered SVG (a linked flow step) SHALL pass its target to the application without following the link URL.

#### Scenario: click a linked-step badge in the preview
- **WHEN** a person clicks a link in the rendered diagram
- **THEN** the editor navigates to the linked block; the browser does not navigate away

## Uncovered

- The render queue prioritises the open block, then other blocks in request order. This is an implementation detail of scheduling, not an observable user behaviour.
- Offline rendering (principle 6): the Web Worker bundles the PlantUML renderer, so the preview works offline after the first page load. The constraint is constitution principle 6; the enforcement is in how `main.tsx` sets up the worker.
