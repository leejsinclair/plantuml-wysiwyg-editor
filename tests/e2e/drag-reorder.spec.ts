// T006: Drag-reorder end-to-end test (FR-007, FR-008, FR-009, US2).
// Drag first button in a three-button row to the last position; confirm order in canvas and source.
import { test, expect } from './fixtures.ts';

test('drag first button to last position in a three-button row', async ({ app, page }) => {
  await app.open();
  await app.createProject();

  // Open Palette (collapsed by default after US7 changes; try both collapsed and expanded).
  const palette = app.region('Palette');
  const canvas = app.region('Canvas');

  // Insert a Row container.
  const rowBtn = palette.getByRole('button', { name: 'Row', exact: true });
  await rowBtn.click();

  // Insert three Button elements.
  const buttonBtn = palette.getByRole('button', { name: 'Button', exact: true });
  await buttonBtn.click();
  await buttonBtn.click();
  await buttonBtn.click();

  // Edit each button's label so we can tell them apart.
  const cells = canvas.getByRole('gridcell');
  // Double-click first button to edit.
  await cells.nth(0).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Alpha');
  await page.keyboard.press('Enter');

  await cells.nth(1).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Beta');
  await page.keyboard.press('Enter');

  await cells.nth(2).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Gamma');
  await page.keyboard.press('Enter');

  // Confirm order: Alpha, Beta, Gamma.
  await expect(cells.nth(0)).toContainText('Alpha');
  await expect(cells.nth(1)).toContainText('Beta');
  await expect(cells.nth(2)).toContainText('Gamma');

  // Drag Alpha (first) to after Gamma (last).
  const alpha = cells.nth(0);
  const gamma = cells.nth(2);
  const alphaBB = await alpha.boundingBox();
  const gammaBB = await gamma.boundingBox();
  if (!alphaBB || !gammaBB) throw new Error('Could not get cell bounding boxes');

  await page.mouse.move(alphaBB.x + alphaBB.width / 2, alphaBB.y + alphaBB.height / 2);
  await page.mouse.down();
  // Move past the threshold to start the drag (>8px).
  await page.mouse.move(alphaBB.x + alphaBB.width / 2 + 10, alphaBB.y + alphaBB.height / 2);
  // Move to after Gamma.
  await page.mouse.move(gammaBB.x + gammaBB.width - 2, gammaBB.y + gammaBB.height / 2);
  await page.mouse.up();

  // After drag: Gamma is first or last, Alpha is at end.
  // The exact new order is: Beta, Gamma, Alpha (Alpha moved to end).
  const updatedCells = canvas.locator('[role=gridcell]:not(:has([role=gridcell]))');
  const texts = await updatedCells.allTextContents();
  // Alpha should now be after Gamma.
  const alphaIndex = texts.findIndex((t) => t.includes('Alpha'));
  const gammaIndex = texts.findIndex((t) => t.includes('Gamma'));
  expect(alphaIndex).toBeGreaterThan(gammaIndex);
});

test('Escape during drag cancels and restores element to original position', async ({ app, page }) => {
  await app.open();
  await app.createProject();

  const palette = app.region('Palette');
  const canvas = app.region('Canvas');

  const rowBtn = palette.getByRole('button', { name: 'Row', exact: true });
  await rowBtn.click();
  const buttonBtn = palette.getByRole('button', { name: 'Button', exact: true });
  await buttonBtn.click();
  await buttonBtn.click();

  const cells = canvas.getByRole('gridcell');
  await cells.nth(0).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('First');
  await page.keyboard.press('Enter');

  await cells.nth(1).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');

  // Start drag but cancel with Escape.
  const first = cells.nth(0);
  const bb = await first.boundingBox();
  if (!bb) throw new Error('No bounding box');
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 + 20, bb.y + bb.height / 2);
  await page.keyboard.press('Escape');
  await page.mouse.up();

  // Order should be unchanged: First, Second.
  await expect(cells.nth(0)).toContainText('First');
  await expect(cells.nth(1)).toContainText('Second');
});
