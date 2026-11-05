// Drag a palette item onto the flow canvas (spec 3.7: drag is never the only way; the palette's click and the
// keyboard insertion still work). The palette and canvas are separate regions, so one drag context wraps both
// (BlockEditor.DndHost). Dropping on an element inserts after it (before a stop); dropping on the empty area
// at the bottom inserts at the end of the main path. Both reuse the palette's `insert`.
import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import { useStore, useSession } from '../app/store.ts';
import { flowDoc } from '../../core/activity/destinations.ts';
import { addLinkedStep } from '../../core/activity/ops/links.ts';
import { insert, FLOW_PALETTE, type FlowPaletteItem } from '../../core/activity/ops/insert.ts';
import type { Path } from '../../core/types.ts';
import { useEditorSensors } from '../workspace/dnd.tsx';

export const PALETTE_PREFIX = 'flow-palette::';
export const SCREEN_PREFIX = 'flow-screen::';
const DROP_PREFIX = 'flow-drop::';
export const END_DROP_ID = `${DROP_PREFIX}end`;

export const dropIdForPath = (path: Path): string => `${DROP_PREFIX}${path.join(',')}`;

/** A canvas drop target; `over` is true while a palette item is dragged over it. */
export function useFlowDrop(id: string): { setNodeRef: (el: HTMLElement | null) => void; over: boolean } {
  const { setNodeRef, isOver } = useDroppable({ id });
  return { setNodeRef, over: isOver };
}

export function FlowDndHost({ blockKey, children }: { blockKey: string; children: ReactNode }) {
  const store = useStore();
  const session = useSession();
  const sensors = useEditorSensors();

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    const id = String(active.id);
    const overId = over ? String(over.id) : '';
    const isScreen = id.startsWith(SCREEN_PREFIX);
    if ((!isScreen && !id.startsWith(PALETTE_PREFIX)) || !overId.startsWith(DROP_PREFIX)) return;
    const item = id.slice(PALETTE_PREFIX.length) as FlowPaletteItem;
    if (!isScreen && !FLOW_PALETTE.includes(item)) return;
    const state = store.getState();
    const view = session.blocks.find((b) => b.key === blockKey);
    if (!state || !view) return;
    const doc = flowDoc(state.source.slice(view.start, view.end), view.start);
    if (!doc) return;
    const raw = overId.slice(DROP_PREFIX.length);
    const target: Path | null = raw === 'end' ? null : raw === '' ? [] : raw.split(',').map(Number);
    if (isScreen) {
      const name = id.slice(SCREEN_PREFIX.length);
      store.applyOp(addLinkedStep(doc, name, name, target), { blockKey });
      return;
    }
    store.applyOp(insert(doc, target, item), { blockKey });
  };

  return (
    <DndContext
      sensors={sensors}
      accessibility={{ screenReaderInstructions: { draggable: '' } }}
      onDragEnd={onDragEnd}
    >
      {children}
    </DndContext>
  );
}
