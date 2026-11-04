// The properties shell (T052; FR-003, FR-007/AC13, contracts/ui.md §8).
import type { MessagePart } from '../en.ts';

const properties = {
  'properties.noBlock': 'Open a screen or the screen flow to see its properties.',
  'properties.of': 'Properties of {subject}',
  'properties.otherContent': 'Other content',
  'properties.sourceOnly': 'This block has no properties to edit here. Change it in the source view.',
  'properties.readOnlySourceEdit': 'Leave the source view to change these properties.',
  'properties.readOnly': 'These properties cannot be changed in this tab.',
} as const satisfies MessagePart;

export default properties;
