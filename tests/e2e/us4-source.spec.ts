// T117: User Story 4, editing source beside the canvas and seeing the real render (spec section 4.2, FR-004, FR-005).
// VO-021 only the typed-in canvas is locked, VO-022 the canvas follows a pause within 500 ms and keeps the
// selection, VO-023 leaving with invalid text keeps it and offers recovery, VO-025 a rendering problem stays in
// the preview pane with the last render marked out of date.
import { test, expect, type App } from './fixtures.ts';

const PROJECT = [
  '@startsalt Login',
  '{',
  '  [OK]',
  '}',
  '@endsalt',
  '',
  '@startsalt Home',
  '{',
  '  [Go]',
  '}',
  '@endsalt',
  '',
  '@startuml Seq',
  'Alice -> Bob : hi',
  '@enduml',
  '',
].join('\n');

async function importProject(app: App): Promise<void> {
  await app.open();
  await app.importFile({ name: 'us4.puml', bytes: PROJECT });
}

async function openBlock(app: App, name: string): Promise<void> {
  await app.projectPanel.getByRole('button', { name, exact: true }).click();
}

/** The open block's source editor. */
const sourceEditor = (app: App) => app.region('Source').getByRole('textbox', { name: 'Source' });

/** Puts the cursor at the end of `line` (1-based) of the source view. */
async function endOfLine(app: App, line: number): Promise<void> {
  await sourceEditor(app).click();
  await app.page.keyboard.press('Control+Home');
  for (let i = 1; i < line; i++) await app.page.keyboard.press('ArrowDown');
  await app.page.keyboard.press('End');
}

test.describe('US4: edit source and see the real render', () => {
  test('typing locks only that block’s canvas (VO-021)', async ({ app }) => {
    await importProject(app);
    await openBlock(app, 'Login');
    const canvas = app.region('Canvas');
    await expect(canvas).not.toHaveAttribute('data-readonly', 'true');
    await endOfLine(app, 3);
    await app.page.keyboard.type(' ');
    await expect(canvas).toHaveAttribute('data-readonly', 'true');
    await expect(canvas.getByRole('status').filter({ hasText: 'Read-only while you edit the source' })).toBeVisible();
    // The other screen stays editable.
    await expect.poll(() => app.blockStatus('Home')).toBe('Editable');
    await openBlock(app, 'Home');
    await expect(app.region('Canvas')).not.toHaveAttribute('data-readonly', 'true');
    await openBlock(app, 'Login');
    await expect(app.region('Canvas')).not.toHaveAttribute('data-readonly', 'true');
  });

  test('the canvas follows a pause within 500 ms and keeps the selection (VO-022)', async ({ app }) => {
    await importProject(app);
    await openBlock(app, 'Login');
    const canvas = app.region('Canvas');
    await canvas.getByText('OK', { exact: true }).click();
    const breadcrumb = canvas.getByRole('navigation');
    const before = await breadcrumb.innerText();
    await endOfLine(app, 3);
    await app.page.keyboard.type(' | [Cancel]');
    // 300 ms pause, then at most 500 ms.
    await expect(canvas.getByText('Cancel', { exact: true })).toBeVisible({ timeout: 800 });
    await expect(breadcrumb).toHaveText(before);
  });

  test('leaving with invalid text keeps it, locks the block and offers recovery (VO-023)', async ({ app }) => {
    await importProject(app);
    await openBlock(app, 'Login');
    // Delete the closing brace on line 4.
    await endOfLine(app, 4);
    await app.page.keyboard.press('Shift+Home');
    await app.page.keyboard.press('Backspace');
    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.blockStatus('Login')).toBe('Error');
    const canvas = app.region('Canvas');
    await expect(canvas.getByRole('button', { name: 'Fix in source' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Revert to last working version' })).toBeVisible();
    await expect(app.saveStatus()).toHaveText('All changes saved');
    // Stored exactly as typed: after a reload the text is still there, unchanged.
    await app.page.reload();
    await openBlock(app, 'Login');
    const text = await sourceEditor(app).innerText();
    expect(text).toContain('[OK]');
    expect(text).not.toContain('}');
    await expect.poll(() => app.blockStatus('Login')).toBe('Error');
  });

  test('a rendering problem stays in the preview, with the last render marked out of date (VO-025)', async ({ app }) => {
    test.setTimeout(90_000);
    await importProject(app);
    await openBlock(app, 'Seq');
    const preview = app.region('Preview');
    const image = preview.getByRole('figure', { name: 'Rendered image of Seq' });
    await expect(image).toBeVisible({ timeout: 60_000 });
    await endOfLine(app, 2);
    await app.page.keyboard.press('Enter');
    await app.page.keyboard.type('this is not a diagram line ((');
    await app.page.keyboard.press('Escape');
    await expect(preview.getByText('Rendering problem')).toBeVisible({ timeout: 60_000 });
    await expect(preview).toContainText('Syntax Error');
    await expect(image).toBeVisible();
    await expect(preview.getByText('Out of date', { exact: true })).toBeVisible();
    // Labelled as a rendering problem, never as a source problem.
    await expect(app.region('Canvas')).not.toContainText('Syntax Error');
    await expect(app.region('Canvas')).not.toContainText('Source problem');
  });
});
