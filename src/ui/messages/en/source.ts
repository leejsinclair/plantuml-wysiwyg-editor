// Source editing strings (T118; spec section 4.2, FR-004/AC10, FR-011/AC14, AC15, FR-016/AC7, contracts/ui.md §9).
import type { MessagePart } from '../en.ts';

const source = {
  // History names (FR-007/AC9).
  'history.redivide': 're-dividing the file after editing {block}',
  'history.sourceRename': 'renaming {block} in the source',

  // Re-division report (FR-004/AC10).
  'source.redivided': {
    one: 'Re-divided the file after editing {block}: its source now forms 1 block.',
    other: 'Re-divided the file after editing {block}: its source now forms {count} blocks.',
  },
  'source.redividedNone':
    'Re-divided the file after editing {block}: its source no longer forms a block, so the text is kept between blocks.',

  // Re-division warning (FR-004/AC10).
  'source.redivideWarning.title': 'Remove a linked screen?',
  'source.redivideWarning.message': {
    one: 'Your changes to the source of {block} remove the screen {screens}, which 1 step links to. Re-dividing the file breaks that link.',
    other:
      'Your changes to the source of {block} remove the screen {screens}, which {count} steps link to. Re-dividing the file breaks those links.',
  },
  'source.redivideWarning.proceed': 'Re-divide',
  'source.redivideWarning.cancel': 'Cancel',
  'source.redivideCancelled':
    'Not re-divided. Your text is still in the source view; it is saved once it forms one block again or you re-divide.',

  // The last block is never removed (FR-011/AC15, EC-01).
  'source.lastBlockRefused':
    'The source of {block} no longer forms a block, and a project must keep at least one block. Your text is still in the source view; fix it to continue.',

  // Held text that could not be applied (the block was left while its text did not form one block).
  'source.notApplied': 'Your source changes to {block} were not saved because they did not form one block.',
  'source.applyAnyway': 'Re-divide anyway',

  // Source-view renames (FR-011/AC14, OD-4).
  'source.rename.updated': {
    one: 'Updated 1 step',
    other: 'Updated {count} steps',
  },
  'source.rename.broken.notAllowed': {
    one: '"{name}" is not an allowed screen name, so the screen is flagged and 1 step linking to "{previous}" now has a broken link.',
    other:
      '"{name}" is not an allowed screen name, so the screen is flagged and {count} steps linking to "{previous}" now have broken links.',
  },
  'source.rename.broken.notNormalised': {
    one: '"{name}" is not written in the standard Unicode form, so the screen is flagged and 1 step linking to "{previous}" now has a broken link.',
    other:
      '"{name}" is not written in the standard Unicode form, so the screen is flagged and {count} steps linking to "{previous}" now have broken links.',
  },
  'source.rename.broken.duplicate': {
    one: '"{name}" is already used by another block, so the screen is flagged and 1 step linking to "{previous}" now has a broken link.',
    other:
      '"{name}" is already used by another block, so the screen is flagged and {count} steps linking to "{previous}" now have broken links.',
  },
  'source.rename.broken.unnamed': {
    one: 'The screen no longer has a name, so 1 step linking to "{previous}" now has a broken link.',
    other: 'The screen no longer has a name, so {count} steps linking to "{previous}" now have broken links.',
  },

  // Whole-file view (FR-016/AC7).
  'source.wholeFile.toggle': 'Whole file',
  'source.wholeFile.title': 'Whole file (read-only)',
  'source.wholeFile.editor': 'Whole project file, read-only',
  'source.wholeFile.copy': 'Copy whole file',
  'source.wholeFile.copied': 'Copied the whole file to the clipboard.',
  'source.wholeFile.copyFailed': 'Could not copy to the clipboard. Select the text and copy it instead.',
  'source.wholeFile.close': 'Close',
} as const satisfies MessagePart;

export default source;
