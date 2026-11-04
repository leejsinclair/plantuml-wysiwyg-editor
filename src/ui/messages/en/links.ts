// Link and navigation strings (T161; FR-013/AC1, AC3, AC4, AC6, FR-015/AC6, contracts/ui.md §8).
// "Open screen", "Back to flow", "Create screen", "Link to another screen", "Remove link",
// the broken-link message and the case-only suggestion.
import type { MessagePart } from '../en.ts';

const links = {
  // Commands (FR-013/AC1, AC3, FR-009/AC8).
  'links.openScreen': 'Open screen',
  'links.backToFlow': 'Back to flow',
  'links.createScreen': 'Create screen',
  'links.linkToScreen': 'Link to another screen',
  'links.removeLink': 'Remove link',

  // Link control labels (properties panel, FR-013/AC1).
  'links.linkLabel': 'Linked screen',
  'links.noLink': 'No link',
  'links.linked': 'Linked to {name}',

  // Broken-link messages (FR-013/AC4, FR-015/AC6).
  'links.broken': 'No screen named {name}',
  'links.brokenCaseOnly': 'No screen named {name}. Did you mean {suggestion}?',
  'links.fixCase': 'Use {suggestion}',
  'links.ambiguous': 'Multiple screens match {name}',

  // Announcements.
  'links.linked.announce': 'Linked step to {name}',
  'links.changed.announce': 'Changed link to {name}',
  'links.removed.announce': 'Removed link',
  'links.created.announce': 'Created screen {name} and linked step',

  // History names (shown as "Undo …").
  'links.history.set': 'linking step to {name}',
  'links.history.remove': 'removing link',
  'links.history.createAndLink': 'creating screen {name} and linking step',
} as const satisfies MessagePart;

export default links;
