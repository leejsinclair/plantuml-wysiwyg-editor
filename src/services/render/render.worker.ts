// The render worker (R-1, contracts/core-api.md §7, spike-renderer.md amendment). It runs the official
// in-browser PlantUML engine, @plantuml/core 1.2026.9, off the main thread, so a slow or stuck render never
// blocks editing; the render queue terminates it after 10 s and starts a new one.
//
// Start-up order matters:
//   1. `self.window = self`: openiconic.js and emoji.js assign to `window.*`.
//   2. Both loaders refuse by calling `err` (`return false` would fall back to a script tag, which a worker
//      does not have). `PLANTUML_STDLIB_BASE` is never set, so nothing is fetched from anywhere (FR-017/AC3).
//   3. viz-global.js, themes.js, openiconic.js and emoji.js are classic scripts. A module worker has no
//      `importScripts`, so each is fetched from the app's own build and run with an indirect eval.
//   4. The DOM shim goes in after those scripts (viz-global.js treats a defined `document` as a page).
//   5. `PLANTUML_VIZ` points at Viz, then plantuml.js (an ES module) is imported and `ready` is posted.
// All five files are `?url` assets, emitted untouched and precached by the service worker (R-10).

import plantumlUrl from '@plantuml/core/plantuml.js?url';
import vizUrl from '@plantuml/core/viz-global.js?url';
import themesUrl from '@plantuml/core/themes.js?url';
import openiconicUrl from '@plantuml/core/openiconic.js?url';
import emojiUrl from '@plantuml/core/emoji.js?url';
import { installDomShim } from './dom-shim.ts';

export type ToWorker = { type: 'render'; id: number; lines: string };
export type FromWorker =
  | { type: 'ready' }
  | { type: 'svg'; id: number; svg: string } // unsanitised; the main thread runs sanitize()
  | { type: 'error'; id: number; message: string }; // the renderer's own message, shown as a rendering problem

interface Engine {
  renderToString(
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (message: unknown) => void,
    options: { maxSvgSize: number },
  ): void;
}

type Loader = (...args: unknown[]) => void;

interface WorkerScope {
  window?: unknown;
  Viz?: unknown;
  PLANTUML_VIZ?: unknown;
  PLANTUML_STDLIB_LOADER?: Loader;
  PLANTUML_FILE_LOADER?: Loader;
  postMessage(message: FromWorker): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker>) => void): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.window = scope;
// (url, ok, err) and (path, from, ok, err, options): every include, stdlib or file, is refused.
scope.PLANTUML_STDLIB_LOADER = (url, _ok, err) => (err as (m: string) => void)(`Include refused: ${String(url)}`);
scope.PLANTUML_FILE_LOADER = (path, _from, _ok, err) => (err as (m: string) => void)(`Include refused: ${String(path)}`);

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.text();
}

async function start(): Promise<Engine> {
  const scripts = await Promise.all([vizUrl, themesUrl, openiconicUrl, emojiUrl].map(fetchText));
  const globalEval = eval;
  scripts.forEach((code, i) => globalEval(`${code}\n//# sourceURL=${[vizUrl, themesUrl, openiconicUrl, emojiUrl][i]}`));
  installDomShim(scope);
  scope.PLANTUML_VIZ = scope.Viz;
  return (await import(/* @vite-ignore */ plantumlUrl)) as Engine;
}

const engine = start();

engine.then(
  () => scope.postMessage({ type: 'ready' }),
  () => {
    // Each request then reports the failure; the queue shows it as a rendering problem.
  },
);

const renderOne = async ({ id, lines }: ToWorker): Promise<void> => {
  let loaded: Engine;
  try {
    loaded = await engine;
  } catch (e) {
    scope.postMessage({ type: 'error', id, message: `The renderer could not start: ${messageOf(e)}` });
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const reply = (message: FromWorker): void => {
      if (settled) return;
      settled = true;
      scope.postMessage(message);
      resolve();
    };
    try {
      loaded.renderToString(
        lines.split(/\r\n|\r|\n/),
        (svg) => reply({ type: 'svg', id, svg }),
        (message) => reply({ type: 'error', id, message: messageOf(message) }),
        { maxSvgSize: 0 },
      );
    } catch (e) {
      reply({ type: 'error', id, message: messageOf(e) });
    }
  });
};

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// One request at a time: a request that arrives during another waits for it.
let queue: Promise<void> = Promise.resolve();
scope.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type !== 'render') return;
  queue = queue.then(() => renderOne(message));
});
