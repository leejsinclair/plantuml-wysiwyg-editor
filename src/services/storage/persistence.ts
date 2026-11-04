// Protecting against storage loss (FR-006/AC9, EC-15, R-5).
//
// - Persistent storage is requested with `navigator.storage.persist()` (skipped when already granted). The result
//   says whether a one-time notice is due: `persisted === false` means the browser refused.
// - Private windows are detected where possible. Chromium gives a private window a temporary quota far below a
//   normal profile's (a normal profile gets a share of the disk); a quota under twice the JavaScript heap limit
//   is taken as private. Where nothing can be measured, the window is not reported as private.

/** The part of `navigator.storage` used here. */
export interface StorageManagerLike {
  persisted?(): Promise<boolean>;
  persist?(): Promise<boolean>;
  estimate?(): Promise<{ quota?: number }>;
}

export interface PersistenceResult {
  /** `true` granted, `false` refused, `null` where the browser cannot say. */
  readonly persisted: boolean | null;
  readonly privateWindow: boolean;
}

const GIB = 1024 * 1024 * 1024;

/** Chromium's private-window quota test: below twice the heap limit (1 GiB assumed when unknown). */
export function looksPrivate(quota: number | undefined, heapLimit: number | undefined): boolean {
  if (typeof quota !== 'number' || !Number.isFinite(quota) || quota <= 0) return false;
  return quota < 2 * (heapLimit && heapLimit > 0 ? heapLimit : GIB);
}

function defaultStorage(): StorageManagerLike | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator.storage as StorageManagerLike | undefined);
}

function defaultHeapLimit(): number | undefined {
  if (typeof performance === 'undefined') return undefined;
  return (performance as Performance & { memory?: { jsHeapSizeLimit?: number } }).memory?.jsHeapSizeLimit;
}

export async function requestPersistence(
  storage: StorageManagerLike | undefined = defaultStorage(),
  heapLimit: number | undefined = defaultHeapLimit(),
): Promise<PersistenceResult> {
  if (!storage) return { persisted: null, privateWindow: false };
  let persisted: boolean | null = null;
  try {
    if (storage.persisted && (await storage.persisted())) persisted = true;
    else if (storage.persist) persisted = await storage.persist();
  } catch {
    persisted = null;
  }
  let privateWindow = false;
  try {
    if (storage.estimate) privateWindow = looksPrivate((await storage.estimate()).quota, heapLimit);
  } catch {
    privateWindow = false;
  }
  return { persisted, privateWindow };
}
