// T087: User Story 2, keeping work safe in the browser (FR-006/AC1, AC2, AC7, AC9, EC-15).
// VO-009 saved within 2 s with "All changes saved", VO-010 a write failure is reported within 1 s with "Download a
// backup", the stored copy stays the previous version and a successful retry recovers, VO-075 reload and crash
// lose at most 2 s, VO-078 persistent storage refused, private window and quota each get one notice.
//
// The edit used throughout is "Add screen" in the project panel, which writes a new "Screen-<n>" block.
import { test, expect, type App } from './fixtures.ts';
import type { Page } from '@playwright/test';

interface StoredProject {
  id: string;
  name: string;
  source: string;
  revision: number;
}

/** Every stored project, read straight from IndexedDB. */
async function storedProjects(page: Page): Promise<StoredProject[]> {
  return page.evaluate(
    () =>
      new Promise<StoredProject[]>((resolve, reject) => {
        const open = indexedDB.open('plantuml-editor');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('projects').objectStore('projects').getAll();
          all.onsuccess = () => {
            resolve(all.result as StoredProject[]);
            db.close();
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

const projectIdOf = (page: Page): string => /#\/project\/([^/]+)/.exec(page.url())?.[1] ?? '';

async function storedSource(page: Page): Promise<string> {
  const id = decodeURIComponent(projectIdOf(page));
  return (await storedProjects(page)).find((p) => p.id === id)?.source ?? '';
}

const toolbar = (app: App) => app.page.getByRole('toolbar', { name: 'Toolbar' });
const notices = (app: App) => app.page.getByRole('region', { name: 'Notifications' });

async function addScreen(app: App): Promise<void> {
  await app.projectPanel.getByRole('button', { name: 'Add screen', exact: true }).click();
}

test.describe('US2: autosave and storage failures', () => {
  test('an edit is stored within 2 seconds and the status reads "All changes saved" (VO-009)', async ({ app }) => {
    await app.open();
    await app.createProject();
    await expect(toolbar(app).getByText('All changes saved')).toBeVisible();
    const started = Date.now();
    await addScreen(app);
    await expect.poll(() => storedSource(app.page), { timeout: 2000 }).toContain('@startsalt Screen-2');
    await expect(toolbar(app).getByText('All changes saved')).toBeVisible({ timeout: Math.max(0, 2000 - (Date.now() - started)) });
  });

  test('a failed write is reported within 1 second, keeps the previous version, and recovers on retry (VO-010)', async ({ app }) => {
    await app.failStorageWrites({ stores: ['projects'], failing: false });
    await app.open();
    await app.createProject();
    await expect(toolbar(app).getByText('All changes saved')).toBeVisible();
    const before = await storedSource(app.page);

    await app.setStorageFailing(true);
    await addScreen(app);
    // Within 1 second of the write, which starts at most 500 ms after the edit.
    const notice = notices(app).getByRole('listitem').filter({ hasText: 'could not be saved' });
    await expect(notice).toBeVisible({ timeout: 1500 });
    await expect(notice.getByRole('button', { name: 'Download a backup' })).toBeVisible();
    await expect(toolbar(app).getByText('Saving…')).toBeVisible();
    expect(await storedSource(app.page)).toBe(before);

    // Editing continues while writes fail.
    await addScreen(app);
    await expect(app.projectPanel.getByRole('button', { name: 'Screen-3', exact: true })).toBeVisible();

    // "Download a backup" gives the latest text, including the unsaved screens.
    const backup = await app.download(notice.getByRole('button', { name: 'Download a backup' }));
    expect(backup.bytes.toString('utf8')).toContain('@startsalt Screen-3');
    await expect(notice).toBeVisible();

    await app.setStorageFailing(false);
    // Retries come after 1 s, 2 s, 4 s, then every 10 s.
    await expect(toolbar(app).getByText('All changes saved')).toBeVisible({ timeout: 15_000 });
    await expect(notice).toHaveCount(0);
    expect(await storedSource(app.page)).toContain('@startsalt Screen-3');
  });

  test('after a reload the project reopens exactly as stored (VO-075)', async ({ app }) => {
    await app.open();
    await app.createProject();
    await addScreen(app);
    await expect(toolbar(app).getByText('All changes saved')).toBeVisible();
    const before = await storedSource(app.page);
    // Render status is session state: after a reload it reads "Not yet checked" until the renderer has run.
    const stored = async () => (await app.readProjectPanel()).map(({ name, status }) => ({ name, status }));
    const panelBefore = await stored();
    await app.page.reload();
    await expect(app.projectPanel).toBeVisible();
    expect(await stored()).toEqual(panelBefore);
    expect(await storedSource(app.page)).toBe(before);
  });

  test('a crash loses no more than the last 2 seconds of edits (VO-075)', async ({ app, page, context }) => {
    await app.open();
    await app.createProject();
    const url = page.url();
    await addScreen(app);
    await page.waitForTimeout(2000);
    // Close the page without running its unload handlers: only what was already stored survives.
    const again = await context.newPage();
    await page.close({ runBeforeUnload: false });
    await again.goto(url);
    await expect(again.getByRole('region', { name: 'Project panel' }).getByRole('button', { name: 'Screen-2', exact: true })).toBeVisible();
  });

  test('persistent storage refused and a private window are each reported once (VO-078)', async ({ app, page }) => {
    await page.addInitScript(() => {
      const storage = navigator.storage as StorageManager & Record<string, unknown>;
      Object.defineProperty(storage, 'persisted', { value: async () => false });
      Object.defineProperty(storage, 'persist', { value: async () => false });
      Object.defineProperty(storage, 'estimate', { value: async () => ({ quota: 50 * 1024 * 1024, usage: 0 }) });
    });
    await app.open();
    await app.createProject();
    const refused = notices(app).getByText('has not agreed to keep your projects');
    const privateWindow = notices(app).getByText('looks like a private window');
    await expect(refused).toHaveCount(1);
    await expect(privateWindow).toHaveCount(1);
    // Editing continues.
    await addScreen(app);
    await expect(app.projectPanel.getByRole('button', { name: 'Screen-2', exact: true })).toBeVisible();
    // Dismissed, they do not come back when another project opens in the same session.
    for (const text of ['has not agreed to keep your projects', 'looks like a private window']) {
      await notices(app).getByRole('listitem').filter({ hasText: text }).getByRole('button', { name: 'Dismiss' }).click();
    }
    await page.goto('/#/');
    await app.createProject();
    await expect(app.projectPanel).toBeVisible();
    await page.waitForTimeout(500);
    await expect(refused).toHaveCount(0);
    await expect(privateWindow).toHaveCount(0);
  });
});
