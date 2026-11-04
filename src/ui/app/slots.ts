// The slot registry: how each user story plugs into the shared workspace without editing the shells
// (tasks.md "One owner per file"). Each story's `register.tsx` adds its contributions at import time, and
// `main.tsx` imports every `src/ui/**/register.tsx` eagerly before the first render. The shells (workspace,
// toolbar, project panel, properties, command bar, source view, preview) only read from here.
//
// Every registration returns a function that removes it. Ids must be unique within a slot, and the keyed and
// single slots refuse a second owner, so two stories can never silently replace each other.

import { useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import type { BlockKind, MessageParams, Path } from '../../core/types.ts';
import type { KeyChord, KeyCommand } from '../keys.ts';

// ---------------------------------------------------------------------------------------------- context

/** The block open in the workspace, as contributions see it. */
export interface OpenBlock {
  readonly key: string;
  readonly kind: BlockKind;
  readonly name: string | null;
  /** True during a source edit and when another tab holds the edit lock. */
  readonly readOnly: boolean;
}

/** What every contribution is given: the open project, the open block and the selection inside it. */
export interface SlotContext {
  readonly projectId: string | null;
  readonly block: OpenBlock | null;
  readonly selection: Path | null;
}

export interface SlotProps {
  readonly ctx: SlotContext;
}

// --------------------------------------------------------------------------------------------- commands

/**
 * A structural or project command. The command bar shows every visible command as a pointer-operable
 * control with its shortcut (FR-009/AC14); labels are message-catalogue keys (FR-016/AC8).
 */
export interface Command {
  readonly id: string;
  readonly labelKey: string;
  readonly labelParams?: MessageParams;
  /** A named binding from `keys.ts`, or the command's own chords. */
  readonly shortcut?: KeyCommand | readonly KeyChord[];
  /** Lower comes first; equal orders keep registration order. */
  readonly order?: number;
  /** Hidden commands are not shown at all; the default is visible. */
  isVisible?(ctx: SlotContext): boolean;
  /** Disabled commands are shown but cannot run; the default is enabled. */
  isEnabled?(ctx: SlotContext): boolean;
  /** `store` is the application store, passed as `unknown` to avoid a circular import; cast to `Store` in implementations that need it. */
  run(ctx: SlotContext, store?: unknown): void;
}

// --------------------------------------------------------------------------------------- block editors

export interface BlockEditorProps<M> {
  readonly blockKey: string;
  readonly model: M;
  readonly selection: Path | null;
  /** The canvas is read-only while the block's source view has focus, whatever its status. */
  readonly readOnly: boolean;
}

/**
 * Everything the workspace needs to edit one kind of block visually: the screen editor (US1) and the flow
 * editor (US6) each register one. `M` is the block's editor model, `D` its destination type (R-7).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each kind has its own model; the shells pass it through
export interface BlockEditor<M = any, D = unknown> {
  readonly Canvas: ComponentType<BlockEditorProps<M>>;
  readonly Outline: ComponentType<BlockEditorProps<M>>;
  readonly Palette: ComponentType<BlockEditorProps<M>>;
  readonly Properties: ComponentType<BlockEditorProps<M>>;
  /** Optional wrapper around the palette and canvas, for drags that cross the two (e.g. palette item onto canvas). */
  readonly DndHost?: ComponentType<{ readonly blockKey: string; readonly children: ReactNode }>;
  /** Structural commands for this kind ("Select parent", "Move to…", "Wrap", …). */
  readonly commands: readonly Command[];
  /** Breadcrumb parts from the block to the element at `path`, e.g. ["Screen", "Form", "Row 2", "Button"]. */
  pathLabels(model: M, path: Path): string[];
  /** Valid destinations for moving the element at `target`, shared by drag and drop and "Move to…". */
  destinations(model: M, target: Path): readonly D[];
  /** Whether `path` still points at something after a re-parse; the store trims it to the nearest survivor. */
  hasPath(model: M, path: Path): boolean;
}

// -------------------------------------------------------------------------------------- contributions

interface Item {
  readonly id: string;
  /** Lower comes first; equal orders keep registration order. */
  readonly order?: number;
}

/** A component placed in a shell; it may render nothing when it does not apply. */
export interface Contribution extends Item {
  readonly Component: ComponentType<SlotProps>;
}

/** Library entries: `header` beside "Create project", `row` among each project's commands. */
export interface LibraryItem extends Item {
  readonly placement: 'header' | 'row';
  readonly Component: ComponentType<SlotProps & { readonly projectId?: string }>;
}

/** Project-panel entries: `header` beside "Add screen", `block` among one block's commands. */
export interface ProjectPanelItem extends Item {
  readonly placement: 'header' | 'block';
  readonly Component: ComponentType<SlotProps & { readonly blockKey?: string }>;
}

/** A properties-panel section, shown when `appliesTo` the current context (e.g. the name or link section). */
export interface PropertySection extends Item {
  appliesTo(ctx: SlotContext): boolean;
  readonly Component: ComponentType<SlotProps>;
}

/** Makes the source view editable (US4). Without one registered, the source view is read-only. */
export interface SourceEditController {
  /** The first keystroke in a block's source: the canvas becomes read-only. */
  begin(blockKey: string): void;
  /** The block's whole text after a change. */
  change(blockKey: string, text: string): void;
  /** Focus left the source view: the typing becomes one history entry and boundaries are checked. */
  end(blockKey: string): void;
}

/** Called with a link's target when a link in the rendered preview is clicked (US7). */
export type PreviewLinkHandler = (target: string, ctx: SlotContext) => void;

// ---------------------------------------------------------------------------------------- slot types

type Listener = () => void;

class Signal {
  private readonly listeners = new Set<Listener>();
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  protected emit(): void {
    for (const l of [...this.listeners]) l();
  }
}

/** An ordered list of contributions with unique ids. */
export class ListSlot<T extends Item> extends Signal {
  private entries: { item: T; seq: number }[] = [];
  private seq = 0;
  private snapshot: readonly T[] = [];

  constructor(readonly name: string) {
    super();
  }

  register(item: T): () => void {
    if (this.entries.some((e) => e.item.id === item.id)) {
      throw new Error(`Slot "${this.name}" already has an item "${item.id}"`);
    }
    const entry = { item, seq: this.seq++ };
    this.entries.push(entry);
    this.update();
    return () => {
      const before = this.entries.length;
      this.entries = this.entries.filter((e) => e !== entry);
      if (this.entries.length !== before) this.update();
    };
  }

  /** The items by `order`, then registration. The same array is returned until something changes. */
  list = (): readonly T[] => this.snapshot;

  getSnapshot = (): readonly T[] => this.snapshot;

  private update(): void {
    this.snapshot = [...this.entries]
      .sort((a, b) => (a.item.order ?? 0) - (b.item.order ?? 0) || a.seq - b.seq)
      .map((e) => e.item);
    this.emit();
  }
}

/** A slot with at most one owner. */
export class SingleSlot<T> extends Signal {
  private value: T | null = null;

  constructor(readonly name: string) {
    super();
  }

  set(value: T): () => void {
    if (this.value !== null) throw new Error(`Slot "${this.name}" already has an owner`);
    this.value = value;
    this.emit();
    return () => {
      if (this.value !== value) return;
      this.value = null;
      this.emit();
    };
  }

  get = (): T | null => this.value;

  getSnapshot = (): T | null => this.value;
}

/** One owner per key. */
export class KeyedSlot<K extends string, V> extends Signal {
  private map: ReadonlyMap<K, V> = new Map();

  constructor(readonly name: string) {
    super();
  }

  register(key: K, value: V): () => void {
    if (this.map.has(key)) throw new Error(`Slot "${this.name}" already has an owner for "${key}"`);
    this.map = new Map(this.map).set(key, value);
    this.emit();
    return () => {
      if (this.map.get(key) !== value) return;
      const next = new Map(this.map);
      next.delete(key);
      this.map = next;
      this.emit();
    };
  }

  get = (key: K): V | null => this.map.get(key) ?? null;

  getSnapshot = (): ReadonlyMap<K, V> => this.map;
}

// ------------------------------------------------------------------------------------------ registry

export function createSlots() {
  return {
    /** Visual editors by block kind. Other content has none: the canvas shows a source-only message. */
    blockEditors: new KeyedSlot<BlockKind, BlockEditor>('blockEditors'),
    /** Always-visible toolbar controls after Undo, Redo and the autosave status (Download, Import, export…). */
    toolbar: new ListSlot<Contribution>('toolbar'),
    /** Project library entries (library commands, Import). */
    library: new ListSlot<LibraryItem>('library'),
    /** Project panel entries ("Add screen flow", screen commands, "Convert to current format"). */
    projectPanel: new ListSlot<ProjectPanelItem>('projectPanel'),
    /** Extra properties sections (block name, step link). */
    propertySections: new ListSlot<PropertySection>('propertySections'),
    /** Commands beyond the open block editor's own ("Open screen", "Back to flow"). */
    commands: new ListSlot<Command>('commands'),
    /** Banners at the top of the canvas region (block status). */
    banners: new ListSlot<Contribution>('banners'),
    /** The controller that makes the source view editable. */
    sourceEdit: new SingleSlot<SourceEditController>('sourceEdit'),
    /** The handler for link clicks in the preview. */
    previewLink: new SingleSlot<PreviewLinkHandler>('previewLink'),
  };
}

export type Slots = ReturnType<typeof createSlots>;

/** The application's registry. */
export const slots: Slots = createSlots();

/** Reads a slot in a component and re-renders when it changes. */
export function useSlot<S>(slot: { subscribe(l: Listener): () => void; getSnapshot(): S }): S {
  return useSyncExternalStore(slot.subscribe, slot.getSnapshot, slot.getSnapshot);
}
