// T168: exporting images and copying source in the real browser (US8; VO-043, VO-044, VO-045).
//
// - The SVG export is the SVG shown in the preview, and the PNG is that SVG at exactly twice its natural width
//   and height (FR-014/AC3).
// - Copying confirms, and the clipboard holds the block's source, or the whole project's source equal to the
//   downloaded file (FR-014/AC4).
// - Image export of an invalid, older-format or `!include` block is refused with an explanation, while copying
//   still works (FR-014/AC5).
import type { Download, Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test, type App } from './fixtures.ts';

const SOURCE = [
  '@startsalt Sign-in\n{\n  Email | "            "\n  [Sign in] | .\n}\n@endsalt\n',
  '@startsalt Broken\n{\n  Name | "     "\n  [Save]\n@endsalt\n',
  '@startuml Login\nsalt\n{\n  Login | "MyName  "\n  [OK]\n}\n@enduml\n',
  '@startsalt Header\n!include common.puml\n{\n  Welcome\n}\n@endsalt\n',
].join('\n');

const button = (page: Page, name: string): Locator => page.getByRole('button', { name, exact: true });

async function downloadFrom(page: Page, control: Locator): Promise<{ download: Download; bytes: Buffer }> {
  const pending = page.waitForEvent('download');
  await control.click();
  const download = await pending;
  return { download, bytes: await readFile(await download.path()) };
}

/** The preview's rendered diagram, once the current text has rendered. */
async function renderedPreview(app: App, block: string): Promise<Locator> {
  const figure = app.region('Preview').getByRole('figure', { name: `Rendered image of ${block}` });
  await expect(figure).toBeVisible({ timeout: 30_000 });
  await expect(figure).toHaveAttribute('data-out-of-date', 'false');
  await expect(button(app.page, 'Export SVG')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  return figure;
}

/** PNG width and height from the IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function utf8(bytes: Buffer): string {
  const text = bytes.toString('utf8');
  return text.startsWith('﻿') ? text.slice(1) : text;
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('the SVG export equals the preview SVG and the PNG is exactly 2× its natural size (VO-043)', async ({ app, page }) => {
  await app.open();
  await app.importFile({ name: 'export.puml', bytes: SOURCE });
  await app.projectPanel.getByRole('button', { name: 'Sign-in', exact: true }).click();
  const figure = await renderedPreview(app, 'Sign-in');

  const svg = await downloadFrom(page, button(page, 'Export SVG'));
  expect(svg.download.suggestedFilename()).toMatch(/Sign-in\.svg$/);
  const exported = utf8(svg.bytes);
  expect(exported.startsWith('<svg')).toBe(true);

  // The same markup the preview shows, once both are parsed the same way.
  const same = await figure.evaluate((el, text) => {
    const shown = el.firstElementChild!.innerHTML;
    const parsed = document.createElement('div');
    parsed.innerHTML = text;
    return parsed.innerHTML === shown;
  }, exported);
  expect(same).toBe(true);

  // A standalone, well-formed SVG file.
  const wellFormed = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    return doc.getElementsByTagName('parsererror').length === 0 && doc.documentElement.localName === 'svg';
  }, exported);
  expect(wellFormed).toBe(true);

  const natural = await figure.evaluate((el) => {
    const root = el.querySelector('svg')!;
    return { width: Math.round(parseFloat(root.getAttribute('width')!)), height: Math.round(parseFloat(root.getAttribute('height')!)) };
  });
  expect(natural.width).toBeGreaterThan(0);

  const png = await downloadFrom(page, button(page, 'Export PNG'));
  expect(png.download.suggestedFilename()).toMatch(/Sign-in\.png$/);
  expect(pngSize(png.bytes)).toEqual({ width: natural.width * 2, height: natural.height * 2 });
});

test('copying confirms, and the clipboard holds the block or the downloaded project source (VO-045)', async ({ app, page }) => {
  await app.open();
  await app.importFile({ name: 'export.puml', bytes: SOURCE });
  await app.projectPanel.getByRole('button', { name: 'Sign-in', exact: true }).click();

  await button(page, 'Copy source').click();
  await expect(page.getByRole('status').filter({ hasText: 'copied' })).toBeVisible();
  const block = await page.evaluate(() => navigator.clipboard.readText());
  expect(block).toBe(SOURCE.slice(0, SOURCE.indexOf('@endsalt') + '@endsalt\n'.length));

  await button(page, 'Copy project source').click();
  await expect(page.getByRole('status').filter({ hasText: 'Project source copied' })).toBeVisible();
  const project = await page.evaluate(() => navigator.clipboard.readText());
  const downloaded = await app.download();
  expect(project).toBe(utf8(downloaded.bytes));
});

for (const { name, explanation } of [
  { name: 'Broken', explanation: /source has a problem/ },
  { name: 'Login', explanation: /older format/ },
  { name: 'Header', explanation: /!include/ },
]) {
  test(`image export of ${name} is refused with an explanation, while copy and download work (VO-044)`, async ({ app, page }) => {
    await app.open();
    await app.importFile({ name: 'export.puml', bytes: SOURCE });
    await app.projectPanel.getByRole('button', { name, exact: true }).click();

    let downloads = 0;
    page.on('download', () => downloads++);
    for (const control of ['Export SVG', 'Export PNG']) {
      await expect(button(page, control)).toHaveAttribute('aria-disabled', 'true');
      await expect(button(page, control)).toHaveAccessibleDescription(explanation);
      await button(page, control).click({ force: true });
      await expect(page.getByRole('status').filter({ hasText: explanation })).toBeVisible();
    }
    expect(downloads).toBe(0);

    await button(page, 'Copy source').click();
    await expect(page.getByRole('status').filter({ hasText: 'copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`@startsalt ${name}`.replace('@startsalt Login', '@startuml Login'));

    const downloaded = await app.download();
    expect(utf8(downloaded.bytes)).toBe(SOURCE);
  });
}
