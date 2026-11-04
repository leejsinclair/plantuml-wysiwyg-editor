// "Move to…" (FR-009/AC2, contracts/ui.md §7): a modal dialog listing every valid destination as a tree, the
// keyboard alternative to dragging. For each valid container the editor lists its empty cells and "at the end",
// and for single-row or single-column containers "before" or "after" each element; the same set drag and drop
// offers (`blockEditors[kind].destinations`). Containers group destinations and cannot be chosen themselves.
//
// Enter on a destination or "Move here" moves; Esc or "Cancel" closes without moving (FR-009/AC12). Tab stays
// inside the dialog while it is open, and focus returns to where it was when it closes.
//
// A command's `run` cannot render, so commands open the dialog through a controller (`moveTo.open(request)`),
// and the workspace renders `<MoveToHost />`.
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { Tree, type TreeItemData } from '../outline/Tree.tsx';
import { t } from '../messages/en.ts';

export interface DestinationNode<D> {
  /** Unique within the tree. */
  readonly id: string;
  /** The accessible name, e.g. "Empty cell, row 2 column 1" or "Before 'OK'". */
  readonly label: string;
  /** Set on a node that can be chosen. */
  readonly destination?: D;
  readonly children?: readonly DestinationNode<D>[];
}

export interface MoveToDialogProps<D> {
  readonly nodes: readonly DestinationNode<D>[];
  onMove(destination: D): void;
  onClose(): void;
}

function index<D>(nodes: readonly DestinationNode<D>[], into = new Map<string, DestinationNode<D>>()): Map<string, DestinationNode<D>> {
  for (const n of nodes) {
    into.set(n.id, n);
    if (n.children) index(n.children, into);
  }
  return into;
}

const FOCUSABLE = 'button:not([disabled]), [tabindex="0"]';

export function MoveToDialog<D>({ nodes, onMove, onClose }: MoveToDialogProps<D>) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => index(nodes), [nodes]);
  const items = nodes as readonly TreeItemData[];
  const [selectedId, setSelectedId] = useState<string | null>(nodes[0]?.id ?? null);
  const chosen = selectedId === null ? undefined : byId.get(selectedId);
  const canMove = chosen?.destination !== undefined;

  // Focus the tree's selected item, or Cancel when there is nowhere to go.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const target = dialog.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]') ?? dialog.querySelector<HTMLElement>('button:not([disabled])');
    target?.focus();
  }, []);

  const move = (id: string | null): void => {
    const node = id === null ? undefined : byId.get(id);
    if (node?.destination !== undefined) onMove(node.destination);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (focusable.length === 0) return;
      const at = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (at <= 0 ? focusable.length - 1 : at - 1) : (at + 1) % focusable.length;
      event.preventDefault();
      focusable[next]?.focus();
    }
  };

  return (
    <div className="move-to-backdrop">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="move-to" onKeyDown={onKeyDown}>
        <h2 id={titleId}>{t('moveTo.title')}</h2>
        {nodes.length > 0 ? (
          <Tree
            label={t('moveTo.destinations')}
            items={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onActivate={move}
            defaultExpanded={nodes.map((n) => n.id)}
          />
        ) : (
          <p>{t('moveTo.none')}</p>
        )}
        <div className="move-to__actions">
          {nodes.length > 0 ? (
            <button type="button" disabled={!canMove} onClick={() => move(selectedId)}>
              {t('moveTo.move')}
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            {t('moveTo.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- controller

export interface MoveToRequest<D> {
  readonly nodes: readonly DestinationNode<D>[];
  onMove(destination: D): void;
}

interface OpenRequest<D> extends MoveToRequest<D> {
  /** Changes on every `open`, so a new request starts a fresh dialog. */
  readonly seq: number;
}

export function createMoveToController() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the host passes the request through unchanged
  let request: OpenRequest<any> | null = null;
  let seq = 0;
  /** Where focus was when the dialog opened; it goes back there when the dialog closes. */
  let returnTo: HTMLElement | null = null;
  const listeners = new Set<() => void>();
  const emit = (): void => listeners.forEach((l) => l());
  return {
    open<D>(next: MoveToRequest<D>): void {
      if (request === null && typeof document !== 'undefined') {
        returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      request = { nodes: next.nodes, onMove: (d: D) => next.onMove(d), seq: ++seq };
      emit();
    },
    close(): void {
      if (request === null) return;
      request = null;
      emit();
    },
    /** The element to refocus after closing, once. */
    takeReturnFocus(): HTMLElement | null {
      const el = returnTo;
      returnTo = null;
      return el;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    getSnapshot: (): OpenRequest<any> | null => request,
  };
}

export type MoveToController = ReturnType<typeof createMoveToController>;

/** The application's "Move to…" controller. */
export const moveTo: MoveToController = createMoveToController();

/** Renders the dialog while a request is open, and puts focus back where it was when it closes. */
export function MoveToHost({ controller = moveTo }: { readonly controller?: MoveToController }) {
  const request = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    if (request !== null) return;
    const el = controller.takeReturnFocus();
    if (el?.isConnected) el.focus();
  }, [request, controller]);
  if (request === null) return null;
  return (
    <MoveToDialog
      key={request.seq}
      nodes={request.nodes}
      onMove={(d) => {
        controller.close();
        request.onMove(d);
      }}
      onClose={() => controller.close()}
    />
  );
}
