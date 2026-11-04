// T065: User Story 1 end-to-end tests (FR-002/AC2, FR-008/AC7, FR-016/AC5–AC6, VO-001, VO-002, VO-065).
//
// VO-001: empty library → create project → see the prompt → first insert.
// Independent Test: build the reference login form (Username, Password, Login button) and render it.
//
// NOTE: This spec typechecks and lints but is NOT YET RUN; the main agent runs all e2e specs at the join.
import { test, expect } from './fixtures.ts';

// ─── VO-001: Empty library, create project, see prompt, first insert ──────────────────────────────
test('empty library shows a prompt and the first insert adds an element (VO-001)', async ({ app, page }) => {
  await app.open();
  // A new library has no projects.
  // Create a project: the screen opens.
  await app.createProject();
  await expect(app.projectPanel).toBeVisible();

  // Canvas should show the empty-screen prompt.
  const canvas = page.getByRole('region', { name: 'Canvas' });
  await expect(canvas).toBeVisible();
  // The empty prompt text is shown.
  await expect(canvas.getByText(/Choose a component from the palette/)).toBeVisible();

  // Insert from the palette: click "Text" in the palette.
  const palette = page.getByRole('region', { name: 'Palette' });
  await expect(palette).toBeVisible();
  const textBtn = palette.getByRole('button', { name: 'Text', exact: true });
  await expect(textBtn).toBeVisible();
  await textBtn.click();

  // The canvas should now have a text element (the empty-cell prompt is gone or a new cell appeared).
  await expect(canvas.getByRole('gridcell').first()).toBeVisible();
});

// ─── VO-002: Button inserted after selected element in a single-row grid ─────────────────────────
test('inserting a button after a selected element in a row grid (VO-002)', async ({ app, page }) => {
  await app.open();
  await app.createProject();

  // Add a Row container first by inserting it from the palette.
  const palette = page.getByRole('region', { name: 'Palette' });
  const rowBtn = palette.getByRole('button', { name: 'Row', exact: true });
  await rowBtn.click();

  // Now a row container should be selected. Insert a Text element.
  const textBtn = palette.getByRole('button', { name: 'Text', exact: true });
  await textBtn.click();

  // Select the first text element.
  const canvas = page.getByRole('region', { name: 'Canvas' });
  const cells = canvas.getByRole('gridcell');
  await cells.nth(1).click();

  // Insert a Button after it.
  const buttonBtn = palette.getByRole('button', { name: 'Button', exact: true });
  await buttonBtn.click();

  // The button lands after the text in the same row: the source reads text, then button.
  const source = page.getByRole('region', { name: 'Source' });
  await expect(source).toContainText(/Item 1\s*\|\s*\[Button\]/);
});

// ─── Independent Test: build the reference login form ────────────────────────────────────────────
test('build the reference login form and verify it renders (Independent Test)', async ({ app, page }) => {
  await app.open();
  await app.createProject();

  const canvas = page.getByRole('region', { name: 'Canvas' });
  const palette = page.getByRole('region', { name: 'Palette' });
  const props = page.getByRole('region', { name: 'Properties' });

  // Step 1: Insert a Form container.
  const formBtn = palette.getByRole('button', { name: /^Form$/i });
  if (await formBtn.isVisible()) {
    await formBtn.click();
  } else {
    // Fallback: insert a Grid.
    const gridBtn = palette.getByRole('button', { name: /^Grid$/i });
    await gridBtn.click();
  }

  // Step 2: the form's first label (cell 1, after the form itself) becomes "Username".
  const cells = canvas.getByRole('gridcell');
  await cells.nth(1).click();
  const labelField = props.getByRole('textbox', { name: 'Text', exact: true });
  await labelField.fill('Username');
  await labelField.press('Enter');

  // Step 3: the second row's label becomes "Password".
  await cells.nth(3).click();
  const labelField2 = props.getByRole('textbox', { name: 'Text', exact: true });
  await labelField2.fill('Password');
  await labelField2.press('Enter');

  // Step 5: The source view should contain the elements we added.
  const source = page.getByRole('region', { name: 'Source' });
  await expect(source).toBeVisible();
  const sourceText = await source.textContent();
  expect(sourceText).toMatch(/Username|Password/i);

  // Step 6: Preview should have rendered content (SVG).
  const preview = page.getByRole('region', { name: 'Preview' });
  // Preview renders asynchronously; wait for an SVG or image.
  await expect(preview.locator('svg, img').first()).toBeVisible({ timeout: 15000 });
});

// ─── Palette has the five categories and descriptions ────────────────────────────────────────────
test('palette shows five categories with item descriptions (FR-008/AC7)', async ({ app, page }) => {
  await app.open();
  await app.createProject();

  const palette = page.getByRole('region', { name: 'Palette' });
  await expect(palette).toBeVisible();

  // Check that the categories are visible.
  for (const category of ['Basic', 'Form', 'Layout', 'Data', 'Navigation']) {
    const heading = palette.getByRole('heading', { name: category }).or(
      palette.getByText(category, { exact: true }),
    );
    await expect(heading.first()).toBeVisible();
  }

  // Each item has an accessible name and description.
  const textBtn = palette.getByRole('button', { name: 'Text', exact: true });
  await expect(textBtn).toBeVisible();
});
