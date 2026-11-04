// T177: after one online visit the app, preview and image export work with the network disconnected, including
// after a reload (VO-135, SC-008). A browser restart is the same as a reload here: the service worker's
// precache lives in the browser profile, not in the page.
import { test, expect } from './fixtures.ts';

test('app, preview and image export work offline after one visit (VO-135, SC-008)', async ({ app, page, context }) => {
  await app.open();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first load registers the worker; a reload puts the page under its control.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // Give the precache time to finish before disconnecting.
  await expect.poll(async () => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Create project' })).toBeVisible();

  await app.importFile({ name: 'offline.puml', bytes: '@startsalt Screen-1\n{\n  Hello | [OK]\n}\n@endsalt\n' });
  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview.locator('svg').first()).toBeVisible({ timeout: 20_000 });

  const exported = await app.download(page.getByRole('button', { name: 'Export SVG' }));
  expect(exported.fileName).toMatch(/\.svg$/);
  expect(exported.bytes.toString('utf8')).toContain('<svg');

  const png = await app.download(page.getByRole('button', { name: 'Export PNG' }));
  expect(png.fileName).toMatch(/\.png$/);
  expect([...png.bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
});
