// Screen editor strings (T066; FR-002, FR-003, FR-008/AC7, FR-009, FR-016/AC8, contracts/ui.md §6–8).
// Palette categories and item descriptions, commands, refusal messages, announcement templates,
// span-limit text and property names. All keys are prefixed `screen.`.
import type { MessagePart } from '../en.ts';

const screen = {
  // ── Palette categories (section 3.3) ────────────────────────────────────────────────────────
  'screen.palette.category.basic': 'Basic',
  'screen.palette.category.form': 'Form',
  'screen.palette.category.layout': 'Layout',
  'screen.palette.category.data': 'Data',
  'screen.palette.category.navigation': 'Navigation',

  // ── Palette item descriptions (FR-008/AC7, Salt limits) ─────────────────────────────────────
  'screen.palette.desc.Text': 'A plain text label.',
  'screen.palette.desc.Separator': 'A full-row horizontal rule (single, double, dotted or wavy).',
  'screen.palette.desc.Spacing': 'An empty row for vertical spacing.',
  'screen.palette.desc.Text field': 'An editable text input. Width is in characters (Salt A-3).',
  'screen.palette.desc.Text area': 'A multi-line text area (shown as a text field in Salt).',
  'screen.palette.desc.Button': 'A push button.',
  'screen.palette.desc.Checkbox': 'A tick-box with a label; checked or unchecked.',
  'screen.palette.desc.Radio button': 'A radio button with a label; selected or deselected.',
  'screen.palette.desc.Drop-down': 'A drop-down selector. Up to 20 options are shown when open.',
  'screen.palette.desc.Grid': 'A rectangular grid of cells (up to 20 × 20 in Salt).',
  'screen.palette.desc.Row': 'A single-row grid for a horizontal group of elements.',
  'screen.palette.desc.Column': 'A single-column grid for a vertical stack.',
  'screen.palette.desc.Form': 'A two-column grid: labels on the left, controls on the right.',
  'screen.palette.desc.Button bar': 'A single-row grid with a border, for a row of buttons.',
  'screen.palette.desc.Group box': 'A bordered container with an optional title.',
  'screen.palette.desc.Table': 'A grid with full table lines and a header row.',
  'screen.palette.desc.Tree': 'A tree list. Nesting depth is limited to one more than the item above.',
  'screen.palette.desc.Tab bar': 'A tab strip. The selected tab is shown in bold.',
  'screen.palette.desc.Menu bar': 'A menu bar. Open menus are shown as locked placeholders.',
  'screen.palette.desc.Scrollable area': 'A scrollable container.',

  // ── Grid row/column inputs ───────────────────────────────────────────────────────────────────
  'screen.palette.grid.rows': 'Rows',
  'screen.palette.grid.columns': 'Columns',

  // ── Commands ─────────────────────────────────────────────────────────────────────────────────
  'screen.command.selectParent': 'Select parent',
  'screen.command.moveTo': 'Move to…',
  'screen.command.wrap': 'Wrap',
  'screen.command.wrapGroup': 'Wrap in group box',
  'screen.command.unwrap': 'Unwrap',
  'screen.command.delete': 'Delete',
  'screen.command.insertRow': 'Insert row',
  'screen.command.deleteRow': 'Delete row',
  'screen.command.insertColumn': 'Insert column',
  'screen.command.deleteColumn': 'Delete column',

  // ── Refusal messages (FR-008/AC3) ────────────────────────────────────────────────────────────
  'screen.refuse.deleteRoot': 'The root grid cannot be deleted.',
  'screen.refuse.alreadyEmpty': 'This cell is already empty.',
  'screen.refuse.notFound': 'The selected element could not be found.',
  'screen.refuse.occupied': 'That cell is occupied.',
  'screen.refuse.separatorCell': 'A separator occupies the whole row.',
  'screen.refuse.notACell': 'Span only applies to grid cells.',
  'screen.refuse.spanFirstCell': 'A span cannot start on the first column of a row.',
  'screen.refuse.spanUnchanged': 'The span is already set to that value.',
  'screen.refuse.wrapNothing': 'There is nothing selected to wrap.',
  'screen.refuse.wrapEmpty': 'An empty cell cannot be wrapped.',
  'screen.refuse.unwrap': 'This container cannot be unwrapped.',
  'screen.refuse.noChange': 'The value is the same; nothing was changed.',
  'screen.refuse.noSuchProperty': 'That property does not apply to the selected element.',
  'screen.refuse.invalidValue': 'That value is not valid for this property.',
  'screen.refuse.formattingChoice': 'This element has imported formatting. Choose "Keep formatting" or "Remove formatting".',
  'screen.refuse.treeDepth': 'A tree item can only be one level deeper than the item above it.',
  'screen.refuse.invalidDestination': 'That destination is not valid for the selected element.',
  'screen.refuse.moveEmpty': 'An empty cell cannot be moved.',
  'screen.refuse.moveEdge': 'At the edge of this container. Use “Move to…” to move it further.',
  'screen.refuse.moveSpan': 'A spanned cell cannot be moved this way.',
  'screen.refuse.noRow': 'There is no row at that position.',
  'screen.refuse.lastRow': 'A grid must have at least one row.',
  'screen.refuse.noColumns': 'A single-column grid cannot have its column deleted.',
  'screen.refuse.noColumn': 'There is no column at that position.',
  'screen.refuse.lastColumn': 'A grid must have at least one column.',

  // ── Announcements (FR-009/AC7, VO-096) ──────────────────────────────────────────────────────
  'screen.announce.inserted': 'Inserted {type}',
  'screen.announce.deleted': 'Deleted {type}',
  'screen.announce.deletedWithComments': {
    one: 'Deleted {type} and {count} comment',
    other: 'Deleted {type} and {count} comments',
  },
  'screen.announce.moved': 'Moved {type}',
  'screen.announce.wrappedGrid': 'Wrapped in grid',
  'screen.announce.wrappedGroup': 'Wrapped in group box',
  'screen.announce.unwrapped': 'Unwrapped',
  'screen.announce.spanChanged': 'Span set to {span}',
  'screen.announce.optionsRemoved': {
    one: 'Removed {count} drop-down option',
    other: 'Removed {count} drop-down options',
  },
  'screen.announce.rowInserted': 'Row inserted',
  'screen.announce.rowDeleted': 'Row deleted',
  'screen.announce.columnInserted': 'Column inserted',
  'screen.announce.columnDeleted': 'Column deleted',

  // Property-change announcements for each PropertyName (screen.announce.changed.<prop>)
  'screen.announce.changed.text': 'Text changed',
  'screen.announce.changed.label': 'Label changed',
  'screen.announce.changed.value': 'Value changed',
  'screen.announce.changed.width': 'Width changed',
  'screen.announce.changed.checked': 'Checked state changed',
  'screen.announce.changed.selected': 'Selected state changed',
  'screen.announce.changed.options': 'Options changed',
  'screen.announce.changed.open': 'Open state changed',
  'screen.announce.changed.items': 'Items changed',
  'screen.announce.changed.tabs': 'Tabs changed',
  'screen.announce.changed.selectedTab': 'Selected tab changed',
  'screen.announce.changed.style': 'Container style changed',
  'screen.announce.changed.title': 'Title changed',
  'screen.announce.changed.kind': 'Separator kind changed',
  'screen.announce.changed.span': 'Span changed',

  // ── History names (undo/redo labels) ─────────────────────────────────────────────────────────
  'screen.history.insert': 'Insert',
  'screen.history.delete': 'Delete',
  'screen.history.move': 'Move',
  'screen.history.wrapGrid': 'Wrap',
  'screen.history.wrapGroup': 'Wrap in group box',
  'screen.history.unwrap': 'Unwrap',
  'screen.history.span': 'Set span',
  'screen.history.rowInserted': 'Insert row',
  'screen.history.rowDeleted': 'Delete row',
  'screen.history.columnInserted': 'Insert column',
  'screen.history.columnDeleted': 'Delete column',

  // Property history names (screen.history.property.<prop>)
  'screen.history.property.text': 'Edit text',
  'screen.history.property.label': 'Edit label',
  'screen.history.property.value': 'Edit value',
  'screen.history.property.width': 'Set width',
  'screen.history.property.checked': 'Toggle checked',
  'screen.history.property.selected': 'Toggle selected',
  'screen.history.property.options': 'Edit options',
  'screen.history.property.open': 'Toggle open',
  'screen.history.property.items': 'Edit items',
  'screen.history.property.tabs': 'Edit tabs',
  'screen.history.property.selectedTab': 'Set selected tab',
  'screen.history.property.style': 'Set container style',
  'screen.history.property.title': 'Edit title',
  'screen.history.property.kind': 'Set separator kind',
  'screen.history.property.span': 'Set span',

  // ── Element type names (for aria-labels and announcements) ───────────────────────────────────
  'screen.type.text': 'Text',
  'screen.type.button': 'Button',
  'screen.type.textField': 'Text field',
  'screen.type.checkbox': 'Checkbox',
  'screen.type.radioButton': 'Radio button',
  'screen.type.dropDown': 'Drop-down',
  'screen.type.tree': 'Tree',
  'screen.type.tabBar': 'Tab bar',
  'screen.type.menuBar': 'Menu bar',
  'screen.type.grid': 'Grid',
  'screen.type.scrollArea': 'Scrollable area',
  'screen.type.empty': 'Empty cell',
  'screen.type.locked': 'Locked part',
  'screen.type.separator': 'Separator',

  // ── Grid labels (VO-054, used in breadcrumb and outline) ─────────────────────────────────────
  'screen.label.Table': 'Table',
  'screen.label.Button bar': 'Button bar',
  'screen.label.Form': 'Form',
  'screen.label.Row': 'Row',
  'screen.label.Column': 'Column',
  'screen.label.Grid': 'Grid',
  'screen.label.Screen': 'Screen',
  'screen.label.rowN': 'Row {n}',

  // ── Aria-label description template (VO-096, FR-016/AC5) ─────────────────────────────────────
  // "{type} '{text}', row {row} column {column} of {container}"
  'screen.describe.withText': '{type} ‘{text}’, row {row} column {column} of {container}',
  'screen.describe.noText': '{type}, row {row} column {column} of {container}',
  'screen.describe.container': '{label}, row {row} column {column} of {container}',
  'screen.describe.rootContainer': '{label}',

  // ── Span limit text (VO-051, EC-03) ──────────────────────────────────────────────────────────
  'screen.span.limitedByName': 'Span limited by ‘{name}’ in column {column}',
  'screen.span.limitedByRowEnd': 'Span limited by end of row',
  'screen.span.limitedNoName': 'Span limited by element in column {column}',
  'screen.span.label': 'Span',
  'screen.span.max': 'Maximum: {max}',

  // ── Property field names ─────────────────────────────────────────────────────────────────────
  'screen.property.text': 'Text',
  'screen.property.label': 'Label',
  'screen.property.value': 'Value',
  'screen.property.width': 'Width',
  'screen.property.checked': 'Checked',
  'screen.property.selected': 'Selected',
  'screen.property.options': 'Options',
  'screen.property.open': 'Open',
  'screen.property.items': 'Items',
  'screen.property.tabs': 'Tabs',
  'screen.property.selectedTab': 'Selected tab',
  'screen.property.style': 'Style',
  'screen.property.title': 'Title',
  'screen.property.kind': 'Separator kind',
  'screen.property.span': 'Span',

  // ── Container style option labels ─────────────────────────────────────────────────────────────
  'screen.style.plain': 'None',
  'screen.style.border': 'Border',
  'screen.style.tableLines': 'Table lines',
  'screen.style.verticalLines': 'Vertical lines',
  'screen.style.horizontalLines': 'Horizontal lines',
  'screen.style.groupBox': 'Group box',

  // ── Separator kind labels ─────────────────────────────────────────────────────────────────────
  'screen.kind.single': 'Single',
  'screen.kind.double': 'Double',
  'screen.kind.dotted': 'Dotted',
  'screen.kind.wavy': 'Wavy',

  // ── Formatting choice (VO-059) ────────────────────────────────────────────────────────────────
  'screen.formatting.keep': 'Keep formatting',
  'screen.formatting.remove': 'Remove formatting',
  'screen.formatting.description': 'This element has imported text formatting.',

  // ── Canvas strings ────────────────────────────────────────────────────────────────────────────
  'screen.canvas.emptyPrompt': 'Choose a component from the palette to get started.',
  'screen.canvas.showGuides': 'Show layout guides',
  'screen.canvas.roleDescription': 'Screen canvas',

  // Right-click menu on an element: links it to another screen through a step in the screen flow.
  'canvas.contextMenu.label': 'Element actions',
  'canvas.contextMenu.linkToScreen': 'Link to screen…',
  'canvas.contextMenu.pickScreen': 'Link to which screen?',
  'screenLink.hint': 'Choose the screen that "{label}" opens. A step for it is added to the screen flow.',
  'canvas.contextMenu.noScreens': 'There are no screens to link to.',

} satisfies MessagePart;

export default screen;
