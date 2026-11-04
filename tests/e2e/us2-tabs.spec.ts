// T088: User Story 2, one editing tab per project (FR-006/AC12, AC16, FR-007/AC7, EC-14).
// VO-012 the second tab is read-only and "Edit here instead" moves editing, VO-081 rename and delete apply in
// another tab, VO-086 histories never mix and are empty after reload or handover.
//
// Two pages in one browser context share IndexedDB, Web Locks and BroadcastChannel, as two tabs do.
import { test, expect, App } from './fixtures.ts';
import type { Page } from '@playwright/test';

const banner = (page: Page) => page.getByRole('region', { name: 'Editing in other tabs' });
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Toolbar' });
const undo = (page: Page) => toolbar(page).getByRole('button', { name: /^Undo/ });
const panelButton = (page: Page, name: string) =>
  page.getByRole('region', { name: 'Project panel' }).getByRole('button', { name, exact: true });

async function addScreen(page: Page): Promise<void> {
  await page.getByRole('region', { name: 'Project panel' }).getByRole('button', { name: 'Add screen', exact: true }).click();
}

test.describe('US2: several tabs', () => {
  test('a second tab is read-only; "Edit here instead" saves the first tab and moves editing (VO-012, VO-086)', async ({ app, context }) => {
    await app.open();
    await app.createProject();
    const first = app.page;
    const url = first.url();
    await addScreen(first);
    await expect(app.saveStatus()).toHaveText('All changes saved');

    const second = await context.newPage();
    await second.goto(url);
    await expect(banner(second)).toBeVisible();
    await expect(banner(second)).toContainText('Undo history is not carried over');
    await expect(second.getByRole('region', { name: 'Canvas' })).toHaveAttribute('data-readonly', 'true');
    await expect(banner(first)).toHaveCount(0);

    // The read-only tab shows the version stored when it opened and does not follow the editing tab.
    await expect(panelButton(second, 'Screen-2')).toBeVisible();
    await addScreen(first);
    await expect(panelButton(first, 'Screen-3')).toBeVisible();
    await second.waitForTimeout(1500);
    await expect(panelButton(second, 'Screen-3')).toHaveCount(0);

    // A pending edit in the first tab, then the handover.
    await addScreen(first);
    await expect(undo(first)).toBeEnabled();
    await banner(second).getByRole('button', { name: 'Edit here instead' }).click();
    await expect(banner(second)).toHaveCount(0);
    await expect(panelButton(second, 'Screen-4')).toBeVisible();
    await expect(second.getByRole('region', { name: 'Canvas' })).not.toHaveAttribute('data-readonly', 'true');
    await expect(banner(first)).toBeVisible();
    await expect(first.getByRole('region', { name: 'Canvas' })).toHaveAttribute('data-readonly', 'true');

    // Neither tab carries undo history over.
    await expect(undo(first)).toBeDisabled();
    await expect(undo(second)).toBeDisabled();

    // Editing now happens in the second tab only.
    await addScreen(second);
    await expect(panelButton(second, 'Screen-5')).toBeVisible();
    await expect(undo(second)).toBeEnabled();
  });

  test('a rename in the library applies in every tab, and a deletion is reported with a download offer (VO-081)', async ({ app, context }) => {
    await app.open();
    await app.createProject();
    const editor = app.page;
    const url = editor.url();

    const libraryTab = await context.newPage();
    const library = new App(libraryTab);
    await library.open();
    const otherLibrary = await context.newPage();
    await otherLibrary.goto('/#/');

    const row = (page: Page, name: string) => page.getByRole('list', { name: 'Your projects' }).getByRole('listitem', { name });
    await row(libraryTab, 'Untitled project').getByRole('button', { name: 'Rename' }).click();
    const field = libraryTab.getByRole('textbox', { name: 'New name for Untitled project' });
    await field.fill('Checkout');
    await field.press('Enter');
    await expect(row(libraryTab, 'Checkout')).toBeVisible();
    // Another library tab follows without a reload.
    await expect(row(otherLibrary, 'Checkout')).toBeVisible();

    // The editing tab keeps the new name when it next saves.
    await addScreen(editor);
    await expect(toolbar(editor).getByText('All changes saved')).toBeVisible();
    await libraryTab.reload();
    await expect(row(libraryTab, 'Checkout')).toBeVisible();

    // Deleting it in the library is reported in the editing tab, which offers its content.
    await row(libraryTab, 'Checkout').getByRole('button', { name: 'Delete' }).click();
    await libraryTab.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row(libraryTab, 'Checkout')).toHaveCount(0);
    await expect(banner(editor)).toContainText('deleted in another tab');
    const file = await app.download(banner(editor).getByRole('button', { name: 'Download its content' }));
    expect(file.fileName).toBe('Checkout.puml');
    expect(file.bytes.toString('utf8')).toContain('@startsalt Screen-2');

    // Nothing writes the deleted project back.
    await editor.waitForTimeout(1500);
    await libraryTab.reload();
    await expect(row(libraryTab, 'Checkout')).toHaveCount(0);
    expect(url).toContain('#/project/');
  });

  test('histories never mix between projects and are empty after a reload (VO-086)', async ({ app }) => {
    await app.open();
    await app.createProject();
    await addScreen(app.page);
    await expect(undo(app.page)).toBeEnabled();
    await expect(toolbar(app.page).getByText('All changes saved')).toBeVisible();

    await app.page.goto('/#/');
    await app.createProject();
    await expect(undo(app.page)).toBeDisabled();

    await addScreen(app.page);
    await expect(undo(app.page)).toBeEnabled();
    await expect(toolbar(app.page).getByText('All changes saved')).toBeVisible();
    await app.page.reload();
    await expect(app.projectPanel).toBeVisible();
    await expect(panelButton(app.page, 'Screen-2')).toBeVisible();
    await expect(undo(app.page)).toBeDisabled();
  });
});
