import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

// Precache every built file, renderer assets included, so the app, preview and export work offline (FR-018, R-10).
declare const self: {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install', listener: () => void): void;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.addEventListener('install', () => void self.skipWaiting());
