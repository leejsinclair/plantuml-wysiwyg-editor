// One editing tab per project (R-5, data-model §6.6 and §7.4, FR-006/AC12, AC16, FR-007/AC7).
//
//   open project ──lock acquired──> editing
//   open project ──lock held elsewhere──> readOnly
//   readOnly ──"Edit here instead"──> handingOver
//   handingOver ──other tab flushes, clears its history, releases the lock──> load latest record ──> editing
//   editing ──handover request received──> readOnly ──flush, clear history, release the lock
//   any ──deleted in another tab──> deletedElsewhere
//   any ──renamed in another tab──> same role, name updated
//
// Holding the Web Lock named by the project id means this tab edits the project. It is requested with
// `ifAvailable`, so a second tab learns at once that it is read-only. "Edit here instead" sends a handover
// request and then waits for the lock: the editing tab releases it only after its pending edits are written,
// so the latest stored version is what the new editing tab loads. A crashed or closed tab releases its lock
// automatically. The "plantuml-editor" BroadcastChannel also carries renames and deletions from the library.

export type TabRole = 'editing' | 'readOnly' | 'handingOver' | 'deletedElsewhere';

export type TabMessage =
  | { readonly type: 'project-renamed'; readonly projectId: string; readonly name: string }
  | { readonly type: 'project-deleted'; readonly projectId: string }
  | { readonly type: 'handover-request'; readonly projectId: string }
  | { readonly type: 'handover-flushed'; readonly projectId: string };

export const CHANNEL_NAME = 'plantuml-editor';

/** The part of `navigator.locks` used here. */
export interface LockManagerLike {
  request(name: string, options: { ifAvailable?: boolean }, callback: (lock: unknown) => unknown): Promise<unknown>;
}

/** The part of `BroadcastChannel` used here. */
export interface ChannelLike {
  postMessage(message: TabMessage): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}

/** What the tab protocol asks of the open project. */
export interface ProjectTabHooks {
  /** Writes every pending edit; resolves `true` when nothing is left unwritten. */
  flush(): Promise<boolean>;
  /** Empties the undo history (both tabs' histories are empty after a handover). */
  clearHistory(): void;
  /** Loads the latest stored record into this tab before it starts editing. */
  loadLatest(): Promise<void>;
  onRenamed?(name: string): void;
  onDeleted?(): void;
}

export interface ProjectTab {
  readonly projectId: string;
  /** `null` while the lock is being requested. */
  getRole(): TabRole | null;
  subscribe(listener: () => void): () => void;
  /** "Edit here instead": moves editing to this tab. */
  editHere(): Promise<void>;
  /** This view no longer shows the project; the lock is released unless it is opened again at once. */
  close(): void;
}

export interface Tabs {
  /** Starts (or rejoins) this tab's session for a project. */
  open(projectId: string, hooks: ProjectTabHooks): ProjectTab;
  /** Tells every other tab, for example after a rename or deletion in the library. */
  broadcast(message: TabMessage): void;
  /** This tab's session for a project, if one is open. */
  find(projectId: string): ProjectTab | null;
  /** Every tab message received from other tabs (the library refreshes on renames and deletions). */
  onMessage(listener: (message: TabMessage) => void): () => void;
  dispose(): void;
}

export interface TabsOptions {
  /** `null` where the browser has no Web Locks: every tab edits. */
  readonly locks: LockManagerLike | null;
  readonly channel: ChannelLike | null;
  /** How long a closed session waits before releasing its lock, so a remounted view keeps it. */
  readonly releaseDelayMs?: number;
}

const TYPES = new Set(['project-renamed', 'project-deleted', 'handover-request', 'handover-flushed']);

function isTabMessage(data: unknown): data is TabMessage {
  if (typeof data !== 'object' || data === null) return false;
  const m = data as { type?: unknown; projectId?: unknown; name?: unknown };
  if (typeof m.type !== 'string' || !TYPES.has(m.type) || typeof m.projectId !== 'string') return false;
  return m.type !== 'project-renamed' || typeof m.name === 'string';
}

interface Entry {
  readonly projectId: string;
  hooks: ProjectTabHooks;
  role: TabRole | null;
  refs: number;
  release: (() => void) | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  ended: boolean;
  readonly listeners: Set<() => void>;
  readonly tab: ProjectTab;
}

/** The browser's own Web Locks and channel, where they exist. */
export function browserTabsOptions(): TabsOptions {
  const locks = typeof navigator !== 'undefined' ? ((navigator as { locks?: LockManagerLike }).locks ?? null) : null;
  const channel = typeof BroadcastChannel === 'undefined' ? null : (new BroadcastChannel(CHANNEL_NAME) as unknown as ChannelLike);
  return { locks, channel };
}

export function createTabs(options: TabsOptions): Tabs {
  const { locks, channel } = options;
  const releaseDelayMs = options.releaseDelayMs ?? 50;
  const entries = new Map<string, Entry>();
  const messageListeners = new Set<(message: TabMessage) => void>();

  const setRole = (entry: Entry, role: TabRole): void => {
    if (entry.role === role) return;
    entry.role = role;
    for (const l of [...entry.listeners]) l();
  };

  const releaseLock = (entry: Entry): void => {
    const release = entry.release;
    entry.release = null;
    release?.();
  };

  /** Requests the lock; resolves `true` once it is held. With `wait`, queues until the holder releases it. */
  const acquire = (entry: Entry, wait: boolean): Promise<boolean> =>
    new Promise((resolve) => {
      if (!locks) {
        resolve(true);
        return;
      }
      locks
        .request(entry.projectId, wait ? {} : { ifAvailable: true }, (lock) => {
          if (!lock || entry.ended) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          return new Promise<void>((release) => {
            entry.release = release;
          });
        })
        .catch(() => resolve(false));
    });

  const post = (message: TabMessage): void => {
    try {
      channel?.postMessage(message);
    } catch {
      // A closed channel: other tabs are not told, which only delays their update until reload.
    }
  };

  async function handOver(entry: Entry): Promise<void> {
    if (entry.role !== 'editing') return;
    // Read-only first, so no edit is made between the flush and the release.
    setRole(entry, 'readOnly');
    let flushed: boolean;
    try {
      flushed = await entry.hooks.flush();
    } catch {
      flushed = false;
    }
    if (!flushed) {
      // The pending edits could not be written: editing stays here rather than losing them.
      setRole(entry, 'editing');
      return;
    }
    entry.hooks.clearHistory();
    releaseLock(entry);
    post({ type: 'handover-flushed', projectId: entry.projectId });
  }

  const onChannelMessage = (event: { data: unknown }): void => {
    const message = event.data;
    if (!isTabMessage(message)) return;
    for (const l of [...messageListeners]) l(message);
    const entry = entries.get(message.projectId);
    if (!entry || entry.ended) return;
    switch (message.type) {
      case 'handover-request':
        void handOver(entry);
        break;
      case 'project-renamed':
        entry.hooks.onRenamed?.(message.name);
        break;
      case 'project-deleted':
        releaseLock(entry);
        setRole(entry, 'deletedElsewhere');
        entry.hooks.onDeleted?.();
        break;
      case 'handover-flushed':
        // The waiting lock request is granted by the release itself.
        break;
    }
  };
  channel?.addEventListener('message', onChannelMessage);

  function end(entry: Entry): void {
    entry.ended = true;
    if (entry.releaseTimer !== null) clearTimeout(entry.releaseTimer);
    releaseLock(entry);
    entry.listeners.clear();
    if (entries.get(entry.projectId) === entry) entries.delete(entry.projectId);
  }

  function start(projectId: string, hooks: ProjectTabHooks): Entry {
    const entry: Entry = {
      projectId, hooks, role: null, refs: 0, release: null, releaseTimer: null, ended: false, listeners: new Set(),
      tab: {
        projectId,
        getRole: () => entry.role,
        subscribe(listener) {
          entry.listeners.add(listener);
          return () => entry.listeners.delete(listener);
        },
        async editHere() {
          if (entry.ended || (entry.role !== 'readOnly')) return;
          setRole(entry, 'handingOver');
          post({ type: 'handover-request', projectId });
          const held = await acquire(entry, true);
          if (!held || entry.ended) return;
          await entry.hooks.loadLatest();
          entry.hooks.clearHistory();
          setRole(entry, 'editing');
        },
        close() {
          if (entry.ended) return;
          entry.refs = Math.max(0, entry.refs - 1);
          if (entry.refs > 0) return;
          if (entry.releaseTimer !== null) clearTimeout(entry.releaseTimer);
          entry.releaseTimer = setTimeout(() => {
            entry.releaseTimer = null;
            if (entry.refs === 0) end(entry);
          }, releaseDelayMs);
        },
      },
    };
    if (!locks) entry.role = 'editing';
    else
      void acquire(entry, false).then((held) => {
        if (!entry.ended && entry.role === null) setRole(entry, held ? 'editing' : 'readOnly');
      });
    return entry;
  }

  return {
    open(projectId, hooks) {
      // One project at a time per view: a session for another project is ended once its view lets go.
      let entry = entries.get(projectId);
      if (!entry || entry.ended) {
        entry = start(projectId, hooks);
        entries.set(projectId, entry);
      }
      entry.hooks = hooks;
      entry.refs += 1;
      if (entry.releaseTimer !== null) {
        clearTimeout(entry.releaseTimer);
        entry.releaseTimer = null;
      }
      return entry.tab;
    },
    find: (projectId) => {
      const entry = entries.get(projectId);
      return entry && !entry.ended ? entry.tab : null;
    },
    broadcast: post,
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    dispose() {
      for (const entry of [...entries.values()]) end(entry);
      messageListeners.clear();
      channel?.removeEventListener('message', onChannelMessage);
      channel?.close();
    },
  };
}
