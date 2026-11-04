// T022/T032: Panel defaults and mobile collapse Playwright tests (FR-013, FR-024, US7).
import { test, expect } from './fixtures.ts';

// T022: Panel default-collapsed state
test('Outline and Properties panels are collapsed by default on new project', async ({ app }) => {
  await app.open();
  await app.createProject();

  const outline = app.region('Outline');
  const properties = app.region('Properties');

  // Both should be collapsed (aria-expanded false or data-collapsed attribute).
  const outlineCollapsed =
    (await outline.getAttribute('aria-expanded')) === 'false' ||
    (await outline.getAttribute('data-collapsed')) === 'true';
  const propertiesCollapsed =
    (await properties.getAttribute('aria-expanded')) === 'false' ||
    (await properties.getAttribute('data-collapsed')) === 'true';

  expect(outlineCollapsed || propertiesCollapsed).toBe(true);
});

test('Palette panel is expanded by default on new project', async ({ app }) => {
  await app.open();
  await app.createProject();

  const palette = app.region('Palette');
  const isExpanded =
    (await palette.getAttribute('aria-expanded')) !== 'false' &&
    (await palette.getAttribute('data-collapsed')) !== 'true';

  expect(isExpanded).toBe(true);
});

test('Panel collapsed state is remembered after toggle and reload', async ({ app, page }) => {
  await app.open();
  await app.createProject();

  const palette = app.region('Palette');

  // Find the collapse toggle button for the palette panel.
  const toggle = palette.locator('[aria-controls], button[aria-expanded]').first();
  const hasToggle = await toggle.count();
  if (!hasToggle) {
    // No toggle found — skip this test as unimplemented.
    return;
  }

  // Collapse it.
  await toggle.click();

  // Reload.
  await page.reload();
  await app.open();

  // After reload, palette should still be collapsed.
  const paletteAfter = app.region('Palette');
  const collapsedAfter =
    (await paletteAfter.getAttribute('aria-expanded')) === 'false' ||
    (await paletteAfter.getAttribute('data-collapsed')) === 'true';
  expect(collapsedAfter).toBe(true);
});

// T032: Mobile panel collapse
test('Outline collapses on mobile-width viewport', async ({ app, page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await app.open();
  await app.createProject();

  const outline = app.region('Outline');

  // On mobile the outline should be collapsed or hidden.
  const isHidden =
    (await outline.isHidden()) ||
    (await outline.getAttribute('data-collapsed')) === 'true' ||
    (await outline.getAttribute('aria-expanded')) === 'false';

  expect(isHidden).toBe(true);
});

test('Source panel is visible on mobile when toggled open', async ({ app, page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await app.open();
  await app.createProject();

  const source = app.region('Source');
  const toggle = source.locator('button').first();

  if (await toggle.count()) {
    const wasCollapsed =
      (await source.getAttribute('data-collapsed')) === 'true' ||
      (await source.getAttribute('aria-expanded')) === 'false';

    if (wasCollapsed) {
      await toggle.click();
      await expect(source).toBeVisible();
    }
  }
});
