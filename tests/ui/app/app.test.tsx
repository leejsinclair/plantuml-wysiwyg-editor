// T047: the app shell and routes (contracts/ui.md §1, FR-019/AC1, FR-017/AC2).
import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, deferEngine, parseRoute, routeHash, type AppViews } from '../../../src/ui/app/App.tsx';
import { createStore, useSession, type Store } from '../../../src/ui/app/store.ts';
import { createNotices } from '../../../src/ui/notices/Notices.tsx';
import type { EngineFactory, RenderEngine } from '../../../src/services/render/render-queue.ts';
import type { FromWorker, ToWorker } from '../../../src/services/render/render.worker.ts';
import type { ProjectRecord } from '../../../src/services/storage/db.ts';
import { t } from '../../../src/ui/messages/en.ts';

const salt = (name: string) => `@startsalt ${name}\n{\n  [OK]\n}\n@endsalt\n`;
const record = (id: string, source = salt('A') + salt('B')): ProjectRecord => ({
  id, name: `Project ${id}`, source, flowIndex: null, lastWorking: [],
  createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
  downloadedAt: null, downloadedRevision: null,
});

const views: AppViews = {
  Library: ({ onOpen }) => (
    <div>
      <h1>Library view</h1>
      <button type="button" onClick={() => onOpen('p1')}>Open p1</button>
    </div>
  ),
  Workspace: () => {
    const s = useSession();
    return <h1>{`Workspace ${s.projectId} open ${s.openBlockKey}`}</h1>;
  },
};

let stores: Store[] = [];
beforeEach(() => {
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  stores.forEach((s) => s.dispose());
  stores = [];
});

function setup(hash: string, extra: { supported?: boolean; onInteractive?: () => void; strict?: boolean } = {}) {
  window.history.replaceState(null, '', `/${hash}`);
  let n = 0;
  const store = createStore({ write: async () => {}, announce: () => {}, newKey: () => `b${++n}` });
  stores.push(store);
  const projects = new Map([['p1', record('p1')]]);
  const loadProject = vi.fn(async (id: string) => projects.get(id));
  const notices = createNotices({ announce: () => {} });
  const app = (
    <App
      support={extra.supported === false ? { supported: false, reason: 'browser', name: 'other', major: null } : { supported: true }}
      store={store}
      loadProject={loadProject}
      views={views}
      notices={notices}
      onInteractive={extra.onInteractive ?? (() => {})}
    />
  );
  render(extra.strict ? <StrictMode>{app}</StrictMode> : app);
  return { store, loadProject, notices };
}

describe('routes (contracts/ui.md §1)', () => {
  it('parses the three hash routes, and anything else is the library', () => {
    expect(parseRoute('')).toEqual({ view: 'library' });
    expect(parseRoute('#/')).toEqual({ view: 'library' });
    expect(parseRoute('#/project/p1')).toEqual({ view: 'project', projectId: 'p1', blockKey: null });
    expect(parseRoute('#/project/p%201/block/b2')).toEqual({ view: 'project', projectId: 'p 1', blockKey: 'b2' });
    expect(parseRoute('#/nowhere')).toEqual({ view: 'library' });
    expect(parseRoute('#/project/')).toEqual({ view: 'library' });
  });

  it('writes routes that parse back', () => {
    for (const route of [{ view: 'library' }, { view: 'project', projectId: 'a/b c', blockKey: null }, { view: 'project', projectId: 'p', blockKey: 'b1' }] as const) {
      expect(parseRoute(routeHash(route))).toEqual(route);
    }
  });

  it('shows the library at #/ and opens a project from it', async () => {
    const { store } = setup('#/');
    expect(screen.getByRole('heading', { name: 'Library view' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open p1' }));
    expect(await screen.findByRole('heading', { name: /^Workspace p1/ })).toBeInTheDocument();
    expect(store.getSnapshot().projectId).toBe('p1');
    expect(window.location.hash).toBe('#/project/p1/block/b1');
  });

  it('opens the block named in the route', async () => {
    setup('#/project/p1/block/b2');
    expect(await screen.findByRole('heading', { name: 'Workspace p1 open b2' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/project/p1/block/b2');
  });

  it('keeps the route in step with the open block', async () => {
    const { store } = setup('#/project/p1');
    await screen.findByRole('heading', { name: 'Workspace p1 open b1' });
    act(() => store.openBlock('b2'));
    expect(window.location.hash).toBe('#/project/p1/block/b2');
  });

  it('a stale block key opens the project at its first block', async () => {
    setup('#/project/p1/block/b99');
    expect(await screen.findByRole('heading', { name: 'Workspace p1 open b1' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/project/p1/block/b1');
  });

  it('a block opened right after the project loads settles on that block, not in a route loop', async () => {
    const { store } = setup('#/project/p1');
    await screen.findByRole('heading', { name: 'Workspace p1 open b1' });
    act(() => store.openBlock('b2'));
    expect(await screen.findByRole('heading', { name: 'Workspace p1 open b2' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/project/p1/block/b2');
  });

  it('an unknown project shows the library with a notice', async () => {
    const { notices } = setup('#/project/missing');
    expect(await screen.findByRole('heading', { name: 'Library view' })).toBeInTheDocument();
    expect(notices.list().map((n) => n.messageKey)).toEqual(['notice.unknownProject']);
    expect(screen.getByText(t('notice.unknownProject'))).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
  });

  it('going back to the library closes the project', async () => {
    const { store } = setup('#/project/p1');
    await screen.findByRole('heading', { name: /^Workspace p1/ });
    act(() => {
      window.location.hash = '#/';
    });
    expect(await screen.findByRole('heading', { name: 'Library view' })).toBeInTheDocument();
    await waitFor(() => expect(store.getSnapshot().projectId).toBeNull());
  });
});

describe('unsupported browser (FR-019/AC1, VO-136)', () => {
  it('every route shows only the unsupported-browser message', () => {
    const { loadProject } = setup('#/project/p1', { supported: false });
    expect(screen.getByText(t('app.unsupportedBrowser'))).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Library view' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Workspace/ })).toBeNull();
    expect(loadProject).not.toHaveBeenCalled();
  });
});

describe('renderer start (FR-017/AC2)', () => {
  it('reports the editor interactive once, after it has rendered', async () => {
    const onInteractive = vi.fn(() => {
      // By the time the renderer may start, the editor is already on screen.
      expect(screen.getByRole('heading', { name: 'Library view' })).toBeInTheDocument();
    });
    setup('#/', { onInteractive });
    await waitFor(() => expect(onInteractive).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Open p1' }));
    await screen.findByRole('heading', { name: /^Workspace p1/ });
    expect(onInteractive).toHaveBeenCalledTimes(1);
  });

  it('reports interactive once under StrictMode, whose effects run twice', async () => {
    const onInteractive = vi.fn();
    setup('#/project/p1', { onInteractive, strict: true });
    await screen.findByRole('heading', { name: /^Workspace p1/ });
    await waitFor(() => expect(onInteractive).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(onInteractive).toHaveBeenCalledTimes(1);
  });

  it('does not report interactive for the unsupported-browser screen', async () => {
    const onInteractive = vi.fn();
    setup('#/', { supported: false, onInteractive });
    await new Promise((r) => setTimeout(r, 20));
    expect(onInteractive).not.toHaveBeenCalled();
  });

  it('deferEngine starts no renderer until released, then forwards what was posted', () => {
    const posted: ToWorker[] = [];
    let replies: ((m: FromWorker) => void) | null = null;
    const real: EngineFactory = vi.fn((onMessage) => {
      replies = onMessage;
      const engine: RenderEngine = { post: (m) => posted.push(m), terminate: vi.fn() };
      return engine;
    });
    const deferred = deferEngine(real);
    const received: FromWorker[] = [];
    const engine = deferred.createEngine((m) => received.push(m));
    engine.post({ type: 'render', id: 1, lines: 'x' });
    expect(real).not.toHaveBeenCalled();
    expect(deferred.released).toBe(false);

    deferred.release();
    expect(real).toHaveBeenCalledTimes(1);
    expect(posted).toEqual([{ type: 'render', id: 1, lines: 'x' }]);
    replies!({ type: 'ready' });
    expect(received).toEqual([{ type: 'ready' }]);

    // After release, new engines start at once.
    deferred.createEngine(() => {});
    expect(real).toHaveBeenCalledTimes(2);
  });

  it('an engine terminated before release never starts', () => {
    const real: EngineFactory = vi.fn(() => ({ post: () => {}, terminate: () => {} }));
    const deferred = deferEngine(real);
    const engine = deferred.createEngine(() => {});
    engine.post({ type: 'render', id: 1, lines: 'x' });
    engine.terminate();
    deferred.release();
    expect(real).not.toHaveBeenCalled();
  });
});
