// Structural command bar, "Move to…" dialog and breadcrumb strings (T053; FR-009/AC2, AC14, contracts/ui.md §7).
// Command labels themselves come from each editor's commands; this part holds only the shells' own wording.
import type { MessagePart } from '../en.ts';

const commandBar = {
  'commandBar.label': 'Commands for the selection',
  'moveTo.title': 'Move to…',
  'moveTo.destinations': 'Valid destinations',
  'moveTo.move': 'Move here',
  'moveTo.cancel': 'Cancel',
  'moveTo.none': 'There is no valid destination for this element.',
  'breadcrumb.label': 'Selection path',
  'breadcrumb.separator': ' › ',
} as const satisfies MessagePart;

export default commandBar;
