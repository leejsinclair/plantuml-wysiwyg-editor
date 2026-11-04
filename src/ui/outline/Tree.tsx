// The generic accessible tree (contracts/ui.md §7, FR-009, VO-097): the screen and flow outlines and the
// "Move to…" destination tree all use it.
//
// It follows the WAI-ARIA tree pattern with a roving tabindex: one item is tabbable, the arrows move focus
// between visible items, and selection follows focus. Right expands a collapsed item or moves to its first
// child; Left collapses an expanded item or moves to its parent; Home and End go to the first and last
// visible item; Enter activates. Items are rendered as one flat list with `aria-level`, `aria-setsize` and
// `aria-posinset`, so each item's accessible name is its own label only. The tree has no text of its own:
// the caller passes its label and the item labels from the message catalogue.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { keyCommand, platformFrom } from '../keys.ts';

export interface TreeItemData {
  /** Unique within the tree. */
  readonly id: string;
  /** The accessible name, also shown unless `renderLabel` is given. */
  readonly label: string;
  /** A parent's children; an item with none is a leaf. */
  readonly children?: readonly TreeItemData[];
}

export interface TreeProps {
  /** The tree's accessible name. */
  readonly label: string;
  readonly items: readonly TreeItemData[];
  /** The selected item, or `null`. */
  readonly selectedId: string | null;
  /** Selection follows focus: called whenever the user moves to or clicks an item. */
  onSelect(id: string): void;
  /** Enter on an item. */
  onActivate?(id: string): void;
  /** Controlled expansion. Without it the tree keeps its own, starting from `defaultExpanded`. */
  readonly expanded?: ReadonlySet<string>;
  onExpandedChange?(expanded: Set<string>): void;
  readonly defaultExpanded?: Iterable<string>;
  /** Visual content of an item; the accessible name stays `item.label`. */
  renderLabel?(item: TreeItemData): ReactNode;
  readonly className?: string;
}

interface VisibleItem {
  readonly item: TreeItemData;
  readonly level: number;
  readonly setSize: number;
  readonly posInSet: number;
  readonly parentId: string | null;
}

const hasChildren = (item: TreeItemData): boolean => (item.children?.length ?? 0) > 0;

/** Ids of the ancestors of `id`, outermost first, or `null` when `id` is not in the tree. */
function ancestorsOf(items: readonly TreeItemData[], id: string): string[] | null {
  for (const item of items) {
    if (item.id === id) return [];
    if (item.children) {
      const inner = ancestorsOf(item.children, id);
      if (inner) return [item.id, ...inner];
    }
  }
  return null;
}

function visibleItems(items: readonly TreeItemData[], expanded: ReadonlySet<string>): VisibleItem[] {
  const out: VisibleItem[] = [];
  const walk = (list: readonly TreeItemData[], level: number, parentId: string | null): void => {
    list.forEach((item, index) => {
      out.push({ item, level, setSize: list.length, posInSet: index + 1, parentId });
      if (hasChildren(item) && expanded.has(item.id)) walk(item.children!, level + 1, item.id);
    });
  };
  walk(items, 1, null);
  return out;
}

const platform = platformFrom(typeof navigator === 'undefined' ? '' : navigator.userAgent);

export function Tree(props: TreeProps) {
  const { items, selectedId, onSelect, onActivate, renderLabel } = props;
  const uid = useId();
  const [ownExpanded, setOwnExpanded] = useState<ReadonlySet<string>>(() => new Set(props.defaultExpanded ?? []));
  const baseExpanded = props.expanded ?? ownExpanded;

  // A selected item is always visible: its ancestors count as expanded.
  const expanded = useMemo(() => {
    const ancestors = selectedId === null ? null : ancestorsOf(items, selectedId);
    if (!ancestors || ancestors.every((a) => baseExpanded.has(a))) return baseExpanded;
    return new Set([...baseExpanded, ...ancestors]);
  }, [items, selectedId, baseExpanded]);

  const visible = useMemo(() => visibleItems(items, expanded), [items, expanded]);

  const [focusedId, setFocusedId] = useState<string | null>(selectedId);
  // The selection changed from outside: the tabbable item follows it.
  const [lastSelected, setLastSelected] = useState(selectedId);
  if (lastSelected !== selectedId) {
    setLastSelected(selectedId);
    if (selectedId !== null) setFocusedId(selectedId);
  }

  const tabbableId = visible.some((v) => v.item.id === focusedId)
    ? focusedId
    : visible.some((v) => v.item.id === selectedId)
      ? selectedId
      : (visible[0]?.item.id ?? null);

  const refs = useRef(new Map<string, HTMLLIElement>());
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    const el = refs.current.get(id);
    if (el) {
      pendingFocus.current = null;
      el.focus();
    }
  });

  const setExpanded = (next: Set<string>): void => {
    if (props.expanded === undefined) setOwnExpanded(next);
    props.onExpandedChange?.(next);
  };

  const moveTo = (id: string): void => {
    setFocusedId(id);
    pendingFocus.current = id;
    refs.current.get(id)?.focus();
    if (id !== selectedId) onSelect(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number): void => {
    const current = visible[index];
    if (!current) return;
    const { item } = current;
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const command = keyCommand(event, platform);
    let handled = true;
    if (command === 'down') {
      const next = visible[index + 1];
      if (next) moveTo(next.item.id);
    } else if (command === 'up') {
      const previous = visible[index - 1];
      if (previous) moveTo(previous.item.id);
    } else if (command === 'right') {
      if (hasChildren(item)) {
        if (!expanded.has(item.id)) setExpanded(new Set([...baseExpanded, item.id]));
        else moveTo(item.children![0]!.id);
      }
    } else if (command === 'left') {
      if (hasChildren(item) && expanded.has(item.id)) {
        const next = new Set(baseExpanded);
        next.delete(item.id);
        // Collapsing the parent of the selection would otherwise re-expand it; select the parent.
        const selectionInside = selectedId !== null && selectedId !== item.id && ancestorsOf([item], selectedId) !== null;
        if (selectionInside) moveTo(item.id);
        setExpanded(next);
      } else if (current.parentId !== null) {
        moveTo(current.parentId);
      }
    } else if (plain && event.key === 'Home') {
      const first = visible[0];
      if (first) moveTo(first.item.id);
    } else if (plain && event.key === 'End') {
      const last = visible[visible.length - 1];
      if (last) moveTo(last.item.id);
    } else if (command === 'enter' && onActivate) {
      onActivate(item.id);
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <ul role="tree" aria-label={props.label} className={props.className}>
      {visible.map((v, index) => {
        const { item } = v;
        const parent = hasChildren(item);
        const labelId = `${uid}-${index}`;
        return (
          <li
            key={item.id}
            ref={(el) => {
              if (el) refs.current.set(item.id, el);
              else refs.current.delete(item.id);
            }}
            role="treeitem"
            aria-labelledby={labelId}
            aria-level={v.level}
            aria-setsize={v.setSize}
            aria-posinset={v.posInSet}
            aria-selected={item.id === selectedId}
            aria-expanded={parent ? expanded.has(item.id) : undefined}
            tabIndex={item.id === tabbableId ? 0 : -1}
            data-level={v.level}
            onKeyDown={(e) => onKeyDown(e, index)}
            onFocus={() => setFocusedId(item.id)}
            onClick={(e) => {
              e.stopPropagation();
              moveTo(item.id);
            }}
          >
            <span id={labelId} hidden={renderLabel !== undefined}>
              {item.label}
            </span>
            {renderLabel ? <span aria-hidden="true">{renderLabel(item)}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
