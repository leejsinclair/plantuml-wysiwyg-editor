// T175: automated WCAG 2.2 AA scan of every workspace state (VO-105, SC-003). Rendered diagram images are
// excluded (the preview diagram). The screen-reader part of SC-003 is judged in MV-003.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, type App } from './fixtures.ts';

const PROJECT = [
  '@startsalt Login',
  '{',
  '  Username | "      "',
  '  [Sign in] | [Cancel]',
  '}',
  '@endsalt',
  '@startuml Screen-flow',
  'start',
  ':[[#Login Sign in]];',
  'if (Ok?) then (yes)',
  '  :Done;',
  'else (no)',
  'endif',
  'stop',
  '@enduml',
  '@startuml',
  'salt',
  '{',
  '  [Old]',
  '}',
  '@enduml',
  '',
].join('\n');

async function scan(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('.preview-diagram')
    .analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `axe violations in state "${state}"`).toEqual([]);
}

const openBlock = (app: App, name: string) => app.projectPanel.getByRole('button', { name, exact: true }).click();

test('no WCAG 2.2 AA violations in any workspace state (VO-105)', async ({ app, page }) => {
  await app.open();
  await scan(page, 'empty library');

  await app.importFile({ name: 'a11y.puml', bytes: PROJECT });
  await expect(app.region('Canvas')).toBeVisible();

  await openBlock(app, 'Login');
  await scan(page, 'screen canvas');

  await app.region('Canvas').getByRole('gridcell').first().click();
  await scan(page, 'screen with a selection');

  await openBlock(app, 'Screen-flow');
  await expect(page.getByRole('region', { name: 'Screen flow, top to bottom' })).toBeVisible();
  await scan(page, 'flow canvas');

  await page.getByRole('region', { name: 'Screen flow, top to bottom' }).getByRole('treeitem').nth(1).click();
  await scan(page, 'flow with a selection');

  await page.getByRole('button', { name: 'Whole file', exact: true }).click();
  await scan(page, 'whole-file view');
  await page.getByRole('button', { name: 'Whole file', exact: true }).click();

  const older = app.projectPanel.getByRole('listitem').filter({ hasText: 'Older format' }).getByRole('button').first();
  await older.click();
  await scan(page, 'older-format block');

  await page.getByRole('button', { name: /Project panel/ , expanded: true }).first().click();
  await scan(page, 'panel collapsed');
});
