# Data Model: Editor UI and UX Improvements

## Entities reshaped by this feature

### Settings (reshaped — `src/services/storage/db.ts`)

Adds per-project panel state and a layout-lines preference.

```typescript
interface Settings {
  // Existing: per-browser global panel state (legacy / fallback)
  panels: Partial<Record<PanelRegion, { collapsed: boolean }>>;

  // New: panel state keyed by project id (FR-013)
  projectPanels: Partial<Record<string, Partial<Record<PanelRegion, { collapsed: boolean }>>>>;

  // New: layout-lines display preference (FR-010, Decision 3)
  layoutLines: boolean;
}
```

**Fields**:
- `panels` — existing per-browser map; retained as fallback when no `projectId` is available.
- `projectPanels` — map from `projectId` (string) to a panel-region collapse map.  When a project id is present the workspace reads and writes this map; it falls back to `panels` when absent.
- `layoutLines` — boolean preference for showing dashed container outlines on the canvas. Default `false` (off). Previously this was local component state and reset on navigation.

**Validation**:
- A `PanelRegion` not present in the inner map is treated as its default collapsed state: `true` for `'source'`, `'preview'`, `'outline'`; `false` for `'project panel'`, `'palette'`, `'properties'` (FR-012).
- `projectPanels` missing entirely falls back to `panels`.

---

### PanelRegion default-collapsed set (new constant — `src/ui/workspace/Workspace.tsx`)

```typescript
const DEFAULT_COLLAPSED: ReadonlySet<PanelRegion> = new Set(['source', 'preview', 'outline']);
```

`isCollapsed()` returns `DEFAULT_COLLAPSED.has(PANEL[id])` when no stored preference exists for that panel (FR-012).

---

### ScreenNode (new — `src/ui/flow-canvas/ScreenFlowCanvas.tsx`)

A derived view model used only within `ScreenFlowCanvas`; not persisted.

```typescript
interface ScreenNode {
  /** Block key of the screen. */
  key: string;
  /** Display name (block name). */
  name: string;
  /** Position on the node-graph canvas (pixels from top-left). */
  x: number;
  y: number;
}
```

**Constraints**:
- Positions are computed by an auto-layout algorithm on first render and updated when the user drags a node (FR-017, FR-022).
- Node positions are not persisted in V1; they reset to auto-layout on reload.

---

### ScreenConnection (derived — `src/ui/flow-canvas/ScreenFlowCanvas.tsx`)

Also a view model derived from the activity flow block; not persisted independently.

```typescript
interface ScreenConnection {
  /** A stable id for React key purposes; derived from step path. */
  id: string;
  /** Name of the source screen (the screen containing the linked element). */
  sourceScreen: string;
  /** Name of the target screen. */
  targetScreen: string;
  /** Label shown on the arrow: the source element's name or step label. */
  label: string;
  /** File-absolute path into the flow block where the link text lives (for edits). */
  stepPath: readonly number[];
  flowBlockKey: string;
}
```

**Derived from**: `ScreenFlow.main` steps whose `link` field is set, collected via `linksTo()` in `src/core/project/links.ts`.

**Validation**:
- Connections whose `targetScreen` does not match any current screen name are treated as broken and shown with a broken-link visual but not hidden (FR-021: deletions cascade automatically because the step's link is invalidated).

---

### NavigationLink (storage representation — activity flow block)

Navigation links are stored as steps in the flow block activity diagram (Decision 1 in `research.md`). No new storage entity is introduced; the existing `Step` type in `src/core/activity/model.ts` is reused.

```typescript
// Existing (no change):
interface Step {
  kind: 'step';
  label: { text: string; raw: TextRange } | null;
  link: { target: string; raw: TextRange } | null;
  // ...
}
```

- `label.text` = the source canvas element's display name (set when creating the link from the context menu).
- `link.target` = the destination screen name.

**Validation rules** (FR-018, FR-018c):
- A canvas element may have at most one navigation link (one corresponding step per element name in the flow block).
- Target screen must be a named screen block in the project; broken links are surfaced with a "broken" badge, not silently dropped.
- Deleting a screen removes all steps whose `link.target` equals that screen's name (FR-021), applied via `retargetEdits` or removal edits in the store.

---

### CanvasElement navigation state (new badge — `src/ui/canvas/CellView.tsx`)

Not a new data entity; the badge is a derived view from the session state.

**Chain badge** (FR-018b): shown on `CellView` when the session's flow block contains a step whose label matches the element's display text and whose link is valid.

```
CellView
  ↓ reads session.blocks (flow block steps)
  ↓ finds step.label.text === elementDisplayText
  ↓ linkStatus(step.link.target, screenNames) === 'valid'
  → renders <span class="cell__link-badge" aria-label="Linked to {target}">🔗</span>
```

**Accessibility**: the badge carries an `aria-label` naming the target screen; it is not interactive (the link is created/edited via the context menu).

---

## State transitions

### Panel collapse lifecycle

```
Initial load (no stored preference)
  source, preview, outline  → Collapsed   (DEFAULT_COLLAPSED)
  project panel, palette, properties → Expanded

User clicks Region heading toggle
  Collapsed → Expanded  (content mounted)
  Expanded  → Collapsed (content unmounted)

State written to Settings.projectPanels[projectId]
  → persisted in IndexedDB (FR-013)
  → restored on next project open
```

### Drag lifecycle (canvas elements)

```
Idle
  → user starts pointer drag on CellView with useDragSource
Dragging (EditorDnd.activeId set)
  → offered drop targets highlighted
  → blocked targets shown as blocked
Over (pointer over offered target)
  → insertion indicator shown
  → Escape → Idle (position restored, FR-009)
  → release → Idle (element moved, FR-007; source updated)
  → release over blocked → Idle (no change, FR-007 AC3)
```

### Navigation link lifecycle

```
No link (default)
  → user right-clicks element → context menu → "Link to screen…"
  → user selects target screen
  → step created in flow block (setLink / createAndLink)
  → chain badge appears on element (FR-018b)
Linked (valid)
  → "Edit link…" → new target selected → step updated
  → "Remove link" → step link cleared
  → target screen deleted → link status becomes 'broken'
Linked (broken)
  → badge shown as broken-link icon
  → "Remove link" removes the step
```
