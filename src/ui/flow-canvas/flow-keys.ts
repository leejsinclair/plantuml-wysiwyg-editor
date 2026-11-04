// Key handling for the flow canvas (section 3.2 "Keys", FR-009/AC13, VO-099).
// Up/Down navigate along the element's own path; Enter enters a branch/body slot (or commits text).
// Left/Right navigate between branches of a decision (never moves an element sideways).
// moveUp/moveDown (Alt+Shift+Arrow) move the selected element along its path.
// Delete removes the selected element, refused if it is the initial start or final stop.
// Cancel selects the parent.

import type { Path } from '../../core/types.ts';
import { keyCommand, type KeyCommand } from '../keys.ts';

export interface FlowKeyEvent {
  readonly command: KeyCommand;
  readonly path: Path | null;
}

/** Commands that apply directly to the flow canvas (not to property fields). */
export type FlowCommand =
  | { kind: 'navigate'; direction: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'enter' }
  | { kind: 'cancel' }
  | { kind: 'move'; direction: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'delete' }
  | { kind: 'none' };

export function flowCommand(event: KeyboardEvent): FlowCommand {
  const c = keyCommand(event, 'windows');
  switch (c) {
    case 'up': return { kind: 'navigate', direction: 'up' };
    case 'down': return { kind: 'navigate', direction: 'down' };
    case 'left': return { kind: 'navigate', direction: 'left' };
    case 'right': return { kind: 'navigate', direction: 'right' };
    case 'enter': return { kind: 'enter' };
    case 'cancel': return { kind: 'cancel' };
    case 'moveUp': return { kind: 'move', direction: 'up' };
    case 'moveDown': return { kind: 'move', direction: 'down' };
    case 'moveLeft': return { kind: 'move', direction: 'left' };
    case 'moveRight': return { kind: 'move', direction: 'right' };
    default:
      if (event.key === 'Delete' || event.key === 'Backspace') return { kind: 'delete' };
      return { kind: 'none' };
  }
}
