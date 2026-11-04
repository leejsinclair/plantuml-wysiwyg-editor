# Tasks: PlantUML Wireframe and Screen Flow Editor

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Data model**: [data-model.md](data-model.md) | **Contracts**: [contracts/](contracts/) | **Research**: [research.md](research.md) | **Behaviour checklist**: [tests/behaviour-checklist.md](tests/behaviour-checklist.md)

Line format: `- [ ] **T###** [P?] [US#] Description · file(s)`. `[P]` means the task is independent of the others in its wave. `VO-nnn` points to the plan's Verification Plan. Tests are written first and must fail before their implementation exists (constitution principle 9, integrated TDD).

**One owner per file.** Several stories plug into the same workspace (library, toolbar, project panel, canvas region, properties, commands, preview). To keep each story's files to itself, Foundational builds the shells and a small slot registry (`src/ui/app/slots.ts`). Each story then adds its own `register.tsx`, and `main.tsx` loads every `src/ui/**/register.tsx` with `import.meta.glob`. Interface strings work the same way: `src/ui/messages/en.ts` merges every `src/ui/messages/en/*.ts` part, and each phase owns its own part (R-11, FR-016/AC8).

---

## Phase 1: Setup

**Purpose**: settle the renderer gate (OD-1), then the toolchain every later phase uses.

**Wave 1 — gate:**

- [x] **T001** Run the renderer feasibility spike (OD-1, R-1). Build a standalone harness that runs `@plantuml/core@1.2026.9` in a Web Worker with `PLANTUML_STDLIB_LOADER` and `PLANTUML_FILE_LOADER` set to refuse. Render a seed corpus (Salt and activity samples, non-English names, every FR-003/AC6 escaping case) and compare each block's success or failure with `plantuml-1.2026.9.jar`. Score all six criteria: (1) parity, (2) download size, start time, and ≤ 3 s per reference-size block, (3) every asset bundled with no network, (4) non-blocking and one request at a time, (5) identifiable failures, (6) every file, including on-demand ones, can be cached for offline use. Record the scores. If any criterion fails, stop here and revisit R-1 · spikes/renderer/, specs/001-wireframe-flow-editor/spike-renderer.md

**⟶ Wait for T001 to pass all six criteria, then:**

- [x] **T002** Scaffold the app: `package.json` with exact versions (React 19, `@plantuml/core` 1.2026.9, CodeMirror 6 and `@lezer/*`, `@dnd-kit/core`, DOMPurify, `idb`, `vite-plugin-pwa`, Vitest, jsdom, Testing Library, `fake-indexeddb`, Playwright, `@axe-core/playwright`, ESLint). Add scripts `dev`, `build`, `test:unit`, `test:e2e`, `test:oracle`, `lint`. Add a strict ES2023 `tsconfig.json`, `index.html` and a `.gitignore` for `node_modules`, `dist` and test output · package.json, tsconfig.json, index.html, .gitignore

**⟶ Wait for T002 to finish, then:**

**Wave 3 — independent (different files):**

- [x] **T003** [P] Configure Vite: ES-module worker bundling, `vite-plugin-pwa` in `injectManifest` mode pointing at `src/sw.ts`, and copying `viz-global.js`, `themes.js` and `openiconic.js` into the build (R-1, R-10) · vite.config.ts
- [x] **T004** [P] Write the service worker that precaches every built file, renderer assets included, with `precacheAndRoute(self.__WB_MANIFEST)` (FR-018, R-10) · src/sw.ts
- [x] **T005** [P] Configure ESLint, including the boundary rule: `src/core` imports nothing from `src/ui` or `src/services` and uses no DOM globals (constitution 9) · eslint.config.js
- [x] **T006** [P] Configure Vitest with two projects: `unit` (Node, `tests/unit`, `tests/oracle`) and `ui` (jsdom, `tests/ui`) · vitest.config.ts
- [x] **T007** [P] Configure Playwright with Chrome and Edge projects, and a web server running `vite preview` on the production build · playwright.config.ts
- [x] **T008** [P] Write the command-line oracle runner. It runs `plantuml-1.2026.9.jar` (Java 17+) on a file or a block's text and returns per-block success or error and the SVG. It fails loudly when Java or the jar is missing (R-13, FR-017/AC7) · tests/oracle/runner.ts
- [x] **T009** [P] Write the corpus conventions and the fidelity seed. The README describes per-owner folders and the `<file>.expected.json` sidecar (per block: kind, status, reason key, flow choice, name flag). The seed covers CRLF, a byte-order mark, no final newline, comments, text between blocks and non-English names (FR-010/AC6) · tests/corpus/README.md, tests/corpus/fidelity/
- [x] **T010** [P] Declare the verification commands in the plan's Verification commands table: focused `npm run test:unit -- -t "<name>"`, then broad `test:unit`, `test:oracle`, `test:e2e` and `lint`. This switches the TDD checks on · specs/001-wireframe-flow-editor/plan.md

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the pure core (decode, split, edits, names, history, both lossless parsers, classification, project model), the services every slice uses (storage, autosave, rendering), and the workspace shells with their slots. Each task writes its tests first, in the test file it names. No story work starts until this phase is done.

A Foundational UI task after T027 puts its interface strings in its own part, `src/ui/messages/en/<area>.ts` (for example `preview.ts` for T039), never in `shared.ts`, so workers in one wave never edit the same file.

**Wave 1 — independent (different files):**

- [x] **T011** [P] Define the shared core types: `TextEdit`, `TextRange`, `BlockStatus` and `RenderStatus` (exact UI strings), `BlockKind`, `SourceCategory`, `Path`, `Selection`, `Diagnostic` (`syntax`, `ignoredContent`, `unsupported`) and `OpResult` (contracts/core-api.md §1, §3) · src/core/types.ts
- [x] **T012** [P] Implement `decode` and `encode`: fatal UTF-8 decoding, byte-order-mark detection, a NUL byte means binary, and decoding then encoding is byte-identical (FR-006/AC13, FR-020/AC2, VO-014 core) · src/core/source/decode.ts, tests/unit/source/decode.test.ts
- [x] **T013** [P] Implement `split`. Segments cover the source exactly and in order. Track blocks (`@start…` to the matching `@end…`) and between-text, attach the comment lines directly above a block, and keep an unmatched start as one block (R-4, data-model §4.1) · src/core/blocks/split.ts, tests/unit/blocks/split.test.ts
- [x] **T014** [P] Implement names: `normalise`, `fold`, `isAllowed`, `nameStatus` and `generate` (`Screen-n`, `Screen-flow`, from a label, `Copy-of-<name>`, `-2`/`-3`, ≤ 64 characters cut on grapheme clusters, NFC). Test VO-113 · src/core/names/names.ts, tests/unit/names/names.test.ts
- [x] **T015** [P] Implement the house style: indentation, templates for new elements and blocks, and line-ending choice (the block's own, else the file's first, LF for a new project) (FR-020/AC5) · src/core/project/house-style.ts, tests/unit/project/house-style.test.ts
- [x] **T016** [P] Implement Salt `escapeSaltText` and `unescapeSaltText` per section 3.4: whole-cell `.`/`...`/separator, the leading `*`, `[`, `(`, `^`, `"` and `==`, `{`, `}` and `|`, the creole pairs, and a command word in the first cell. Plain `a.b` and `5 * 3` stay unchanged, `unescape(escape(t)) === t`, and `formatted` is detected (VO-055 unit). Use the forms the spike confirmed (spike-renderer.md, Escaping results): `<U+hhhh>` for each character that would be interpreted, and a leading U+200B for a command word in a row's first cell. A typed `<U+` gets its `<` written as `<U+003C>` · src/core/salt/escape.ts, tests/unit/salt/escape.test.ts
- [x] **T017** [P] Implement activity `escapeStepLabel` for plain and linked labels. A linked label escapes `[`, `]` and `|`, and the escape round-trips (FR-013/AC5). Use `<U+005B>`, `<U+005D>` and `<U+007C>`: `~` breaks the link (spike-renderer.md, Escaping results) · src/core/activity/escape.ts, tests/unit/activity/escape.test.ts
- [x] **T018** [P] Write the lossless Salt lexer. Every character belongs to one token, including whitespace, `'` comments and `/'…'/` blocks · src/core/salt/lexer.ts, tests/unit/salt/lexer.test.ts
- [x] **T019** [P] Write the lossless activity lexer: current syntax, `|Lane|`, `note … end note`, `{{salt … }}`, legacy `(*)` and preprocessor lines · src/core/activity/lexer.ts, tests/unit/activity/lexer.test.ts
- [x] **T020** [P] Build the classification corpus with `.expected.json` sidecars. Include a tree-table variant, `!define`, `!include`, older-format Salt, a file whose only screen is invalid, a sequence diagram plus two activity diagrams, several root grids, text after the root grid, more than one style modifier, legacy activity syntax, `goto`/`label`, fork, switch, partition, detach/kill, `{{salt` inside a step, an unknown container modifier, arrow labels, and unnamed, disallowed, duplicate and non-NFC names. Also include a case-only link, a single Salt block, an empty file and a file with no screen or flow (FR-010/AC6, EC-01, EC-08–EC-11) · tests/corpus/import/
- [x] **T021** [P] Write the IndexedDB layer with `idb`: a `projects` store holding `ProjectRecord` and a `settings` store, with the whole record written in one transaction (R-5, data-model §3) · src/services/storage/db.ts, tests/unit/services/db.test.ts
- [x] **T022** [P] Write the render worker. Loaders refuse and `PLANTUML_STDLIB_BASE` is never set. It calls `renderToString(lines, …, { maxSvgSize: 0 })` and sends `ready`, `svg` or `error` (contracts/core-api.md §7, FR-017/AC3). Follow the spike amendment (spike-renderer.md, `spikes/renderer/public/worker-shim.js`): set `self.window = self`, load the five engine files as `?url` assets (classic scripts by fetch and indirect eval, since module workers have no `importScripts`), install the DOM shim after they load, set `PLANTUML_VIZ`, and make loaders call `err` · src/services/render/render.worker.ts, src/services/render/dom-shim.ts
- [x] **T023** [P] Write SVG sanitising: the DOMPurify SVG profile plus an href filter that keeps only `#fragment` and `data:image/…`. Test VO-071 · src/services/render/sanitize.ts, tests/unit/services/sanitize.test.ts
- [x] **T024** [P] Write unsupported-browser detection for anything but the latest two Chrome or Edge majors. Test VO-136 · src/services/browser-support.ts, tests/unit/services/browser-support.test.ts
- [x] **T025** [P] Write the key model: Esc, Enter, F2, Space and arrows, move Alt+Shift+Arrow, "Open screen" Ctrl+Enter, the region-focus shortcut, undo Ctrl+Z, and redo Ctrl+Y or Ctrl+Shift+Z. Test VO-102: no binding is reserved by Chrome, Edge or common screen readers · src/ui/keys.ts, tests/unit/ui/keys.test.ts
- [x] **T026** [P] Write the slot registry: `blockEditors` keyed by `BlockKind` (`Canvas`, `Outline`, `Palette`, `Properties`, `commands`, `pathLabels`, `destinations`), plus `toolbar`, `library`, `projectPanel`, `propertySections`, `commands`, `banners`, `sourceEdit` and `previewLink` · src/ui/app/slots.ts
- [x] **T027** [P] Write the message catalogue: `t(key, params)` with `Intl.PluralRules`, an eager merge of `./en/*.ts` that fails on duplicate keys, and the shared part (regions, toolbar, autosave, block and render statuses, core diagnostics, generic notices, all from contracts/ui.md). Test VO-134: no UI literal escapes the catalogue · src/ui/messages/en.ts, src/ui/messages/en/shared.ts, tests/unit/ui/catalogue.test.ts
- [x] **T028** [P] Write the end-to-end fixtures: open the app, create or import a project, read the project panel and block statuses, read the downloaded bytes, and fail storage writes through `addInitScript` · tests/e2e/fixtures.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T029** [P] Implement `applyEdits` and `invertEdits`: non-overlapping edits applied from the highest offset down, and the inverse restores the text exactly · src/core/source/edits.ts, tests/unit/source/edits.test.ts
- [x] **T030** [P] Write the Salt parser and model: lossless tree, grids, the six styles, ragged rows, cells and spans, every A.1 element, separators, tree, tab bar, menu bar, scroll area and `leadingComments`. Locked parts: tree-table variants, open menus, `{SI`/`{S-`, unknown modifier. Source-only diagnostics: preprocessor, several root grids, text after the root (`ignoredContent` wording), more than one style modifier. Syntax errors with their line (section 4, 4.1, data-model §5.2) · src/core/salt/parser.ts, src/core/salt/model.ts, tests/unit/salt/parser.test.ts
- [x] **T031** [P] Write the activity parser and model: start, stop and end, steps and linked steps, `if`/`elseif`/`else`, `repeat` and `while`, lanes with the effective lane per element, notes attached to their owner or path start, and `leadingComments`. Locked parts: fork, switch, partition, detach/kill, `{{salt`, arrow labels. Source-only: legacy syntax, `goto`/`label`, preprocessor. Syntax errors with their line (data-model §5.3) · src/core/activity/parser.ts, src/core/activity/model.ts, tests/unit/activity/parser.test.ts
- [x] **T032** [P] Write autosave with the `SaveState` machine (data-model §7.3): debounce ≤ 500 ms, flush on `pagehide` and `visibilitychange`, failure reported within 1 s, the previous record kept intact, retries with 1 s, 2 s, 4 s, then 10 s backoff, and the latest text written on retry (FR-006/AC1, AC7) · src/services/storage/autosave.ts, tests/unit/services/autosave.test.ts
- [x] **T033** [P] Write the render queue: open block first, one request at a time, terminate and restart after 10 s and report "Not yet checked", skip category-3 and `!include` blocks while keeping the last render out of date, keep latest and last-ok results, and use a substitutable renderer interface. Classify an `svg` reply that is a PlantUML error image (first text `PlantUML version`, line from `(line N)`, message last; or `An error has occurred`) as a failure (spike criterion 5). Test VO-067 (queue), VO-068, VO-069, VO-070, VO-072 · src/services/render/render-queue.ts, tests/unit/services/render-queue.test.ts
- [x] **T034** [P] Write the polite live-region announcer and non-blocking notices with actions and `oncePerSession` (FR-009/AC9, data-model §6.8) · src/ui/announcer/Announcer.tsx, src/ui/notices/Notices.tsx, tests/ui/notices/notices.test.tsx
- [x] **T035** [P] Write the generic accessible tree (ARIA `tree`, selection follows focus, Right/Left expand and collapse), used by the outlines and "Move to…". Test VO-097 (tree part) · src/ui/outline/Tree.tsx, tests/ui/outline/tree.test.tsx
- [x] **T036** [P] Write the drag-and-drop base: pointer and touch sensors that need movement or a press delay, and drop targets offered only from a supplied destinations list (R-7, FR-008/AC3, EC-18) · src/ui/workspace/dnd.tsx
- [x] **T037** [P] Write the locked placeholder, a labelled item showing the reason and a source excerpt, shared by both canvases (section 4.1) · src/ui/workspace/LockedPlaceholder.tsx
- [x] **T038** [P] Write the source view: a CodeMirror 6 wrapper with a Lezer highlighter for Salt and activity, read-only unless a `sourceEdit` controller is registered, a `focusLine` API for "Fix in source", selection highlight, a brief changed-lines highlight with no scroll, and Esc moving focus out (R-6, FR-009/AC15) · src/ui/source-view/SourceView.tsx, src/ui/source-view/highlight.ts, tests/ui/source-view/source-view.test.tsx
- [x] **T039** [P] Write the preview pane, labelled read-only: sanitised inline SVG, an out-of-date marker, "Not yet checked", a rendering-problem area separate from source problems, and link clicks passed to the `previewLink` slot (FR-005/AC1–AC6) · src/ui/preview/Preview.tsx, tests/ui/preview/preview.test.tsx
- [x] **T040** [P] Write the escaping oracle. Each FR-003/AC6 case goes through `escapeSaltText` or `escapeStepLabel` into a minimal block and must render through `runner.ts` with no visible escape characters. Test VO-007 (render), VO-055 (contract) · tests/oracle/escaping.test.ts, tests/corpus/escaping/cases.json

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [x] **T041** [P] Implement history: named entries, at least 200 kept (VO-087), `visual`, `sourceTyping` and `propertyTyping` groups, `metaBefore`/`metaAfter`, a new edit clears redo, and `clear` · src/core/history/history.ts, tests/unit/history/history.test.ts
- [x] **T042** [P] Implement `classify`: kind, category, `isolable`, `dependsOnExternal`, `olderFormat` and the reason key, all synchronous with no renderer (section 4). Write the plain-language catalogue strings for every reason key the parsers and `classify` emit (`locked.*`, `sourceOnly.*`, `ignored.*`, `diagnostic.unsupported.*`, older format, include dependence). `ignored.*` wording says which content will not appear in the image, and differs from syntax errors (FR-008/AC8) · src/core/blocks/classify.ts, src/ui/messages/en/reasons.ts, tests/unit/blocks/classify.test.ts
- [x] **T043** [P] Implement links: find the steps linking to a name, compute retarget edits for a rename, and derive `linkStatus` (`valid`, `broken`, `brokenCaseOnly` with the suggested screen, `ambiguous`) (data-model §5.3 Link) · src/core/project/links.ts, tests/unit/project/links.test.ts

**⟶ Wait for Wave 3 to finish, then:**

**Wave 4 — independent (different files):**

- [x] **T044** [P] Implement the project model: `ProjectState`, `createProject` ("Untitled project", `@startsalt Screen-1` with an empty one-column grid), and `blocks()` views with derived status (data-model §7.1), render status, incoming link count, name flags and "Untitled screen n". Also flow choice on import and re-division (FR-006/AC14), `flowIndex` kept once set (AC18), `lastWorking` transitions, and an index-remap helper (R-4) · src/core/project/project.ts, tests/unit/project/project.test.ts
- [x] **T045** [P] Write the corpus suites. Every `tests/corpus/**/*.puml` splits and re-joins byte-identically (VO-062), and every sidecar's statuses, reasons, flow choice and name flags match. Test VO-015, VO-016, VO-019, VO-094, VO-106, VO-107, VO-108, VO-111, VO-116, VO-119 · tests/unit/corpus/roundtrip.test.ts, tests/unit/corpus/classification.test.ts

**⟶ Wait for Wave 4 to finish, then:**

- [x] **T046** Write the store with `useSyncExternalStore`. It holds the session (data-model §6.1), loads and autosaves the open project, memoises block models on text, and tracks the open block and selection. After a re-parse the selection keeps its path or moves to the nearest surviving container. It tracks the block that is read-only during a source edit and `returnToFlow`. `applyOp(OpResult)` applies edits, re-parses, updates `lastWorking`, pushes history, announces, sets focus, schedules autosave and requests a render. Undo and redo open the affected block, select and announce (FR-007/AC11, AC12). Test VO-090, VO-091 · src/ui/app/store.ts, tests/ui/app/store.test.ts

**⟶ Wait for T046 to finish, then:**

**Wave 6 — independent (different files):**

- [x] **T047** [P] Write the app entry and routes: hash routes `#/`, `#/project/<id>` and `#/project/<id>/block/<key>`, unsupported-browser screen (FR-019), eager `import.meta.glob('./**/register.tsx')`, and the renderer started only after the editor is interactive (FR-017/AC2) · src/main.tsx, src/ui/app/App.tsx
- [x] **T048** [P] Write the project library view: project list with last-modified, last-downloaded or "never downloaded", the not-downloaded indicator, "Create project", open, the not-synchronised statement, and the `library` slot (FR-006/AC8, AC10, FR-001/AC1) · src/ui/library/Library.tsx, tests/ui/library/library-view.test.tsx
- [x] **T049** [P] Write the workspace layout. Seven named landmark regions in the default arrangement, panel collapse remembered in settings, and the region-focus shortcut. The canvas region dispatches to `blockEditors[kind]`, shows `banners`, and is read-only during a source edit. Other content shows a source-only message. Test VO-101 (region cycle), VO-129, VO-132 · src/ui/workspace/Workspace.tsx, tests/ui/workspace/workspace.test.tsx
- [x] **T050** [P] Write the toolbar: "Undo" and "Redo" naming their action, autosave status ("All changes saved", "Saving…"), and the `toolbar` slot. Test VO-089 · src/ui/workspace/Toolbar.tsx, tests/ui/workspace/toolbar.test.tsx
- [x] **T051** [P] Write the project panel. Every block appears in file order with status, reason, render status, incoming link count and name flag. Selecting one opens it. Includes the `projectPanel` slot. Test VO-128, VO-067 (render status shown) · src/ui/project-panel/ProjectPanel.tsx, tests/ui/project-panel/project-panel.test.tsx
- [x] **T052** [P] Write the properties shell. It shows the selected element's sections from `blockEditors[kind].Properties` and `propertySections`, or the open block's own properties when nothing is selected. `PropertyField` commits on blur or Enter as one `propertyTyping` entry, and undo acts inside the focused field first. Test VO-092 · src/ui/properties/PropertiesPanel.tsx, src/ui/properties/PropertyField.tsx, tests/ui/properties/properties.test.tsx
- [x] **T053** [P] Write the structural command bar, which shows every command with its shortcut from `blockEditors[kind].commands` and the `commands` slot (FR-009/AC14). Also the "Move to…" dialog (tree of valid destinations) and the breadcrumb (`navigation`, " › ", every part selectable) · src/ui/workspace/CommandBar.tsx, src/ui/workspace/MoveToDialog.tsx, src/ui/workspace/Breadcrumb.tsx, tests/ui/workspace/commands.test.tsx

**⟶ Wait for Wave 6 to finish, then:**

- [x] **T054** Write the renderer parity check. It drives the built app's worker in Playwright over every corpus block and compares success or failure per block with `runner.ts`. Test VO-073 · tests/e2e/oracle-parity.spec.ts

**Checkpoint**: core, storage, rendering and the workspace shells are ready. Story phases can now run in parallel.

---

## Phase 3: User Story 1 - Build a screen wireframe visually (Priority: P1) 🎯 MVP

**Goal**: build a Salt screen from the palette on a structured canvas, with outline, properties, breadcrumb, source and preview, all by keyboard or visible controls.

**Independent Test**: in an empty library, create a project and build the reference login form with only the palette, canvas, outline and properties. The source renders in the in-browser renderer and the command-line oracle with all text as typed.

Files: src/core/salt/labels.ts, src/core/salt/destinations.ts, src/core/salt/ops/{presets,properties,span,wrap,remove,insert,rows-columns,move}.ts, src/ui/messages/en/screen.ts, src/ui/canvas/{SaltCanvas.tsx,CellView.tsx,components.tsx,canvas-keys.ts,InlineEdit.tsx,canvas.css,register.tsx}, src/ui/palette/Palette.tsx, src/ui/outline/screen-outline.tsx, src/ui/properties/{salt-properties.tsx,FormattingChoice.tsx}

### Tests (write first, must fail)

**Wave 1 — independent (different files):**

- [x] **T055** [P] [US1] Unit test insert and presets. The insertion point for every selection kind (VO-047, EC-04 1 × 1 grids), the button after the selection in a single-row grid (VO-002 core), house style for every new element (VO-065), and preset labels after a re-parse (VO-008 core) · tests/unit/salt/ops/insert.test.ts
- [x] **T056** [P] [US1] Unit test remove and move. An empty cell is left in multi-row and multi-column grids with other rows byte-identical (VO-004). Gaps close in single-row and single-column grids (VO-048). The keyboard move works along the axis or swaps cells (VO-050) and is refused at an edge (VO-005 core). A comment above an element moves and is deleted with it (VO-064) · tests/unit/salt/ops/remove-move.test.ts
- [x] **T057** [P] [US1] Unit test `validDestinations`: exactly the section 3.2 set (VO-049 core) · tests/unit/salt/destinations.test.ts
- [x] **T058** [P] [US1] Unit test rows, columns and spans. No span on a first cell, spans only over empty cells with the limiting element named, deleting a span's start column, inserting a column inside a span (VO-051 core, EC-03), and ragged rows untouched (VO-052) · tests/unit/salt/ops/rows-columns-span.test.ts
- [x] **T059** [P] [US1] Unit test wrap and unwrap in a grid and a group box. Unwrap is offered only for a single-element grid with no style (VO-053) · tests/unit/salt/ops/wrap.test.ts
- [x] **T060** [P] [US1] Unit test properties. Text-field width rules (VO-056). Drop-down options and closing with a count (VO-058). Keep or Remove formatting with type and structure kept (VO-059 core). Every control state round-trips (VO-060 core). No placeholder or enabled property is offered (VO-061) · tests/unit/salt/ops/properties.test.ts
- [x] **T061** [P] [US1] Unit test `gridLabel` precedence for every shape (VO-054) · tests/unit/salt/labels.test.ts
- [x] **T062** [P] [US1] Oracle test the screen operations. Row, column and span operations render aligned (VO-051), every preset renders, and command-word first cells inserted through operations appear in the render (VO-007) · tests/oracle/salt-ops.test.ts
- [x] **T063** [P] [US1] UI test screen editing. Insert from the palette with selection, focus and announcement (VO-002). Edge move message (VO-005). Select parent and Esc with the breadcrumb (VO-006). Click, Space, Enter, F2, double-click and Esc (VO-057). Invalid targets refused with a message (VO-093, screens). Focus after each operation (VO-095). Announcements (VO-096). Outline and canvas keys (VO-097). Esc and Enter precedence (VO-098). Move to and drag offer the same set (VO-049) · tests/ui/canvas/screen-editing.test.tsx
- [x] **T064** [P] [US1] UI test properties and presets. Label and value update canvas, source and preview while the width is kept (VO-003). Presets are labelled after reload (VO-008). The formatting choice (VO-059). States after reload (VO-060) · tests/ui/canvas/properties-presets.test.tsx
- [x] **T065** [P] [US1] End-to-end test: an empty library, then create a project, see the prompt, and do a first insert (VO-001). Build the reference login form, then render it in the app and through `runner.ts` (Independent Test) · tests/e2e/us1-build-screen.spec.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T066** [P] [US1] Write the screen messages: palette categories and labels with descriptions stating Salt's limits (FR-008/AC7), commands, refusal messages, announcement templates ("<Type> '<text>', row <r> column <c> of <container>"), span-limit text and property names · src/ui/messages/en/screen.ts
- [x] **T067** [P] [US1] Implement `gridLabel`: Table, Button bar, Form, Row, Column, then Grid (FR-002/AC14) · src/core/salt/labels.ts
- [x] **T068** [P] [US1] Implement `validDestinations`: for each container its empty cells and "at the end", plus "before" or "after" each element in single-row or single-column containers (section 3.2) · src/core/salt/destinations.ts
- [x] **T069** [P] [US1] Implement presets: Grid (rows × columns of `.`), Row, Column, Form, Button bar, Table, Group box and Text area, with placeholder text escaped (section 3.2) · src/core/salt/ops/presets.ts
- [x] **T070** [P] [US1] Implement `setProperty` for every A.1 property: width ≥ value, closing a drop-down drops its options with a count, Keep or Remove formatting, the selected tab marked bold, and container style. Writes nothing it cannot represent (FR-003) · src/core/salt/ops/properties.ts
- [x] **T071** [P] [US1] Implement span operations: set and reduce to fit, refuse on a first cell, and report the limiting element (EC-03) · src/core/salt/ops/span.ts
- [x] **T072** [P] [US1] Implement `wrap` (grid or group box) and `unwrap` (FR-002/AC11) · src/core/salt/ops/wrap.ts
- [x] **T073** [P] [US1] Implement `remove`: close the gap or leave `.`, delete attached comments, and change no other row (FR-002/AC8, FR-020/AC4) · src/core/salt/ops/remove.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T074** [P] [US1] Implement `insert` at the section 3.2 insertion point, never into an occupied cell, selecting the new element (FR-002/AC2) · src/core/salt/ops/insert.ts
- [x] **T075** [P] [US1] Implement row and column insert and delete, including span continuation cells (FR-002/AC9) · src/core/salt/ops/rows-columns.ts
- [x] **T076** [P] [US1] Implement `move` and `moveByKey`. A move carries comments and the span reduced to fit. The keyboard move refuses at an edge with the "Move to…" hint (FR-002/AC3, AC4, AC13) · src/core/salt/ops/move.ts

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [x] **T077** [P] [US1] Write the Salt canvas. Components are drawn Salt-like, never as live controls. Empty cells are always visible, with a "Show layout guides" toggle. Container outlines and the empty-screen prompt. Keys: arrows between cells, Enter into a container, Esc to the parent, Space toggles, and F2, Enter or double-click start inline editing. Each element is announced with type, text, cell and container. Drag targets come from `validDestinations` (FR-016/AC5, AC6, FR-009/AC3, AC10) · src/ui/canvas/SaltCanvas.tsx, src/ui/canvas/CellView.tsx, src/ui/canvas/components.tsx, src/ui/canvas/canvas-keys.ts, src/ui/canvas/InlineEdit.tsx, src/ui/canvas/canvas.css
- [x] **T078** [P] [US1] Write the screen palette: five categories, item descriptions, and Enter or click inserts (section 3.3) · src/ui/palette/Palette.tsx
- [x] **T079** [P] [US1] Write the screen outline on `Tree.tsx`. Nodes use grid labels, and the outline follows and expands to the selection · src/ui/outline/screen-outline.tsx
- [x] **T080** [P] [US1] Write the Salt properties sections for every component, grid style and title, and span with its limit text, plus the Keep or Remove formatting choice (FR-003) · src/ui/properties/salt-properties.tsx, src/ui/properties/FormattingChoice.tsx

**⟶ Wait for Wave 3 to finish, then:**

- [x] **T081** [US1] Register the `screen` block editor: Canvas, Outline, Palette, Properties, `pathLabels` ("Screen › Form › Row 2 › Button"), destinations, and the commands "Select parent", "Move to…", "Wrap", "Unwrap", "Delete", "Insert row", "Delete row", "Insert column" and "Delete column" with their shortcuts · src/ui/canvas/register.tsx

**Checkpoint**: a user can create a project and build a screen visually. User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Keep work safe in the browser and exchange it as a file (Priority: P1)

**Goal**: projects autosave, survive reloads and failures, are managed in the library, work safely across tabs, and download and import as one `.puml` file.

**Independent Test**: build a screen, refresh, and confirm it reopens exactly. Download it, import the file, and confirm everything is identical. Simulate a quota failure and confirm the report within 1 s with "Download a backup" while editing continues.

Files: src/core/project/import.ts, src/services/storage/{library-ops,tabs,persistence}.ts, src/services/files/{download,import-file}.ts, src/ui/messages/en/storage.ts, src/ui/library/{library-commands.tsx,DeleteDialog.tsx}, src/ui/storage/{StorageNotices.tsx,TabBanner.tsx,DownloadCommand.tsx,ImportCommand.tsx,register.tsx}

### Tests (write first, must fail)

**Wave 1 — independent (different files):**

- [x] **T082** [P] [US2] Unit test import. The project is named after the file, with the date appended on a clash, and starts never downloaded (VO-013 core). Non-UTF-8 and binary files are refused (VO-014). The first editable screen opens, else the flow, else the first block (VO-082). An empty file gives one screen, and a file without screen or flow gives other content with a status (VO-084 import) · tests/unit/project/import.test.ts
- [x] **T083** [P] [US2] Unit test library operations: create, rename, duplicate ("Copy of", never downloaded), delete and download (VO-076). Download state and the changes-since flag, where only a `.puml` download counts (VO-077) · tests/unit/services/library-ops.test.ts
- [x] **T084** [P] [US2] Unit test the tabs protocol with fake Web Locks and BroadcastChannel: read-only when the lock is held, handover with flush and release, history cleared on both sides (VO-012 core), and rename and delete broadcast (VO-081 core) · tests/unit/services/tabs.test.ts
- [x] **T085** [P] [US2] UI test library commands. The delete confirmation states changes not downloaded and offers "Download and delete" (VO-011). Times, the statement and the once-per-session reminder (VO-079) · tests/ui/library/library-commands.test.tsx
- [x] **T086** [P] [US2] UI test download notices. The notice lists unrenderable blocks and the count not yet checked, and every block is unchanged (VO-127). An invalid or source-only flow gets the notice that it will import as other content (VO-083) · tests/ui/storage/download.test.tsx
- [x] **T087** [P] [US2] End-to-end test storage. Saved within 2 s with "All changes saved" (VO-009). A write failure shows the notice within 1 s, keeps the previous record, and recovers on retry (VO-010). Reload, restart and crash lose at most 2 s (VO-075). Persistent storage refused, private window and quota each get one notice (VO-078) · tests/e2e/us2-storage.spec.ts
- [x] **T088** [P] [US2] End-to-end test tabs. The second tab is read-only and "Edit here instead" moves editing (VO-012). Rename and delete apply in another tab (VO-081). Histories never mix and are empty after reload or handover (VO-086) · tests/e2e/us2-tabs.spec.ts
- [x] **T089** [P] [US2] End-to-end test exchange. Refresh reopens exactly. Download, then import, gives an identical project (VO-013). A binary import changes nothing (VO-014) · tests/e2e/us2-exchange.spec.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T090** [P] [US2] Write the storage messages, including `storage.failed` and `storage.failed.quota` from autosave: library commands, delete confirmation, storage failure advice, "Download a backup", persistence and private-window notices, backup reminder, read-only and "Edit here instead" prompt (says undo history is not carried over), deleted elsewhere, and download notices · src/ui/messages/en/storage.ts
- [x] **T091** [P] [US2] Implement import as `importFile` from the core contract: decode, split, classify, choose the flow, give an empty file one screen, name the project from the file, and pick the block to open (section 3.6 "Import", FR-006/AC5, AC6, AC14, AC17) · src/core/project/import.ts
- [x] **T092** [P] [US2] Implement library operations on `db.ts`: rename (trim, an empty name keeps the old one), duplicate (copies `lastWorking`), delete, and mark downloaded (`downloadedAt`, `downloadedRevision`) (data-model §7.5, §7.6) · src/services/storage/library-ops.ts
- [x] **T093** [P] [US2] Implement tabs: a Web Lock per project id with `ifAvailable`, the `"plantuml-editor"` BroadcastChannel messages, handover, and `TabRole` changes (R-5, data-model §7.4) · src/services/storage/tabs.ts
- [x] **T094** [P] [US2] Implement persistence: `navigator.storage.persist()`, the result for a one-time notice, and private-window detection where possible (FR-006/AC9) · src/services/storage/persistence.ts
- [x] **T095** [P] [US2] Implement download: a `Blob` of the exact source (byte-order mark and line endings kept), a file name made safe, the list of unrenderable and unchecked blocks and the flow warning, and a mark-downloaded call (FR-006/AC4, FR-014/AC1, AC6, R-9) · src/services/files/download.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T096** [P] [US2] Implement file import: the picker (cancel does nothing), bytes into `importFile`, a new record, the import date appended on a name clash, and the project opened (FR-006/AC13) · src/services/files/import-file.ts
- [x] **T097** [P] [US2] Write the delete confirmation `alertdialog`, which states changes not downloaded and offers "Download and delete" (FR-006/AC3) · src/ui/library/DeleteDialog.tsx
- [x] **T098** [P] [US2] Write the storage notices: storage failure with advice and "Download a backup" while retrying, persistent storage refused, private window, and one backup reminder per session (FR-006/AC7, AC9, AC11) · src/ui/storage/StorageNotices.tsx
- [x] **T099** [P] [US2] Write the tab banner: read-only with "Edit here instead", handing over, and deleted elsewhere with a download offer (FR-006/AC12, AC16) · src/ui/storage/TabBanner.tsx
- [x] **T100** [P] [US2] Write the toolbar "Download" command with its non-blocking notices (FR-014/AC6) · src/ui/storage/DownloadCommand.tsx

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [x] **T101** [P] [US2] Write the library row commands "Open", "Rename", "Duplicate" and "Delete", and the empty-library "Import .puml file" (FR-006/AC3) · src/ui/library/library-commands.tsx
- [x] **T102** [P] [US2] Write the toolbar "Import .puml file" command (FR-016/AC1) · src/ui/storage/ImportCommand.tsx

**⟶ Wait for Wave 3 to finish, then:**

- [x] **T103** [US2] Register the library commands, toolbar Download and Import, storage notices, the tab banner, and history clearing on handover · src/ui/storage/register.tsx

**Checkpoint**: with User Story 1, this is the MVP. Work is safe, and projects download and re-import identically.

---

## Phase 5: User Story 3 - Open existing PlantUML files without losing anything (Priority: P2)

**Goal**: imported files show every block's status with a reason. Older-format Salt can be converted. Invalid blocks can be reverted. Downloads change only what was edited.

**Independent Test**: import every corpus file. Each status in the project panel matches its sidecar, and downloading without edits is byte-identical.

Files: src/core/blocks/convert.ts, src/core/project/revert.ts, src/ui/messages/en/blocks.ts, src/ui/blocks/{StatusBanner.tsx,ConvertAllNotice.tsx,register.tsx}

### Tests (write first, must fail)

**Wave 1 — independent (different files):**

- [x] **T104** [P] [US3] Unit test conversion and revert. "Convert all" replaces only the opening and closing lines and removes the `salt` line, in one entry (VO-112). Revert restores the last working version (VO-109 core) · tests/unit/blocks/convert.test.ts, tests/unit/project/revert.test.ts
- [x] **T105** [P] [US3] Oracle test: converted older-format blocks render (VO-017 render) · tests/oracle/convert.test.ts
- [x] **T106** [P] [US3] Contract test edit fidelity. For each corpus screen, one Salt operation followed by a download differs only within that element's text (VO-020, screens) · tests/unit/corpus/edit-fidelity.test.ts
- [x] **T107** [P] [US3] UI test status banners. An invalid-only screen shows "Error" with problem and line and no revert (VO-018). The last working version shows after reload (VO-080). Revert works before and after reload (VO-109). "Cannot be rendered" shows the renderer's message (VO-110). Exactly one "Convert all" notice, undone in one step (VO-017). A plain reason for each status (VO-106 display) · tests/ui/blocks/status.test.tsx
- [x] **T108** [P] [US3] End-to-end test: import every corpus file, check panel statuses against the sidecars, and download without edits byte-identically (Independent Test) · tests/e2e/us3-import.spec.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T109** [P] [US3] Write the block messages (status reasons are in T042's `reasons.ts`): "Fix in source", "Revert to last working version", "Convert to current format" and "Convert all" · src/ui/messages/en/blocks.ts
- [x] **T110** [P] [US3] Implement `convertOlderFormat` per block and for all blocks: `@startuml [name]` becomes `@startsalt [name]`, `@enduml` becomes `@endsalt`, the `salt` line is removed, and nothing else changes (FR-010/AC7, OD-5) · src/core/blocks/convert.ts
- [x] **T111** [P] [US3] Implement revert to last working version as one undoable edit that removes the `lastWorking` entry (FR-010/AC4) · src/core/project/revert.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T112** [P] [US3] Write the status banner above the canvas. Error shows block, line and problem, plus "Fix in source" (via `SourceView.focusLine`) and revert only when a last working version exists. Source-only shows its explanation. Older format offers "Convert to current format" (FR-004/AC4, FR-010/AC3, AC8) · src/ui/blocks/StatusBanner.tsx
- [x] **T113** [P] [US3] Write the one "Convert all" notice per import with older-format blocks (FR-010/AC7) · src/ui/blocks/ConvertAllNotice.tsx

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T114** [US3] Register the status banner in `banners`, the per-block convert entry in `projectPanel`, and the "Convert all" notice · src/ui/blocks/register.tsx

**Checkpoint**: existing files open with every block classified and kept. User Story 3 is independently testable.

---

## Phase 6: User Story 4 - Edit source and see the real render (Priority: P2)

**Goal**: type in a block's source with its canvas read-only, see the canvas update after a pause, recover from invalid source, and have the file re-divided safely on leaving.

**Independent Test**: type a valid change and the canvas updates within 500 ms of the pause. Introduce an error and see the message, line, "Fix in source" and revert. The preview shows "Not yet checked" until rendered and keeps the last render, marked out of date, after a failure.

Files: src/core/blocks/redivide.ts, src/ui/messages/en/source.ts, src/ui/source-view/{WholeFileView.tsx,source-edit.ts,register.tsx}

### Tests (write first, must fail)

**Wave 1 — independent (different files):**

- [x] **T115** [P] [US4] Unit test `redivide`: one block gives `null`, several blocks give one undoable change, removed linked screens are reported, the flow keeps its name or else the first activity block, and removing the last block is refused (VO-024 core, VO-084 re-division) · tests/unit/blocks/redivide.test.ts
- [x] **T116** [P] [US4] UI test the source edit session. The re-division warning and cancel (VO-024). Switching without typing is byte-identical (VO-063). Invalid text is kept through reload and other edits (VO-066). Typing runs between pauses are one undo step (VO-085). A source-view rename updates links or flags them with an "Undo" notice (VO-118). The whole-file view is read-only and copyable (VO-133) · tests/ui/source-view/source-edit.test.tsx
- [x] **T117** [P] [US4] End-to-end test. Only the typed-in canvas is locked (VO-021). The canvas updates within 500 ms after a 300 ms pause, keeping the selection (VO-022). Leaving with invalid text keeps it, locks the block and offers actions (VO-023). A rendering problem appears in the preview pane and the last render stays, marked out of date (VO-025) · tests/e2e/us4-source.spec.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T118** [P] [US4] Write the source messages: re-division report and warning, source-rename notices ("Updated 3 steps", the broken count with "Undo"), and the whole-file view label · src/ui/messages/en/source.ts
- [x] **T119** [P] [US4] Implement `redivide` (section 4.2 "Block boundaries", FR-004/AC10, FR-011/AC15) · src/core/blocks/redivide.ts
- [x] **T120** [P] [US4] Write the read-only whole-file view for copying (FR-016/AC7) · src/ui/source-view/WholeFileView.tsx

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T121** [US4] Write the source edit controller (data-model §7.2). The first keystroke locks this block's canvas. A 300 ms pause re-parses and maps the cursor to a selection. Leaving parses, writes one `sourceTyping` entry, re-divides once with a warning and cancel, and applies source-rename rules through `links.ts` (FR-011/AC14, OD-4). Leaving never changes the typed text (FR-004, FR-020/AC6) · src/ui/source-view/source-edit.ts

**⟶ Wait for T121 to finish, then:**

- [x] **T122** [US4] Register `sourceEdit`, which makes `SourceView` editable, and the whole-file view toggle · src/ui/source-view/register.tsx

**Checkpoint**: source editing and recovery work beside the visual editor. User Story 4 is independently testable.

---

## Phase 7: User Story 5 - Manage several screens in a project (Priority: P2)

**Goal**: add, rename, duplicate, reorder and delete screens (and other content) in the project panel, with safe names and link warnings.

**Independent Test**: create three screens, rename one to "Sign in" (saved as `Sign-in`), duplicate, reorder and delete. Download and re-import, and order and names are kept.

Files: src/core/project/screens.ts, src/ui/messages/en/screens.ts, src/ui/project-panel/{RenameField.tsx,LinkWarningDialog.tsx,screen-commands.tsx,register.tsx}

### Tests (write first, must fail)

**Wave 1 — independent (different files):**

- [x] **T123** [P] [US5] Unit test screen operations. Add uses the lowest unused `Screen-n` (VO-026 core). A case-insensitive duplicate name is refused, naming the block (VO-028). Deleting the last block is refused (VO-031, VO-084 delete). Placement and reorder rules carry attached comments, and order and names survive a re-import (VO-114). Duplicate goes after the original with a generated name and no links (VO-117) · tests/unit/project/screens.test.ts
- [x] **T124** [P] [US5] UI test the project panel. Add opens the new screen (VO-026). "Will be saved as Sign-in" previews the rename (VO-027). Renaming a screen with three linking steps updates them in one step (VO-029). An unlinked delete has no confirmation, offers "Undo" and opens the neighbour (VO-030). The linked-delete or rename warning lists steps, and cancel changes nothing (VO-115). Other content reorders and deletes as a unit, undoably (VO-130) · tests/ui/project-panel/screens.test.tsx
- [x] **T125** [P] [US5] End-to-end Independent Test: three screens, rename, duplicate, reorder, delete, download and re-import · tests/e2e/us5-screens.spec.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T126** [P] [US5] Write the screen messages: "Add screen", "Rename", "Duplicate", "Move up", "Move down", "Delete", "Will be saved as <name>", empty and duplicate refusals, link warning text, and the delete announcement with "Undo" · src/ui/messages/en/screens.ts
- [x] **T127** [P] [US5] Implement screen operations. Add goes after the last screen. Rename commits through `normalise`, refuses duplicates, and retargets links in one entry. Duplicate goes after the original. Reorder swaps blocks of the same kind only, with their attached comments. Delete covers screens and other content and refuses the last block. Every operation remaps `flowIndex` and `lastWorking` (section 3.6, FR-011) · src/core/project/screens.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T128** [P] [US5] Write the rename field. Text is unchanged while typing with the "Will be saved as …" preview, and converted on commit (FR-011/AC7) · src/ui/project-panel/RenameField.tsx
- [x] **T129** [P] [US5] Write the link warning dialog, which lists the affected steps before a rename or delete, with Proceed and Cancel (FR-011/AC5, AC8) · src/ui/project-panel/LinkWarningDialog.tsx

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T130** [US5] Write the project panel screen commands, the open screen's own name property, and the neighbour opening after a delete (FR-011/AC1, AC9, FR-015/AC4) · src/ui/project-panel/screen-commands.tsx

**⟶ Wait for T130 to finish, then:**

- [x] **T131** [US5] Register the screen commands in `projectPanel` and the name section in `propertySections` · src/ui/project-panel/register.tsx

**Checkpoint**: multi-screen projects are fully manageable. User Story 5 is independently testable.

---

## Phase 8: User Story 6 - Describe a screen flow (Priority: P3)

**Goal**: add a screen flow and build it from steps, decisions, loops, lanes and notes on a structured top-to-bottom canvas.

**Independent Test**: add a flow, insert a step, a two-branch decision and a loop, and assign lanes "User" and "System". The render shows each element in its lane, and the source renders in the command-line oracle.

Files: src/core/activity/{destinations,lanes,notes}.ts, src/core/activity/ops/{branches,insert,remove,lanes,notes,move}.ts, src/core/project/flow-block.ts, src/ui/messages/en/flow.ts, src/ui/flow-canvas/{FlowCanvas.tsx,flow-keys.ts,StepView.tsx,FlowPalette.tsx,FlowProperties.tsx,LaneList.tsx,NotesEditor.tsx,flow-outline.tsx,register.tsx}

### Tests (write first, must fail)

**Wave 1 — independent (different files):**

- [x] **T132** [P] [US6] Unit test flow structure operations. Insertion rules for a step, a branch, a loop body and no selection (VO-124). Deleting a decision with four steps, with its announcement (VO-034 core). The initial start and final stop cannot be moved or deleted (VO-036). Moves keep lane and notes and are refused at an edge. Attached comments move with elements (VO-064, flows). New elements follow the house style (VO-065, flows) · tests/unit/activity/ops/structure.test.ts
- [x] **T133** [P] [US6] Unit test branches: at least two, `elseif`, empty branches and empty loop bodies (VO-123 core) · tests/unit/activity/ops/branches.test.ts
- [x] **T134** [P] [US6] Unit test lanes. Adding the first lane covers every element. A new element takes the previous lane. Rename and reorder work. Deleting a lane in use needs a destination. Deleting the only lane removes every switch (VO-121, VO-037 core) · tests/unit/activity/lanes.test.ts
- [x] **T135** [P] [US6] Unit test notes: attached to steps, decisions, loops, start and path starts, several kept in order with their side, and moved and deleted with their owner (VO-122) · tests/unit/activity/notes.test.ts
- [x] **T136** [P] [US6] Unit test the flow block. "Add screen flow" writes `Screen-flow` with start and stop at the end of the file (VO-032 core). Deleting the flow clears `flowIndex` undoably (VO-125 core) · tests/unit/project/flow-block.test.ts
- [x] **T137** [P] [US6] Contract test edit fidelity: one flow operation per corpus flow changes only that element's text (VO-020, flows) · tests/unit/corpus/flow-edit-fidelity.test.ts
- [x] **T138** [P] [US6] Oracle test lanes and branches. Changing one lane inside a branch changes only that element's rendered lane (VO-035, VO-120), and every decision and loop shape renders (VO-123) · tests/oracle/flow-ops.test.ts
- [x] **T139** [P] [US6] UI test the flow editor. "Add screen flow" opens the flow (VO-032). Enter goes to the first branch, Left and Right move between branches, and empty branches take insertions (VO-033). Delete announces "Deleted decision and 4 steps" and can be undone (VO-034). Deleting a lane asks for a destination (VO-037). Invalid targets are refused (VO-093, flows). The flow key model, including the move shortcut never moving sideways (VO-099). Deleting the flow asks for confirmation and the panel shows "Add screen flow" (VO-125) · tests/ui/flow-canvas/flow-editing.test.tsx
- [x] **T140** [P] [US6] End-to-end Independent Test: a flow with a step, a decision, a loop and two lanes, rendered in the app and through `runner.ts` · tests/e2e/us6-flow.spec.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T141** [P] [US6] Write the flow messages: "Step", "Decision", "Loop" and "Stop", "Add screen flow" with its one-line explanation, lane and note labels ("Add note", left and right), refusals, removal announcements and the delete-flow confirmation · src/ui/messages/en/flow.ts
- [x] **T142** [P] [US6] Implement flow destinations: positions on paths, empty branch and body slots, and never sideways between branches (section 3.7) · src/core/activity/destinations.ts
- [x] **T143** [P] [US6] Implement lane switch writing. Compute the minimal `|Lane|` switches so that each element renders in its own lane, including across branches (OD-8, FR-012/AC10). PlantUML 1.2026.9 rejects a flow whose first lane switch comes after any statement, `start` included ("This swimlane must be defined at the start of the diagram"). So the first switch is always written before `start`, and later lanes, new ones included, may switch anywhere · src/core/activity/lanes.ts
- [x] **T144** [P] [US6] Implement note helpers to write and attach `note left`/`note right` in single-line or block form (section 3.7) · src/core/activity/notes.ts
- [x] **T145** [P] [US6] Implement adding and deleting the flow block, with deletion confirmed by the caller (FR-012/AC8, AC13) · src/core/project/flow-block.ts
- [x] **T146** [P] [US6] Implement branch operations: add and remove branches, refuse below two, and `elseif` ordering (FR-012/AC2, AC8) · src/core/activity/ops/branches.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T147** [P] [US6] Implement flow `insert` by the section 3.7 rules. The new element takes the previous lane through `lanes.ts` and is selected · src/core/activity/ops/insert.ts
- [x] **T148** [P] [US6] Implement flow `remove`: delete contents, notes and attached comments, refuse the initial start and final stop, and name what was removed (FR-012/AC9, AC13) · src/core/activity/ops/remove.ts
- [x] **T149** [P] [US6] Implement lane operations: add, rename, reorder, delete with a destination, set an element's lane, and the first and only lane rules (FR-012/AC12) · src/core/activity/ops/lanes.ts
- [x] **T150** [P] [US6] Implement note operations: add, edit text and side, and delete (FR-012/AC1) · src/core/activity/ops/notes.ts

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T151** [US6] Implement flow `move` and `moveByKey`. Elements move along the path, are refused at a branch or body edge with the "Move to…" hint, and keep their lane and notes · src/core/activity/ops/move.ts

**⟶ Wait for T151 to finish, then:**

**Wave 4 — independent (different files):**

- [x] **T152** [P] [US6] Write the flow canvas: structured top-to-bottom blocks with simple connectors and lane markers, notes beside their owner, locked parts through `LockedPlaceholder`, and step badges for linked, broken and case-only links (FR-013/AC2, AC4). Keys per FR-009/AC13 and drag targets from flow destinations · src/ui/flow-canvas/FlowCanvas.tsx, src/ui/flow-canvas/flow-keys.ts, src/ui/flow-canvas/StepView.tsx
- [x] **T153** [P] [US6] Write the flow palette: "Step", "Decision", "Loop" and "Stop" · src/ui/flow-canvas/FlowPalette.tsx
- [x] **T154** [P] [US6] Write the flow properties: element label, condition and branch labels, lane, notes ("Add note", text, side), and the flow's own lane list (FR-012/AC10, AC12) · src/ui/flow-canvas/FlowProperties.tsx, src/ui/flow-canvas/LaneList.tsx, src/ui/flow-canvas/NotesEditor.tsx
- [x] **T155** [P] [US6] Write the flow outline on `Tree.tsx` · src/ui/flow-canvas/flow-outline.tsx

**⟶ Wait for Wave 4 to finish, then:**

- [x] **T156** [US6] Register the `flow` block editor (Canvas, Outline, Palette, Properties, `pathLabels`, destinations, commands), plus "Add screen flow" in `projectPanel` and the confirmed delete-flow command · src/ui/flow-canvas/register.tsx

**Checkpoint**: screen flows can be built visually. User Story 6 is independently testable.

---

## Phase 9: User Story 7 - Link flow steps to screens and walk through a journey (Priority: P3)

**Goal**: link steps to screens or create screens from steps, open a linked screen and return, and follow links from the rendered flow preview with panels collapsed.

**Independent Test**: link a step, open it with "Open screen" and return with "Back to flow". Delete the screen and see the broken link with its three actions. Click a linked step in the rendered preview and the screen opens.

Files: src/core/activity/ops/links.ts, src/ui/messages/en/links.ts, src/ui/flow-links/{navigation.ts,LinkControl.tsx,preview-links.ts,register.tsx}

### Tests (write first, must fail)

**Wave 1 — independent (different files):**

- [x] **T157** [P] [US7] Unit test link operations. `setLink` links, changes and removes a link. Creating a screen from "Enter credentials" gives `Enter-credentials` linked in one entry (VO-038 core). A label with `[x]`, `]]` and `|` round-trips (VO-041 core) · tests/unit/activity/ops/links.test.ts
- [x] **T158** [P] [US7] Oracle test: an escaped linked label renders and keeps its link (VO-041) · tests/oracle/links.test.ts
- [x] **T159** [P] [US7] UI test the link control. "Create screen" creates and links (VO-038). A broken step offers "Link to another screen", "Create screen" and "Remove link" (VO-040). Linked steps look different (VO-126) · tests/ui/flow-links/links.test.tsx
- [x] **T160** [P] [US7] End-to-end test. "Open screen" and its shortcut focus the root grid, and "Back to flow" re-selects the step (VO-039). Clicking a preview step with panels collapsed opens the screen (VO-042). The collapsed-panel walkthrough works both ways (VO-131) · tests/e2e/us7-walkthrough.spec.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T161** [P] [US7] Write the link messages: "Open screen", "Back to flow", "Create screen", "Link to another screen", "Remove link", the broken-link message and the case-only suggested fix · src/ui/messages/en/links.ts
- [x] **T162** [P] [US7] Implement `setLink` and create-from-step. A screen is created through `screens.ts` and named by `generate({ fromLabel })`, and the label is escaped for a linked step (FR-013/AC1, AC5, AC6) · src/core/activity/ops/links.ts
- [x] **T163** [P] [US7] Implement navigation. "Open screen" sets `returnToFlow` and focuses the root grid. "Back to flow" re-selects the step (FR-013/AC3, FR-009/AC8) · src/ui/flow-links/navigation.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T164** [P] [US7] Write the link control in a step's properties: link to an existing screen, change, remove, "Create screen", the broken-link actions and the case-only fix (FR-013/AC1, AC4, FR-011/AC16) · src/ui/flow-links/LinkControl.tsx
- [x] **T165** [P] [US7] Write the preview link handler. A `#<screen-id>` click opens that screen. A missing screen shows the broken-link message (FR-015/AC6) · src/ui/flow-links/preview-links.ts

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T166** [US7] Register the link control in `propertySections`, "Open screen" (Ctrl+Enter) and "Back to flow" in `commands`, and the `previewLink` handler · src/ui/flow-links/register.tsx

**Checkpoint**: flows and screens are connected for walkthroughs. User Story 7 is independently testable.

---

## Phase 10: User Story 8 - Export images and copy source (Priority: P3)

**Goal**: export the open block as SVG or PNG, and copy the block's or the whole project's source.

**Independent Test**: export a screen as SVG and PNG and compare with the preview. Copy the whole project and compare with the downloaded file. Exporting an invalid block is prevented with an explanation.

Files: src/services/render/export-image.ts, src/services/files/clipboard.ts, src/ui/messages/en/export.ts, src/ui/export/{ExportCommands.tsx,register.tsx}

### Tests (write first, must fail)

**Wave 1 — independent (different files):**

- [x] **T167** [P] [US8] UI test: image export is refused with an explanation for invalid, older-format and `!include` blocks, while download and copy stay available (VO-044) · tests/ui/export/export.test.tsx
- [x] **T168** [P] [US8] End-to-end test. The SVG export equals the preview SVG, and the PNG is exactly 2× its natural width and height (VO-043). Copy confirms, and the clipboard equals the block source or the downloaded file (VO-045) · tests/e2e/us8-export.spec.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T169** [P] [US8] Write the export messages: "Export SVG", "Export PNG", "Copy source", "Copy project source", the copied confirmation and the export-refused explanations · src/ui/messages/en/export.ts
- [x] **T170** [P] [US8] Implement image export. SVG downloads the sanitised preview SVG. PNG draws that SVG at exactly 2× into a canvas and calls `toBlob` (FR-014/AC2, AC3, R-9) · src/services/render/export-image.ts
- [x] **T171** [P] [US8] Implement the clipboard with `navigator.clipboard.writeText` and a result for the confirmation (FR-014/AC4) · src/services/files/clipboard.ts

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T172** [US8] Write the export and copy commands, refused for unrenderable blocks with an explanation (FR-014/AC5) · src/ui/export/ExportCommands.tsx

**⟶ Wait for T172 to finish, then:**

- [x] **T173** [US8] Register the export and copy commands in `toolbar` · src/ui/export/register.tsx

**Checkpoint**: all eight stories are independently functional.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: cross-cutting verification (accessibility, offline, privacy, viewport, performance, generated-content correctness), docs, and validation against the Success Criteria.

**Wave 1 — independent (different files):**

- [x] **T174** [P] Build the reference project (10 screens of about 50 components, a flow of about 30 steps with decisions and lanes) and the SC-006 measurements: canvas ≤ 100 ms, source ≤ 200 ms, model ≤ 500 ms after a pause, preview ≤ 3 s (VO-137) · tests/corpus/reference/reference-project.puml, tests/e2e/perf/reference.spec.ts
- [x] **T175** [P] Scan every workspace state with axe and expect no WCAG 2.2 AA violations (VO-105, SC-003) · tests/e2e/a11y.spec.ts
- [x] **T176** [P] End-to-end test keyboard-only use. Both SC-001 tasks work by keyboard. Every command is a visible control with its shortcut (VO-100). No region traps focus (VO-101) · tests/e2e/keyboard-only.spec.ts
- [x] **T177** [P] End-to-end test offline: after one visit, go offline, reload and restart, and preview and image export still work (VO-135, SC-008) · tests/e2e/offline.spec.ts
- [x] **T178** [P] End-to-end test privacy. Record network traffic through editing, rendering, export and import: only the app's own files are requested (VO-074, VO-070 end to end, SC-008) · tests/e2e/privacy.spec.ts
- [x] **T179** [P] End-to-end test viewport and touch. At 1024 px and wider every feature works with panels collapsing, and below that nothing breaks (VO-103). Taps never delete or move unintentionally (VO-104) · tests/e2e/viewport-touch.spec.ts
- [x] **T180** [P] Oracle test generated content. Build the reference login form and a three-screen project with a decision flow through the core operations, then render every generated block in both renderers with nothing dropped (VO-046, SC-004) · tests/oracle/generated.test.ts
- [x] **T181** [P] Unit test undo and redo for every FR-007/AC10 operation kind with unrelated edits around it. Structure, properties and source are restored exactly (VO-088) · tests/unit/history/every-operation.test.ts
- [x] **T182** [P] Write the README: run, build, test, oracle jar and Java setup, the three-layer architecture, and the slot and message-part conventions · README.md
- [x] **T183** [P] Write the manual verification script for MV-001 to MV-005 (participants, tasks, thresholds, recording sheet) · specs/001-wireframe-flow-editor/tests/manual-verification.md

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T184** Validate against the Success Criteria. Run `npm run lint`, `npm run test:unit`, `npm run test:oracle` and `npm run test:e2e`. Check SC-003 to SC-008 against their VOs. Record that SC-001, SC-002 and the screen-reader part of SC-003 depend on the MV sessions. Report each failure against its owning task. SC-009 is exempt (plan) · specs/001-wireframe-flow-editor/tests/validation-report.md

---

## Dependencies & Execution Order

**Phases**: Setup (T001 gate first) → Foundational → user stories → Polish.

- **US1 (P1)** and **US2 (P1)** depend only on Foundational. Together they are the MVP.
- **US3 (P2)** and **US4 (P2)** depend on Foundational. Their tests exercise the US1 screen operations (T106) and the US2 import (T108), so finish US1 and US2 before running those tests.
- **US5 (P2)** depends on Foundational.
- **US6 (P3)** depends on Foundational.
- **US7 (P3)** depends on US5 (`screens.ts` for "Create screen") and US6 (the flow editor and step view).
- **US8 (P3)** depends on Foundational.
- **Polish** depends on every story.

Stories own disjoint files and plug in through `register.tsx` slots, so US1, US2, US3, US4, US5, US6 and US8 can be built in parallel after Foundational. US7 starts after US5 and US6.

**Waves within each phase:**

- **Setup**: T001 (gate) → T002 → T003–T010.
- **Foundational**: Wave 1 T011–T028 → Wave 2 T029–T040 → Wave 3 T041–T043 → Wave 4 T044–T045 → T046 → Wave 6 T047–T053 → T054.
- **US1**: tests T055–T065 → Wave 1 T066–T073 → Wave 2 T074–T076 → Wave 3 T077–T080 → T081.
- **US2**: tests T082–T089 → Wave 1 T090–T095 → Wave 2 T096–T100 → Wave 3 T101–T102 → T103.
- **US3**: tests T104–T108 → Wave 1 T109–T111 → Wave 2 T112–T113 → T114.
- **US4**: tests T115–T117 → Wave 1 T118–T120 → T121 → T122.
- **US5**: tests T123–T125 → Wave 1 T126–T127 → Wave 2 T128–T129 → T130 → T131.
- **US6**: tests T132–T140 → Wave 1 T141–T146 → Wave 2 T147–T150 → T151 → Wave 4 T152–T155 → T156.
- **US7**: tests T157–T160 → Wave 1 T161–T163 → Wave 2 T164–T165 → T166.
- **US8**: tests T167–T168 → Wave 1 T169–T171 → T172 → T173.
- **Polish**: Wave 1 T174–T183 → T184.
