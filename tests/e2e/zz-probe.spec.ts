import { test } from './fixtures.ts';
test('probe', async ({ app, page }) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message, e.stack?.split('\n').slice(0, 6).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 600)); });
  await app.open();
  await app.importFile('import/goto-label.puml', false);
  await page.waitForTimeout(1500);
  console.log('URL', page.url());
  console.log(await page.locator('body').innerText());
});
