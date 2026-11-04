// Locked placeholder strings (T037; spec section 4.1, FR-010/AC2). The reason shown on a placeholder is the
// locked part's own message key, which the block messages define; this part holds only the placeholder's
// own wording.
import type { MessagePart } from '../en.ts';

const lockedPlaceholder = {
  'lockedPlaceholder.title': 'Locked part:',
  'lockedPlaceholder.roleDescription': 'locked part',
  'lockedPlaceholder.editInSource': 'Kept exactly as written. Change it in the source view.',
  'lockedPlaceholder.moreLines': {
    one: '… {count} more line',
    other: '… {count} more lines',
  },
} as const satisfies MessagePart;

export default lockedPlaceholder;
