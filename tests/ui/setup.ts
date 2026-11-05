import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Mantine's color-scheme detection calls window.matchMedia which jsdom does not implement.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mantine's SegmentedControl observes its size; jsdom has no ResizeObserver.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;

// The interface defaults to Simple; most UI tests exercise the full (Advanced) layout.
beforeEach(() => { try { localStorage.setItem('plantuml-editor.mode', 'advanced'); } catch { /* ignore */ } });

afterEach(() => cleanup());
