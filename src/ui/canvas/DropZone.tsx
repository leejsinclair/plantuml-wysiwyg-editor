// DropZone: an invisible drop target registered under a move destination's key, so a drop resolves to the same
// destinations "Move to…" offers. Layout is always present (dnd-kit measures rects); only its look changes.

import { useDropTarget } from '../workspace/dnd.tsx';
import { destinationKey, type Destination } from '../../core/salt/destinations.ts';

export type ZoneSide = 'start' | 'end' | 'whole';

export function DropZone({ destination, side, axis = 'row' }: { destination: Destination; side: ZoneSide; axis?: 'row' | 'column' }) {
  const key = destinationKey(destination);
  const { setNodeRef, state } = useDropTarget(key);
  return <span ref={setNodeRef} aria-hidden="true" className={`salt-dropzone salt-dropzone--${side}${axis === 'column' ? ' salt-dropzone--column' : ''}`} data-drop-state={state} />;
}
