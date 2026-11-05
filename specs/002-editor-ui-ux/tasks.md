# Tasks: Editor UI and UX Improvements

## File Ownership

Each file is owned by exactly one phase.

| File | Phase |
|---|---|
| `src/services/storage/db.ts` | Phase 2 Foundational |
| `src/ui/messages/en/screen.ts` | Phase 2 Foundational |
| `src/core/salt/ops/rows-columns.ts` | Phase 2 Foundational |
| `src/ui/canvas/register.tsx` | Phase 3 US1 |
| `src/ui/canvas/CellView.tsx` | Phase 4 US2 |
| `src/ui/palette/Palette.tsx` | Phase 4 US2 |
| `src/ui/canvas/SaltCanvas.tsx` | Phase 5 US3 |
| `src/ui/canvas/RoughBorder.tsx` (new) | Phase 6 US4 |
| `src/ui/canvas/components.tsx` | Phase 6 US4 |
| `src/ui/flow-canvas/ScreenFlowCanvas.tsx` (new) | Phase 7 US5 |
| `src/ui/canvas/CanvasContextMenu.tsx` (new) | Phase 7 US5 |
| `src/ui/flow-canvas/register.tsx` | Phase 7 US5 |
| `src/ui/canvas/canvas.css` | Phase 8 US6 |
| `src/ui/workspace/Workspace.tsx` | Phase 9 US7 (layout/state), Phase 10 US8 (Mantine panel headers — T025) |
| `src/ui/workspace/workspace.css` | Phase 9 US7 |
| `src/main.tsx` | Phase 10 US8 |
| `src/ui/workspace/Toolbar.tsx` | Phase 10 US8 |
| `src/ui/workspace/CommandBar.tsx` | Phase 10 US8 |

---

## Phase 1: Setup

- [x] **T000** [P] [US4,US6,US8] Install `roughjs` and Mantine: `npm install roughjs @mantine/core @mantine/hooks` · `package.json`

---

## Phase 2: Foundational

Shared infrastructure that blocks all stories.
Files: `src/services/storage/db.ts`, `src/ui/messages/en/screen.ts`, `src/core/salt/ops/rows-columns.ts`

**Wave 1 — independent (different files):**

- [x] **T001** [P] [US1] Add `lastRow` / `lastColumn` guards to `deleteRow` and `deleteColumn`; return `{ ok: false, messageKey: 'screen.refuse.lastRow' }` when `rows.filter(r => r.type === 'cells').length <= 1`, and `screen.refuse.lastColumn` when `columnCount(container) <= 1` · `src/core/salt/ops/rows-columns.ts`
- [x] **T002** [P] [US1] Add message keys `screen.refuse.lastRow` and `screen.refuse.lastColumn` to the English message catalogue · `src/ui/messages/en/screen.ts`
- [x] **T003** [P] [US3,US7] Extend `Settings` interface with `projectPanels: Partial<Record<string, Partial<Record<PanelRegion, { collapsed: boolean }>>>>` and `layoutLines: boolean`; update `DEFAULT_SETTINGS` to include `layoutLines: false`; add `getProjectPanelSettings` / `putProjectPanelSettings` helpers · `src/services/storage/db.ts`

---

## Phase 3: User Story 1 — Toolbar Structural Operations

Goal: insert/delete row/column, wrap, unwrap all work correctly with last-row/col guards.
Files: `src/ui/canvas/register.tsx`

Depends on Phase 2 (T001, T002 must be done first).

### Tests

- [x] **T004** [US1] Write unit tests for `insertRow`, `deleteRow`, `insertColumn`, `deleteColumn` in `rows-columns.ts`: last-row guard blocks, last-column guard blocks, normal insert/delete succeeds · `src/core/salt/ops/rows-columns.test.ts`

### Implementation

**Wave 1:**

- [x] **T005** [US1] Add keyboard shortcuts to `screen.insertRow` (`Ctrl+Shift+Enter`), `screen.deleteRow`, `screen.insertColumn`, `screen.deleteColumn` commands in the `commands` array · `src/ui/canvas/register.tsx`

**Checkpoint**: Insert row, delete row, insert column, delete column each succeed in the CommandBar and are blocked correctly on last-row/col with a visible message. Wrap and unwrap already work.

---

## Phase 4: User Story 2 — Drag-and-Drop

Goal: elements can be dragged to reorder within a container; elements from the palette can be dragged onto the canvas.
Files: `src/ui/canvas/CellView.tsx`, `src/ui/palette/Palette.tsx`

Depends on Phase 2 (T003 for settings) and Phase 3 complete.

### Tests

- [x] **T006** [US2] Write Playwright test: drag first button in a three-button row to the last position; confirm order in both the canvas and the source · `tests/drag-reorder.spec.ts`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T007** [P] [US2] Wire `useDragSource(path.join(','), readOnly)` onto each `CellView` cell; wire `useDropTarget(key)` onto the gap zones between cells and between rows; render `DropTargetState` visually (`offered`/`over`/`blocked`/`hidden`) · `src/ui/canvas/CellView.tsx`
- [x] **T008** [P] [US2] Add `useDragSource` to each palette item with id `palette::<elementType>`; wrap the palette's root in a top-level `DndContext` that intercepts `palette::` drags and calls `cmdInsert(selection, choice, ctx)` on drop · `src/ui/palette/Palette.tsx`

**Checkpoint**: Dragging a cell to another position in the same row reorders it. Dragging from the palette inserts the element at the target position. Escape cancels the drag.

---

## Phase 5: User Story 3 — Layout Guide Lines

Goal: the "Show layout lines" toggle is stable across navigation and applies recursively.
Files: `src/ui/canvas/SaltCanvas.tsx`

Depends on Phase 2 (T003 adds `layoutLines` to Settings).

### Implementation

**Wave 1:**

- [x] **T009** [US3] Replace local `useState(true)` for `showGuides` in `SaltCanvas` with a read from `appSettingsStore` (using `layoutLines`, defaulting to `false`); write back on toggle; pass the stable value down to `GridView` · `src/ui/canvas/SaltCanvas.tsx`
- [x] **T010** [US3] Fix the guide-lines CSS selector to apply recursively: change `.salt-grid--guides` to also apply `outline` to `.salt-grid--guides .salt-grid`, `.salt-grid--guides .salt-row`, and `.salt-grid--guides .salt-cell` · `src/ui/canvas/SaltCanvas.tsx` (inline style or class addition; CSS lives in canvas.css but is owned by Phase 8 — add a single targeted rule here via a `<style>` injection or confirm the CSS update is deferred to Phase 8)

> Note: T010 adds a `data-show-guides` attribute on the canvas root and the Phase 8 CSS task handles the recursive selector. T010 sets the attribute; T021 styles it.

**Checkpoint**: Toggle "Show layout lines" on, navigate to a different screen, navigate back — guide lines are still on. New rows added while guide lines are on immediately show a dashed boundary.

---

## Phase 6: User Story 4 — WYSIWYG Canvas

Goal: every widget type renders a recognisable visual form on the canvas with a hand-drawn sketch border.
Files: `src/ui/canvas/RoughBorder.tsx` (new), `src/ui/canvas/components.tsx`

Depends on Phase 3 complete (canvas is functional) and T000 (roughjs installed).

### Implementation

**Wave 1 — independent (different files):**

- [x] **T011** [P] [US4,US6] Create `RoughBorder.tsx`: a wrapper component that uses `ResizeObserver` to measure its child element, then draws an aria-hidden `<svg>` overlay using `rough.svg().rectangle()` (for rectangular widgets) or `rough.svg().ellipse()` (for radio circles); accepts `roughness` (default 1.2) and `seed` props so the sketch shape is stable across re-renders · `src/ui/canvas/RoughBorder.tsx`
- [x] **T012** [P] [US4,US6] Wrap each bordered widget in `RoughBorder`: `ButtonComponent`, `TextFieldComponent`, `DropDownComponent`, `TreeComponent`, `TabBarComponent`, `MenuBarComponent`; replace their `border: 1px solid` inline styles with `border: none`; for `CheckboxComponent` wrap the 12×12 indicator square in `RoughBorder`; for `RadioButtonComponent` use `RoughBorder` with ellipse mode on the 12×12 indicator · `src/ui/canvas/components.tsx`

**Checkpoint**: Open a screen with a heading, two input fields, a button, and a data table. Without opening Preview, the canvas clearly shows the layout and each widget's border looks hand-drawn.

---

## Phase 7: User Story 5 — Screen Flow

Goal: the flow view shows screens as nodes; right-clicking a canvas element lets the user link it to a target screen; linked elements show a chain badge.
Files: `src/ui/flow-canvas/ScreenFlowCanvas.tsx` (new), `src/ui/canvas/CanvasContextMenu.tsx` (new), `src/ui/flow-canvas/register.tsx`

Depends on Phase 2 complete.

### Decision

- [x] **T033** [US5] Confirm which links module owns navigation connections — `src/core/project/links.ts` (read in T014's `ScreenFlowCanvas`) or `src/core/activity/ops/links.ts` (called in T015's `CanvasContextMenu`) — and record the chosen storage format in `specs/002-editor-ui-ux/data-model.md`. This must be resolved before T014 or T015 begin. · decision

### Tests

- [x] **T013** [US5] Write Playwright test: create two screens, right-click a button on Screen 1, choose "Link to screen…", select Screen 2, confirm chain badge appears on the button and the flow view shows an arrow from Screen 1 to Screen 2 · `tests/screen-flow.spec.ts`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T014** (SUPERSEDED: node graph removed; product-spec §3.7 structured flow is the design) [P] [US5] Create `ScreenFlowCanvas.tsx`: renders each screen block as a draggable labelled node (`data-block-key`), derives directed edges from `linksTo()` in `src/core/project/links.ts`, renders edges as SVG arrows (`data-edge-id`); supports click-to-select an edge, Delete key removes the selected edge via `setLink(..., null)`, double-click a node navigates canvas to that screen · `src/ui/flow-canvas/ScreenFlowCanvas.tsx`
- [x] **T015** [P] [US5] Create `CanvasContextMenu.tsx`: a right-click context menu on canvas elements showing "Link to screen…" (always), "Edit link…" and "Remove link" (when element is already linked); "Link to screen…" opens an inline popover listing all project screens; selection calls `createAndLink` from `src/core/activity/ops/links.ts` · `src/ui/canvas/CanvasContextMenu.tsx`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T016** (SUPERSEDED: node graph removed) [US5] Register `ScreenFlowCanvas` as the visual canvas for 'flow' blocks in `blockEditors`; add pan/zoom interaction (CSS `transform` on a wrapper, pointer-drag to pan, wheel to zoom) · `src/ui/flow-canvas/register.tsx`
- [x] **T017** [US5] Wire `CanvasContextMenu` into `CellView`: (1) attach a right-click handler that opens `CanvasContextMenu`; (2) on hover, reveal a link icon in the cell's corner that opens the same "Link to screen…" popover as the right-click menu (FR-018a); (3) render the chain badge (`cell--link-badge`) on any cell that has a navigation link (FR-018b) · `src/ui/canvas/CellView.tsx`

> T017 touches `CellView.tsx`, which is owned by Phase 4. Because Phase 4 and Phase 7 are in different phases and this is an additive touch, the task is listed here but implementors must confirm no Phase 4 work is in-flight. If Phase 4 and Phase 7 are merged into one worker, this is fine. Otherwise ensure T007 is merged before T017 begins.

- [x] **T018** [US5] Auto-remove flow connections when a screen is deleted: add a listener on screen-delete events that calls `retargetEdits` / `setLink(..., null)` for all connections targeting the deleted screen · `src/ui/flow-canvas/register.tsx`

**Checkpoint**: Draw connections between three screens via right-click. Confirm chain badges on linked elements. Delete a connection from the flow view. Double-click a node to navigate. Delete a screen and confirm its connections disappear.

---

## Phase 8: User Story 6 — Sketch-Style Theme

Goal: canvas borders have a hand-drawn feel; CommandBar buttons have three visually distinct tiers.
Files: `src/ui/canvas/canvas.css`

Depends on Phase 6 complete (visual forms must be in place before theming).

### Implementation

**Wave 1:**

- [x] **T019** [US6] Add an inline SVG `<feTurbulence>/<feDisplacementMap>` filter (`id="roughen"`, `baseFrequency="0.03"`, `scale="2"`) scoped to `.salt-canvas` and apply `filter: url(#roughen)` to `.salt-grid--border`, `.salt-grid--groupBox`, `.salt-grid--tableLines` container borders only — not to text or child elements (use a `::before` pseudo-element carrying the border so the filter does not distort content) · `src/ui/canvas/canvas.css`
- [x] **T020** [US6] Add `.cmd--primary`, `.cmd--secondary`, `.cmd--destructive` CSS classes to `canvas.css`; apply them in the CommandBar template (primary = insert operations, secondary = wrap, destructive = delete) · `src/ui/canvas/canvas.css`
- [x] **T021** [US6] Add the guide-lines recursive selector `[data-show-guides] .salt-grid, [data-show-guides] .salt-row, [data-show-guides] .salt-cell { outline: 1px dashed var(--guide-color, …) }` · `src/ui/canvas/canvas.css`

**Checkpoint**: Container borders read as deliberately rough. Three button tiers are distinguishable without reading labels.

---

## Phase 9: User Story 7 — Panel Defaults

Goal: Preview, Source and Outline are hidden on first load; panel state is persisted per project; panels auto-collapse below 768 px.
Files: `src/ui/workspace/Workspace.tsx`, `src/ui/workspace/workspace.css`

Depends on Phase 2 (T003 adds `projectPanels` to Settings).

### Tests

- [x] **T022** [US7] Write Playwright test: open the editor to a fresh project, confirm Source/Preview/Outline are collapsed; open Source, refresh the page, confirm Source is still open · `tests/panel-defaults.spec.ts`
- [x] **T032** [US7] Write Playwright test: set viewport to 767 px width and confirm Source, Preview, and Outline panels all auto-collapse and the canvas takes the full available viewport width · `tests/panel-defaults.spec.ts`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T023** [P] [US7] In `isCollapsed()`, return `true` for `'source'`, `'preview'`, and `'outline'` when the stored value is absent; read/write from `stored.projectPanels[session.projectId]` when a `projectId` is available, falling back to global `stored.panels` · `src/ui/workspace/Workspace.tsx`
- [x] **T024** [P] [US7] Add `@media (max-width: 768px)` rule that sets `data-collapsed` on source, preview, outline, properties, and palette regions; the canvas takes the full viewport width · `src/ui/workspace/workspace.css`

**Checkpoint**: On first load, Source/Preview/Outline are hidden and the canvas fills the space. Toggling Source open and reloading restores it as open. At 767 px viewport width, the panels auto-collapse.

---

## Phase 10: User Story 8 — Refined App Shell

Goal: Toolbar, CommandBar and panel headers use Mantine components; app shell looks professional while the canvas interior remains unaffected.
Files: `src/main.tsx`, `src/ui/workspace/Toolbar.tsx`, `src/ui/workspace/CommandBar.tsx`, `src/ui/workspace/Workspace.tsx`

Depends on T000 (Mantine installed) and Phase 9 complete.

### Tests

- [x] **T026** [US8] Write Playwright test: confirm Toolbar Undo button renders as a Mantine ActionIcon (`data-mantine-component="ActionIcon"`); confirm CommandBar insert button has `data-variant="filled"` and delete button has `data-variant="subtle"` · `tests/app-shell-theme.spec.ts`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T025** [P] [US8] Replace panel header toggle `<button>` elements with Mantine `ActionIcon` and panel label `<span>` elements with Mantine `Text`; import only those two Mantine components here — do not import any Mantine component inside the `src/ui/canvas/` subtree · `src/ui/workspace/Workspace.tsx`
- [x] **T027** [P] [US8] Wrap the app root in `MantineProvider` with a minimal theme object; import `@mantine/core/styles.css` before any project stylesheet in `main.tsx`; add `ColorSchemeScript` to support dark mode · `src/main.tsx`
- [x] **T028** [P] [US8] Replace Toolbar Undo and Redo `<button>` elements with Mantine `ActionIcon variant="subtle"`; replace the autosave status `<span>` with Mantine `Text size="sm"` · `src/ui/workspace/Toolbar.tsx`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T029** [US8] Replace CommandBar `<button>` rendering with Mantine `Button`; apply `variant="filled"` to insert commands (`screen.insertRow`, `screen.insertColumn`), `variant="light"` to wrap commands (`screen.wrap`, `screen.wrapGroup`, `screen.unwrap`), and `variant="subtle"` with `color="red"` to delete commands (`screen.deleteRow`, `screen.deleteColumn`) · `src/ui/workspace/CommandBar.tsx`

**Checkpoint**: Toolbar Undo/Redo, CommandBar buttons, and panel header toggles use Mantine components. Canvas interior sketch borders are unchanged. Dark mode toggle produces correct shell styling.

---

## Phase 11: Polish

- [x] **T030** [US1–US8] Run the full test suite (`npm test`) and confirm all new tests pass; run lint (`npm run lint`) and fix any issues · project root
- [x] **T031** Validate against Success Criteria SC-001 through SC-009: manual walkthrough in the browser for each criterion · n/a (manual)

---

## Phase 12: Post-release changes (US9–US11)

- [x] **T040** [US11] `addLinkedStep` takes an optional selection path; unit test · `src/core/activity/ops/links.ts`, `tests/unit/activity/ops/links.test.ts`
- [x] **T041** [US11] Flow palette "Screens" section with click and drag; guidance text · `src/ui/flow-canvas/FlowPalette.tsx`, `flow-dnd.tsx`, `messages/en/flow.ts`
- [x] **T042** [US11] Readable context menu on theme tokens; shared `useLinkToScreen` · `src/ui/canvas/CanvasContextMenu.tsx`, `link-to-screen.ts`, `canvas.css`
- [x] **T043** [US11] "Link to screen…" Properties section for buttons · `src/ui/properties/ScreenLinkSection.tsx`, `src/ui/canvas/register.tsx`
- [x] **T044** [US9] Simple/Advanced mode · `src/ui/workspace/mode.ts`, `Workspace.tsx`, `workspace.css`, `tests/e2e/modes.spec.ts`
- [x] **T045** [US10] Project panel ⋮ actions menu; quiet status text · `src/ui/project-panel/ProjectPanel.tsx`, `screen-commands.tsx`, `src/ui/app/app.css`
- [x] **T046** [US9–US11] Update tests: Mantine test env, `ResizeObserver` stub, default mode in UI setup; menu-based project panel tests · `tests/ui/render.tsx`, `tests/ui/setup.ts`, `tests/ui/project-panel/screens.test.tsx`, `tests/e2e/*`
- [ ] **T047** Trace the 15 e2e tests that fail on `main` independent of these changes (a11y, keyboard-only, offline, panel-defaults ×2, perf/reference, privacy, us1-build-screen ×2, us4-source ×4, us7-walkthrough, us8-export). `panel-defaults` also asserts the superseded collapsed-by-default behaviour and needs rewriting for modes.

---

## Dependencies & Execution Order

```
Phase 1 Setup (T000)
  → all phases (roughjs + Mantine must be installed first)

Phase 2 Foundational
  → Phase 3 US1 (depends on rows-columns guards from T001/T002)
  → Phase 4 US2 (depends on Settings T003 for palette DnD context)
  → Phase 7 US5 (depends on Settings T003 for links)
  → Phase 9 US7 (depends on projectPanels from T003)

Phase 3 US1
  → Phase 4 US2

Phase 4 US2
  → Phase 5 US3 (SaltCanvas needs DnD wiring before guide-lines rework)

Phase 5 US3
  → Phase 6 US4 (SaltCanvas stable before visual tweaks)

Phase 6 US4
  → Phase 8 US6 (widget forms in place before theming)

Phase 8 US6
  → Phase 11 Polish

Phase 7 US5 (independent of US1–US4 except Phase 2)
Phase 9 US7 (independent of US1–US6 except Phase 2)
  → Phase 10 US8 (panel layout and state from Phase 9 must be stable before Mantine styling)

Phase 10 US8
  → Phase 11 Polish
```

**Wave summary by phase:**
- Phase 1: 1 setup task (npm install).
- Phase 2: one wave of 3 independent tasks (different files).
- Phase 3: tests task, then 1 implementation task.
- Phase 4: tests task, then 1 wave of 2 independent tasks (different files).
- Phase 5: 2 sequential tasks (same file).
- Phase 6: 2 parallel tasks (different files).
- Phase 7: decision task (T033), then tests task, then 1 wave of 2 independent tasks (new files), then 3 sequential integration tasks.
- Phase 8: 3 tasks in the same file (sequential).
- Phase 9: 2 test tasks (T022, T032), then 1 wave of 2 independent tasks (different files).
- Phase 10: tests task, then 1 wave of 3 independent tasks (different files: Workspace.tsx T025, main.tsx T027, Toolbar.tsx T028), then 1 sequential integration task.
- Phase 11: 2 validation tasks.
