// The workspace layout (FR-016/AC1–AC4, FR-015/AC3–AC5, FR-009/AC15, contracts/ui.md §3).
//
// - Seven named landmark regions, in region-focus order: project panel, palette, canvas, outline, properties,
//   source, preview. The default arrangement puts the project panel, palette and outline on the left, the canvas
//   in the centre, properties on the right, and source and preview in a shared pane (FR-016/AC4).
// - Every region but the canvas collapses to its heading; the choice is remembered per browser in the settings
//   store (data-model §3.3). A collapsed region keeps its landmark, so the region shortcut still reaches it.
// - The region-focus shortcut (`nextRegion` / `previousRegion` in keys.ts) moves focus to the next or previous
//   region, wrapping, back to the control last focused there or else the region itself. No region traps focus.
// - The canvas region shows the `banners`, the breadcrumb and the command bar, then dispatches to
//   `blockEditors[kind].Canvas`; palette and outline dispatch the same way. Other content, or a block with no
//   visual model, shows a source-only message instead. The open block is read-only during its source edit.
// - With no props it places the toolbar, project panel, properties panel, the open block's source view and its
//   preview (their own tasks), reading the session from the store; each can be replaced through a prop. The
//   preview shows render results only when given the render queue.
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SegmentedControl, Text, UnstyledButton } from '@mantine/core';
import { useUiMode } from './mode.ts';
import type { Path } from '../../core/types.ts';
import { getSettings, openEditorDb, putSettings, type EditorDatabase, type PanelRegion, type Settings } from '../../services/storage/db.ts';
import type { BlockRender, RenderQueue } from '../../services/render/render-queue.ts';
import { slots as appSlots, useSlot, type SlotContext, type Slots } from '../app/slots.ts';
import { useSession, useStore } from '../app/store.ts';
import { keyCommand, platformFrom, type Platform } from '../keys.ts';
import { has, t } from '../messages/en.ts';
import { Breadcrumb } from './Breadcrumb.tsx';
import { CommandBar } from './CommandBar.tsx';
import { MoveToHost, moveTo as appMoveTo, type MoveToController } from './MoveToDialog.tsx';
import { Toolbar } from './Toolbar.tsx';
import { ProjectPanel, blockLabel } from '../project-panel/ProjectPanel.tsx';
import { PropertiesPanel } from '../properties/PropertiesPanel.tsx';
import { SourceView } from '../source-view/SourceView.tsx';
import type { SourceLanguageKind } from '../source-view/highlight.ts';
import { Preview } from '../preview/Preview.tsx';
import './workspace.css';

/** The workspace regions in region-focus order (FR-016/AC3). */
export const REGIONS = ['projectPanel', 'palette', 'canvas', 'outline', 'properties', 'source', 'preview'] as const;
export type RegionId = (typeof REGIONS)[number];

type Area = 'left' | 'centre' | 'right' | 'shared';
const AREA: Record<RegionId, Area> = {
  projectPanel: 'left', palette: 'left', outline: 'left', canvas: 'centre', properties: 'right', source: 'shared', preview: 'shared',
};
/** The settings key of each collapsible region; the canvas never collapses. */
const PANEL: Record<Exclude<RegionId, 'canvas'>, PanelRegion> = {
  projectPanel: 'project panel', palette: 'palette', outline: 'outline', properties: 'properties', source: 'source', preview: 'preview',
};

/** Regions that start collapsed until the user opens them (FR-012). */
const DEFAULT_COLLAPSED: ReadonlySet<RegionId> = new Set<RegionId>(['outline', 'source', 'preview']);

/** Where panel visibility is remembered (one record per browser). */
export interface SettingsStore {
  /** Settings already in memory, shown on the first render; the defaults apply until `get` resolves. */
  readonly initial?: Settings;
  get(): Promise<Settings>;
  put(settings: Settings): Promise<void>;
}

export function dbSettingsStore(db: EditorDatabase): SettingsStore {
  return { get: () => getSettings(db), put: (s) => putSettings(db, s) };
}

let appDb: Promise<EditorDatabase> | null = null;
/** The browser's own settings record, opened on first use. */
export const appSettingsStore: SettingsStore = {
  get: async () => getSettings(await (appDb ??= openEditorDb())),
  put: async (s) => putSettings(await (appDb ??= openEditorDb()), s),
};

const noRenders = (): (() => void) => () => {};

export interface WorkspaceProps {
  /** The slot registry; defaults to the application's. */
  readonly slots?: Slots;
  readonly platform?: Platform;
  /** Where panel visibility is remembered; the browser's settings record by default. */
  readonly settings?: SettingsStore;
  /** The render queue whose results the default preview shows. */
  readonly renderQueue?: RenderQueue;
  /** The whole project is read-only (another tab holds the edit lock). */
  readonly readOnly?: boolean;
  readonly moveToController?: MoveToController;
  readonly toolbar?: ReactNode;
  readonly projectPanel?: ReactNode;
  readonly properties?: ReactNode;
  readonly source?: ReactNode;
  readonly preview?: ReactNode;
}

const defaultPlatform = platformFrom(typeof navigator === 'undefined' ? '' : navigator.userAgent);

interface RegionProps {
  readonly id: RegionId;
  readonly collapsed?: boolean;
  onToggle?(): void;
  readonly children: ReactNode;
  readonly registerRef: (id: RegionId, el: HTMLElement | null) => void;
  onFocusInside(id: RegionId, el: HTMLElement): void;
  readonly readOnly?: boolean;
}

function Region({ id, collapsed = false, onToggle, children, registerRef, onFocusInside, readOnly }: RegionProps) {
  const contentId = useId();
  const name = t(`region.${id}`);
  return (
    <section
      ref={(el) => registerRef(id, el)}
      aria-label={name}
      data-region={id}
      data-area={AREA[id]}
      data-collapsed={collapsed ? 'true' : undefined}
      data-readonly={readOnly ? 'true' : undefined}
      tabIndex={-1}
      className="workspace__region"
      onFocus={(e) => {
        if (e.target instanceof HTMLElement && e.target !== e.currentTarget) onFocusInside(id, e.target);
      }}
    >
      <h2 className="workspace__heading">
        {onToggle ? (
          <UnstyledButton aria-expanded={!collapsed} aria-controls={contentId} onClick={onToggle}>
            {name}
          </UnstyledButton>
        ) : (
          <Text size="sm" fw={500}>{name}</Text>
        )}
      </h2>
      <div id={contentId} className="workspace__content" hidden={collapsed}>
        {collapsed ? null : children}
      </div>
    </section>
  );
}

export function Workspace(props: WorkspaceProps) {
  const { slots = appSlots, platform = defaultPlatform, settings = appSettingsStore, readOnly = false, moveToController = appMoveTo, renderQueue } = props;
  const session = useSession();
  const store = useStore();
  useSlot(slots.blockEditors);
  const banners = useSlot(slots.banners);

  const [mode, setMode] = useUiMode();

  // ---------------------------------------------------------------------------- panel collapse memory
  const [stored, setStored] = useState<Settings>(settings.initial ?? { panels: {} });
  useEffect(() => {
    let live = true;
    settings.get().then(
      (s) => { if (live) setStored(s); },
      () => { /* Unreadable settings: every panel stays expanded. */ },
    );
    return () => { live = false; };
  }, [settings]);

  const isCollapsed = (id: Exclude<RegionId, 'canvas'>): boolean =>
    stored.panels[PANEL[id]]?.collapsed ?? DEFAULT_COLLAPSED.has(id);
  const toggle = (id: Exclude<RegionId, 'canvas'>) => (): void => {
    const next: Settings = { ...stored, panels: { ...stored.panels, [PANEL[id]]: { collapsed: !isCollapsed(id) } } };
    setStored(next);
    settings.put(next).catch(() => { /* Not remembered this time; the layout still changes. */ });
  };

  // ------------------------------------------------------------------------------- region-focus shortcut
  const regionEls = useRef(new Map<RegionId, HTMLElement>());
  const lastFocused = useRef(new Map<RegionId, HTMLElement>());
  const registerRef = (id: RegionId, el: HTMLElement | null): void => {
    if (el) regionEls.current.set(id, el);
    else regionEls.current.delete(id);
  };
  const onFocusInside = (id: RegionId, el: HTMLElement): void => {
    lastFocused.current.set(id, el);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = keyCommand(event, platform);
      if (command !== 'nextRegion' && command !== 'previousRegion') return;
      const active = document.activeElement;
      // A modal dialog keeps focus until it closes.
      if (active instanceof Element && active.closest('[aria-modal="true"]')) return;
      event.preventDefault();
      const currentId = active instanceof Element ? active.closest('[data-region]')?.getAttribute('data-region') : null;
      const at = REGIONS.indexOf(currentId as RegionId);
      const step = command === 'nextRegion' ? 1 : -1;
      const nextIndex = at === -1 ? (step === 1 ? 0 : REGIONS.length - 1) : (at + step + REGIONS.length) % REGIONS.length;
      // Regions hidden by the simple mode are not in the document; skip them.
      let id = REGIONS[nextIndex]!;
      for (let n = 0; n < REGIONS.length && !regionEls.current.has(id); n++) {
        id = REGIONS[(REGIONS.indexOf(id) + step + REGIONS.length) % REGIONS.length]!;
      }
      const region = regionEls.current.get(id);
      if (!region) return;
      const remembered = lastFocused.current.get(id);
      if (remembered?.isConnected && region.contains(remembered) && !remembered.closest('[hidden]')) remembered.focus();
      else region.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [platform]);

  // ---------------------------------------------------------------------------------- the open block
  const view = session.blocks.find((b) => b.key === session.openBlockKey) ?? null;
  const editor = view && view.kind !== 'other' ? slots.blockEditors.get(view.kind) : null;
  const model = view ? (view.classification.salt?.model ?? view.classification.activity?.model ?? null) : null;
  const visual = editor !== null && model !== null;
  const sourceEditing = view !== null && session.sourceEditKey === view.key;
  const blockReadOnly = readOnly || sourceEditing;
  const selection: Path | null = view && session.selection?.blockKey === view.key ? session.selection.path : null;
  const ctx: SlotContext = {
    projectId: session.projectId,
    block: view ? { key: view.key, kind: view.kind, name: view.name, readOnly: blockReadOnly } : null,
    selection,
  };
  const editorProps = view ? { blockKey: view.key, model, selection, readOnly: blockReadOnly } : null;

  // The open block's render results, for the default preview.
  const openKey = view?.key ?? null;
  const render: BlockRender | null = useSyncExternalStore(
    renderQueue ? (l) => renderQueue.subscribe(() => l()) : noRenders,
    () => (renderQueue && openKey ? renderQueue.get(openKey) : null),
  );
  const text = view ? (store.getState()?.source.slice(view.start, view.end) ?? '') : '';
  const language: SourceLanguageKind = view?.classification.salt ? 'salt' : view?.classification.activity ? 'activity' : 'other';
  /** Esc in the source view: back to the canvas, where focus last was. */
  const focusCanvas = (): void => {
    const region = regionEls.current.get('canvas');
    const remembered = lastFocused.current.get('canvas');
    if (remembered?.isConnected && region?.contains(remembered)) remembered.focus();
    else region?.focus();
  };
  const source = props.source ?? (view ? (
    <SourceView key={view.key} blockKey={view.key} text={text} language={language} slots={slots} onEscape={focusCanvas} />
  ) : null);
  const preview = props.preview ?? (view ? (
    <Preview
      ctx={ctx}
      blockLabel={blockLabel(view)}
      text={text}
      latest={render?.latest ?? null}
      lastOk={render?.lastOk ?? null}
      notCheckedByEditor={view.classification.category === 3}
    />
  ) : null);

  const notVisual = <p className="workspace__message">{t('workspace.notVisual')}</p>;
  let canvas: ReactNode;
  if (!view) {
    canvas = <p className="workspace__message">{t('workspace.noBlock')}</p>;
  } else if (visual && editorProps) {
    canvas = (
      <>
        <Breadcrumb labels={editor.pathLabels(model, selection ?? [])} path={selection} onSelect={(p) => store.select(p)} />
        <CommandBar ctx={ctx} slots={slots} platform={platform} />
        <editor.Canvas {...editorProps} />
      </>
    );
  } else {
    canvas = (
      <div className="workspace__message">
        <p>{t('workspace.sourceOnly')}</p>
        {view.reasonKey && has(view.reasonKey) ? <p>{t(view.reasonKey, view.reasonParams)}</p> : null}
      </div>
    );
  }

  const regionProps = { registerRef, onFocusInside };
  // Simple mode hides outline, source and preview, except that content with no visual editor needs its source.
  const advanced = mode === 'advanced';
  const showSource = advanced || !visual || sourceEditing;
  const DndHost = visual && editorProps ? editor.DndHost : undefined;
  const wrapDnd = (body: ReactNode): ReactNode => (DndHost && view ? <DndHost blockKey={view.key}>{body}</DndHost> : body);
  return (
    <div className="workspace">
      <header className="workspace__toolbar">
        {props.toolbar ?? <Toolbar ctx={ctx} slots={slots} platform={platform} />}
        <SegmentedControl
          className="workspace__mode"
          size="xs"
          aria-label={t('mode.label')}
          value={mode}
          onChange={(v) => setMode(v === 'advanced' ? 'advanced' : 'simple')}
          data={[
            { value: 'simple', label: t('mode.simple') },
            { value: 'advanced', label: t('mode.advanced') },
          ]}
        />
      </header>
      {wrapDnd(<div className="workspace__body" data-mode={showSource ? undefined : 'simple'}>
        <Region id="projectPanel" collapsed={isCollapsed('projectPanel')} onToggle={toggle('projectPanel')} {...regionProps}>
          {props.projectPanel ?? <ProjectPanel />}
        </Region>
        <Region id="palette" collapsed={isCollapsed('palette')} onToggle={toggle('palette')} {...regionProps}>
          {visual && editorProps ? <editor.Palette {...editorProps} /> : notVisual}
        </Region>
        <Region id="canvas" readOnly={blockReadOnly} {...regionProps}>
          {banners.map(({ id, Component }) => <Component key={id} ctx={ctx} />)}
          {sourceEditing ? <p role="status" className="workspace__readonly">{t('workspace.readOnlyDuringSourceEdit')}</p> : null}
          {canvas}
        </Region>
        {advanced && <Region id="outline" collapsed={isCollapsed('outline')} onToggle={toggle('outline')} {...regionProps}>
          {visual && editorProps ? <editor.Outline {...editorProps} /> : notVisual}
        </Region>}
        <Region id="properties" collapsed={isCollapsed('properties')} onToggle={toggle('properties')} {...regionProps}>
          {props.properties ?? <PropertiesPanel slots={slots} readOnly={readOnly} />}
        </Region>
        {showSource && <Region id="source" collapsed={isCollapsed('source')} onToggle={toggle('source')} {...regionProps}>
          {source}
        </Region>}
        {advanced && <Region id="preview" collapsed={isCollapsed('preview')} onToggle={toggle('preview')} {...regionProps}>
          {preview}
        </Region>}
      </div>)}
      <MoveToHost controller={moveToController} />
    </div>
  );
}
