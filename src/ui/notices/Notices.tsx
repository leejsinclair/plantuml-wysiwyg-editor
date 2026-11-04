// Non-blocking notices (data-model §6.8, contracts/ui.md §11): storage failure, persistent storage refused,
// private window, backup reminder, "Convert all", source rename, re-division report, drop-down options removed,
// download warnings. A notice never takes focus and never blocks the editor; its actions ("Undo", "Download a
// backup", "Convert all") are ordinary buttons. A notice with `oncePerSession` is shown at most once per session.
// Every string is a catalogue key (FR-016/AC8); shown notices are also announced through the polite announcer.

import { useSyncExternalStore } from 'react';
import type { MessageParams } from '../../core/types.ts';
import { announce as announceDefault } from '../announcer/Announcer.tsx';
import { t } from '../messages/en.ts';

export interface NoticeAction {
  readonly labelKey: string;
  readonly labelParams?: MessageParams;
  run(): void;
  /** Keep the notice after the action runs (for example "Download a backup" while writes still fail). */
  readonly keepOpen?: boolean;
}

export interface NoticeInput {
  /** What the notice is about, for example `storageFailure` or `optionsRemoved`. */
  readonly kind: string;
  readonly messageKey: string;
  readonly params?: MessageParams;
  readonly actions?: readonly NoticeAction[];
  /** Shown at most once in this session under this key, even after it is dismissed. */
  readonly oncePerSession?: string | null;
  /** A notice with the same key replaces the earlier one instead of stacking. */
  readonly key?: string;
  /** Shown prominently, for example a storage failure (section 3.6). */
  readonly prominent?: boolean;
}

export interface Notice extends NoticeInput {
  readonly id: string;
}

export interface NoticesStore {
  /** Shows a notice and returns its id, or `null` when a `oncePerSession` notice was already shown. */
  show(notice: NoticeInput): string | null;
  dismiss(id: string): void;
  list(): readonly Notice[];
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly Notice[];
}

export interface NoticesOptions {
  /** Called for every shown notice; defaults to the application's announcer. */
  readonly announce?: (messageKey: string, params?: MessageParams) => void;
}

export function createNotices(options: NoticesOptions = {}): NoticesStore {
  const announce = options.announce ?? announceDefault;
  let items: readonly Notice[] = [];
  const shownOnce = new Set<string>();
  const listeners = new Set<() => void>();
  let next = 0;

  const set = (value: readonly Notice[]): void => {
    items = value;
    for (const l of [...listeners]) l();
  };

  return {
    show(input) {
      if (input.oncePerSession) {
        if (shownOnce.has(input.oncePerSession)) return null;
        shownOnce.add(input.oncePerSession);
      }
      const notice: Notice = { ...input, id: `notice-${++next}` };
      const kept = input.key === undefined ? items : items.filter((n) => n.key !== input.key);
      set([...kept, notice]);
      announce(input.messageKey, input.params);
      return notice.id;
    },
    dismiss(id) {
      if (items.some((n) => n.id === id)) set(items.filter((n) => n.id !== id));
    },
    list: () => items,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => items,
  };
}

/** The application's notices. */
export const notices: NoticesStore = createNotices();

export function Notices({ notices: store = notices }: { readonly notices?: NoticesStore }) {
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <section className="notices" aria-label={t('notice.region')}>
      {items.length > 0 && (
        <ul className="notices__list">
          {items.map((n) => (
            <li key={n.id} className="notice" data-kind={n.kind} data-prominent={n.prominent ? 'true' : undefined}>
              <p className="notice__message">{t(n.messageKey, n.params)}</p>
              <div className="notice__actions">
                {n.actions?.map((a) => (
                  <button
                    key={a.labelKey}
                    type="button"
                    onClick={() => {
                      a.run();
                      if (!a.keepOpen) store.dismiss(n.id);
                    }}
                  >
                    {t(a.labelKey, a.labelParams)}
                  </button>
                ))}
                <button type="button" onClick={() => store.dismiss(n.id)}>
                  {t('notice.dismiss')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
