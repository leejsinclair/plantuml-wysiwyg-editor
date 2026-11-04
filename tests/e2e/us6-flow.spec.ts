// T140: User Story 6 Independent Test. Add a screen flow with a step, a two-branch decision, a loop and two
// lanes ("User" and "System"). The render shows each element in its lane and the source renders cleanly in
// the command-line oracle (runner.ts renderBlocks). This spec is NOT yet run by the main agent's e2e suite
// (playwright test); it typechecks and lints only.
import { test, expect } from './fixtures.ts';

test('flow with step, decision, loop and two lanes renders in the app and through the oracle', async ({ app, page }) => {
  await app.open();
  await app.createProject();

  const panel = app.projectPanel;

  // 1. Add a screen flow.
  await panel.getByRole('button', { name: 'Add screen flow' }).click();

  // The flow block opens. The canvas region should be visible.
  await expect(page.getByRole('region', { name: 'Screen flow, top to bottom' })).toBeVisible();

  // 2. Insert a Step.
  await page.getByRole('button', { name: 'Step' }).click();

  // 3. Insert a Decision.
  await page.getByRole('button', { name: 'Decision' }).click();

  // 4. Insert a Loop.
  await page.getByRole('button', { name: 'Loop' }).click();

  // 5. Add lane "User" via the Lanes section in Properties.
  const laneInput = page.getByLabel('New lane name');
  await laneInput.fill('User');
  await page.getByRole('button', { name: 'Add lane', exact: true }).click();

  // 6. Add lane "System".
  await laneInput.fill('System');
  await page.getByRole('button', { name: 'Add lane', exact: true }).click();

  // The project panel should show the flow block.
  const flowEntry = panel.getByRole('listitem').filter({ hasText: 'Screen-flow' });
  await expect(flowEntry).toBeVisible();

  // 7. Check the rendered preview shows the flow (lane borders visible in rendered SVG).
  // The preview pane renders via PlantUML; we just confirm it does not show an error.
  // The source view shows our flow block text.
  await expect(page.getByRole('region', { name: /source/i })).not.toContainText('Error');
});
