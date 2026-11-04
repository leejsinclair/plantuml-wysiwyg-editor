import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Collision, CollisionDetection } from '@dnd-kit/core';
import {
  EditorDnd,
  MouseAndPenSensor,
  POINTER_ACTIVATION,
  TOUCH_ACTIVATION,
  dropOutcome,
  dropTargetState,
  preferOffered,
  useDragSession,
  useDragSource,
  useDropTarget,
  type DragSession,
} from '../../../src/ui/workspace/dnd.tsx';

// jsdom lays nothing out; each element's box comes from its `data-rect` ("x y width height").
let rectSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const [x = 0, y = 0, w = 0, h = 0] = (this.getAttribute('data-rect') ?? '0 0 0 0').split(' ').map(Number);
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => rectSpy.mockRestore());

interface Dest {
  key: string;
}

function Item({ id }: { id: string }) {
  const { setNodeRef, listeners, isDragging } = useDragSource(id);
  return (
    <button ref={setNodeRef} {...listeners} data-rect="0 0 40 20" data-dragging={isDragging}>
      {id}
    </button>
  );
}

function Target({ id, rect }: { id: string; rect: string }) {
  const { setNodeRef, state } = useDropTarget(id);
  return (
    <div ref={setNodeRef} data-testid={id} data-rect={rect} data-state={state}>
      {id}
    </div>
  );
}

function SessionProbe() {
  const s = useDragSession();
  return <output data-testid="session">{s.activeId ?? 'none'}</output>;
}

function setup(offered: string[] = ['gap-1']) {
  const onMove = vi.fn();
  const onBlocked = vi.fn();
  const destinationsFor = vi.fn((_id: string): Dest[] => offered.map((key) => ({ key })));
  render(
    <EditorDnd destinationsFor={destinationsFor} destinationKey={(d: Dest) => d.key} onMove={onMove} onBlocked={onBlocked}>
      <Item id="item-a" />
      <Target id="gap-1" rect="0 100 200 20" />
      <Target id="gap-2" rect="0 200 200 20" />
      <SessionProbe />
    </EditorDnd>,
  );
  return { onMove, onBlocked, destinationsFor };
}

const mouse = (x: number, y: number) => ({ clientX: x, clientY: y, button: 0, isPrimary: true, pointerType: 'mouse', pointerId: 1 });

function press() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'item-a' }), mouse(10, 10));
}
function moveTo(x: number, y: number) {
  act(() => {
    fireEvent.pointerMove(document, mouse(x, y));
  });
}
function release(x: number, y: number) {
  act(() => {
    fireEvent.pointerUp(document, mouse(x, y));
  });
}

describe('drag-and-drop base (R-7, FR-008/AC3, EC-18)', () => {
  it('needs movement for mouse and pen, and a held press for touch', () => {
    expect(POINTER_ACTIVATION.distance).toBeGreaterThan(0);
    expect(TOUCH_ACTIVATION.delay).toBeGreaterThan(0);
    expect(TOUCH_ACTIVATION.tolerance).toBeGreaterThan(0);
  });

  it('leaves touch pointers to the touch sensor', () => {
    const handler = MouseAndPenSensor.activators[0]!.handler;
    const onActivation = vi.fn();
    const event = (pointerType: string) => ({ nativeEvent: { pointerType, isPrimary: true, button: 0 } }) as never;
    expect(handler(event('touch'), { onActivation })).toBe(false);
    expect(handler(event('mouse'), { onActivation })).toBe(true);
    expect(handler(event('pen'), { onActivation })).toBe(true);
  });

  it('a click that does not move starts no drag and moves nothing', () => {
    const { onMove, destinationsFor } = setup();
    press();
    release(10, 10);
    expect(destinationsFor).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('offers only the supplied destinations while dragging', () => {
    const { destinationsFor } = setup(['gap-1']);
    press();
    moveTo(10, 30);
    expect(destinationsFor).toHaveBeenCalledWith('item-a');
    expect(screen.getByTestId('session')).toHaveTextContent('item-a');
    expect(screen.getByTestId('gap-1')).toHaveAttribute('data-state', 'offered');
    expect(screen.getByTestId('gap-2')).toHaveAttribute('data-state', 'hidden');
    release(10, 30);
    expect(screen.getByTestId('gap-1')).toHaveAttribute('data-state', 'idle');
    expect(screen.getByTestId('session')).toHaveTextContent('none');
  });

  it('moves once when dropped on an offered destination', () => {
    const { onMove, onBlocked } = setup(['gap-1']);
    press();
    moveTo(10, 30);
    moveTo(50, 110);
    expect(screen.getByTestId('gap-1')).toHaveAttribute('data-state', 'over');
    release(50, 110);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith('item-a', { key: 'gap-1' });
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('shows a target that is not offered as blocked and does nothing when dropped there', () => {
    const { onMove, onBlocked } = setup(['gap-1']);
    press();
    moveTo(10, 30);
    moveTo(50, 210);
    expect(screen.getByTestId('gap-2')).toHaveAttribute('data-state', 'blocked');
    release(50, 210);
    expect(onMove).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith('item-a', 'gap-2');
  });

  it('Esc cancels a drag without moving', () => {
    const { onMove } = setup(['gap-1']);
    press();
    moveTo(10, 30);
    moveTo(50, 110);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    });
    release(50, 110);
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByTestId('session')).toHaveTextContent('none');
  });

  it('adds no dnd-kit roles or English descriptions to the dragged element', () => {
    setup();
    const item = screen.getByRole('button', { name: 'item-a' });
    expect(item).not.toHaveAttribute('aria-roledescription');
    expect(item).not.toHaveAttribute('aria-describedby');
  });
});

describe('drop helpers', () => {
  it('prefers offered collisions, keeping order within each group', () => {
    const hits: Collision[] = [{ id: 'outer' }, { id: 'inner' }, { id: 'other' }];
    const detect: CollisionDetection = () => hits;
    const ordered = preferOffered(detect, new Set(['inner']))({} as never);
    expect(ordered.map((c) => c.id)).toEqual(['inner', 'outer', 'other']);
  });

  it('resolves a drop to a move, blocked, or nothing', () => {
    const offered = new Map([['a', { key: 'a' }]]);
    expect(dropOutcome(offered, 'a')).toEqual({ move: { key: 'a' } });
    expect(dropOutcome(offered, 'b')).toBe('blocked');
    expect(dropOutcome(offered, null)).toBeNull();
  });

  it('derives each target state from the session', () => {
    const idle: DragSession = { activeId: null, offered: new Set(), overKey: null };
    const s: DragSession = { activeId: 'x', offered: new Set(['a']), overKey: null };
    expect(dropTargetState(idle, 'a')).toBe('idle');
    expect(dropTargetState(s, 'a')).toBe('offered');
    expect(dropTargetState(s, 'b')).toBe('hidden');
    expect(dropTargetState({ ...s, overKey: 'a' }, 'a')).toBe('over');
    expect(dropTargetState({ ...s, overKey: 'b' }, 'b')).toBe('blocked');
  });
});
