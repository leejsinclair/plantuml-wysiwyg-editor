// T084: the tabs protocol with fake Web Locks and BroadcastChannel (VO-012 core, VO-081 core; R-5, data-model §6.6,
// §7.4, FR-006/AC12, AC16, FR-007/AC7).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabs, type ChannelLike, type LockManagerLike, type ProjectTabHooks, type TabMessage, type Tabs, type TabRole } from '../../../src/services/storage/tabs.ts';

/** Web Locks for one origin: exclusive, `ifAvailable` gives null when held, otherwise requests queue. */
class FakeLocks implements LockManagerLike {
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
  isHeld(name: string) {
    return this.held.has(name);
  }
}

/** A BroadcastChannel hub: a message reaches every other channel, never the sender. */
class FakeHub {
  channels = new Set<FakeChannel>();
  channel(): FakeChannel {
    const c = new FakeChannel(this);
    this.channels.add(c);
    return c;
  }
}
class FakeChannel implements ChannelLike {
  listeners = new Set<(e: { data: unknown }) => void>();
  constructor(private hub: FakeHub) {}
  postMessage(message: TabMessage): void {
    for (const c of this.hub.channels) if (c !== this) queueMicrotask(() => c.listeners.forEach((l) => l({ data: structuredClone(message) })));
  }
  addEventListener(_type: 'message', l: (e: { data: unknown }) => void) {
    this.listeners.add(l);
  }
  removeEventListener(_type: 'message', l: (e: { data: unknown }) => void) {
    this.listeners.delete(l);
  }
  close() {
    this.hub.channels.delete(this);
  }
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

function hooks(over: Partial<ProjectTabHooks> = {}) {
  const log: string[] = [];
  const h: ProjectTabHooks & { log: string[] } = {
    log,
    flush: vi.fn(async () => {
      log.push('flush');
      return true;
    }),
    clearHistory: vi.fn(() => log.push('clearHistory')),
    loadLatest: vi.fn(async () => {
      log.push('loadLatest');
    }),
    onRenamed: vi.fn(),
    onDeleted: vi.fn(),
    ...over,
  };
  return h;
}

let all: Tabs[] = [];
function setup() {
  const locks = new FakeLocks();
  const hub = new FakeHub();
  const tab = () => {
    const t = createTabs({ locks, channel: hub.channel(), releaseDelayMs: 0 });
    all.push(t);
    return t;
  };
  return { locks, hub, tab };
}
afterEach(() => {
  all.forEach((t) => t.dispose());
  all = [];
});

const roleOf = (p: { getRole(): TabRole | null }) => p.getRole();

describe('opening (FR-006/AC12)', () => {
  it('edits when the lock is free, and is read-only when another tab holds it', async () => {
    const { locks, tab } = setup();
    const a = tab().open('p1', hooks());
    await settle();
    expect(roleOf(a)).toBe('editing');
    expect(locks.isHeld('p1')).toBe(true);
    const b = tab().open('p1', hooks());
    await settle();
    expect(roleOf(b)).toBe('readOnly');
  });

  it('locks per project', async () => {
    const { tab } = setup();
    const a = tab().open('p1', hooks());
    const b = tab().open('p2', hooks());
    await settle();
    expect([roleOf(a), roleOf(b)]).toEqual(['editing', 'editing']);
  });

  it('edits at once where the browser has no Web Locks', () => {
    const t = createTabs({ locks: null, channel: null });
    all.push(t);
    expect(t.open('p1', hooks()).getRole()).toBe('editing');
  });

  it('releases the lock when closed, so another tab can then edit', async () => {
    const { locks, tab } = setup();
    const a = tab().open('p1', hooks());
    await settle();
    a.close();
    await settle();
    expect(locks.isHeld('p1')).toBe(false);
    const b = tab().open('p1', hooks());
    await settle();
    expect(roleOf(b)).toBe('editing');
  });

  it('keeps the lock when the same project is closed and reopened at once (a remounted view)', async () => {
    const { locks, tab } = setup();
    const t = tab();
    const first = t.open('p1', hooks());
    await settle();
    first.close();
    const again = t.open('p1', hooks());
    await settle();
    expect(roleOf(again)).toBe('editing');
    expect(locks.isHeld('p1')).toBe(true);
  });

  it('notifies subscribers when the role changes', async () => {
    const { tab } = setup();
    const a = tab().open('p1', hooks());
    const seen: (TabRole | null)[] = [];
    a.subscribe(() => seen.push(a.getRole()));
    await settle();
    expect(seen).toEqual(['editing']);
  });
});

describe('"Edit here instead" (VO-012 core, FR-006/AC12, FR-007/AC7)', () => {
  it('flushes and clears the editing tab, releases the lock, then loads the latest version here', async () => {
    const { tab } = setup();
    const order: string[] = [];
    const ha = hooks({
      flush: vi.fn(async () => {
        order.push('A flush');
        return true;
      }),
      clearHistory: vi.fn(() => order.push('A clear')),
    });
    const hb = hooks({
      loadLatest: vi.fn(async () => {
        order.push('B load');
      }),
      clearHistory: vi.fn(() => order.push('B clear')),
    });
    const a = tab().open('p1', ha);
    await settle();
    const b = tab().open('p1', hb);
    await settle();

    const done = b.editHere();
    expect(roleOf(b)).toBe('handingOver');
    await done;
    await settle();
    expect(roleOf(a)).toBe('readOnly');
    expect(roleOf(b)).toBe('editing');
    expect(order).toEqual(['A flush', 'A clear', 'B load', 'B clear']);
  });

  it('makes the editing tab read-only before it flushes, so no edit slips in', async () => {
    const { tab } = setup();
    let roleDuringFlush: TabRole | null = null;
    const a = tab().open('p1', hooks({
      flush: vi.fn(async () => {
        roleDuringFlush = a.getRole();
        return true;
      }),
    }));
    await settle();
    const b = tab().open('p1', hooks());
    await settle();
    await b.editHere();
    expect(roleDuringFlush).toBe('readOnly');
  });

  it('keeps editing in the first tab while its pending edits cannot be saved', async () => {
    const { tab } = setup();
    const a = tab().open('p1', hooks({ flush: vi.fn(async () => false) }));
    await settle();
    const b = tab().open('p1', hooks());
    await settle();
    void b.editHere();
    await settle();
    expect(roleOf(a)).toBe('editing');
    expect(roleOf(b)).toBe('handingOver');
  });

  it('takes over at once when the editing tab has gone', async () => {
    const { tab } = setup();
    const ta = tab();
    const a = ta.open('p1', hooks());
    await settle();
    const hb = hooks();
    const b = tab().open('p1', hb);
    await settle();
    a.close();
    await settle();
    await b.editHere();
    expect(roleOf(b)).toBe('editing');
    expect(hb.loadLatest).toHaveBeenCalled();
  });

  it('ignores a handover request for another project', async () => {
    const { tab } = setup();
    const ha = hooks();
    const a = tab().open('p1', ha);
    await settle();
    tab().broadcast({ type: 'handover-request', projectId: 'other' });
    await settle();
    expect(roleOf(a)).toBe('editing');
    expect(ha.flush).not.toHaveBeenCalled();
  });
});

describe('rename and delete in another tab (VO-081 core, FR-006/AC16)', () => {
  it('passes a rename to the tab showing the project, keeping its role', async () => {
    const { tab } = setup();
    const ha = hooks();
    const a = tab().open('p1', ha);
    await settle();
    tab().broadcast({ type: 'project-renamed', projectId: 'p1', name: 'New name' });
    await settle();
    expect(ha.onRenamed).toHaveBeenCalledWith('New name');
    expect(roleOf(a)).toBe('editing');
  });

  it('marks a project deleted elsewhere and releases its lock', async () => {
    const { tab, locks } = setup();
    const ha = hooks();
    const a = tab().open('p1', ha);
    await settle();
    tab().broadcast({ type: 'project-deleted', projectId: 'p1' });
    await settle();
    expect(roleOf(a)).toBe('deletedElsewhere');
    expect(ha.onDeleted).toHaveBeenCalled();
    expect(locks.isHeld('p1')).toBe(false);
  });

  it('tells library listeners about renames and deletions', async () => {
    const { tab } = setup();
    const listener = vi.fn();
    tab().onMessage(listener);
    tab().broadcast({ type: 'project-renamed', projectId: 'p9', name: 'X' });
    await settle();
    expect(listener).toHaveBeenCalledWith({ type: 'project-renamed', projectId: 'p9', name: 'X' });
  });

  it('ignores messages that are not tab messages', async () => {
    const { tab, hub } = setup();
    const listener = vi.fn();
    tab().onMessage(listener);
    const other = hub.channel();
    (other as unknown as { postMessage(m: unknown): void }).postMessage({ type: 'something-else' });
    (other as unknown as { postMessage(m: unknown): void }).postMessage('junk');
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });
});
