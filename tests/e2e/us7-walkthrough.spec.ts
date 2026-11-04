// T160: User Story 7 walkthrough. "Open screen" (button and Ctrl+Enter) focuses the screen's root grid and
// "Back to flow" re-selects the step (VO-039). Clicking a linked step in the rendered preview opens the screen
// (VO-042), including with the panels collapsed (VO-131).
import { test, expect } from './fixtures.ts';

const SOURCE = [
  '@startsalt Sign-in',
  '{',
  '  [Sign in]',
  '}',
  '@endsalt',
  '@startuml Screen-flow',
  'start',
  ':[[#Sign-in Enter credentials]];',
  ':Done;',
  'stop',
  '@enduml',
  '',
].join('\n');

const upload = { name: 'journey.puml', bytes: SOURCE };

test('Open screen and Back to flow return to the same step (VO-039)', async ({ app, page }) => {
  await app.open();
  await app.importFile(upload);
  await app.projectPanel.getByRole('listitem').filter({ hasText: 'Screen-flow' }).getByRole('button').first().click();

  const canvas = page.getByRole('region', { name: 'Screen flow, top to bottom' });
  await canvas.getByRole('treeitem', { name: /Enter credentials/ }).click();

  await page.getByRole('button', { name: 'Open screen' }).click();
  await expect(page.getByRole('region', { name: /Screen, / }).or(page.getByRole('region', { name: /canvas/i })).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to flow' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to flow' }).click();
  await expect(canvas.getByRole('treeitem', { name: /Enter credentials/ })).toHaveAttribute('aria-selected', 'true');

  // The shortcut does the same as the button.
  await canvas.getByRole('treeitem', { name: /Enter credentials/ }).focus();
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('button', { name: 'Back to flow' })).toBeVisible();
});

test('a click on a linked step in the preview opens the screen, with panels collapsed (VO-042, VO-131)', async ({ app, page }) => {
  await app.open();
  await app.importFile(upload);
  await app.projectPanel.getByRole('listitem').filter({ hasText: 'Screen-flow' }).getByRole('button').first().click();

  const diagram = page.getByLabel(/^Rendered image of /).first();
  await expect(diagram.locator('svg')).toBeVisible({ timeout: 15_000 });

  for (const name of ['Project panel', 'Palette', 'Outline', 'Properties']) {
    const toggle = page.getByRole('button', { name: new RegExp(`${name}`), expanded: true });
    if (await toggle.count()) await toggle.first().click();
  }

  await diagram.locator('a').first().click();
  await expect(page.getByRole('button', { name: 'Back to flow' })).toBeVisible();
});
