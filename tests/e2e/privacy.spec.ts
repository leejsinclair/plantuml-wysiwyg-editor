// T178: only the application's own files are requested during editing, rendering, export and import, and no
// request carries diagram content (VO-074, VO-070 end to end, SC-008).
import { test, expect } from './fixtures.ts';

const SECRET = 'Zq-confidential-marker-7431';

test('no diagram content leaves the browser and only the app origin is contacted (VO-074)', async ({ app, page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));

  await app.open();
  await app.importFile({ name: 'privacy.puml', bytes: `@startsalt Screen-1\n{\n  ${SECRET} | [OK]\n}\n@endsalt\n` });
  await expect(page.getByRole('region', { name: 'Preview' }).locator('svg').first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole('region', { name: 'Palette' }).getByRole('button', { name: 'Text', exact: true }).click();
  await app.download(page.getByRole('button', { name: 'Export SVG' }));
  await app.download(page.getByRole('button', { name: 'Download', exact: true }));

  expect(requests.length).toBeGreaterThan(0);
  for (const r of requests) {
    if (r.url.startsWith('data:') || r.url.startsWith('blob:')) continue;
    expect(new URL(r.url).origin, `${r.method} ${r.url}`).toBe(origin);
    expect(r.method, r.url).toBe('GET');
    expect(r.url).not.toContain(SECRET);
    expect(r.body ?? '').not.toContain(SECRET);
  }
});
