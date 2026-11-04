// Shared English interface strings (contracts/ui.md, R-11, FR-016/AC8): workspace regions, the
// toolbar, autosave, block and render statuses, core syntax diagnostics and generic notices.
// Each story phase owns its own part in this folder; en.ts merges them and refuses duplicate keys.
import type { MessagePart } from '../en.ts';

const shared = {
  // Workspace regions, in region-focus order (ui.md §3).
  'region.projectPanel': 'Project panel',
  'region.palette': 'Palette',
  'region.canvas': 'Canvas',
  'region.outline': 'Outline',
  'region.properties': 'Properties',
  'region.source': 'Source',
  'region.preview': 'Preview',

  // Always-visible toolbar (ui.md §3, FR-016/AC1, FR-007/AC9).
  'toolbar.label': 'Toolbar',
  'toolbar.import': 'Import .puml file',
  'toolbar.download': 'Download',
  'toolbar.undo': 'Undo',
  'toolbar.redo': 'Redo',
  'toolbar.undoAction': 'Undo {action}',
  'toolbar.redoAction': 'Redo {action}',
  'toolbar.nothingToUndo': 'Nothing to undo',
  'toolbar.nothingToRedo': 'Nothing to redo',

  // Autosave status (ui.md §4).
  'autosave.saved': 'All changes saved',
  'autosave.saving': 'Saving…',

  // Block statuses, exactly the core BlockStatus values (ui.md §4, FR-010/AC1).
  'blockStatus.editable': 'Editable',
  'blockStatus.hasLockedParts': 'Has locked parts',
  'blockStatus.sourceOnly': 'Source only',
  'blockStatus.error': 'Error',
  'blockStatus.olderFormat': 'Older format',
  'blockStatus.cannotBeRendered': 'Cannot be rendered',

  // Render status and other status strings (ui.md §4).
  'renderStatus.notYetChecked': 'Not yet checked',
  'status.neverDownloaded': 'never downloaded',
  'names.untitledScreen': 'Untitled screen {n}',

  // Core syntax diagnostics (category 3). Each is shown with the block and line, labelled as a
  // source problem, never as a rendering problem (FR-008, ui.md §9).
  'diagnostic.sourceProblem': 'Source problem',
  'diagnostic.atLine': '{block}, line {line}: {problem}',
  'diagnostic.syntax.invalidLine': 'This line is not valid here.',
  'diagnostic.syntax.laneNotFirst': 'The first lane must come before start and every step. Move this line to the top of the flow.',
  'diagnostic.syntax.missingEndLine': 'The block has no end line.',
  'diagnostic.syntax.noRootGrid': 'The screen has no grid. A screen starts with "{".',
  'diagnostic.syntax.unclosedContainer': 'A container opened here is not closed with "}".',
  'diagnostic.syntax.unclosedContainers': {
    one: '{count} container is not closed.',
    other: '{count} containers are not closed.',
  },
  'diagnostic.syntax.unexpectedClose': 'There is a "}" with no container to close.',
  'diagnostic.syntax.spanInFirstColumn': 'A column span ("*") cannot be in the first column of a row.',
  'diagnostic.syntax.unclosedQuote': 'A text field is missing its closing quote.',
  'diagnostic.syntax.unclosedStep': 'A step is not closed with ";".',
  'diagnostic.syntax.unclosedNote': 'A note is not closed with "end note".',
  'diagnostic.syntax.unclosedComment': 'A comment starting with "/\'" is not closed with "\'/".',
  'diagnostic.syntax.unmatchedKeyword': '"{keyword}" has nothing to close.',
  'diagnostic.syntax.unclosedKeyword': '"{keyword}" is not closed.',
  'diagnostic.syntax.misplacedKeyword': '"{keyword}" cannot be used here.',
  'diagnostic.syntax.missingCondition': '"{keyword}" needs a condition in brackets.',

  // Generic notices (ui.md §1, §11).
  'notice.region': 'Notifications',
  'notice.undo': 'Undo',
  'notice.dismiss': 'Dismiss',
  'notice.unknownProject': 'That project could not be found. It may have been deleted.',
  'app.unsupportedBrowser':
    'This browser is not supported. Use one of the latest two versions of Google Chrome or Microsoft Edge on a desktop computer.',
} as const satisfies MessagePart;

export default shared;
