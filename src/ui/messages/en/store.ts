// Announcements made by the store (T046; FR-007/AC9, AC11, FR-016).
import type { MessagePart } from '../en.ts';

const store = {
  'history.undone': 'Undone: {action}',
  'history.redone': 'Redone: {action}',
  'history.sourceTyping': 'typing in the source',
  'history.propertyTyping': 'typing in a property',
} as const satisfies MessagePart;

export default store;
