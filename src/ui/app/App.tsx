// The application shell (contracts/ui.md §1, FR-019, FR-017/AC2).
//
// - Hash routes, since the app is static files with no server routing: `#/` the project library,
//   `#/project/<id>` a project's workspace, `#/project/<id>/block/<key>` with that block open. Block keys are
//   runtime keys (R-4), so a stale key opens the project at its first block. The route follows the open block.
// - An unknown or deleted project shows the library with a notice.
// - In an unsupported browser every route shows only the unsupported-browser message (FR-019/AC1).
// - The renderer starts only once the editor is on screen and idle (FR-017/AC2): `onInteractive` is called
//   once, after the first view has rendered. `deferEngine` holds the render queue's engine until then, so
//   render requests made while a project loads wait without starting the worker.
//
// The library and workspace views are passed in, so this shell does not depend on how they are built.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import type { SupportResult } from '../../services/browser-support.ts';
import type { EngineFactory, RenderEngine } from '../../services/render/render-queue.ts';
import type { FromWorker, ToWorker } from '../../services/render/render.worker.ts';
import type { ProjectRecord } from '../../services/storage/db.ts';
import { Announcer, type AnnouncerStore } from '../announcer/Announcer.tsx';
import { t } from '../messages/en.ts';
import { notices as defaultNotices, Notices, type NoticesStore } from '../notices/Notices.tsx';
import { StoreContext, type Store } from './store.ts';

// ---------------------------------------------------------------------------------------------- routes

export type Route =
  | { readonly view: 'library' }
  | { readonly view: 'project'; readonly projectId: string; readonly blockKey: string | null };

const LIBRARY: Route = { view: 'library' };

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/** The route for a location hash; anything unrecognised is the library. */
export function parseRoute(hash: string): Route {
  const m = /^#\/project\/([^/]+)(?:\/block\/([^/]+))?\/?$/.exec(hash);
  if (!m) return LIBRARY;
  const projectId = decode(m[1]!);
  const blockKey = m[2] === undefined ? null : decode(m[2]);
  if (projectId === null || projectId === '' || blockKey === '') return LIBRARY;
  return { view: 'project', projectId, blockKey };
}

/** The location hash for a route. */
export function routeHash(route: Route): string {
  if (route.view === 'library') return '#/';
  const project = `#/project/${encodeURIComponent(route.projectId)}`;
  return route.blockKey === null ? project : `${project}/block/${encodeURIComponent(route.blockKey)}`;
}

const sameRoute = (a: Route, b: Route) => routeHash(a) === routeHash(b);

/** The current route, following `hashchange`; `navigate` with `replace` adds no history entry. */
function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute((current) => {
      const next = parseRoute(window.location.hash);
      return sameRoute(current, next) ? current : next;
    });
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((next: Route, options: { readonly replace?: boolean } = {}) => {
    const hash = routeHash(next);
    if (options.replace) {
      if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash);
      setRoute((current) => (sameRoute(current, next) ? current : next));
    } else if (window.location.hash !== hash) {
      window.location.hash = hash; // the hashchange listener updates the route
    }
  }, []);
  return [route, navigate] as const;
}

// --------------------------------------------------------------------------------------- renderer gate

export interface DeferredEngine {
  /** Hands the render queue engines that wait until `release()`. */
  readonly createEngine: EngineFactory;
  /** Starts every engine requested so far and sends what was posted to it; later engines start at once. */
  release(): void;
  readonly released: boolean;
}

/**
 * Holds the renderer back until the editor is interactive (FR-017/AC2). Before `release()` an engine only
 * records what is posted to it; an engine terminated before then is never started.
 */
export function deferEngine(factory: EngineFactory): DeferredEngine {
  let released = false;
  const waiting = new Set<() => void>();

  const createEngine: EngineFactory = (onMessage: (message: FromWorker) => void) => {
    if (released) return factory(onMessage);
    let real: RenderEngine | null = null;
    let terminated = false;
    const buffered: ToWorker[] = [];
    const start = () => {
      waiting.delete(start);
      if (terminated) return;
      real = factory(onMessage);
      for (const message of buffered.splice(0)) real.post(message);
    };
    waiting.add(start);
    return {
      post(message) {
        if (terminated) return;
        if (real) real.post(message);
        else buffered.push(message);
      },
      terminate() {
        terminated = true;
        waiting.delete(start);
        buffered.length = 0;
        real?.terminate();
      },
    };
  };

  return {
    createEngine,
    release() {
      if (released) return;
      released = true;
      for (const start of [...waiting]) start();
    },
    get released() {
      return released;
    },
  };
}

/** Runs `fn` once the browser is idle after the current paint, or soon after where idle callbacks are missing. */
function whenIdle(fn: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: 2000 });
    return () => w.cancelIdleCallback!(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
}

// -------------------------------------------------------------------------------------------------- app

export interface LibraryViewProps {
  readonly onOpen: (projectId: string) => void;
}

export interface WorkspaceViewProps {
  readonly projectId: string;
}

export interface AppViews {
  readonly Library: ComponentType<LibraryViewProps>;
  /** Reads the open project from `StoreContext`. */
  readonly Workspace: ComponentType<WorkspaceViewProps>;
}

export interface AppProps {
  readonly support: SupportResult;
  readonly store: Store;
  readonly loadProject: (id: string) => Promise<ProjectRecord | undefined>;
  readonly views: AppViews;
  readonly notices?: NoticesStore;
  readonly announcer?: AnnouncerStore;
  /** Called once, when the editor is first on screen and idle: start the renderer here (FR-017/AC2). */
  readonly onInteractive?: () => void;
}

export function App(props: AppProps) {
  if (!props.support.supported) {
    return (
      <main className="unsupported-browser">
        <h1>{t('app.title')}</h1>
        <p role="alert">{t('app.unsupportedBrowser')}</p>
      </main>
    );
  }
  return <Editor {...props} />;
}

function Editor({ store, loadProject, views, notices = defaultNotices, announcer, onInteractive }: AppProps) {
  const [route, navigate] = useHashRoute();
  const session = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const routeBlock = route.view === 'project' ? route.blockKey : null;

  // The renderer starts once, after the first view is on screen (FR-017/AC2).
  // Cleared when it runs, not when it is scheduled, so a remounted effect (StrictMode) still runs it once.
  const interactive = useRef(onInteractive);
  useEffect(
    () =>
      whenIdle(() => {
        const fn = interactive.current;
        interactive.current = undefined;
        fn?.();
      }),
    [],
  );

  // Open the routed project, or close the open one when the route leaves it.
  const projectId = route.view === 'project' ? route.projectId : null;
  useEffect(() => {
    if (projectId === null) {
      if (store.getSnapshot().projectId !== null) void store.close();
      return;
    }
    if (store.getSnapshot().projectId === projectId) return;
    let cancelled = false;
    void (async () => {
      if (store.getSnapshot().projectId !== null) await store.close();
      let found: ProjectRecord | undefined;
      try {
        found = await loadProject(projectId);
      } catch {
        found = undefined;
      }
      if (cancelled) return;
      if (!found) {
        notices.show({ kind: 'unknownProject', key: 'unknownProject', messageKey: 'notice.unknownProject' });
        navigate(LIBRARY, { replace: true });
        return;
      }
      store.load(found);
      // The block named in the route as it is now, which may have changed while the project loaded.
      const now = parseRoute(window.location.hash);
      if (now.view === 'project' && now.projectId === projectId && now.blockKey !== null) store.openBlock(now.blockKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, store, loadProject, notices, navigate]);

  const ready = projectId !== null && session.projectId === projectId;

  // The block the next effect last wrote into the route, so the route change it causes is not mistaken for navigation.
  const written = useRef<string | null>(null);

  // A block named in the route after the project is open (back and forward within a project).
  useEffect(() => {
    if (routeBlock !== null && routeBlock === written.current) {
      written.current = null;
      return;
    }
    if (ready && routeBlock !== null && routeBlock !== session.openBlockKey) store.openBlock(routeBlock);
    // Only a route change should open a block; the open block itself is followed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, routeBlock, store]);

  // The route follows the open block, without adding history entries.
  useEffect(() => {
    if (!ready || projectId === null) return;
    const next: Route = { view: 'project', projectId, blockKey: session.openBlockKey };
    if (sameRoute(route, next)) return;
    written.current = next.blockKey;
    navigate(next, { replace: true });
  }, [ready, projectId, session.openBlockKey, route, navigate]);

  const onOpen = useCallback((id: string) => navigate({ view: 'project', projectId: id, blockKey: null }), [navigate]);
  const { Library, Workspace } = views;

  let view;
  if (projectId === null) view = <Library onOpen={onOpen} />;
  else if (ready) view = <Workspace projectId={projectId} />;
  else view = <p role="status" className="app__loading">{t('app.openingProject')}</p>;

  return (
    <StoreContext.Provider value={store}>
      {view}
      <Notices notices={notices} />
      <Announcer {...(announcer ? { announcer } : {})} />
    </StoreContext.Provider>
  );
}
