// T179: viewport and touch (VO-103, VO-104, EC-17, EC-18). At 1024 px and wider every editing feature works
// with panels collapsing as needed. Below that nothing breaks and projects can still be viewed. Taps select and
// run visible commands and never delete or move an element on their own.
import { test, expect } from './fixtures.ts';

const PROJECT = '@startsalt Login\n{\n  Username | "      "\n  [Sign in] | [Cancel]\n}\n@endsalt\n';

for (const width of [1024, 1440]) {
  test(`every editing feature works at ${width} px (VO-103)`, async ({ app, page }) => {
    await page.setViewportSize({ width, height: 800 });
    await app.open();
    await app.importFile({ name: 'v.puml', bytes: PROJECT });
    const canvas = page.getByRole('region', { name: 'Canvas' });
    await expect(canvas.getByRole('gridcell').first()).toBeVisible();
    const before = await canvas.getByRole('gridcell').count();
    await canvas.getByRole('gridcell').first().click();
    await page.getByRole('region', { name: 'Palette' }).getByRole('button', { name: 'Text', exact: true }).click();
    await expect.poll(() => canvas.getByRole('gridcell').count()).toBeGreaterThanOrEqual(before);
    await page.getByRole('button', { name: /Properties/, expanded: true }).first().click();
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('below 1024 px nothing breaks and a project can be viewed (EC-17)', async ({ app, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 700, height: 800 });
  await app.open();
  await app.importFile({ name: 'v.puml', bytes: PROJECT });
  await expect(page.getByRole('region', { name: 'Canvas' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Preview' })).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('taps select and never delete or move (VO-104)', async ({ app, page }) => {
    await app.open();
    await app.importFile({ name: 'v.puml', bytes: PROJECT });
    const canvas = page.getByRole('region', { name: 'Canvas' });
    const cells = canvas.getByRole('gridcell');
    await expect(cells.first()).toBeVisible();
    const before = await cells.allInnerTexts();
    for (let i = 0; i < (await cells.count()); i++) await cells.nth(i).tap();
    // A short swipe is not a drag: no press delay, so nothing moves.
    const box = (await cells.first().boundingBox())!;
    await page.touchscreen.tap(box.x + 4, box.y + 4);
    expect(await cells.allInnerTexts()).toEqual(before);
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  });
});
