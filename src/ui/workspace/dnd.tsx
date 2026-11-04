// Drag-and-drop base for the screen canvas, the outlines and the flow canvas (R-7, FR-008/AC3, EC-18).
//
// - A drag needs movement (mouse and pen) or a press held still (touch) before it starts, so a tap or a click
//   never moves anything (FR-009/AC7, EC-18). Esc cancels a drag in progress.
// - When a drag starts, the dragged item's valid destinations come from the supplied function, the same
//   `blockEditors[kind].destinations` list that "Move to…" offers, so drag and keyboard can never disagree.
//   Only those destinations are offered; any other drop target reports `blocked` while dragged over, and
//   dropping there does nothing (an operation is never accepted and then reversed).
// - dnd-kit's own English announcements, instructions and roles are switched off: the editor's announcer and
//   the message catalogue say what happened (FR-016/AC8).

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type PointerSensorOptions,
  type SensorDescriptor,
  type SensorOptions,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  createContext,
  useContext,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/** Mouse and pen: the pointer must move this many pixels before a drag starts. */
export const POINTER_ACTIVATION = { distance: 8 } as const;
/** Touch: the finger must stay within `tolerance` pixels for `delay` ms before a drag starts. */
export const TOUCH_ACTIVATION = { delay: 250, tolerance: 5 } as const;

/**
 * Pointer events for mouse and pen only. Touch input is left to `TouchSensor`, whose press delay lets a
 * touch scroll or tap without starting a drag.
 */
export class MouseAndPenSensor extends PointerSensor {
  static override activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (event: ReactPointerEvent, options: PointerSensorOptions): boolean => {
        if (event.nativeEvent.pointerType === 'touch') return false;
        const base = PointerSensor.activators[0];
        return base ? base.handler(event, options) : false;
      },
    },
  ];
}

/** The editor's sensors: movement for mouse and pen, a press delay for touch. No keyboard dragging. */
export function useEditorSensors(): SensorDescriptor<SensorOptions>[] {
  return useSensors(
    useSensor(MouseAndPenSensor, { activationConstraint: POINTER_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
  );
}

const SILENT: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

/**
 * Collisions with offered targets come first, so a nested offered target wins over an outer one that is
 * not offered. Order within each group is kept.
 */
export function preferOffered(detect: CollisionDetection, offered: ReadonlySet<string>): CollisionDetection {
  return (args) => {
    const hits = detect(args);
    return [...hits.filter((h) => offered.has(String(h.id))), ...hits.filter((h) => !offered.has(String(h.id)))];
  };
}

/** The pointer's own target first; if the pointer is over no target, any target the dragged item overlaps. */
export const pointerFirst: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

/** What a drop on `overKey` does: the destination to move to, `blocked`, or nothing when not over a target. */
export function dropOutcome<D>(offered: ReadonlyMap<string, D>, overKey: string | null): { move: D } | 'blocked' | null {
  if (overKey === null) return null;
  return offered.has(overKey) ? { move: offered.get(overKey) as D } : 'blocked';
}

// ------------------------------------------------------------------------------------------- session

export interface DragSession {
  /** The item being dragged, or `null`. */
  readonly activeId: string | null;
  /** Keys of the destinations offered for the current drag; empty when nothing is being dragged. */
  readonly offered: ReadonlySet<string>;
  /** The drop target under the drag, offered or not. */
  readonly overKey: string | null;
}

const IDLE: DragSession = { activeId: null, offered: new Set(), overKey: null };
const SessionContext = createContext<DragSession>(IDLE);

/** The current drag, for shells that dim the canvas or show only offered gaps while dragging. */
export function useDragSession(): DragSession {
  return useContext(SessionContext);
}

export interface EditorDndProps<D> {
  /** The valid destinations for moving `dragId`: the list "Move to…" offers (`BlockEditor.destinations`). */
  destinationsFor(dragId: string): readonly D[];
  /** A destination's key; the drop target for that destination registers under the same key. */
  destinationKey(destination: D): string;
  /** Called once when the item is dropped on an offered destination. */
  onMove(dragId: string, destination: D): void;
  /** Called when the item is dropped on a target that was not offered; nothing is moved. */
  onBlocked?(dragId: string, targetKey: string): void;
  /** No drag can start, for example while the block's source view is being edited. */
  disabled?: boolean;
  children: ReactNode;
}

/** The drag-and-drop context for one editing surface (a canvas or an outline). */
export function EditorDnd<D>({ destinationsFor, destinationKey, onMove, onBlocked, disabled: _disabled = false, children }: EditorDndProps<D>) {
  const sensors = useEditorSensors();
  const [session, setSession] = useState<DragSession>(IDLE);
  const [destinations, setDestinations] = useState<ReadonlyMap<string, D>>(() => new Map());

  const reset = () => {
    setDestinations(new Map());
    setSession(IDLE);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    const offered = new Map(destinationsFor(id).map((d) => [destinationKey(d), d] as const));
    setDestinations(offered);
    setSession({ activeId: id, offered: new Set(offered.keys()), overKey: null });
  };

  const onDragOver = ({ over }: DragOverEvent) => {
    const overKey = over ? String(over.id) : null;
    setSession((s) => (s.overKey === overKey ? s : { ...s, overKey }));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const outcome = dropOutcome(destinations, over ? String(over.id) : null);
    reset();
    if (outcome === 'blocked') onBlocked?.(id, String(over?.id));
    else if (outcome) onMove(id, outcome.move);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={preferOffered(pointerFirst, session.offered)}
      accessibility={{ announcements: SILENT, screenReaderInstructions: { draggable: '' }, restoreFocus: true }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </DndContext>
  );
}

// ------------------------------------------------------------------------------------- sources and targets

/**
 * Makes an element draggable. Only the ref and pointer listeners are returned: the element keeps its own
 * role, name and focus behaviour, so dnd-kit adds no roles or English descriptions.
 */
export function useDragSource(id: string, disabled = false) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, disabled });
  return { setNodeRef, listeners, isDragging };
}

/**
 * - `idle`: nothing is being dragged.
 * - `hidden`: a drag is in progress and this target is not offered.
 * - `offered`: a valid destination for the current drag.
 * - `over`: an offered destination under the drag.
 * - `blocked`: a target that is not offered, under the drag: show that dropping here is not allowed.
 */
export type DropTargetState = 'idle' | 'hidden' | 'offered' | 'over' | 'blocked';

export function dropTargetState(session: DragSession, key: string): DropTargetState {
  if (session.activeId === null) return 'idle';
  const offered = session.offered.has(key);
  if (session.overKey === key) return offered ? 'over' : 'blocked';
  return offered ? 'offered' : 'hidden';
}

/** Registers a drop target under a destination key and reports its state for the current drag. */
export function useDropTarget(key: string) {
  const { setNodeRef } = useDroppable({ id: key as UniqueIdentifier });
  const session = useDragSession();
  return { setNodeRef, state: dropTargetState(session, key) };
}
