// The application entry (T047; contracts/ui.md §1, FR-017/AC2, FR-019).
//
// 1. Every story's `register.tsx` is imported eagerly, so its slot contributions are in place before the
//    first render (tasks.md "One owner per file").
// 2. The browser is checked; an unsupported one sees only the unsupported-browser message (FR-019/AC1).
// 3. The render queue is created with its renderer held back: the worker starts only once the editor is on
//    screen and idle (FR-017/AC2). Edits never wait for it.
// 4. The store saves each project as one record (R-5); the database opens on first use.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import './ui/app/app.css';
import { detectBrowserSupport } from './services/browser-support.ts';
import { createWorkerEngine, RenderQueue } from './services/render/render-queue.ts';
import { getProject, listProjects, openEditorDb, putProject, type EditorDatabase } from './services/storage/db.ts';
import { App, deferEngine, type AppViews } from './ui/app/App.tsx';
import { createStore } from './ui/app/store.ts';
import { Library, type LibraryStorage } from './ui/library/Library.tsx';
import { Workspace } from './ui/workspace/Workspace.tsx';
import { bindExportRenders } from './ui/export/register.tsx';
import { useProjectReadOnly } from './ui/storage/register.tsx';

import.meta.glob('./**/register.tsx', { eager: true });

let db: Promise<EditorDatabase> | null = null;
const database = (): Promise<EditorDatabase> => (db ??= openEditorDb());

const storage: LibraryStorage = {
  list: async () => listProjects(await database()),
  put: async (record) => putProject(await database(), record),
};

const renderer = deferEngine(createWorkerEngine);
const renderQueue = new RenderQueue({ createEngine: renderer.createEngine });
const store = createStore({ write: storage.put, renderQueue });
// Toolbar contributions have no prop path to the queue; image export reads it from this binding.
bindExportRenders(renderQueue);

const views: AppViews = {
  Library: ({ onOpen }) => <Library storage={storage} onOpen={onOpen} />,
  Workspace: ({ projectId }) => <Workspace renderQueue={renderQueue} readOnly={useProjectReadOnly(projectId)} />,
};

function startRenderer(): void {
  renderer.release();
  renderQueue.start();
}

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto">
      <App
        support={detectBrowserSupport()}
        store={store}
        loadProject={async (id) => getProject(await database(), id)}
        views={views}
        onInteractive={startRenderer}
      />
    </MantineProvider>
  </StrictMode>,
);
