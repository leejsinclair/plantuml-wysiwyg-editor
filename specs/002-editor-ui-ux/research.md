# Research: Editor UI and UX Improvements

## Decision 1 — Navigation link storage format

**Decision**: Store screen-to-screen navigation links as steps in the existing activity-diagram
flow block, reusing `setLink` / `createAndLink` from `src/core/activity/ops/links.ts`.
Each canvas element that has a navigation link corresponds to a named step whose `link.target`
is the destination screen name.

**Rationale**: The infrastructure already exists (`LinkControl.tsx`, `navigation.ts`,
`src/core/project/links.ts`). The flow block is the project's declared home for screen
connections. Adding a separate annotation block or per-widget Salt property would require
a new parser and a new storage concept; reusing the existing structure adds no new concepts.

**Alternatives considered**:
- *Salt widget property* (e.g. `{link:ScreenB}` in the widget text): PlantUML does not
  support this; it would require the project's own parser extension and break round-trip
  fidelity.
- *Separate metadata block* (`@startuml screen-connections`): Valid architecturally but adds
  a new block kind and parser. No existing code to reuse.
- *localStorage / project side-car file*: Breaks the single-file project model the rest of
  the system relies on.

## Decision 2 — Flow view representation

**Decision**: Implement a new `ScreenFlowCanvas.tsx` component that renders screens as nodes
and activity-diagram step links as directed arrows, displayed when the 'flow' block is open.
The existing `FlowCanvas.tsx` (linear step editor) remains for editing the activity-diagram
source; `ScreenFlowCanvas` is the new read-plus-create visual surface that shows the
screen graph.

**Rationale**: The existing `FlowCanvas` shows activity steps top-to-bottom — useful for
editing the flow program, but not readable as a "screen map" for stakeholders. A node-graph
view better serves FR-017 and the non-technical audience the spec targets. Replacing
`FlowCanvas` would lose the step-editor; running them side-by-side (tab or split) is the
least-disruptive approach.

**Alternatives considered**:
- *Adapt FlowCanvas to be a node graph*: Requires a near-total rewrite of the layout and
  interaction model. The step-editor features (add branch, add note, move step) would be
  lost or degraded. More disruption for less gain than a focused new component.
- *Use a third-party graph library (e.g. ReactFlow)*: Ruled out by spec assumption
  ("no third-party DnD library added unless already present"); the same spirit applies
  to graph libraries. A minimal SVG-based layout is achievable for ≤20 screens.

## Decision 3 — "Show layout lines" state persistence

**Decision**: Move `showGuides` out of local `useState` in `SaltCanvas.tsx` and into the
`SettingsStore`, stored alongside the panel state. Key: `'layoutLines'` under `Settings`.

**Rationale**: Local state is reset when navigating between screens. The spec implies the
setting is stable across edits (FR-010 AC3: "layout lines update to include a new row's
boundary" — they must still be on after an insert). Per-browser persistence (not per-project)
is acceptable here since it is a display preference, not content.

**Alternatives considered**:
- *Per-project persistence via project record*: Adds complexity to the project schema for a
  display preference. Not worth it; the spec does not require per-project persistence for
  this setting.

## Decision 4 — Panel default state (FR-012)

**Decision**: Change `isCollapsed()` in `Workspace.tsx` to return `true` for `'source'`,
`'preview'`, and `'outline'` when the stored value is absent (no saved preference).
Do not change `DEFAULT_SETTINGS`; the function-level default is the right place, so
existing users who explicitly opened these panels keep their stored state.

**Rationale**: A `DEFAULT_SETTINGS` change would re-collapse panels for users who
previously chose to keep them open (their stored key is present and set to `{ collapsed: false }`
— actually their stored key is absent, so `DEFAULT_SETTINGS = { panels: {} }` currently
means expanded). Changing the function-level default only affects users with no stored
preference, which is exactly the "first load" case the spec addresses.

**Alternatives considered**:
- *Seed DEFAULT_SETTINGS with three panels pre-collapsed*: Equivalent outcome but changes
  the shared constant used by tests; function-level default is more localised.

## Decision 5 — Per-project panel state (FR-013)

**Decision**: Key panel state under `projectId` in the `Settings` record: add
`projectPanels: Partial<Record<string, Partial<Record<PanelRegion, { collapsed: boolean }>>>>` to
the `Settings` interface in `db.ts`. `Workspace.tsx` reads and writes from
`settings.panels[projectId] ?? {}` when a `projectId` is available, falling back to the
global `panels` record for the legacy case.

**Rationale**: The spec explicitly requires per-project persistence (FR-013). The storage
layer (IndexedDB via `db.ts`) already has a single `Settings` record; adding a project-keyed
sub-map extends it without a schema migration.

**Alternatives considered**:
- *Store panel state in the project record*: Would require touching `ProjectRecord` in the
  project storage schema and all project read/write paths. Much larger blast radius.
- *Separate IDB object store per project*: Clean but adds migration complexity and a new
  store opening path.

## Decision 6 — Palette-to-canvas drag (FR-007 AC8)

**Decision**: Implement palette drag as a wrapper `DndContext` at the workspace level (above
`SaltCanvas`), using a distinct drag-id prefix (`palette::<elementType>`) to distinguish palette
sources from canvas sources. The canvas `EditorDnd` ignores palette-prefixed ids. The workspace
context handles the drop and calls `cmdInsert(selection, choice, ctx)` in `canvas-keys.ts`.

**Rationale**: The current `EditorDnd` in `SaltCanvas` calls `destinationsFor(dragId)` which
calls `validDestinations(model, path)` — `path` is derived from the drag id as a comma-separated
integer string, which fails for a palette drag id. A top-level context that intercepts palette
drags before the canvas context sees them is the simplest extension that avoids modifying
`EditorDnd`'s contract.

**Alternatives considered**:
- *Extend EditorDnd to handle two id schemes*: Complicates the generic DnD abstraction.
  Rejected: EditorDnd is purposefully generic and shared across screen, outline and flow canvases.
- *Add a `type` field to drag data*: dnd-kit's `useDraggable` accepts a `data` field that
  `destinationsFor` could inspect. Clean, but requires touching the generic `EditorDnd`
  contract and both canvas and palette components. More invasive than a wrapper context.

## Decision 8 — App shell component library (FR-023–FR-026)

**Decision**: Use **Mantine** (`@mantine/core`, `@mantine/hooks`) for all app shell components:
Toolbar buttons, CommandBar buttons, and panel header controls. Mantine is installed alongside
the existing stack; its CSS is imported via a `@layer mantine` layer so unlayered Salt and
project CSS takes precedence automatically.

**Rationale**: The current shell uses unstyled divs with inline CSS. The project has no
component library. Mantine was chosen over:
- *shadcn/ui*: requires Tailwind CSS project-wide — a large new dependency that would affect
  every existing component.
- *Radix UI / Base UI*: headless only — gives accessibility primitives but no visual styling;
  a full design system would still need to be written from scratch.
- *Custom CSS design tokens*: viable but slower, and produces a bespoke system with no
  ecosystem. Mantine's token system (CSS custom properties on `:root`) is compatible with the
  project's existing CSS approach.
- *Wired Elements*: abandoned (last publish 2021, still at v3.0.0-rc.6 release candidate).

Mantine v7+ uses CSS modules and CSS layers; no Tailwind required. Tree-shakeable — only
imported components add to the bundle. Dark mode is handled by Mantine's `ColorSchemeScript`
and the `data-mantine-color-scheme` attribute, which does not conflict with the canvas CSS.

**Scope boundary**: Mantine applies exclusively to app shell elements outside `.salt-canvas`.
The canvas interior continues to use roughjs and Salt's own CSS classes. This boundary is
enforced by not importing Mantine components inside any `src/ui/canvas/` component.

## Decision 7 — Sketch-style theme (FR-011)

**Decision**: Use `roughjs` to render each widget component's border as a hand-drawn SVG
shape via a `RoughBorder` wrapper component in `src/ui/canvas/RoughBorder.tsx`. Container
and grid borders use a CSS `feTurbulence`/`feDisplacementMap` SVG filter scoped to
`.salt-canvas`. Button hierarchy: three classes `cmd--primary`, `cmd--secondary`,
`cmd--destructive` applied in `CommandBar` button rendering, styled in `canvas.css`.

**Rationale**: The Salt canvas renders custom React components (`ButtonComponent`,
`TextFieldComponent`, etc.), not standard HTML form elements. Libraries that style standard
elements (Wired Elements, Drawably) cannot wrap them. `roughjs` is the only actively-
maintained option (last publish April 2025) that works directly with custom-rendered
components. The approach mirrors what Drawably does internally: keep HTML content for layout
and accessibility, draw an aria-hidden SVG border overlay using `ResizeObserver` to track
element size.

Widget borders and grid container borders are treated separately:
- Widget borders → `RoughBorder` wrapper with `rough.svg().rectangle()` or `.ellipse()`.
- Grid container borders → CSS SVG filter (`feTurbulence`/`feDisplacementMap`), because
  containers resize dynamically and rough.js can't efficiently redraw on every resize.

**Alternatives ruled out**:
- *Wired Elements*: Last published 2021 (v3.0.0-rc.6 still a release candidate). Snyk
  health 53/100, rated inactive. React wrapper at v0.1.6, also unmaintained.
- *Drawably*: Wraps standard HTML form elements only; cannot be applied to custom canvas
  components. Maintenance status unverified.
- *CSS-only SVG filter for widgets*: The filter distorts text inside borders as well as
  the border itself. Acceptable for grid containers (which contain child elements anyway),
  but wrong for buttons and inputs where label legibility matters.
- *`react-rough-fiber`*: A custom React reconciler replacement — invasive integration and
  requires all SVG inside the boundary to be redrawn. Heavier than a targeted `RoughBorder`
  wrapper.
