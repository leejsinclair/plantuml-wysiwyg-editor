// Autosave (R-5, data-model §6.5 and §7.3, FR-006/AC1, AC7).
//
//   saved ──edit──> pending ──≤ 500 ms, or pagehide / visibilitychange──> saving
//   saving ──write committed──> saved
//   saving ──write failed──> failed (reported at once; previous record intact)
//   failed ──backoff 1 s, 2 s, 4 s, then 10 s──> saving
//   failed ──further edits──> failed (latest text kept in memory; the next retry writes it)
//
// The write itself is one IndexedDB transaction (db.ts `putProject`), so a failed write leaves the previous record.

import type { ProjectRecord } from './db.ts';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'failed';

/** Message keys for the storage failure notice (owned by the storage messages part, T090). */
export type SaveErrorKey = 'storage.failed.quota' | 'storage.failed';

/** data-model §6.5. */
export interface SaveState {
  status: SaveStatus;
  /** Failed attempts since the last successful write. */
  attempt: number;
  lastError: SaveErrorKey | null;
}

type Listener = (state: SaveState) => void;

export interface AutosaveOptions {
  /** Writes the whole record in one transaction; rejects on failure. */
  write: (record: ProjectRecord) => Promise<void>;
  /** Wait after the last change before writing. Capped at 500 ms (R-5). */
  debounceMs?: number;
  /** Delays before each retry; the last one repeats. Defaults to 1 s, 2 s, 4 s, then 10 s. */
  retryDelays?: readonly number[];
  onChange?: Listener;
  /** Receives `pagehide`. Defaults to the global window. */
  window?: EventTarget;
  /** Receives `visibilitychange`. Defaults to the global document. */
  document?: EventTarget & { visibilityState: DocumentVisibilityState };
}

export interface Autosave {
  /** Records the project's latest state; it is written within 500 ms, or on the next retry after a failure. */
  schedule(record: ProjectRecord): void;
  /** Writes any pending change now and resolves once nothing is being written. */
  flush(): Promise<SaveState>;
  getState(): SaveState;
  subscribe(listener: Listener): () => void;
  /** Stops timers and listeners. A change not yet written is dropped; call `flush` first to keep it. */
  dispose(): void;
}

export const MAX_DEBOUNCE_MS = 500;
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 10_000];

/** The wait before retry number `attempt` (1-based), given the schedule whose last entry repeats. */
export function retryDelay(attempt: number, delays: readonly number[] = RETRY_DELAYS_MS): number {
  return delays[Math.min(Math.max(attempt, 1), delays.length) - 1] ?? RETRY_DELAYS_MS.at(-1)!;
}

function errorKey(error: unknown): SaveErrorKey {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'QuotaExceededError' ? 'storage.failed.quota' : 'storage.failed';
}

export function createAutosave(options: AutosaveOptions): Autosave {
  const debounceMs = Math.min(Math.max(options.debounceMs ?? MAX_DEBOUNCE_MS, 0), MAX_DEBOUNCE_MS);
  const delays = options.retryDelays?.length ? options.retryDelays : RETRY_DELAYS_MS;
  const win = options.window ?? (typeof window === 'undefined' ? undefined : window);
  const doc = options.document ?? (typeof document === 'undefined' ? undefined : document);

  const listeners = new Set<Listener>();
  if (options.onChange) listeners.add(options.onChange);

  let state: SaveState = { status: 'saved', attempt: 0, lastError: null };
  /** The latest record not yet stored. */
  let pending: ProjectRecord | null = null;
  let inFlight: Promise<void> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function set(next: Partial<SaveState>): void {
    const merged = { ...state, ...next };
    if (merged.status === state.status && merged.attempt === state.attempt && merged.lastError === state.lastError) return;
    state = merged;
    for (const l of [...listeners]) l(state);
  }

  function clearDebounce(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  function clearRetry(): void {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  }

  /** Starts a write of the pending record unless one is already running (it then follows on). */
  function run(): void {
    clearDebounce();
    if (disposed || inFlight || pending === null) return;
    clearRetry();
    const record = pending;
    pending = null;
    set({ status: 'saving' });
    inFlight = options.write(record).then(
      () => {
        inFlight = null;
        if (disposed) return;
        set({ attempt: 0, lastError: null });
        if (pending === null) set({ status: 'saved' });
        else if (debounceTimer !== null) set({ status: 'pending' });
        else run();
      },
      (error: unknown) => {
        inFlight = null;
        if (disposed) return;
        // A newer edit made during the write supersedes the one that failed.
        pending ??= record;
        clearDebounce();
        const attempt = state.attempt + 1;
        set({ status: 'failed', attempt, lastError: errorKey(error) });
        retryTimer = setTimeout(() => {
          retryTimer = null;
          run();
        }, retryDelay(attempt, delays));
      },
    );
  }

  function schedule(record: ProjectRecord): void {
    if (disposed) return;
    pending = record;
    // While failed, the backoff timer writes the latest text; while saving, the next write follows this one.
    if (state.status === 'failed') return;
    clearDebounce();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      run();
    }, debounceMs);
    if (state.status !== 'saving') set({ status: 'pending' });
  }

  async function flush(): Promise<SaveState> {
    if (pending !== null && state.status !== 'failed') run();
    while (inFlight) await inFlight;
    return state;
  }

  const onPageHide = () => {
    if (pending !== null && state.status !== 'failed') run();
  };
  const onVisibility = () => {
    if (doc?.visibilityState === 'hidden') onPageHide();
  };
  win?.addEventListener('pagehide', onPageHide);
  doc?.addEventListener('visibilitychange', onVisibility);

  return {
    schedule,
    flush,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      clearDebounce();
      clearRetry();
      listeners.clear();
      win?.removeEventListener('pagehide', onPageHide);
      doc?.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
