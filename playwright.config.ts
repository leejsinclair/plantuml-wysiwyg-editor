import { defineConfig, devices } from '@playwright/test';

// Chrome and Edge are the supported browsers (FR-019). Their branded channels run when installed
// (PW_BRANDED=1); Playwright's bundled Chromium always runs, so the suite works on any machine.
const branded = process.env.PW_BRANDED === '1'
  ? [
      { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
      { name: 'msedge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    ]
  : [];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 800 }, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, ...branded],
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI },
});
