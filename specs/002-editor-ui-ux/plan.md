# Plan: Editor UI and UX Improvements

## Summary

Fix seven interrelated gaps in the canvas editor: wire drag sources and targets so
elements can actually be moved; add last-row and last-column guards to structural ops;
make the guide-lines toggle visible; change three panel defaults to collapsed; add per-project
panel-state storage; apply a sketch CSS theme; and build the screen-flow node graph view that
lets a business analyst create and view screen-to-screen navigation links from the canvas.
The work is spread across existing files (`CellView.tsx`, `rows-columns.ts`, `Workspace.tsx`,
`canvas.css`, `db.ts`) plus two new components (`ScreenFlowCanvas.tsx`, `CanvasContextMenu.tsx`).

> **Update (aligned with the built product)**: the screen flow shipped as the structured flow editor (`flow-canvas/FlowCanvas.tsx`, `StepView.tsx`, `FlowPalette.tsx`), not the `ScreenFlowCanvas.tsx` node graph listed below, and the default-collapsed panels were replaced by Simple/Advanced modes. See "Later changes" at the end for the files involved.

## Constitution Check

| Principle | Assessment |
|-----------|------------|
| (no operative principles — constitution is an unfilled template) | N/A |

## Project Structure

```
src/
  core/
    salt/
      ops/
        rows-columns.ts          ← add last-row / last-column guards (FR-002, FR-004)
  ui/
    canvas/
      SaltCanvas.tsx             ← move showGuides to settings; remove local state
      CellView.tsx               ← add useDragSource per cell; CanvasContextMenu trigger
      register.tsx               ← add keyboard shortcuts to row/column commands
      canvas.css                 ← container border SVG filter; guide-lines; button tiers (FR-011)
      RoughBorder.tsx            ← NEW: roughjs SVG overlay wrapper for widget borders (FR-011)
      CanvasContextMenu.tsx      ← NEW: right-click "Link to screen…" context menu (FR-018)
    workspace/
      Workspace.tsx              ← collapsed defaults, per-project state, Mantine panel headers
      workspace.css              ← mobile collapse breakpoint ≤768 px (US7 AC5)
      Toolbar.tsx                ← Mantine ActionIcon for Undo/Redo, Text for autosave (FR-024)
      CommandBar.tsx             ← Mantine Button with tier variants (FR-025)
  main.tsx                       ← MantineProvider + ColorSchemeScript wrap (FR-023)
    flow-canvas/
      ScreenFlowCanvas.tsx       ← NEW: screen node-graph view (FR-017–FR-022)
      register.tsx               ← register ScreenFlowCanvas as the visual for 'flow' blocks
    services/
      storage/
        db.ts                    ← add per-project panel state (FR-013)
specs/002-editor-ui-ux/
  plan.md
  research.md
  data-model.md
  contracts/
    ui.md
```

**Structure Decision**: all changes land in existing files except three new UI components
(`RoughBorder.tsx`, `CanvasContextMenu.tsx`, `ScreenFlowCanvas.tsx`) and two new dependencies:
`roughjs` (per-widget hand-drawn SVG borders) and `@mantine/core` + `@mantine/hooks` (app
shell components — Toolbar, CommandBar, panel headers). Mantine is explicitly excluded from
everything inside `src/ui/canvas/` to preserve the sketch-vs-shell boundary.

## Call Paths

**Structural command (e.g. Insert row)**
```
CommandBar button click
  → Command.run(ctx, store)                       register.tsx
    → canvasCtx(store, blockKey)
    → cmdInsertRow(selection, ctx)                canvas-keys.ts
      → docFor(ctx)  → screenDoc(text)
      → insertRow(doc, selection)                 rows-columns.ts
      → applyOp(op, ctx)                          canvas-keys.ts
        → shiftEdits(op.edits, view.start)
        → store.applyOp(shifted, { blockKey })
```

**Drag a canvas cell**
```
Pointer drag starts on CellView
  → useDragSource(id)                             dnd.tsx (already exists)
    fires EditorDnd.onDragStart
      → destinationsFor(dragId)                   SaltCanvas / validDestinations
      → session: { activeId, offered, overKey }
  Pointer moves over drop target
    → useDropTarget(key) → state: 'over'          CellView / dnd.tsx
  Pointer released
    → EditorDnd.onDragEnd
      → dropOutcome(destinations, overKey)
      → onMove(dragId, destination)               SaltCanvas.tsx
        → move(doc, path, dest)
        → applyOp(op, ctx)
```

**"Link to screen…" context menu**
```
Right-click CellView
  → CanvasContextMenu opens (FR-018)
    → user selects target screen
    → setLink(flowDoc, stepPath, targetName)      flow-links/ops/links.ts
      → store.applyOp(op, { blockKey: flowKey })
  Chain badge re-renders on CellView (FR-018b)
```

**Panel toggle**
```
Region heading button click
  → toggle(id)()                                  Workspace.tsx
    → Settings updated (collapsed toggled)
    → settings.put({ panels: { [projectId]: { ... } } })
      → db.ts putProjectSettings
```

## Key Code Notes

- `deleteRow` in `rows-columns.ts` has no minimum-row guard; add:
  `if (ctx.container.rows.filter(r => r.type === 'cells').length <= 1)`
- `deleteColumn` similarly has no minimum-column guard; the `columnCount === 0` check
  is a parse guard, not a user-action guard.
- `isCollapsed()` in `Workspace.tsx` currently returns `false` when the stored value is
  absent; add a `DEFAULT_COLLAPSED` set (`{ 'source', 'preview', 'outline' }`) to
  return `true` for those three when absent.

## States

```
Panel region
  Expanded  — initial state for project panel, palette, properties
              panel content rendered, grid column at full width
  Collapsed — initial default for source, preview, outline (FR-012)
              content unmounted, column shrinks to heading width
  [toggle click / page load with stored state]
  Persisted — stored per-project in IndexedDB (FR-013)
```

```
Drag
  Idle     — nothing being dragged; all targets show 'idle'
  Dragging — activeId set; offered targets show 'offered'; others 'hidden'
  Over     — pointer over an offered target; target shows 'over'
  Blocked  — pointer over a non-offered target; shows 'blocked'
  [Escape] → Idle (element returns, onDragCancel)
  [Release over offered] → Idle (element moves, onMove called)
  [Release over blocked] → Idle (no move, onBlocked called)
```

## Screens

**Canvas with sketch theme and context menu trigger** (FR-011, FR-018)
```
┌─ Command bar ──────────────────────────────────────────────────┐
│ [Insert row] [Delete row] [Insert col] [Delete col] [Wrap] … │
└────────────────────────────────────────────────────────────────┘
┌─ Canvas ───────────────────────────────────────────────────────┐
│  ☐ Show layout lines                                          │
│                                                               │
│  ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐                     │
│  ╎  [ Button 🔗 ]  [ Button ]           ╎  ← sketch border   │
│  ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤                     │
│  ╎  [___Input field___]                 ╎                     │
│  └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘                     │
│         ↑ right-click → context menu                          │
└────────────────────────────────────────────────────────────────┘
```

**"Link to screen…" context menu** (FR-018)
```
┌─ Context menu ──────────┐
│  Link to screen…        │
│  Edit link…    (if set) │
│  Remove link   (if set) │
│  ─────────────          │
│  (other actions)        │
└─────────────────────────┘
     ↓ select "Link to screen…"
┌─ Screen picker popover ─────────────────┐
│  Screen 1                               │
│  Screen 2                               │
│  ▸ Screen 3  (current screen, greyed)   │
└─────────────────────────────────────────┘
```

**Screen flow node graph** (FR-017)
```
┌─ Flow view ──────────────────────────────────────┐
│                                                  │
│  ┌──────────┐        ┌──────────┐               │
│  │ Screen 1 │──────→ │ Screen 2 │               │
│  └──────────┘        └──────────┘               │
│       │                    │                    │
│       └──────────→ ┌──────────┐                 │
│                    │ Screen 3 │                  │
│                    └──────────┘                  │
│  [pan + zoom; click arrow to edit/delete]        │
└──────────────────────────────────────────────────┘
```

**Workspace with panels hidden by default** (FR-012)
```
┌─ Toolbar ────────────────────────────────────────────────────────┐
│ Undo  Redo  All changes saved                                    │
├──────────┬─────────────────────────────────────────┬────────────┤
│ ▸ Project│                                         │▸Properties │
│ ▸ Palette│   Canvas (full width when panels hidden)│            │
│ ▸ Outline│                                         │            │
│          │                                         │            │
│          ├─────────────────────────────────────────┤            │
│          │ ▸ Source   ▸ Preview   (collapsed)       │            │
└──────────┴─────────────────────────────────────────┴────────────┘
```

## Later changes (US9–US11; product-spec OD-17 to OD-19)

### Structure

```
src/
  core/activity/ops/links.ts       ← addLinkedStep(doc, label, target, selection | null): inserts after the selection, or before the final stop
  ui/
    workspace/
      mode.ts                      ← NEW: UiMode, readMode(), useUiMode(); localStorage 'plantuml-editor.mode', default 'simple'
      Workspace.tsx                ← SegmentedControl "Interface mode"; Simple omits Outline and Preview; Source when advanced, no visual editor or source editing; region shortcut skips absent regions
      workspace.css                ← simple-mode grid (three columns); flex toolbar
    project-panel/
      ProjectPanel.tsx             ← entry row = open button + actions slot; details block visually hidden unless Error, name flag or reason
      screen-commands.tsx          ← Mantine Menu (ActionIcon ⋮): Rename, Duplicate, Move up/down, Delete; inline RenameField; warning dialogs unchanged
    flow-canvas/
      FlowPalette.tsx              ← "Screens" section: click or drag adds addLinkedStep
      flow-dnd.tsx                 ← SCREEN_PREFIX 'flow-screen::' drag ids
    canvas/
      link-to-screen.ts            ← NEW: useLinkToScreen() — creates the flow if missing, then addLinkedStep
      CanvasContextMenu.tsx        ← theme tokens; uses useLinkToScreen
      canvas.css                   ← .canvas-context-menu__item hover/focus
      register.tsx                 ← registers propertySections 'screen.linkToScreen' (order 20)
    properties/
      ScreenLinkSection.tsx        ← NEW: <details> "Link to screen…", shown for a selected button
```

### States

```
Interface mode
  Simple   — default; Outline, Preview not rendered; Source only for text-only blocks or when editing source
  Advanced — all regions
  [toolbar control] ↔  persisted per browser (localStorage)
```

```
Project panel entry
  Quiet   — name + ⋮ menu; details text visually hidden (still read by assistive technology)
  Flagged — error / name flag / reason drawn beneath the name
  Renaming — name field inline under the row
```

### Testing notes

- UI tests render through `tests/ui/render.tsx` (Mantine `env="test"`); `tests/ui/setup.ts` stubs `ResizeObserver` and seeds mode `advanced`.
- E2E fixtures seed mode `advanced` unless the test sets one; `tests/e2e/modes.spec.ts` covers Simple, Advanced and persistence. Playwright serves `vite preview`, so run `npm run build` first.
- Project-panel actions are reached through the "Actions for <name>" menu in both layers.
