// The render queue (R-1, contracts/core-api.md §7, data-model §6.7 and §7.1, spec section 4.2).
//
// - Requests never wait: `request()` records the block's text and returns; rendering happens in the worker.
// - One request at a time, the open block first, then the others in the order they were first requested.
// - After 10 s with no reply, the renderer is terminated, the block is reported "Not yet checked" (outcome
//   `timedOut`), a new renderer is started and the queue goes on (FR-017/AC5, EC-13).
// - A block that depends on `!include` or another external file is never sent (FR-017/AC3). A block that is
//   invalid under the editor's grammar (category 3) is not sent once it has a previous render. In both cases
//   the last render is kept and shown out of date (section 4.2 "Preview"). A block with no previous render may
//   be rendered; the preview labels it as not checked by the editor.
// - An `svg` reply that is a PlantUML error image is a failure, with its line and message (spike criterion 5).
// - Per block it keeps the latest result and the last `ok` result. Results are not stored.
// - The renderer is substitutable (VO-072): anything that offers `RenderEngine` can stand in for the worker.

import type { RenderStatus, SourceCategory } from '../../core/types.ts';
import type { FromWorker, ToWorker } from './render.worker.ts';
import { sanitizeSvg } from './sanitize.ts';

export const RENDER_TIMEOUT_MS = 10_000;

/** The renderer as the queue sees it: the worker's message interface. */
export interface RenderEngine {
  post(message: ToWorker): void;
  terminate(): void;
}

/** Starts a renderer that delivers its replies to `onMessage`. */
export type EngineFactory = (onMessage: (message: FromWorker) => void) => RenderEngine;

/** The production renderer: `render.worker.ts` in a module worker. */
export const createWorkerEngine: EngineFactory = (onMessage) => {
  const worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module', name: 'plantuml-render' });
  worker.onmessage = (event: MessageEvent<FromWorker>) => onMessage(event.data);
  return {
    post: (message) => worker.postMessage(message),
    terminate: () => worker.terminate(),
  };
};

export interface RenderRequest {
  readonly key: string;
  /** The block's whole text, start and end lines included. */
  readonly text: string;
  /** From the editor's grammar; `null` for other content, whose validity only the renderer reports. */
  readonly category: SourceCategory | null;
  /** Uses `!include` or another URL or file reference (detected without rendering). */
  readonly dependsOnExternal: boolean;
}

export type RenderOutcome = 'ok' | 'failed' | 'timedOut';

/** data-model §6.7. */
export type RenderResult =
  | { readonly blockKey: string; readonly text: string; readonly outcome: 'ok'; readonly svg: string }
  | {
      readonly blockKey: string;
      readonly text: string;
      readonly outcome: 'failed';
      readonly message: string;
      /** 1-based line within the block, when the renderer gives one. */
      readonly line: number | null;
    }
  | { readonly blockKey: string; readonly text: string; readonly outcome: 'timedOut' };

/** What the preview, export and project panel read for one block. */
export interface BlockRender {
  /** The block's current text, as last requested. */
  readonly text: string;
  readonly latest: RenderResult | null;
  readonly lastOk: (RenderResult & { outcome: 'ok' }) | null;
  /** "Not yet checked" unless the latest result is for the current text and finished in time. */
  readonly status: RenderStatus;
  /** The last good image is not of the current text, so it is shown marked out of date (FR-005/AC6). */
  readonly outOfDate: boolean;
  /** The current text is not sent: it is invalid with a previous render, or depends on `!include`. */
  readonly skipped: boolean;
  /** The current text is waiting or being rendered. */
  readonly pending: boolean;
}

export interface RenderQueueOptions {
  readonly createEngine?: EngineFactory;
  /** Runs on every successful image before it is kept (R-8). */
  readonly sanitize?: (svg: string) => string;
  readonly timeoutMs?: number;
}

interface BlockRecord {
  text: string;
  latest: RenderResult | null;
  lastOk: (RenderResult & { outcome: 'ok' }) | null;
  skipped: boolean;
  snapshot: BlockRender | null;
}

interface Job {
  readonly id: number;
  readonly key: string;
  readonly text: string;
  readonly generation: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

// ------------------------------------------------------------------------------------- error images

const ENTITIES: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function textsOf(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeEntities(m[1]!.replace(/<[^>]*>/g, '')));
}

/**
 * Reads a PlantUML error image (spike-renderer.md criterion 5). Two shapes are failures:
 * - the first text starts `PlantUML version` and the second holds `(line N)`; the message is the last text;
 * - the first text starts `An error has occurred`, which is also the message; there is no line.
 * Anything else is an ordinary diagram and gives `null`, even when its labels use those words later on.
 */
export function readErrorImage(svg: string): { message: string; line: number | null } | null {
  const texts = textsOf(svg);
  const first = texts[0]?.trim() ?? '';
  if (first.startsWith('An error has occurred')) return { message: first, line: null };
  if (first.startsWith('PlantUML version')) {
    const lineMatch = /\(line (\d+)\)/.exec(texts[1] ?? '');
    if (!lineMatch) return null;
    const message = texts.slice(2).reverse().find((t) => t.trim() !== '')?.trim() ?? '';
    return { message, line: Number(lineMatch[1]) };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- queue

export class RenderQueue {
  readonly #createEngine: EngineFactory;
  readonly #sanitize: (svg: string) => string;
  readonly #timeoutMs: number;

  #engine: RenderEngine | null = null;
  #ready = false;
  #disposed = false;
  #nextId = 1;
  #generation = 0;
  #inFlight: Job | null = null;
  /** Waiting blocks and the text to render, in first-requested order. */
  readonly #waiting = new Map<string, string>();
  readonly #blocks = new Map<string, BlockRecord>();
  #openKey: string | null = null;
  readonly #listeners = new Set<(key: string | null) => void>();

  constructor(options: RenderQueueOptions = {}) {
    this.#createEngine = options.createEngine ?? createWorkerEngine;
    this.#sanitize = options.sanitize ?? sanitizeSvg;
    this.#timeoutMs = options.timeoutMs ?? RENDER_TIMEOUT_MS;
  }

  /** Records a block's current text and queues a render when one is due. Never waits. */
  request({ key, text, category, dependsOnExternal }: RenderRequest): void {
    if (this.#disposed) return;
    let record = this.#blocks.get(key);
    if (!record) {
      record = { text, latest: null, lastOk: null, skipped: false, snapshot: null };
      this.#blocks.set(key, record);
    }
    const hasPrevious = record.latest !== null || record.lastOk !== null;
    record.text = text;
    record.skipped = dependsOnExternal || (category === 3 && hasPrevious);
    record.snapshot = null;

    const inFlight = this.#inFlight?.key === key && this.#inFlight.text === text;
    const done = record.latest?.text === text && record.latest.outcome !== 'timedOut';
    if (record.skipped || inFlight || done) this.#waiting.delete(key);
    else this.#waiting.set(key, text);

    this.#notify(key);
    this.#pump();
  }

  /** The block open in the workspace renders before the others. */
  setOpenBlock(key: string | null): void {
    this.#openKey = key;
  }

  /** Forgets a block (deleted, or no longer in the project). A render in flight for it is ignored. */
  remove(key: string): void {
    this.#waiting.delete(key);
    if (this.#blocks.delete(key)) this.#notify(key);
  }

  /** Forgets every block, for example when another project opens. */
  clear(): void {
    this.#generation++;
    this.#waiting.clear();
    this.#blocks.clear();
    this.#openKey = null;
    this.#notify(null);
  }

  /** Starts the renderer ahead of the first request, so it is warm. */
  start(): void {
    if (!this.#disposed && !this.#engine) this.#engine = this.#startEngine();
  }

  /** Stops all work and terminates the renderer. */
  dispose(): void {
    this.#disposed = true;
    if (this.#inFlight) clearTimeout(this.#inFlight.timer);
    this.#inFlight = null;
    this.#waiting.clear();
    this.#engine?.terminate();
    this.#engine = null;
    this.#ready = false;
    for (const record of this.#blocks.values()) record.snapshot = null;
    this.#listeners.clear();
  }

  /** True once the current renderer has said it is ready. */
  isReady(): boolean {
    return this.#ready;
  }

  /** The block's render state, or `null` for a block never requested. Stable until the block changes. */
  get(key: string): BlockRender | null {
    const record = this.#blocks.get(key);
    if (!record) return null;
    record.snapshot ??= snapshotOf(record, this.#waiting.has(key) || this.#inFlight?.key === key && this.#inFlight.text === record.text);
    return record.snapshot;
  }

  /** Calls `listener` with the key of each block that changed, or `null` for a queue-wide change. */
  subscribe(listener: (key: string | null) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  // ----------------------------------------------------------------------------------------- internals

  #notify(key: string | null): void {
    for (const listener of [...this.#listeners]) listener(key);
  }

  #changed(key: string): void {
    const record = this.#blocks.get(key);
    if (!record) return;
    record.snapshot = null;
    this.#notify(key);
  }

  #startEngine(): RenderEngine {
    this.#ready = false;
    const engine: RenderEngine = this.#createEngine((message) => this.#receive(engine, message));
    return engine;
  }

  #pump(): void {
    if (this.#disposed || this.#inFlight || this.#waiting.size === 0) return;
    const key = this.#openKey !== null && this.#waiting.has(this.#openKey) ? this.#openKey : this.#waiting.keys().next().value!;
    const text = this.#waiting.get(key)!;
    this.#waiting.delete(key);
    this.#engine ??= this.#startEngine();
    const id = this.#nextId++;
    const timer = setTimeout(() => this.#timeOut(id), this.#timeoutMs);
    this.#inFlight = { id, key, text, generation: this.#generation, timer };
    this.#engine.post({ type: 'render', id, lines: text });
  }

  #receive(engine: RenderEngine, message: FromWorker): void {
    if (this.#disposed || engine !== this.#engine) return; // a terminated renderer's late reply
    if (message.type === 'ready') {
      this.#ready = true;
      this.#notify(null);
      return;
    }
    const job = this.#inFlight;
    if (!job || message.id !== job.id) return;
    clearTimeout(job.timer);
    const base = { blockKey: job.key, text: job.text };
    let result: RenderResult;
    if (message.type === 'error') {
      result = { ...base, outcome: 'failed', message: message.message, line: null };
    } else {
      const failure = readErrorImage(message.svg);
      result = failure
        ? { ...base, outcome: 'failed', message: failure.message, line: failure.line }
        : { ...base, outcome: 'ok', svg: this.#sanitize(message.svg) };
    }
    this.#finish(job, result);
  }

  #timeOut(id: number): void {
    const job = this.#inFlight;
    if (this.#disposed || !job || job.id !== id) return;
    this.#engine?.terminate();
    this.#engine = this.#startEngine();
    this.#finish(job, { blockKey: job.key, text: job.text, outcome: 'timedOut' });
  }

  #finish(job: Job, result: RenderResult): void {
    this.#inFlight = null;
    const record = job.generation === this.#generation ? this.#blocks.get(job.key) : undefined;
    if (record) {
      record.latest = result;
      if (result.outcome === 'ok') record.lastOk = result;
      this.#changed(job.key);
    }
    this.#pump();
  }
}

function snapshotOf(record: BlockRecord, pending: boolean): BlockRender {
  const { text, latest, lastOk, skipped } = record;
  const current = latest !== null && latest.text === text;
  const status: RenderStatus =
    current && latest.outcome === 'ok' ? 'rendered' : current && latest.outcome === 'failed' ? 'failed' : 'Not yet checked';
  return Object.freeze({
    text,
    latest,
    lastOk,
    status,
    outOfDate: lastOk !== null && lastOk.text !== text,
    skipped,
    pending,
  });
}
