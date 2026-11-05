// Simple (default) and advanced interface modes: simple hides the outline, source and preview.
import { test, expect } from './fixtures.ts';

test('simple mode hides outline, source and preview; advanced shows them and is remembered', async ({ app, page }) => {
  await page.addInitScript(() => {
    try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('plantuml-editor.mode', 'simple'); } } catch { /* storage unavailable */ }
  });
  await app.open();
  await app.createProject();

  for (const name of ['Outline', 'Source', 'Preview'] as const) await expect(app.region(name)).toHaveCount(0);
  await expect(app.region('Canvas')).toBeVisible();
  await expect(app.region('Properties')).toBeVisible();

  await page.getByRole('radio', { name: 'Advanced' }).check({ force: true });
  for (const name of ['Outline', 'Source', 'Preview'] as const) await expect(app.region(name)).toBeVisible();

  await page.reload();
  await expect(app.region('Source')).toBeVisible();
  await page.getByRole('radio', { name: 'Simple' }).check({ force: true });
  await expect(app.region('Source')).toHaveCount(0);
});
