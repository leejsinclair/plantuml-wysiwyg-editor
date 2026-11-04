// Block status actions and banners (T109; FR-004/AC4, FR-010/AC3, AC4, AC7, AC8, contracts/ui.md §5 and §9).
// The plain-language status reasons themselves are in reasons.ts (T042); syntax errors are in shared.ts.
import type { MessagePart } from '../en.ts';

const blocks = {
  // Commands (exact strings from contracts/ui.md).
  'blocks.fixInSource': 'Fix in source',
  'blocks.revert': 'Revert to last working version',
  'blocks.convert': 'Convert to current format',
  'blocks.convertAll': 'Convert all',

  // Undo and redo names.
  'blocks.history.revert': 'Revert to last working version',
  'blocks.history.convert': 'Convert to current format',
  'blocks.history.convertAll': 'Convert all',

  // Announcements.
  'blocks.announce.reverted': 'Reverted to the last working version',
  'blocks.announce.converted': 'Converted {block} to the current format',
  'blocks.announce.convertedAll': {
    one: 'Converted 1 screen to the current format',
    other: 'Converted {count} screens to the current format',
  },
  'blocks.announce.nothingToConvert': 'Nothing is left in the older format.',
  'blocks.revert.none': 'This block has no last working version to revert to.',

  // The "Convert all" notice, one per import.
  'blocks.convertAll.notice': {
    one: 'This file has 1 screen written in an older Salt format, listed as other content. Convert it to the current format to edit it visually. Nothing changes until you choose to convert.',
    other: 'This file has {count} screens written in an older Salt format, listed as other content. Convert them to the current format to edit them visually. Nothing changes until you choose to convert.',
  },

  // The status banner above the canvas.
  'blocks.banner.label': 'Block status',
  'blocks.banner.status': '{block}: {status}',
  'blocks.banner.sourceProblem': 'Source problem',
  'blocks.banner.problem': 'Source problem in {block}, line {line}: {problem}',
  'blocks.banner.lockedUntilFixed': 'Only this block is locked until its source is fixed. Other screens and the flow stay editable.',
  'blocks.banner.neverValid': 'This block has never been valid, so there is no earlier version to go back to.',
  'blocks.banner.lastWorking': 'Last working version (read-only)',
  'blocks.banner.cannotBeRendered': 'PlantUML could not draw this block. The renderer\'s message is shown in the preview.',
  'blocks.banner.notAnError': 'The editor does not check this block itself, so this is not reported as an error.',
} as const satisfies MessagePart;

export default blocks;
