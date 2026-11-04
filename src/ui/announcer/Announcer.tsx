// The one polite live region (FR-009/AC9, contracts/ui.md §13). Structural changes (insert, delete, move,
// undo, redo, revert) and notices are announced through it; nothing else in the interface is a live region.
// Messages are catalogue keys, so every announced string comes from the catalogue (FR-016/AC8).

import { useSyncExternalStore, type CSSProperties } from 'react';
import type { MessageParams } from '../../core/types.ts';
import { t } from '../messages/en.ts';

export interface AnnouncerStore {
  /** Announce a catalogue message politely. */
  announce(messageKey: string, params?: MessageParams): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): AnnouncerSnapshot;
}

export interface AnnouncerSnapshot {
  readonly text: string;
  /** Increases with every announcement, so a repeated message still changes the region. */
  readonly seq: number;
}

export function createAnnouncer(): AnnouncerStore {
  let snapshot: AnnouncerSnapshot = { text: '', seq: 0 };
  const listeners = new Set<() => void>();
  const set = (next: AnnouncerSnapshot): void => {
    snapshot = next;
    for (const l of [...listeners]) l();
  };
  return {
    announce(messageKey, params) {
      set({ text: t(messageKey, params), seq: snapshot.seq + 1 });
    },
    clear() {
      set({ text: '', seq: snapshot.seq + 1 });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}

/** The application's announcer. */
export const announcer: AnnouncerStore = createAnnouncer();

/** Announce a catalogue message through the application's live region. */
export function announce(messageKey: string, params?: MessageParams): void {
  announcer.announce(messageKey, params);
}

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** No-break space: appended on alternate announcements so identical messages are read again. */
const NBSP = '\u00A0';

/** Mount once, at the application root. */
export function Announcer({ announcer: store = announcer }: { readonly announcer?: AnnouncerStore }) {
  const { text, seq } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" style={visuallyHidden}>
      {text === '' ? null : seq % 2 === 0 ? text + NBSP : text}
    </div>
  );
}
