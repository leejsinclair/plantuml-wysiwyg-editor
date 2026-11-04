// Workspace layout strings (T049; FR-015/AC4, FR-016, contracts/ui.md §3). Region names live in shared.ts.
import type { MessagePart } from '../en.ts';

const workspace = {
  'workspace.sourceOnly': 'This content can only be edited in the source view.',
  'workspace.notVisual': 'Nothing to show here: the open content can only be edited in the source view.',
  'workspace.noBlock': 'This project has no screens, screen flow or other content yet.',
  'workspace.readOnlyDuringSourceEdit': 'Read-only while you edit the source. Leave the source view to edit here again.',
} as const satisfies MessagePart;

export default workspace;
