// T089: User Story 2, file exchange (FR-006/AC5, AC13, FR-016/AC1).
// VO-013 download then import gives an identical project (fidelity/bom.puml with BOM, bytes match, second import
// named "<name> <date>", marked "never downloaded"), VO-014 a binary import changes nothing.
//
// NOTE: these are Playwright specs typed and linted but NOT yet run. See SubagentHandback for details.
import { test, expect, corpusFile, type App } from './fixtures.ts';
import type { Page } from '@playwright/test';

interface StoredRecord {
  id: string;
  name: string;
  source: string;
  revision: number;
  downloadedAt: number | null;
  downloadedRevision: number | null;
}

/** All projects from IndexedDB. */
async function storedProjects(page: Page): Promise<StoredRecord[]> {
  return page.evaluate(
    () =>
      new Promise<StoredRecord[]>((resolve, reject) => {
        const open = indexedDB.open('plantuml-editor');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('projects').objectStore('projects').getAll();
          all.onsuccess = () => {
            resolve(all.result as StoredRecord[]);
            db.close();
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

const projectIdOf = (page: Page): string => /#\/project\/([^/]+)/.exec(page.url())?.[1] ?? '';

async function storedRecord(app: App): Promise<StoredRecord | undefined> {
  const id = decodeURIComponent(projectIdOf(app.page));
  return (await storedProjects(app.page)).find((p) => p.id === id);
}

const toolbar = (app: App) => app.page.getByRole('toolbar', { name: 'Toolbar' });
const notices = (app: App) => app.page.getByRole('region', { name: 'Notifications' });

test.describe('US2: file exchange', () => {
  test('after a reload the project reopens to exactly the same blocks (VO-013 setup)', async ({ app }) => {
    // Import bom.puml (has BOM + one screen).
    const bom = await corpusFile('fidelity/bom.puml');
    await app.open();
    await app.importFile(bom);
    await expect(toolbar(app).getByText('All changes saved')).toBeVisible({ timeout: 5000 });
    const panelBefore = await app.readProjectPanel();
    const url = app.page.url();

    await app.page.reload();
    await expect(app.projectPanel).toBeVisible();
    await app.page.waitForURL(url);
    expect(await app.readProjectPanel()).toEqual(panelBefore);
  });

  test('download then import gives an identical project; second import gets a date suffix and is never-downloaded (VO-013)', async ({ app }) => {
    // Import bom.puml so we have a project with a BOM.
    const bom = await corpusFile('fidelity/bom.puml');
    await app.open();
    await app.importFile(bom);
    await expect(toolbar(app).getByText('All changes saved')).toBeVisible({ timeout: 5000 });
    const panelOriginal = await app.readProjectPanel();

    // Download the project.
    const downloaded = await app.download();
    expect(downloaded.fileName).toMatch(/\.puml$/);

    // The file starts with the BOM byte (0xEF 0xBB 0xBF) because source was stored with it.
    expect([...downloaded.bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    // Import the downloaded file — it should give an identical project.
    await app.open();
    await app.importFile({ name: downloaded.fileName, bytes: downloaded.bytes });
    await expect(toolbar(app).getByText('All changes saved')).toBeVisible({ timeout: 5000 });
    const panelImported = await app.readProjectPanel();
    expect(panelImported).toEqual(panelOriginal);

    // The imported project's record shows it was never downloaded (downloadedAt null).
    const rec = await storedRecord(app);
    expect(rec?.downloadedAt).toBeNull();
    expect(rec?.downloadedRevision).toBeNull();

    // Import the same file a second time: the name should have the date appended.
    await app.open();
    await app.importFile({ name: downloaded.fileName, bytes: downloaded.bytes });
    await expect(toolbar(app).getByText('All changes saved')).toBeVisible({ timeout: 5000 });
    const secondName = decodeURIComponent(projectIdOf(app.page));
    // Get the name from the panel or page title, or read the stored record.
    const projects = await storedProjects(app.page);
    const secondRec = projects.find((p) => p.id === secondName);
    // The second project's name includes the year (date suffix like "2026-10-28").
    expect(secondRec?.name ?? '').toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test('importing a binary file is refused, shows a "not a text file" notice, and the library is unchanged (VO-014)', async ({ app }) => {
    // Start with one project.
    await app.open();
    await app.createProject();
    await app.page.goto('/#/');
    const before = await storedProjects(app.page);

    // Try to import a binary file — the operation should be refused.
    const binary = await corpusFile('import/binary.puml');
    await app.importFile(binary, false /* expectWorkspace = false */);

    // A notice saying "not a text file" should appear.
    await expect(notices(app).getByText(/not a text file/i)).toBeVisible({ timeout: 3000 });

    // Still on the library page, library unchanged.
    await expect(app.page.getByRole('button', { name: 'Create project' })).toBeVisible();
    const after = await storedProjects(app.page);
    expect(after.length).toBe(before.length);
  });
});
