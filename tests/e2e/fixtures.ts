// End-to-end fixtures (T028). Specs import `test` and `expect` from here instead of '@playwright/test'.
// Everything is found by role and accessible name from contracts/ui.md, so specs read like the user's view.
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

export { expect };

/** Exact status strings shown in the project panel (contracts/ui.md section 4). */
export const BLOCK_STATUSES = ['Editable', 'Has locked parts', 'Source only', 'Error', 'Older format', 'Cannot be rendered'] as const;
export type BlockStatusText = (typeof BLOCK_STATUSES)[number];
export const NOT_YET_CHECKED = 'Not yet checked';

export const CORPUS_DIR = resolve(import.meta.dirname, '../corpus');

/** Reads a corpus file's bytes, for example `corpusFile('fidelity/crlf.puml')`. */
export async function corpusFile(relativePath: string): Promise<{ name: string; bytes: Buffer }> {
  return { name: basename(relativePath), bytes: await readFile(resolve(CORPUS_DIR, relativePath)) };
}

export interface PanelBlock {
  /** The block's displayed name: the first line of its entry ("Untitled screen n" for an unnamed screen). */
  name: string;
  status: BlockStatusText | null;
  /** True when the entry shows "Not yet checked". */
  notYetChecked: boolean;
  /** The entry's whole visible text, for assertions on reasons and link counts. */
  text: string;
}

export interface DownloadedFile {
  fileName: string;
  bytes: Buffer;
}

export interface StorageFailureOptions {
  /** Object stores whose writes fail; all stores when omitted. */
  stores?: string[];
  /** Whether writes fail from the first page load; switch later with `setStorageFailing`. Default true. */
  failing?: boolean;
}

/**
 * Runs in the page before any app script (through `addInitScript`). Every IndexedDB write to the chosen stores
 * aborts its transaction, so nothing is stored, and throws the `QuotaExceededError` a full disk gives.
 * `window.__e2eStorageFailing` switches the failure on and off at run time.
 */
function installStorageFailure(options: { stores: string[] | null; failing: boolean }): void {
  const w = window as unknown as { __e2eStorageFailing: boolean; __e2eStorageFailures: number };
  w.__e2eStorageFailing = options.failing;
  w.__e2eStorageFailures = 0;
  const proto = IDBObjectStore.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const method of ['put', 'add', 'delete', 'clear']) {
    const original = proto[method];
    if (!original) continue;
    proto[method] = function (this: IDBObjectStore, ...args: unknown[]) {
      if (w.__e2eStorageFailing && (options.stores === null || options.stores.includes(this.name))) {
        w.__e2eStorageFailures++;
        try {
          this.transaction.abort();
        } catch {
          // already finished or aborted
        }
        throw new DOMException('The quota has been exceeded. (simulated by the end-to-end fixture)', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  }
}

export class App {
  constructor(readonly page: Page) {}

  /** Opens the project library. */
  async open(): Promise<void> {
    await this.page.goto('/#/');
    await expect(this.page.getByRole('button', { name: 'Create project' })).toBeVisible();
  }

  /** Creates a project from the library and waits for its workspace. */
  async createProject(): Promise<void> {
    await this.page.getByRole('button', { name: 'Create project' }).click();
    await this.page.waitForURL(/#\/project\//);
    await expect(this.projectPanel).toBeVisible();
  }

  /**
   * Imports a file through "Import .puml file" (library or toolbar). Pass a corpus path, or a name and the bytes.
   * Waits for the workspace unless `expectWorkspace` is false, for imports that are refused.
   */
  async importFile(file: string | { name: string; bytes: Buffer | Uint8Array | string }, expectWorkspace = true): Promise<void> {
    const { name, bytes } = typeof file === 'string' ? await corpusFile(file) : file;
    const chooser = this.page.waitForEvent('filechooser');
    await this.page.getByRole('button', { name: 'Import .puml file' }).first().click();
    await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(bytes) });
    if (expectWorkspace) {
      await this.page.waitForURL(/#\/project\//);
      await expect(this.projectPanel).toBeVisible();
    }
  }

  get projectPanel(): Locator {
    return this.page.getByRole('region', { name: 'Project panel' });
  }

  region(name: 'Project panel' | 'Palette' | 'Canvas' | 'Outline' | 'Properties' | 'Source' | 'Preview'): Locator {
    return this.page.getByRole('region', { name }).or(this.page.getByRole('complementary', { name }));
  }

  /** Reads every block entry in the project panel, in panel order. */
  async readProjectPanel(): Promise<PanelBlock[]> {
    const items = this.projectPanel.getByRole('listitem');
    const entries = await items.evaluateAll((els) =>
      els.map((el) => {
        // The name is the entry's first piece of text, whether the entry lays its parts out inline or stacked.
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let first = '';
        for (let n = walker.nextNode(); n && !first; n = walker.nextNode()) first = (n.textContent ?? '').trim();
        return { first, text: (el as HTMLElement).innerText.trim() };
      }),
    );
    // Longest first, so "Error" never matches inside a longer status.
    const statuses = [...BLOCK_STATUSES].sort((a, b) => b.length - a.length);
    return entries.map(({ first, text }) => {
      const rest = text.startsWith(first) ? text.slice(first.length) : text;
      return { name: first, status: statuses.find((s) => rest.includes(s)) ?? null, notYetChecked: rest.includes(NOT_YET_CHECKED), text };
    });
  }

  /** The status shown for one block, by its displayed name. */
  async blockStatus(name: string): Promise<BlockStatusText | null> {
    const block = (await this.readProjectPanel()).find((b) => b.name === name);
    if (!block) throw new Error(`No block named "${name}" in the project panel`);
    return block.status;
  }

  /** The autosave status text in the toolbar ("All changes saved", "Saving…" or a failure). */
  saveStatus(): Locator {
    return this.page.getByRole('toolbar', { name: 'Toolbar' }).getByText(/All changes saved|Saving…|not saved|failed/i).first();
  }

  /** Clicks "Download" (or another control that downloads) and returns the downloaded file's name and bytes. */
  async download(control: Locator = this.page.getByRole('button', { name: 'Download', exact: true })): Promise<DownloadedFile> {
    const pending = this.page.waitForEvent('download');
    await control.click();
    const download = await pending;
    const path = await download.path();
    return { fileName: download.suggestedFilename(), bytes: await readFile(path) };
  }

  /**
   * Makes IndexedDB writes fail from the next page load (call before `open`). The page's existing scripts are
   * not patched, so call it before navigating.
   */
  async failStorageWrites(options: StorageFailureOptions = {}): Promise<void> {
    await this.page.addInitScript(installStorageFailure, { stores: options.stores ?? null, failing: options.failing ?? true });
  }

  /** Switches the simulated storage failure on or off in the running page, for example to let a retry succeed. */
  async setStorageFailing(failing: boolean): Promise<void> {
    await this.page.evaluate((f) => {
      (window as unknown as { __e2eStorageFailing: boolean }).__e2eStorageFailing = f;
    }, failing);
  }

  /** How many writes the simulated failure has refused so far in this page. */
  async storageFailureCount(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as { __e2eStorageFailures?: number }).__e2eStorageFailures ?? 0);
  }
}

export const test = base.extend<{ app: App }>({
  // The second argument is Playwright's `use`; named otherwise so the React hooks lint rule does not mistake it.
  app: async ({ page }, provide) => {
    // The interface starts in simple mode; most specs exercise the outline, source and preview, so they start advanced.
    await page.addInitScript(() => {
      try {
        if (localStorage.getItem('plantuml-editor.mode') === null) localStorage.setItem('plantuml-editor.mode', 'advanced');
      } catch { /* storage unavailable */ }
    });
    await provide(new App(page));
  },
});
