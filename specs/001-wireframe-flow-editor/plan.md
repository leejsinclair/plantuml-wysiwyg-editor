# Implementation Plan: PlantUML Wireframe and Screen Flow Editor

**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md) | **Data model**: [data-model.md](data-model.md) | **Contracts**: [contracts/](contracts/) | **Date**: 2026-10-27

## Summary

Business analysts build PlantUML Salt screens and one linked activity-diagram screen flow visually, in the browser, and exchange the project as one standard `.puml` file without losing anything they or others wrote. The technical approach makes the source text the only truth. Hand-written lossless parsers derive the editor model from it, and every visual operation becomes a small text patch followed by a re-parse. Byte-identical round trips, grammar-based block status and undo therefore share one mechanism. The application is a static TypeScript, Vite and React site. It stores projects in IndexedDB, renders with the official in-browser PlantUML build (`@plantuml/core` 1.2026.9) in a Web Worker it can terminate, and precaches everything in a service worker for offline use. The repository has no code yet, so every stack choice is new and recorded in [research.md](research.md).

The plan depends on the renderer feasibility gate (OD-1). Its spike is the first phase of work, and the renderer decision is revisited if the spike fails.

## Technical Context

| Item | Choice |
| ---- | ------ |
| Language | TypeScript 6.0 (strict), ES2023 target. 6.0 is the newest release `typescript-eslint` supports |
| Build | Vite, static output, no server |
| UI | React 19; state in a small external store read with `useSyncExternalStore` (R-14) |
| Source view | CodeMirror 6 with a Lezer highlighter (R-6) |
| Drag and drop | `@dnd-kit/core` with activation constraints (R-7) |
| Renderer | `@plantuml/core` pinned to `1.2026.9`, in a dedicated Web Worker (R-1) |
| Sanitising | DOMPurify, SVG profile, plus an href filter (R-8) |
| Storage | IndexedDB through `idb`; Web Locks and `BroadcastChannel` for tabs (R-5) |
| Offline | Workbox service worker through `vite-plugin-pwa`, precaching every file (R-10) |
| Testing (proposed) | Vitest (core, and UI with jsdom), Playwright with `@axe-core/playwright` (Chrome, Edge), and a command-line oracle on `plantuml-1.2026.9.jar` (R-13) |
| Target platform | Latest two major versions of desktop Chrome and Edge, 1024 px and wider |
| Performance goals | SC-006: canvas ≤ 100 ms, source ≤ 200 ms, re-parse ≤ 500 ms after a 300 ms pause, preview ≤ 3 s |
| Constraints | No network after load except the application's own files; offline after one visit; byte-identical round trips |
| Scale | Reference project: 10 screens of about 50 components and a flow of about 30 steps. No maximum size (OD-14) |

## Constitution Check

Gate before Phase 0, re-checked after Phase 1 (the result below is the post-design re-check).

| # | Principle | Assessment |
| - | --------- | ---------- |
| 1 | Visual-first | PASS. Every operation is a visual or keyboard command; the source view is optional. Escaping is applied by the core writers, so users never type syntax (section 3.4). |
| 2 | Structured by design | PASS. The Salt model is grids and cells only, and the flow model is paths, branches and bodies. There are no coordinates anywhere in the data model. |
| 3 | Standards-based output | PASS. Writers emit only constructs in the Supported Constructs tables. The command-line oracle suite checks every generated block. Unrenderable user content is kept and listed on download. |
| 4 | Never lose user work | PASS. Source is the only truth and every edit is a text patch (R-3). Storage writes are atomic (R-5). Invalid text is stored as typed. |
| 5 | Predictable editing | PASS. Visual edits, source typing and undo all go through the same apply-patch-then-parse path. |
| 6 | Local and private | PASS. The renderer runs in a worker with every loader refusing, there is no analytics, and the service worker precaches everything (R-1, R-10). |
| 7 | Accessible to non-developers | PASS. The design follows the WCAG 2.2 AA target, the accessible tree and grid patterns, a single announcer, and a keyboard command for every action. |
| 8 | Developer-friendly handover | PASS. Generated source follows one house style, and the file format has no proprietary additions (R-4). |
| 9 | Testable core | PASS. `src/core` has no DOM or browser imports, which an ESLint boundary rule enforces, and it is tested in Node. |

No violations, so there is no Complexity Tracking table.

## Project Structure

```text
package.json                 scripts: dev, build, test:unit, test:e2e, test:oracle, lint
vite.config.ts               app, worker and service-worker build
playwright.config.ts         Chrome and Edge projects
eslint.config.js             includes the rule that src/core imports nothing from src/ui or src/services
src/
  core/                      pure TypeScript, no DOM
    source/                  decode.ts (UTF-8, BOM), edits.ts (TextEdit apply and invert)
    blocks/                  split.ts (lossless segments), classify.ts, redivide.ts, convert.ts (older format)
    salt/                    lexer.ts, parser.ts (lossless tree), model.ts, escape.ts, labels.ts (grid labels),
                             ops/ (insert, remove, move, wrap, rows-columns, span, properties), destinations.ts
    activity/                lexer.ts, parser.ts, model.ts, escape.ts, lanes.ts (switch writing), notes.ts,
                             ops/ (insert, remove, move, branches, lanes, links), destinations.ts
    names/                   names.ts (normalise, fold, generate, validate)
    project/                 project.ts (blocks, flow choice, links, status), screens.ts (add, rename, duplicate,
                             reorder, delete), house-style.ts
    history/                 history.ts (named entries, 200-step cap, typing groups)
  services/                  browser APIs behind small interfaces
    storage/                 db.ts (idb), autosave.ts, tabs.ts (Web Locks, BroadcastChannel), persistence.ts
    render/                  render.worker.ts, render-queue.ts (priority, 10 s limit, restart), sanitize.ts,
                             export-image.ts (SVG, PNG 2×)
    files/                   import-file.ts, download.ts, clipboard.ts
    browser-support.ts
  ui/
    app/                     App.tsx, store.ts, routes between library and workspace
    library/                 project library
    workspace/               layout, region focus shortcut, panel collapse memory
    project-panel/  palette/  outline/  properties/  breadcrumb/
    canvas/                  Salt canvas (grid, cells, components drawn Salt-like)
    flow-canvas/             flow paths, branches, lanes markers, notes
    source-view/             CodeMirror wrapper, whole-file view, Lezer highlighter
    preview/                 rendered output, link clicks, status
    notices/  announcer/     non-blocking notices; polite live region
    messages/en.ts           every interface string (FR-016/AC8)
    keys.ts                  key model of section 3.2 "Keys"
  sw.ts                      service worker
tests/
  corpus/                    .puml files covering every category and construct (FR-010/AC6), with expected status
  unit/                      Vitest, mirrors src/core
  ui/                        Vitest with jsdom and Testing Library
  oracle/                    command-line oracle runner and parity checks
  e2e/                       Playwright specs, including perf/ for SC-006 and the reference project
```

**Structure Decision.** One Vite application with three layers. `core` is pure and holds all parsing, writing and rules. `services` wraps browser APIs. `ui` holds React components. The boundary rule keeps the core testable without a browser (constitution principle 9), and one package avoids workspace tooling the project does not need.

## Key call paths

How one action crosses the layers.

**A visual edit (for example inserting a button).**
`ui/palette` → `store.dispatch(insert)` → `core/salt/ops/insert` returns `TextEdit[]` and the new selection path → `core/source/edits.apply` → `core/salt/parser` re-parses that block only → `core/history.push(name, inverse edits, selection)` → the store publishes → canvas, outline, source view and announcer update → `services/storage/autosave.schedule` (≤ 500 ms) → `services/render/render-queue.request(block, priority)`.

**Typing in the source view.**
`ui/source-view` change → after a 300 ms pause, the block is parsed and classified → canvas updates read-only, or shows the last working version with the message → on blur, the typing becomes one history entry, block boundaries are checked and `core/blocks/redivide` runs if needed (with a warning when a linked screen would be removed).

**Rendering.**
`render-queue` takes the highest-priority block (the open block first) → posts the block's lines to `render.worker` → after 10 s with no reply the worker is terminated and the block is marked "Not yet checked" → on reply, `sanitize` → the preview, export and project-panel status update.

**Import.**
`files/import-file` reads bytes → `core/source/decode` (fatal UTF-8) → `core/blocks/split` and `classify` → `core/project` chooses the flow and computes statuses → a new project is stored → the first visually editable screen opens. Rendering starts in the background later.

## Block status

A block's status is derived, never stored (R-15). These are the rules behind [block-sync-states.puml](diagrams/block-sync-states.puml):

| Status shown | Derived when |
| ------------ | ------------ |
| Editable | The grammar says category 1 |
| Has locked parts | Category 2 with isolatable parts |
| Source only | Category 2 that cannot be isolated (section 4.1 list), or other content |
| Error | Category 3. The canvas shows the stored last working version, or no revert when there is none |
| Older format | Other content whose structure is `@startuml` + `salt` |
| Cannot be rendered | The renderer reported a failure, or the block depends on `!include` |
| Render status "Not yet checked" | No render result for the block's current text yet, or the 10 s limit was reached |

While a block's source view has focus, its canvas is read-only whatever the status. A storage failure is a project-level status, not a block status.

## Phases of work

These are the inputs `tasks` orders by user story:

0. **Renderer spike (gate).** Score the six OD-1 criteria with the corpus. Stop and revisit R-1 if any fails.
1. **Setup.** Scaffold, scripts, lint boundary, corpus folder, oracle runner. Declare the verification commands in this plan.
2. **Core foundations.** Decoding, splitting, edits, names, history, Salt and activity parsers with round-trip tests on the whole corpus.
3. **User stories P1 to P3** in the spec's order. Each slice is built core first, then services, then UI, then end to end.
4. **Cross-cutting.** Accessibility audit, offline, performance on the reference project, browser support.

## Verification Plan

### Verification commands

| ID | Command | Scope | Source |
|----|---------|-------|--------|
| VC-1 | `npx vitest run <test file> -t "<test name>"` | focused: one unit or UI test | package.json (Vitest projects in vitest.config.ts) |
| VC-2 | `npm run test:unit` | broad: every unit and UI test (Vitest projects `unit` and `ui`) | package.json |
| VC-3 | `npm run test:oracle` | broad: command-line oracle suite (needs Java 17+ and `tools/plantuml-1.2026.9.jar`) | package.json |
| VC-4 | `npx playwright test <spec file>` | focused: one end-to-end spec (after `npm run build`) | package.json, playwright.config.ts |
| VC-5 | `npm run test:e2e` | broad: build, then every Playwright spec | package.json |
| VC-6 | `npm run typecheck` | broad: TypeScript strict check | package.json |
| VC-7 | `npm run lint` | broad: ESLint, including the `src/core` boundary rule | package.json |

These commands were added by the setup tasks (T002, T006, T007) on 2026-10-27, as [research.md](research.md) R-13 proposed.

### Verification obligations

| ID | Requirements | Scenario | Expected outcome | Level | Origin |
|----|--------------|----------|------------------|-------|--------|
| VO-001 | FR-001, US1-AS1 | US1-AS1: an empty project library; the user creates a project | The project opens on one empty screen with the add-first-component prompt, and inserting a component into that empty screen succeeds | end-to-end | planned |
| VO-002 | FR-002, FR-009, US1-AS2 | US1-AS2: a selected element in a single-row grid; the user chooses "Button" in the palette | The button sits directly after the selected element in the same row, is selected and focused, and the polite status message announces the insertion | integration | planned |
| VO-003 | FR-003, US1-AS3 | US1-AS3: a selected text field; the user changes its label and value in the properties panel | Canvas, source and preview all show the new label and value, and the field's width in characters is unchanged | integration | planned |
| VO-004 | FR-002, US1-AS4 | US1-AS4: a selected element in a multi-row, multi-column grid; the user deletes it | An empty cell (.) replaces the element, every other row's source line is byte-identical, and focus is on the empty cell | unit | planned |
| VO-005 | FR-002, US1-AS5 | US1-AS5: a selected element; the user presses the keyboard move shortcut at the edge of its container | The source is unchanged and a message tells the user to use Move to | integration | planned |
| VO-006 | FR-002, US1-AS6 | US1-AS6: a selected field; the user chooses "Select parent" (or presses Esc with nothing temporary open) | The containing grid is selected and the breadcrumb shows the full selection path | integration | planned |
| VO-007 | FR-003, US1-AS7 | US1-AS7: the user types `{`, `\|`, `**` or "Title" as the first cell of a row; the screen is rendered | Each text renders exactly as typed in the canvas and in both renderers, with no visible escape characters | contract | planned |
| VO-008 | FR-002, US1-AS8 | US1-AS8: a Form, Button bar or Table preset is inserted; the project is reloaded | After reload, the canvas and outline label each preset Form, Button bar or Table | integration | planned |
| VO-009 | FR-006, US2-AS1 | US2-AS1: an open project; the user makes an edit | The stored copy holds the edit within 2 seconds and the status reads All changes saved | end-to-end | planned |
| VO-010 | FR-006, US2-AS2 | US2-AS2: a storage write fails; the failure occurs | A non-blocking message with advice and Download a backup appears within 1 second, the stored copy is the previous version, and after a successful retry the status reads All changes saved | end-to-end | planned |
| VO-011 | FR-006, US2-AS3 | US2-AS3: a project with changes that have not been downloaded; the user deletes it | The confirmation states the changes have not been downloaded and offers Download and delete | end-to-end | planned |
| VO-012 | FR-006, FR-007, US2-AS4 | US2-AS4: a project open for editing in one tab; it is opened in a second tab | The second tab is read-only with Edit here instead; choosing it stores the first tab's pending edits, loads them, and only the second tab can edit | end-to-end | planned |
| VO-013 | FR-006, US2-AS5 | US2-AS5: a downloaded project file; it is imported | The new project has the same screens, flow, layout and properties, is named after the file (date appended on a clash), and is marked never downloaded | integration | planned |
| VO-014 | FR-006, US2-AS6 | US2-AS6: a non-UTF-8 or binary file; the user imports it | The file is refused with an explanation and the library is unchanged | integration | planned |
| VO-015 | FR-010, US3-AS1 | US3-AS1: a file containing a screen with an unsupported tree-table variant; it is imported | The screen's status is Has locked parts, the variant is a locked placeholder with reason and source excerpt, and the other cells are editable | unit | planned |
| VO-016 | FR-010, US3-AS2 | US3-AS2: a screen using `!define`; it is imported | The screen's status is Source only with an explanation naming the preprocessor use | unit | planned |
| VO-017 | FR-010, US3-AS3 | US3-AS3: a Salt block written as `salt` inside `@startuml`; it is imported | The block is other content with status Older format, one Convert all notice appears, and converting is one undo step whose result renders in the command-line oracle | integration | planned |
| VO-018 | FR-010, US3-AS4 | US3-AS4: a file whose only screen is invalid; it is imported | The screen shows Error with the problem and its line, offers no revert, and other blocks stay editable | integration | planned |
| VO-019 | FR-006, US3-AS5 | US3-AS5: a file with a sequence diagram and two activity diagrams; it is imported | The first supported activity diagram is the screen flow; the sequence diagram and the second activity diagram are other content | unit | planned |
| VO-020 | FR-004, FR-020, US3-AS6 | US3-AS6: any imported file; the user edits one element and downloads | For every corpus file, the downloaded file differs from the imported one only within the edited element's source text | contract | planned |
| VO-021 | FR-004, US4-AS1 | US4-AS1: the source view of a screen has focus; the user types | That screen's canvas refuses edits while other screens accept them | end-to-end | planned |
| VO-022 | FR-004, US4-AS2 | US4-AS2: the user pauses after typing valid source; the block is re-parsed | The canvas shows the change within 500 ms of the 300 ms pause and the selection is on the same element or its nearest surviving container | end-to-end | planned |
| VO-023 | FR-004, US4-AS3 | US4-AS3: the user leaves the source view with invalid source; focus moves elsewhere | The stored source equals the typed text, the block is locked, and Fix in source and Revert to last working version are offered | end-to-end | planned |
| VO-024 | FR-004, US4-AS4 | US4-AS4: the user deletes a block's `@endsalt` line while typing and then leaves the source view; the file no longer forms one block | The file is re-divided once as one undo step with a report; when a linked screen would be removed, a warning appears first and cancelling leaves the text and the invalid block | integration | planned |
| VO-025 | FR-005, US4-AS5 | US4-AS5: a rendering failure; the preview updates | The renderer's message appears in the preview pane labelled as a rendering problem, not in the source problem area, and the last render stays visible marked out of date | end-to-end | planned |
| VO-026 | FR-011, US5-AS1 | US5-AS1: a project; the user adds a screen | A screen named Screen-n with the lowest unused n is created empty and opened | integration | planned |
| VO-027 | FR-011, US5-AS2 | US5-AS2: the user renames a screen to "Sign in"; they commit | While typing the preview reads Will be saved as Sign-in, and after commit the name is Sign-in | integration | planned |
| VO-028 | FR-011, US5-AS3 | US5-AS3: a name that matches another block's name ignoring case; the user commits it | The rename is refused with a message naming the other block, and the previous name stays | unit | planned |
| VO-029 | FR-011, US5-AS4 | US5-AS4: a screen that three steps link to; the user renames it from the project panel and proceeds | All three steps link to the new name after one undoable step | integration | planned |
| VO-030 | FR-011, US5-AS5 | US5-AS5: a screen that no step links to; the user deletes it | The screen is deleted without a confirmation, the announcement offers Undo, and the neighbouring screen opens | integration | planned |
| VO-031 | FR-011, US5-AS6 | US5-AS6: the only block in a project; the user tries to delete it | The deletion is refused with an explanation and the project is unchanged | unit | planned |
| VO-032 | FR-012, US6-AS1 | US6-AS1: a project with no screen flow; the user chooses "Add screen flow" | A flow named Screen-flow with start and stop exists and is open | integration | planned |
| VO-033 | FR-012, FR-009, US6-AS2 | US6-AS2: a decision is selected; the user presses Enter | Enter focuses the first branch, Left and Right move between branches, and an empty branch can be selected and receives an inserted step | integration | planned |
| VO-034 | FR-012, US6-AS3 | US6-AS3: a decision containing four steps; the user deletes it | The decision and its four steps are gone, undo restores them, and the announcement reads Deleted decision and 4 steps | integration | planned |
| VO-035 | FR-012, US6-AS4 | US6-AS4: a step inside a branch; the user changes its lane | In the command-line oracle's render, only that step changes lane | contract | planned |
| VO-036 | FR-012, US6-AS5 | US6-AS5: the initial start or the final stop of the main path; the user tries to move or delete it | Moving or deleting the initial start or final stop is refused with an explanation and the source is unchanged | unit | planned |
| VO-037 | FR-012, US6-AS6 | US6-AS6: a lane in use; the user deletes it | The user is asked for a destination lane, every element of the deleted lane is in it afterwards, and undo restores the lane | integration | planned |
| VO-038 | FR-013, US7-AS1 | US7-AS1: an unlinked step "Enter credentials"; the user chooses "Create screen" from its link control | A screen named Enter-credentials exists and the step links to it after one action | integration | planned |
| VO-039 | FR-013, US7-AS2 | US7-AS2: a linked step; the user activates "Open screen" or its shortcut | The screen opens with focus on its root grid, and Back to flow shows the flow with the step selected | end-to-end | planned |
| VO-040 | FR-013, US7-AS3 | US7-AS3: a linked step whose screen has been deleted; the user views the flow | The step is flagged as broken and its properties offer Link to another screen, Create screen and Remove link | integration | planned |
| VO-041 | FR-013, US7-AS4 | US7-AS4: a step label containing `[x]`, `]]` and `\|`; the project is downloaded and re-imported | After download and re-import the step links to the same screen and shows the same label, and the oracle renders it | contract | planned |
| VO-042 | FR-015, US7-AS5 | US7-AS5: all panels are collapsed; the user clicks a linked step in the flow's rendered preview | Clicking the linked step in the preview opens the screen, and Back to flow returns to the flow | end-to-end | planned |
| VO-043 | FR-014, US8-AS1 | US8-AS1: a screen that renders; the user exports PNG | The PNG is the preview's SVG rasterised at exactly twice its natural width and height, and the SVG export equals the preview's SVG | end-to-end | planned |
| VO-044 | FR-014, US8-AS2 | US8-AS2: a block that is invalid, in the older format or depends on `!include`; the user tries to export it as an image | Image export is refused with an explanation for each of the three kinds of block, while download and copy still work | integration | planned |
| VO-045 | FR-014, US8-AS3 | US8-AS3: the user copies source; the copy succeeds | A confirmation says the source was copied, and the clipboard holds the block's source, or the whole project's source equal to the downloaded file | end-to-end | planned |
| VO-046 | FR-001, SC-004 | Every block the editor generates in the test corpus is rendered by the in-browser renderer and the command-line oracle | Each renders without error and no content is silently dropped | contract | planned |
| VO-047 | FR-002, EC-04 | Choosing a palette item with each kind of selection (element in a single-row grid, a single-column grid, a multi-row multi-column grid, a 1 × 1 grid with a button and with another element, an empty cell, a container, nothing) (EC-04: 1 × 1 grids) | The new element lands at the insertion point section 3.2 defines for that selection, and an occupied cell is never a target | unit | planned |
| VO-048 | FR-002 | Removing or moving an element out of single-row, single-column and multi-row multi-column grids | Single-row and single-column grids close the gap; multi-row multi-column grids leave an empty cell; other rows' source lines are unchanged | unit | planned |
| VO-049 | FR-002, FR-009 | Moving an element by Move to and by dragging, to every kind of destination | Move to lists exactly the valid destinations of section 3.2, dragging offers the same set, and the element ends at the chosen destination with source consistent with the structure | integration | planned |
| VO-050 | FR-002 | Using the keyboard move shortcut inside single-row, single-column and multi-row multi-column grids | The element moves one position along the axis, or swaps with the neighbouring cell, empty or occupied | unit | planned |
| VO-051 | FR-002, EC-03 | Inserting and deleting rows and columns and setting spans, including deleting the column a span starts from and inserting a column inside a span (EC-03: column spans) | Spans are never offered on a first cell, extend only over empty cells with the limiting element named, and every result renders aligned in the command-line oracle | contract | planned |
| VO-052 | FR-002, EC-02 | Editing one row of an imported grid whose rows have different lengths (EC-02: ragged grids) | Rows the user did not edit are byte-identical; editing a missing cell adds cells to that row only | unit | planned |
| VO-053 | FR-002 | Wrapping an element in a grid and in a group box, and unwrapping a single-element unstyled grid | The wrapped element gains a visible parent; unwrap is offered only for a single-element grid with no style and restores the element in place | unit | planned |
| VO-054 | FR-002 | Labelling imported grids of each shape listed in section 3.2 Grid labels | Each grid gets the label the fixed precedence gives it | unit | planned |
| VO-055 | FR-003, EC-05 | Typing every text in the escaping corpus as a label, value and linked step label (EC-05: text that looks like syntax) | Each appears literally in the canvas and in both renderers with no visible escape characters, ordinary text is written unchanged, and it re-imports as the same text | contract | planned |
| VO-056 | FR-003 | Changing a text field's value to shorter and longer values | The width is kept unless changed; a longer value widens the field to fit; width never falls below the value's length | unit | planned |
| VO-057 | FR-003 | Clicking, Space, Enter, F2, double-click and Esc on canvas controls | Clicking only selects; Space toggles a selected checkbox or radio button; Enter, F2 or double-click start in-place editing; Esc cancels and restores the text | integration | planned |
| VO-058 | FR-003, EC-07 | Editing drop-down options and switching between open and closed (EC-07: drop-downs switched to closed) | The canvas shows the same form as the render; closing removes the other options with an undoable notice stating how many | unit | planned |
| VO-059 | FR-003, EC-06 | Editing imported formatted text and choosing each option (EC-06: imported formatted text) | Text is unchanged until edited; Keep formatting keeps markers, Remove formatting makes the text literal; type and structure never change | integration | planned |
| VO-060 | FR-003 | Reloading, downloading and re-importing a screen with every form-control state and drop-down options | Every state and option is the same after reload and after re-import | integration | planned |
| VO-061 | FR-003 | Inspecting the properties offered for every component | No placeholder, enabled or disabled property, and no setting that cannot be written to source, is offered | unit | planned |
| VO-062 | FR-004, FR-020, FR-010, SC-005 | Opening and downloading every corpus file without edits, including CRLF line endings, a byte-order mark, no final newline, comments and text between blocks | Every downloaded file is byte-identical to the imported file | contract | planned |
| VO-063 | FR-004 | Switching repeatedly between canvas and source view without typing | The source is byte-identical | integration | planned |
| VO-064 | FR-020 | Moving and deleting an element that has a full-line comment directly above it | The comment moves and is deleted with the element, undoably, and the deletion announcement mentions it; other comments stay where they are | unit | planned |
| VO-065 | FR-020 | Inserting every kind of new element | Each new element's source follows the house style | unit | planned |
| VO-066 | FR-020, SC-007 | Typing invalid source, reloading and making visual edits in other blocks | The invalid text is stored and shown exactly as typed and is never replaced or discarded | integration | planned |
| VO-067 | FR-005, FR-017 | Opening a project with several blocks while the renderer starts, then editing during renders | Editing is possible before the renderer is ready; blocks render one at a time with the open block first; each block's render status appears in the project panel; editing never waits for a render | integration | planned |
| VO-068 | FR-005 | Requesting renders for an invalid block and for a block that depends on !include | No render is attempted; the last render is kept and marked out of date | unit | planned |
| VO-069 | FR-017, EC-13 | A render that runs longer than 10 seconds (EC-13: renderer) | It is abandoned, the block shows Not yet checked, and the next render proceeds | integration | planned |
| VO-070 | FR-017 | Rendering blocks that use !include, a URL and a local file reference | None is resolved and no request leaves the browser | integration | planned |
| VO-071 | FR-017 | Displaying rendered output that contains scripts, event handlers, external references, internal links and embedded images | Scripts, handlers and external references are removed; internal links and embedded images remain | unit | planned |
| VO-072 | FR-017 | Running the editing workflow against a substitute renderer that offers the same interface | Editing behaviour is unchanged | integration | planned |
| VO-073 | FR-017, SC-004 | Rendering the shared corpus in the in-browser renderer and in the command-line tool at the same version | Each block succeeds or fails the same way in both | contract | planned |
| VO-074 | FR-017, FR-001, SC-008 | Recording network traffic through editing, rendering, export and import | Only the application's own files are requested and no diagram content leaves the browser | end-to-end | planned |
| VO-075 | FR-006, SC-007 | Reloading, restarting the browser and crashing the page after edits | Every project reopens as last stored; after a crash at most the last 2 seconds of edits are missing | end-to-end | planned |
| VO-076 | FR-006 | Creating, opening, renaming, duplicating and deleting projects, and downloading one | Each works; duplicates are named Copy of and start never downloaded; non-unique names are allowed; the download is one file named after the project | integration | planned |
| VO-077 | FR-006 | Downloading, editing and duplicating a project | Last downloaded time and the changes-since flag update; only a .puml download counts | integration | planned |
| VO-078 | FR-006, EC-15 | Persistent storage refused, a private window, and a quota failure (EC-15: storage) | One non-blocking notice explains each risk and editing continues | end-to-end | planned |
| VO-079 | FR-006 | Viewing the library and returning to a project with changes not downloaded | Last-modified times show, the not-synchronised statement shows, and the reminder appears once per session | integration | planned |
| VO-080 | FR-006 | Reloading a project that holds an invalid block | The block shows its last working version and Revert to last working version works | integration | planned |
| VO-081 | FR-006, EC-14 | Renaming and deleting a project in one tab while another tab shows it (EC-14: multiple tabs) | The rename appears in every tab; a tab showing a deleted project says so and offers to download its content | end-to-end | planned |
| VO-082 | FR-006 | Importing files whose first editable block is a screen, the flow, or neither | The first visually editable screen opens, else the flow, else the first block | unit | planned |
| VO-083 | FR-006, FR-014, EC-12 | Making the screen flow invalid or source-only, reloading, and downloading (EC-12: screen flow becomes invalid) | It stays the screen flow after edits and reload, and the download notice says it will become other content on re-import | integration | planned |
| VO-084 | FR-006, FR-011, EC-01 | Importing an empty file and a file with no screen or flow, and trying to delete or re-divide away the last block (EC-01: empty and degenerate projects) | An empty file gives one new screen; a file without screen or flow gives other content with an explanatory status; removing the last block is refused with a reason | unit | planned |
| VO-085 | FR-007 | Typing a run of characters in the source view with and without 300 ms pauses, then undoing | Each run between pauses (or until leaving) is one undo step | integration | planned |
| VO-086 | FR-007 | Undoing after switching projects, after reload, and after Edit here instead | Histories never mix between projects; after reload or handover the history is empty | end-to-end | planned |
| VO-087 | FR-007 | Making 201 operations in one project | The 200 most recent can be undone and the oldest is dropped | unit | planned |
| VO-088 | FR-007 | Undoing and redoing every operation kind in section FR-007 AC10, with other unrelated edits around it | Structure, properties and source return to the exact state, and unrelated changes are kept | unit | planned |
| VO-089 | FR-007 | Viewing the undo and redo controls after operations | The controls name the action that will be undone or redone | integration | planned |
| VO-090 | FR-007, EC-19 | Undoing an edit made in a screen other than the open one (EC-19: undo across blocks) | The affected screen opens, the element is selected, and the change is announced | integration | planned |
| VO-091 | FR-007 | Undoing back to a state where the block's source was invalid | The block is shown as invalid | unit | planned |
| VO-092 | FR-007 | Typing in a property field and pressing undo while it still has focus | The typing in that field is undone first; typing is one step ending on blur or Enter | integration | planned |
| VO-093 | FR-008 | Attempting an invalid operation by dragging, keyboard and command | Invalid targets are not offered; a keyboard or command attempt is refused with a message beside the target and a screen-reader announcement; nothing is accepted and then reversed | integration | planned |
| VO-094 | FR-008, EC-08 | Importing screens with several root grids or text after the root grid (EC-08: content PlantUML silently ignores) | The block is source-only and its message names the content that will not appear in the image, worded differently from a syntax error | unit | planned |
| VO-095 | FR-009 | Inserting, deleting (with and without an empty cell left), moving, undoing an insert, re-parsing and opening a linked screen | Focus moves to the element section FR-009 AC8 names for each case | integration | planned |
| VO-096 | FR-009 | Performing structural changes and moving focus over canvas elements with assistive technology | Each change is announced politely, and each element is announced with type, text, cell position and container | integration | planned |
| VO-097 | FR-009 | Using the outline and canvas with the keyboard | The outline acts as an accessible tree with selection following focus; on the canvas arrows move between cells, Enter enters and Esc leaves a container | integration | planned |
| VO-098 | FR-009 | Pressing Esc and Enter during an inline edit, a drag, an open menu and with nothing temporary open | Esc cancels the innermost temporary state first and only otherwise selects the parent; Enter enters containers or starts editing | integration | planned |
| VO-099 | FR-009, EC-18 | Navigating and moving on the flow canvas with the keyboard | Up and Down move along the path, Left and Right between branches, Enter into a decision or loop and Esc out; the move shortcut never moves sideways between branches | integration | planned |
| VO-100 | FR-009 | Performing every structural command with the pointer only via visible controls, and with the keyboard only | Every command is available as a visible control showing its shortcut and by keyboard; no operation requires dragging | end-to-end | planned |
| VO-101 | FR-009, FR-016 | Moving focus out of every workspace region, including the source view | Esc leaves the source view to the canvas selection; the region shortcut cycles through every region; no region traps focus | end-to-end | planned |
| VO-102 | FR-009 | Listing every keyboard shortcut | None uses a combination reserved by the supported browsers or common screen readers | unit | planned |
| VO-103 | FR-009, EC-17 | Using the workspace at 1024 px and wider, and below 1024 px (EC-17: narrow windows) | At 1024 px and wider every editing feature works with panels collapsing as needed; below 1024 px nothing breaks and projects can be viewed | end-to-end | planned |
| VO-104 | FR-009, EC-18 | Tapping elements and visible commands on a touchscreen (EC-18: touch) | Taps select and run commands, and never delete or move an element unintentionally | end-to-end | planned |
| VO-105 | FR-009, SC-003 | Scanning every workspace state with an automated WCAG 2.2 AA checker | No AA violations are reported for the editor interface | end-to-end | planned |
| VO-106 | FR-010 | Importing a block of each status | Each block shows the right status with a plain-language reason, and render status shows Not yet checked until rendered | unit | planned |
| VO-107 | FR-010, EC-10 | Importing screens and flows with unsupported but isolatable content, then editing around it (EC-10: fork/join, switch, partitions, detach/kill, Salt inside a step) | Each is a locked part at the smallest isolatable unit with reason and excerpt; it is byte-identical after edits elsewhere and after download | unit | planned |
| VO-108 | FR-010, EC-09 | Importing blocks with preprocessor directives, more than one style modifier, legacy activity syntax and goto or label (EC-09) | Each opens source-only with an explanation, and legacy or goto flows are not chosen as the flow | unit | planned |
| VO-109 | FR-010 | Reverting an invalid block before and after a reload | One action restores the last working version | integration | planned |
| VO-110 | FR-010 | A source-only block and other content that the renderer fails on | The status is Cannot be rendered with the renderer's message, and they are not reported as errors otherwise | integration | planned |
| VO-111 | FR-010 | Importing well-formed blocks with an unknown container modifier and activity arrow labels | They are reported as having locked parts or source only, never Error | unit | planned |
| VO-112 | FR-010 | Choosing Convert all on a file with several older-format blocks | Each block's opening and closing lines are replaced and the salt line removed, nothing else changes, all in one undo step | unit | planned |
| VO-113 | FR-011, EC-11 | Committing typed names and generating names for new screens, screens from step labels, duplicates and the flow (EC-11: names) | Typed names are converted by the section 3.6 rules or refused when empty or duplicate; generated names are never refused and get -2, -3 on collision; all are at most 64 characters, NFC, with non-English letters kept | unit | planned |
| VO-114 | FR-011 | Adding, duplicating and reordering screens and other content around other blocks and text between blocks | New screens go after the last screen, a duplicate after its original, the flow at the end; reorders swap only blocks of that kind, carrying comments directly above; panel order equals file order; order and names survive download and re-import | unit | planned |
| VO-115 | FR-011 | Deleting and renaming a screen that steps link to, proceeding and cancelling | The warning shows the affected steps; proceeding deletes undoably and flags links broken; cancelling changes nothing | integration | planned |
| VO-116 | FR-011, EC-11 | Importing unnamed screens, disallowed names, duplicate names and a link differing only in case | Unnamed screens keep no name and stay byte-identical until renamed or linked; disallowed and duplicate names are flagged and not changed; a case-only link is broken with a suggested fix | unit | planned |
| VO-117 | FR-011 | Duplicating a screen | The copy is after the original with a generated name, has no incoming links, and the duplication is undoable | unit | planned |
| VO-118 | FR-011 | Changing a screen's name line in the source view to an allowed unique name and to a disallowed name, then leaving | No confirmation; an allowed name updates links in the same undo step with a notice; any other name is flagged and a notice with Undo states how many links are broken | integration | planned |
| VO-119 | FR-011 | Opening a file with a single Salt block | A single-screen project opens without conversion | unit | planned |
| VO-120 | FR-012 | Changing lanes inside and outside decision branches | Every element renders in its own lane in the command-line oracle, and changing one element's lane changes no other element's rendered lane | contract | planned |
| VO-121 | FR-012 | Adding, renaming, reordering and deleting lanes, adding the first lane, and inserting and moving elements | New elements take the previous element's lane; moves keep lanes; renames update every element; the first lane takes every element; the render shows lanes in list order; deleting the only lane removes lanes | unit | planned |
| VO-122 | FR-012 | Adding, editing and deleting notes on steps, decisions, loops, start and branch beginnings, then moving and deleting those elements | Notes stay attached, several keep their order and side, and move and are deleted with their element, undoably | unit | planned |
| VO-123 | FR-012 | Building decisions with two or more branches, elseif conditions, empty branches and empty loop bodies | Each flow renders in the command-line oracle, and no operation produces an unrepresentable flow | contract | planned |
| VO-124 | FR-012 | Inserting with a step, a branch, a loop body and nothing selected | The new element is placed by the section 3.7 insertion rules and is selected and focused | unit | planned |
| VO-125 | FR-012 | Deleting the screen flow and confirming | The confirmation is asked, the deletion is undoable, and the project panel shows Add screen flow | integration | planned |
| VO-126 | FR-013 | Linking, changing and removing a step's link | Each works, and linked steps look different from unlinked ones | integration | planned |
| VO-127 | FR-014, SC-005 | Downloading a project with invalid, older-format and include-dependent blocks and unchecked blocks | The download succeeds with every block unchanged, and a non-blocking notice lists the unrenderable blocks and the number not yet checked | integration | planned |
| VO-128 | FR-015 | Viewing the project panel of a project with screens, a flow, other content and links | Every block is listed in file order with its status, each screen shows its incoming link count, and without a flow the panel offers Add screen flow with an explanation | integration | planned |
| VO-129 | FR-015, FR-016 | Selecting a screen, the flow and other content in turn | Palette, outline, properties, source view and preview switch to it; with nothing selected, properties show the open block's own properties | integration | planned |
| VO-130 | FR-015 | Opening, reordering and deleting a block of other content | It opens in the source view only, and reorder and delete work as units and are undoable | integration | planned |
| VO-131 | FR-015 | Collapsing every panel and following links from flow steps to screens and back | The preview or canvas fills the workspace and links can still be followed both ways | end-to-end | planned |
| VO-132 | FR-016 | Opening the workspace at the minimum supported width, changing panel visibility and reloading | Every region and control is present in the default arrangement, and panel visibility is remembered | end-to-end | planned |
| VO-133 | FR-016 | Opening the whole-file view of a project with text between blocks | It shows the entire file read-only and can be copied | integration | planned |
| VO-134 | FR-016 | Checking every interface string | All interface text comes from the separate English message catalogue and diagram content in any language is shown and saved unchanged | unit | planned |
| VO-135 | FR-018, SC-008 | Disconnecting the network after one online visit, then reloading and restarting the browser | The application, preview and image export work offline | end-to-end | planned |
| VO-136 | FR-019, EC-16 | Opening the application in an unsupported browser (EC-16: unsupported browser) | A message says the browser is not supported instead of failing silently | unit | planned |
| VO-137 | SC-006 | Measuring the reference project on the reference laptop | Canvas feedback ≤ 100 ms, source ≤ 200 ms after a visual edit, visual model ≤ 500 ms after a pause, preview ≤ 3 s | end-to-end | planned |

### Verification exemptions

| Requirement | Reason | Alternative verification |
|-------------|--------|--------------------------|
| SC-009 | A property of the specification's diagrams, not of the product | Review of the traceability tables in spec.md whenever a requirement or diagram changes |

### Manual verification

| ID | Covers | Steps | Expected result | Why not automated |
|----|--------|-------|-----------------|-------------------|
| MV-001 | SC-001, FR-008, FR-001 | Run the two SC-001 tasks with at least 5 business analysts or product owners who do not know PlantUML | At least 4 of 5 complete both tasks unaided within 15 minutes without writing source | Usability of the whole workflow is judged by people |
| MV-002 | SC-002, FR-002 | In the same sessions, ask each participant which container a selected field belongs to and to select it | At least 4 of 5 succeed without help | Comprehension is judged by people |
| MV-003 | SC-003, FR-009 | Complete both SC-001 tasks using only a keyboard, then with a screen reader in focus mode on each supported browser | Both tasks complete, every element is announced meaningfully, and the canvas key model works in focus mode | Screen-reader experience cannot be judged by an automated test |
| MV-004 | FR-008, FR-003 | Review the palette, properties panel, statuses and messages against the terminology table, and each palette description for Salt limits | Terms match the terminology table, no property needs Salt knowledge, each limited construct's description states its limit, and selection, insertion and focus states are clearly visible | Wording and visual clarity are judgements |
| MV-005 | FR-016, FR-009 | Inspect the canvas, the flow canvas and the source view, and try a touchscreen device | The canvas looks like a Salt wireframe with no free positioning, limited constructs look as Salt draws them, source is highlighted, and touch uses taps and visible commands only | Visual likeness and real-device touch feel are judged by a person |

### Behaviour checklist

Behaviour items are in [tests/behaviour-checklist.md](tests/behaviour-checklist.md).
