import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The renderer's five files (plantuml.js, viz-global.js, themes.js, openiconic.js, emoji.js) reach the build as
// untouched `?url` assets imported by the render worker, so the precache below covers them (R-1, R-10).
export default defineConfig({
  // GitHub Pages serves the app under /<repo>/; the deploy workflow sets BASE_PATH. Local dev and e2e stay at '/'.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: 'auto',
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // plantuml.js is about 3.4 MB; the default 2 MiB limit would leave it out of the precache.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2023', chunkSizeWarningLimit: 4096 },
});
