import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // The persistent module cache keeps a stale `import.meta.glob` result when a message part is added under
    // src/ui/messages/en/, so the catalogue would miss its keys.
    fsModuleCache: false,
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
      {
        extends: true,
        test: { name: 'ui', environment: 'jsdom', include: ['tests/ui/**/*.test.{ts,tsx}'], setupFiles: ['tests/ui/setup.ts'] },
      },
      // The command-line oracle starts a JVM; it runs on its own with `npm run test:oracle`.
      { extends: true, test: { name: 'oracle', environment: 'node', include: ['tests/oracle/**/*.test.ts'], testTimeout: 120_000 } },
    ],
  },
});
