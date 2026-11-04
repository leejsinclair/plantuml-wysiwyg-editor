// T125: User Story 5 Independent Test. Create three screens, rename one to "Sign in" (saved as Sign-in),
// duplicate it, reorder and delete screens; download and re-import, and the order and names are kept
// (FR-011/AC1–AC3, AC7, AC9, AC12; VO-026, VO-027, VO-030, VO-114, VO-117).
import { test, expect } from './fixtures.ts';

test('screens are added, renamed, duplicated, reordered and deleted, and survive download and re-import', async ({ app, page }) => {
  await app.open();
  await app.createProject();
  const panel = app.projectPanel;
  const screenNames = async () => (await app.readProjectPanel()).map((b) => b.name);
  const entry = (name: string) => panel.getByRole('listitem').filter({ has: page.getByRole('button', { name, exact: true }) });

  // Three screens: the new project's Screen-1, then two more, each opened when added.
  await panel.getByRole('button', { name: 'Add screen', exact: true }).click();
  await panel.getByRole('button', { name: 'Add screen', exact: true }).click();
  expect(await screenNames()).toEqual(['Screen-1', 'Screen-2', 'Screen-3']);
  await expect(panel.getByRole('button', { name: 'Screen-3', exact: true })).toHaveAttribute('aria-current', 'true');

  // Rename Screen-2 to "Sign in": the preview shows the saved name while typing.
  await entry('Screen-2').getByRole('button', { name: /^Rename/ }).click();
  const field = panel.getByRole('textbox', { name: 'Name' });
  await field.fill('Sign in');
  await expect(field).toHaveValue('Sign in');
  await expect(panel.getByText('Will be saved as Sign-in')).toBeVisible();
  await field.press('Enter');
  expect(await screenNames()).toEqual(['Screen-1', 'Sign-in', 'Screen-3']);

  // Duplicate it: the copy goes directly after the original and opens.
  await entry('Sign-in').getByRole('button', { name: /^Duplicate/ }).click();
  expect(await screenNames()).toEqual(['Screen-1', 'Sign-in', 'Copy-of-Sign-in', 'Screen-3']);
  await expect(panel.getByRole('button', { name: 'Copy-of-Sign-in', exact: true })).toHaveAttribute('aria-current', 'true');

  // Reorder: Screen-3 moves up past the copy.
  await entry('Screen-3').getByRole('button', { name: /^Move up/ }).click();
  expect(await screenNames()).toEqual(['Screen-1', 'Sign-in', 'Screen-3', 'Copy-of-Sign-in']);

  // Delete Screen-1 (no step links to it): no confirmation, an Undo, and its neighbour opens.
  await panel.getByRole('button', { name: 'Screen-1', exact: true }).click();
  await entry('Screen-1').getByRole('button', { name: /^Delete/ }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await screenNames()).toEqual(['Sign-in', 'Screen-3', 'Copy-of-Sign-in']);
  await expect(panel.getByRole('button', { name: 'Sign-in', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('region', { name: 'Notifications' }).getByRole('button', { name: 'Undo' })).toBeVisible();

  // Download and re-import: order and names are kept.
  const file = await app.download();
  const text = file.bytes.toString('utf8');
  expect(text).toContain('@startsalt Sign-in');
  expect(text.indexOf('@startsalt Sign-in')).toBeLessThan(text.indexOf('@startsalt Screen-3'));
  expect(text.indexOf('@startsalt Screen-3')).toBeLessThan(text.indexOf('@startsalt Copy-of-Sign-in'));

  await app.importFile({ name: 'screens.puml', bytes: file.bytes });
  expect(await screenNames()).toEqual(['Sign-in', 'Screen-3', 'Copy-of-Sign-in']);
});
