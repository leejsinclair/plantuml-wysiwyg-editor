// Project panel strings (T051; FR-015/AC1–AC3, FR-011/AC11, FR-017, contracts/ui.md §5). Block statuses and
// "Not yet checked" are shared (shared.ts); the reasons come from reasons.ts. Commands such as "Add screen" and
// "Add screen flow" belong to the stories that register them in the `projectPanel` slot.
import type { MessagePart } from '../en.ts';

const projectPanel = {
  'projectPanel.label': 'Project parts',
  'projectPanel.screens': 'Screens',
  'projectPanel.flow': 'Screen flow',
  'projectPanel.other': 'Other content',
  'projectPanel.noScreens': 'This project has no screens.',
  'projectPanel.otherUnnamed': '@{opener} (block {n})',
  'projectPanel.open': 'Open',
  'projectPanel.status': 'Status: {status}',
  'projectPanel.render.rendered': 'Rendered',
  'projectPanel.render.failed': 'Rendering failed',
  'projectPanel.problemAtLine': 'Line {line}: {problem}',
  'projectPanel.incomingLinks': {
    one: '{count} flow step links here',
    other: '{count} flow steps link here',
  },
  'projectPanel.noIncomingLinks': 'No flow steps link here',
  'projectPanel.nameFlag.notAllowed': 'Name not allowed: rename this screen',
  'projectPanel.nameFlag.notNfc': 'Name is not in a standard form: rename this screen',
  'projectPanel.nameFlag.duplicate': 'Name used more than once: rename this screen',
} as const satisfies MessagePart;

export default projectPanel;
