// Screen management strings (T126; FR-011, FR-015/AC4, contracts/ui.md §5). The command labels are the plan
// labels "Add screen", "Rename", "Duplicate", "Move up", "Move down" and "Delete"; each per-block command's
// accessible name adds the block it acts on. History names complete "Undo …" and "Redo …".
import type { MessagePart } from '../en.ts';

const screens = {
  // Commands.
  'screens.add': 'Add screen',
  'screens.rename': 'Rename',
  'screens.duplicate': 'Duplicate',
  'screens.moveUp': 'Move up',
  'screens.moveDown': 'Move down',
  'screens.delete': 'Delete',
  'screens.renameBlock': 'Rename {name}',
  'screens.duplicateBlock': 'Duplicate {name}',
  'screens.moveUpBlock': 'Move up {name}',
  'screens.moveDownBlock': 'Move down {name}',
  'screens.deleteBlock': 'Delete {name}',

  // The name field (FR-011/AC7).
  'screens.nameLabel': 'Name',
  'screens.rename.preview': 'Will be saved as {name}',
  'screens.rename.previewEmpty': 'Nothing usable: a name needs at least one letter',
  'screens.rename.empty': 'A name needs at least one letter. The name was not changed.',
  'screens.rename.duplicate': 'The name is already used by {name}. Choose another name.',

  // Refusals.
  'screens.delete.last': 'A project needs at least one block, so its only block cannot be deleted.',
  'screens.move.first': '{name} is already first.',
  'screens.move.last': '{name} is already last.',

  // Link warning (FR-011/AC5, AC8).
  'screens.warning.renameTitle': 'Rename {name}?',
  'screens.warning.renameBody': {
    one: '{count} flow step links to {name}. Proceeding changes it to link to {newName}.',
    other: '{count} flow steps link to {name}. Proceeding changes them to link to {newName}.',
  },
  'screens.warning.deleteTitle': 'Delete {name}?',
  'screens.warning.deleteBody': {
    one: '{count} flow step links to {name}. It will be kept with a broken link.',
    other: '{count} flow steps link to {name}. They will be kept with broken links.',
  },
  'screens.warning.steps': 'Linked steps',
  'screens.warning.untitledStep': '(step with no text)',
  'screens.warning.proceed': 'Proceed',
  'screens.warning.cancel': 'Cancel',

  // Announcements and the delete notice (FR-011/AC9).
  'screens.added': 'Added screen {name}',
  'screens.renamed': 'Renamed {old} to {name}',
  'screens.renamedWithLinks': {
    one: 'Renamed {old} to {name} and updated {count} step',
    other: 'Renamed {old} to {name} and updated {count} steps',
  },
  'screens.duplicated': 'Duplicated {old} as {name}',
  'screens.movedUp': 'Moved {name} up',
  'screens.movedDown': 'Moved {name} down',
  'screens.deleted': 'Deleted {name}',
  'screens.deletedBrokenLinks': {
    one: 'Deleted {name}. {count} flow step now has a broken link.',
    other: 'Deleted {name}. {count} flow steps now have broken links.',
  },

  // History names (shown as "Undo …").
  'screens.history.add': 'adding screen {name}',
  'screens.history.rename': 'renaming {old} to {name}',
  'screens.history.duplicate': 'duplicating {old}',
  'screens.history.move': 'moving {name}',
  'screens.history.delete': 'deleting {name}',
} as const satisfies MessagePart;

export default screens;
