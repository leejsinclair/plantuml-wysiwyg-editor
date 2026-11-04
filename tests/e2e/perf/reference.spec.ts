// T174: SC-006 / VO-137 responsiveness on the reference project (10 screens of about 50 components, a flow of
// about 30 steps with decisions and lanes). Canvas feedback for select and insert ≤ 100 ms, source view updated
// after a visual edit ≤ 200 ms, preview ≤ 3 s. The thresholds are the spec's for a mid-range laptop; set
// PERF_SLACK (a multiplier, default 1) to relax them on a slower machine.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures.ts';

const SLACK = Number(process.env.PERF_SLACK ?? 1);

/** Milliseconds from `act` running until the first mutation inside `watch` and the next painted frame. */
async function timeToChange(page: Page, watch: string, act: string): Promise<number> {
  return page.evaluate(
    ({ watch, act }) =>
      new Promise<number>((done) => {
        const target = document.querySelector(watch);
        if (!target) throw new Error(`nothing matches ${watch}`);
        const t0 = performance.now();
        const observer = new MutationObserver(() => {
          observer.disconnect();
          requestAnimationFrame(() => done(performance.now() - t0));
        });
        observer.observe(target, { subtree: true, childList: true, attributes: true, characterData: true });
        new Function(act)();
      }),
    { watch, act },
  );
}

test('the reference project meets the responsiveness targets (SC-006, VO-137)', async ({ app, page }) => {
  const bytes = await readFile(resolve(import.meta.dirname, '../../corpus/reference/reference-project.puml'));
  await app.open();
  await app.importFile({ name: 'reference-project.puml', bytes });

  const canvas = page.getByRole('region', { name: 'Canvas' });
  const cells = canvas.getByRole('gridcell');
  await expect(cells.first()).toBeVisible();
  await expect.poll(() => cells.count()).toBeGreaterThanOrEqual(50);
  await canvas.evaluate((el) => el.setAttribute('data-perf', 'canvas'));
  await page.getByRole('region', { name: 'Source' }).evaluate((el) => el.setAttribute('data-perf', 'source'));

  // Select: canvas feedback within 100 ms.
  const select = await timeToChange(page, '[data-perf="canvas"]', `document.querySelectorAll('[data-perf="canvas"] [role="gridcell"]')[7].click()`);
  expect(select, `select took ${select.toFixed(0)} ms`).toBeLessThanOrEqual(100 * SLACK);

  // Insert from the palette: canvas within 100 ms, and the source view within 200 ms.
  await page.getByRole('region', { name: 'Source' }).evaluate((el) => el.setAttribute('data-perf', 'source'));
  const palette = page.getByRole('region', { name: 'Palette' });
  await expect(palette.getByRole('button', { name: 'Text', exact: true })).toBeVisible();
  const insertCanvas = await timeToChange(page, '[data-perf="canvas"]', `document.querySelector('button[aria-label="Text"]').click()`);
  expect(insertCanvas, `insert took ${insertCanvas.toFixed(0)} ms`).toBeLessThanOrEqual(100 * SLACK);

  // Source view updated after another visual edit within 200 ms.
  const insertSource = await timeToChange(page, '[data-perf="source"]', `document.querySelector('button[aria-label="Text"]').click()`);
  expect(insertSource, `source update took ${insertSource.toFixed(0)} ms`).toBeLessThanOrEqual(200 * SLACK);

  // Preview within 3 s.
  const t0 = Date.now();
  await expect(page.getByRole('region', { name: 'Preview' }).locator('svg').first()).toBeVisible({ timeout: 3000 * SLACK });
  expect(Date.now() - t0).toBeLessThanOrEqual(3000 * SLACK);
});
