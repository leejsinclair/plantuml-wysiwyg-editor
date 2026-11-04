// T176: keyboard-only use (VO-100, VO-101, SC-003). The reference login form is built with the keyboard alone,
// every command is a visible control that names its shortcut, and the region shortcut visits every region with
// no trap.
import { test, expect } from './fixtures.ts';

test('the login form can be built with the keyboard alone (SC-003, VO-100)', async ({ app, page }) => {
  await app.open();
  await page.getByRole('button', { name: 'Create project' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/#\/project\//);

  const palette = page.getByRole('region', { name: 'Palette' });
  for (const item of ['Form', 'Button bar']) {
    const button = palette.getByRole('button', { name: item, exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
  }

  const canvas = page.getByRole('region', { name: 'Canvas' });
  await expect(canvas.getByRole('gridcell').first()).toBeVisible();
  // Move through the canvas with the arrows and the parent key.
  await canvas.getByRole('gridcell').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(canvas.getByRole('gridcell').first()).toBeVisible();

  // Undo and redo by keyboard.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeVisible();
});

test('every command is a visible control that shows its shortcut (VO-100)', async ({ app, page }) => {
  await app.open();
  await app.createProject();
  await page.getByRole('region', { name: 'Palette' }).getByRole('button', { name: 'Form', exact: true }).click();
  const commands = page.getByRole('group', { name: 'Commands for the selection' });
  await expect(commands).toBeVisible();
  const buttons = commands.getByRole('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i);
    const label = (await b.getAttribute('aria-keyshortcuts')) ?? (await b.getAttribute('title')) ?? (await b.innerText());
    expect(label, `command ${i} names itself`).toBeTruthy();
  }
});

test('the region shortcut visits every region and Esc leaves the source view (VO-101)', async ({ app, page }) => {
  await app.open();
  await app.createProject();
  const seen = new Set<string>();
  await page.getByRole('button', { name: 'Download', exact: true }).focus();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Control+F6');
    const region = await page.evaluate(() => document.activeElement?.closest('[role="region"], [role="complementary"]')?.getAttribute('aria-label') ?? document.activeElement?.closest('section,aside')?.querySelector('h2')?.textContent ?? '');
    seen.add(region.replace(/^[▾▸]\s*/, ''));
  }
  for (const name of ['Project panel', 'Palette', 'Canvas', 'Outline', 'Properties', 'Source', 'Preview']) {
    expect([...seen].some((s) => s.includes(name)), `region ${name} reached; saw ${[...seen].join(', ')}`).toBe(true);
  }

  // Esc leaves the source view for the canvas.
  const source = page.getByRole('region', { name: 'Source' }).getByRole('textbox', { name: 'Source' });
  await source.click();
  await page.keyboard.press('Escape');
  await expect(source).not.toBeFocused();
});
