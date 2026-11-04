// Plain-language reasons for block statuses and locked parts (T042; FR-010/AC1–AC3, FR-008/AC8, section 4.1).
// The keys come from the parsers (src/core/salt/model.ts, src/core/activity/model.ts and parser.ts) and from
// src/core/blocks/classify.ts. Syntax errors are in shared.ts.
import type { MessagePart } from '../en.ts';

const reasons = {
  // Status reasons added by classify.
  'reason.lockedParts': {
    one: 'One part uses PlantUML features the visual editor does not support. It is kept exactly and can be changed in the source view.',
    other: '{count} parts use PlantUML features the visual editor does not support. They are kept exactly and can be changed in the source view.',
  },
  'reason.dependsOnExternal':
    'This block uses !include or another file or web address. The editor never loads those, so it cannot draw this block. It is kept exactly and included in downloads.',
  'reason.olderFormat':
    'This screen is written in an older Salt format that current PlantUML does not draw. Convert it to the current format to edit it visually.',
  'reason.otherContent': 'This diagram is not a screen or the screen flow. It is kept exactly and can be edited in the source view.',
  'reason.extraActivity':
    'A project has one screen flow, and this activity diagram is not it. It is kept exactly and can be edited in the source view.',

  // Screens: locked parts.
  'locked.treeTable': 'Tree tables are not supported by the visual editor.',
  'locked.openMenu': 'Open menus below a menu bar are not supported by the visual editor.',
  'locked.scrollVariant': 'This kind of scrollable area is not supported by the visual editor.',
  'locked.unknownModifier': 'This container uses a style the visual editor does not know.',
  'locked.treeShape': 'This tree has a shape the visual editor cannot show.',
  'locked.tabBarShape': 'This tab bar has more than tab names, which the visual editor cannot show.',
  'locked.menuBarShape': 'This menu bar has more than item names, which the visual editor cannot show.',
  'locked.mixedCell': 'This cell holds more than one item, which the visual editor cannot show.',
  'locked.separatorInRow': 'A separator shares this row with other items, which the visual editor cannot show.',
  'locked.groupBoxTitleRow': 'The group box title shares its line with other items, which the visual editor cannot show.',

  // Screens: source-only.
  'sourceOnly.preprocessor':
    'This screen uses preprocessor commands (lines starting with !), so it can only be edited in the source view.',
  'sourceOnly.multipleStyles':
    'A container in this screen has more than one style, which PlantUML does not draw reliably. It can only be edited in the source view.',
  'sourceOnly.rootNotGrid': 'This screen does not start with a grid, so it can only be edited in the source view.',
  'ignored.severalRootGrids':
    'PlantUML draws only the first grid of a screen. The content starting with "{content}" will not appear in the image. Edit it in the source view.',
  'ignored.textAfterRoot':
    'PlantUML ignores anything after the screen\'s grid. "{content}" will not appear in the image. Edit it in the source view.',

  // Screen flow: locked parts.
  'locked.fork': 'Parallel steps (fork) are not supported by the visual editor.',
  'locked.split': 'Split branches are not supported by the visual editor.',
  'locked.switch': 'Switch statements are not supported by the visual editor.',
  'locked.partition': 'Partitions and groups are not supported by the visual editor.',
  'locked.detach': 'Detach is not supported by the visual editor.',
  'locked.kill': 'Kill is not supported by the visual editor.',
  'locked.embeddedSalt': 'A wireframe drawn inside a step is not supported by the visual editor.',
  'locked.arrowLabel': 'Labels on arrows are not supported by the visual editor.',
  'locked.arrow': 'Styled arrows are not supported by the visual editor.',
  'locked.stepShape': 'This step has a shape the visual editor does not support.',
  'locked.note': 'This kind of note is not supported by the visual editor.',
  'locked.decisionForm': 'This form of decision is not supported by the visual editor.',
  'locked.loopForm': 'This form of loop is not supported by the visual editor.',
  'locked.statement': 'This statement is not supported by the visual editor.',

  // Screen flow: source-only.
  'diagnostic.unsupported.legacyActivity':
    'This flow uses the older activity syntax, so it can only be edited in the source view and cannot be the screen flow.',
  'diagnostic.unsupported.gotoLabel':
    'This flow uses goto or label, so it can only be edited in the source view and cannot be the screen flow.',
  'diagnostic.unsupported.preprocessor':
    'This flow uses preprocessor commands (lines starting with !), so it can only be edited in the source view.',
} as const satisfies MessagePart;

export default reasons;
