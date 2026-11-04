# UI Contract: Editor UI and UX Improvements

This contract lists the DOM identifiers, command IDs, CSS classes, and storage keys that
consumers and tests code against. Names are copied exactly from the spec.

---

## §1  Command bar commands (test by `data-command`)

| `data-command` value | Spec | Notes |
|---|---|---|
| `screen.insertRow` | FR-001 | Enabled when a screen block is open |
| `screen.deleteRow` | FR-002 | Disabled when grid has only one row |
| `screen.insertColumn` | FR-003 | Enabled when a screen block is open |
| `screen.deleteColumn` | FR-004 | Disabled when grid has only one column |
| `screen.wrap` | FR-005 | Wraps selection in a grid |
| `screen.wrapGroup` | FR-005 | Wraps selection in a named group box |
| `screen.unwrap` | FR-006 | Removes enclosing group box |

Error messages when blocked:

| Situation | `messageKey` |
|---|---|
| Delete row on last row | `screen.refuse.lastRow` (new key) |
| Delete column on last column | `screen.refuse.lastColumn` (new key) |

---

## §2  Canvas region identifiers

| Identifier | Kind | Location |
|---|---|---|
| `data-region="canvas"` | attr | The canvas `<section>` in `Workspace.tsx` |
| `data-region="source"` | attr | Source panel `<section>` |
| `data-region="preview"` | attr | Preview panel `<section>` |
| `data-region="outline"` | attr | Outline panel `<section>` |
| `data-collapsed="true"` | attr | Set on a collapsed region |
| `aria-expanded` | attr | On the region heading toggle `<button>` |

**Default collapsed** (FR-012): `source`, `preview`, `outline` start collapsed on first load.

---

## §3  Canvas CSS classes (sketch theme, FR-011)

| Class | Applied to | Meaning |
|---|---|---|
| `salt-canvas` | Canvas host | Top-level canvas container |
| `salt-grid--guides` | Grid containers | Layout guide-lines visible (FR-010) |
| `salt-grid--groupBox` | Group box grids | Sketch-style groove border |
| `cmd--primary` | CommandBar buttons | Insert operations (primary visual tier) |
| `cmd--secondary` | CommandBar buttons | Wrap operations (secondary visual tier) |
| `cmd--destructive` | CommandBar buttons | Delete operations (destructive visual tier) |
| `cell--link-badge` | CellView element | Cell has a navigation link; renders chain badge (FR-018b) |

---

## §4  Drag-and-drop identifiers

| Identifier | Kind | Meaning |
|---|---|---|
| `data-path` | attr on cell/row | Comma-separated path for existing canvas elements (`"0,1,2"`) |
| `palette::<elementType>` | drag id prefix | Palette drags (e.g. `"palette::button"`); distinct from canvas paths |
| `DropTargetState` | TypeScript type | `'idle' \| 'hidden' \| 'offered' \| 'over' \| 'blocked'` |

---

## §5  Context menu (FR-018)

The context menu is triggered by `contextmenu` event on any canvas element.

| Menu item label | Condition shown |
|---|---|
| `Link to screen…` | Always (when element has no link, or to add another) |
| `Edit link…` | Element already has a navigation link |
| `Remove link` | Element already has a navigation link |

The screen-picker popover lists all screens in the project. The current screen is shown
but greyed (disabled).

---

## §6  Screen flow node graph (FR-017–FR-022)

| Identifier | Kind | Notes |
|---|---|---|
| `data-block-key` | attr on node | The screen block's key |
| `data-edge-id` | attr on edge | Source block key + `→` + target block key |
| `aria-label` | attr on node | The screen's name |

Interactions:

| Action | Result |
|---|---|
| Double-click a screen node | Canvas navigates to that screen (FR-020) |
| Click an edge | Edge is selected; rename/delete controls appear (FR-019) |
| Press Delete on selected edge | Connection removed, Salt source updated (FR-019) |
| Pan (pointer drag on empty canvas) | View pans (FR-022) |
| Scroll or pinch | View zooms (FR-022) |

---

## §7  Settings storage keys

| Key | Type | Default | Notes |
|---|---|---|---|
| `settings.panels` | `Partial<Record<PanelRegion, { collapsed: boolean }>>` | `{}` | Legacy global |
| `settings.projectPanels[projectId]` | `Partial<Record<PanelRegion, { collapsed: boolean }>>` | `{}` | Per-project (FR-013) |
| `settings.layoutLines` | `boolean` | `false` | Guide-lines toggle persistence (FR-010) |

**Default collapsed panels** (FR-012): when `settings.projectPanels[projectId]['source']`
(or `preview`, or `outline`) is absent, those panels start collapsed.

---

## §8  Announcement keys (new)

| `announceKey` | Trigger |
|---|---|
| `screen.announce.rowInserted` | Insert row succeeded |
| `screen.announce.rowDeleted` | Delete row succeeded |
| `screen.announce.columnInserted` | Insert column succeeded |
| `screen.announce.columnDeleted` | Delete column succeeded |
| `screen.refuse.lastRow` | Delete row blocked: last row |
| `screen.refuse.lastColumn` | Delete column blocked: last column |
| `links.created.announce` | Navigation link created |
| `links.removed.announce` | Navigation link removed |

---

## §9  Mantine app shell (FR-023–FR-026)

Mantine components are used exclusively in the app shell (outside `.salt-canvas`). Tests
can identify them by `data-mantine-component` attributes Mantine sets automatically.

| Location | Component | Mantine variant |
|---|---|---|
| Toolbar Undo button | `ActionIcon` | `variant="subtle"` |
| Toolbar Redo button | `ActionIcon` | `variant="subtle"` |
| Toolbar autosave status | `Text` | `size="sm"` |
| CommandBar insert commands | `Button` | `variant="filled"` |
| CommandBar wrap commands | `Button` | `variant="light"` |
| CommandBar delete commands | `Button` | `variant="subtle"` `color="red"` |
| Panel header toggle | `ActionIcon` | `variant="subtle"` |
| Panel header label | `Text` | `size="sm"` |

**Scope boundary**: no Mantine component is imported inside `src/ui/canvas/`. The canvas
subtree uses only Salt CSS classes (`salt-*`) and roughjs SVG overlays.

**Dark mode**: `ColorSchemeScript` is rendered in the HTML `<head>` and `MantineProvider`
reads `defaultColorScheme="auto"` so the shell follows the OS preference without JS flash.
