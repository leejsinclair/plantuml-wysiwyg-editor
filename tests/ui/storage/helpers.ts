// Shared set-up for the US2 storage UI tests: an in-memory IndexedDB, a tabs service without Web Locks, notices,
// and a recorded download.
import { vi } from 'vitest';
import { openEditorDb, type ProjectRecord } from '../../../src/services/storage/db.ts';
import { dbProjectStore } from '../../../src/services/storage/library-ops.ts';
import { createTabs, type ChannelLike, type LockManagerLike, type TabMessage } from '../../../src/services/storage/tabs.ts';
import { createNotices } from '../../../src/ui/notices/Notices.tsx';
import { createStorageSession, type StorageUi } from '../../../src/ui/storage/StorageNotices.tsx';

let dbs = 0;
let ids = 0;

export const NOW = '2026-10-28T09:00:00.000Z';

export interface Saved {
  readonly fileName: string;
  readonly blob: Blob;
}

export function record(over: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'p1', name: 'Shop', source: '@startsalt Home\n{\n  [OK]\n}\n@endsalt\n', flowIndex: null, lastWorking: [],
    createdAt: '2026-10-01T09:00:00.000Z', modifiedAt: '2026-10-02T09:00:00.000Z', revision: 3,
    downloadedAt: null, downloadedRevision: null, ...over,
  };
}

export function makeUi(over: Partial<StorageUi> = {}) {
  const db = openEditorDb(`storage-ui-${++dbs}`);
  const projects = dbProjectStore(() => db);
  const tabs = createTabs({ locks: null, channel: null });
  const broadcast = vi.spyOn(tabs, 'broadcast');
  const announce = vi.fn();
  const notices = createNotices({ announce: vi.fn() });
  const saved: Saved[] = [];
  const ui: StorageUi = {
    projects,
    tabs,
    notices,
    announce,
    now: () => NOW,
    today: () => '2026-10-28',
    newId: () => `new-${++ids}`,
    save: (blob, fileName) => {
      saved.push({ blob, fileName });
    },
    pickFile: vi.fn(async () => null),
    navigate: vi.fn(),
    persistence: vi.fn(async () => ({ persisted: true, privateWindow: false })),
    session: createStorageSession(),
    ...over,
  };
  return { ui, projects, tabs, broadcast, announce, notices, saved, db };
}

export async function blobText(blob: Blob): Promise<string> {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blobBytes(blob));
}

export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Web Locks for one origin: exclusive; `ifAvailable` gives null when held; other requests queue. */
export class FakeLocks implements LockManagerLike {
  private held = new Set<string>();
  private queues = new Map<string, (() => void)[]>();
  request(name: string, options: { ifAvailable?: boolean }, callback: (lock: unknown) => unknown): Promise<unknown> {
    const run = async (): Promise<unknown> => {
      this.held.add(name);
      try {
        return await callback({ name });
      } finally {
        this.held.delete(name);
        this.queues.get(name)?.shift()?.();
      }
    };
    if (!this.held.has(name)) return run();
    if (options.ifAvailable) return Promise.resolve(callback(null));
    return new Promise((resolve) => {
      const q = this.queues.get(name) ?? [];
      q.push(() => resolve(run()));
      this.queues.set(name, q);
    });
  }
}

/** BroadcastChannels of one origin: a message reaches every other channel, never the sender. */
export class FakeHub {
  private channels = new Set<ChannelLike & { deliver(data: unknown): void }>();
  channel(): ChannelLike {
    const listeners = new Set<(e: { data: unknown }) => void>();
    const hub = this.channels;
    const c = {
      deliver: (data: unknown) => listeners.forEach((l) => l({ data })),
      postMessage(message: TabMessage) {
        for (const other of hub) if (other !== c) queueMicrotask(() => other.deliver(structuredClone(message)));
      },
      addEventListener: (_t: 'message', l: (e: { data: unknown }) => void) => void listeners.add(l),
      removeEventListener: (_t: 'message', l: (e: { data: unknown }) => void) => void listeners.delete(l),
      close: () => void hub.delete(c),
    };
    hub.add(c);
    return c;
  }
}
