// Screen flow: the guidance, adding steps by click and by drag, and linking a step to a screen, both from the
// flow's Properties and by right-clicking an element on a screen (product-spec 3.7).
import { test, expect } from './fixtures.ts';

const SOURCE = [
  '@startsalt Sign-in',
  '{',
  '  [Sign in]',
  '}',
  '@endsalt',
  '@startsalt Home',
  '{',
  '  Welcome',
  '}',
  '@endsalt',
  '@startuml Screen-flow',
  'start',
  'stop',
  '@enduml',
  '',
].join('\n');

const upload = { name: 'journey.puml', bytes: SOURCE };

async function openBlock(app: import('./fixtures.ts').App, name: string): Promise<void> {
  await app.projectPanel.getByRole('listitem').filter({ hasText: name }).getByRole('button').first().click();
}

test('the flow explains how to add and link steps', async ({ app, page }) => {
  await app.open();
  await app.importFile(upload);
  await openBlock(app, 'Screen-flow');

  const canvas = page.getByRole('region', { name: 'Screen flow, top to bottom' });
  await expect(canvas.getByText('How screen flows work')).toBeVisible();
  await expect(canvas.getByText(/Link a step to a screen/)).toBeVisible();
});

test('clicking a palette item adds a step, which can be linked to a screen', async ({ app, page }) => {
  await app.open();
  await app.importFile(upload);
  await openBlock(app, 'Screen-flow');

  await page.getByRole('button', { name: 'Step', exact: true }).click();
  const canvas = page.getByRole('region', { name: 'Screen flow, top to bottom' });
  const step = canvas.getByRole('treeitem', { name: /^Step/ });
  await expect(step).toBeVisible();
  await expect(step).toContainText('Link to another screen');

  // The link control lives in Properties: a button opens a screen chooser, and a second button applies it.
  const properties = app.region('Properties');
  await properties.getByRole('button', { name: 'Link to another screen' }).click();
  await properties.getByRole('combobox', { name: 'Linked screen' }).selectOption('Home');
  await properties.getByRole('button', { name: 'Link to another screen' }).click();
  await expect(canvas.getByRole('treeitem', { name: /^Step/ }).getByLabel('Linked to screen Home')).toBeVisible();
});

test('dragging a palette item onto the flow adds it', async ({ app, page }) => {
  await app.open();
  await app.importFile(upload);
  await openBlock(app, 'Screen-flow');

  const canvas = page.getByRole('region', { name: 'Screen flow, top to bottom' });
  await expect(canvas.getByRole('treeitem', { name: /^Step/ })).toHaveCount(0);

  const from = await page.getByRole('button', { name: 'Step', exact: true }).boundingBox();
  const to = await canvas.getByText('Drop here to add at the end of the flow').boundingBox();
  if (!from || !to) throw new Error('missing drag geometry');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(canvas.getByRole('treeitem', { name: /^Step/ })).toHaveCount(1);
});

test('right-clicking an element on a screen links it to another screen through a new flow step', async ({ app, page }) => {
  await app.open();
  await app.importFile(upload);
  await openBlock(app, 'Sign-in');

  await app.region('Canvas').getByRole('gridcell').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /link to screen/i }).click();
  await page.getByRole('option', { name: 'Home' }).click();

  await app.projectPanel.getByRole('listitem').filter({ hasText: 'Screen-flow' }).getByRole('button').first().click();
  const canvas = page.getByRole('region', { name: 'Screen flow, top to bottom' });
  const step = canvas.getByRole('treeitem', { name: /Sign in/ });
  await expect(step).toBeVisible();
  await expect(step.getByLabel('Linked to screen Home')).toBeVisible();
});
