import { describe, expect, it } from 'vitest';
import {
  checkSupport,
  detectBrowserSupport,
  estimatedLatestMajor,
  identifyBrowser,
  type NavigatorLike,
} from '../../../src/services/browser-support.ts';

const brands = (...b: [string, string][]) => b.map(([brand, version]) => ({ brand, version }));
const ua = {
  chrome: (v: number) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
  edge: (v: number) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36 Edg/${v}.0.0.0`,
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 OPR/120.0.0.0',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0.0.0 Mobile/15E148 Safari/604.1',
  headless: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36',
};

describe('identifyBrowser', () => {
  it('reads Chrome and Edge from client-hint brands', () => {
    expect(identifyBrowser({ userAgent: ua.chrome(154), userAgentData: { brands: brands(['Not;A=Brand', '24'], ['Chromium', '154'], ['Google Chrome', '154']), mobile: false } }))
      .toEqual({ name: 'chrome', major: 154, mobile: false });
    expect(identifyBrowser({ userAgent: ua.edge(153), userAgentData: { brands: brands(['Microsoft Edge', '153'], ['Not.A/Brand', '99'], ['Chromium', '153']), mobile: false } }))
      .toEqual({ name: 'edge', major: 153, mobile: false });
  });

  it('treats plain Chromium, including the headless test browser, as Chromium', () => {
    expect(identifyBrowser({ userAgent: ua.headless, userAgentData: { brands: brands(['Not:A-Brand', '8'], ['Chromium', '156'], ['HeadlessChrome', '156']), mobile: false } }))
      .toEqual({ name: 'chromium', major: 156, mobile: false });
    expect(identifyBrowser({ userAgent: ua.headless })).toEqual({ name: 'chromium', major: 156, mobile: false });
  });

  it('identifies other Chromium-based browsers as other', () => {
    expect(identifyBrowser({ userAgent: ua.chrome(154), userAgentData: { brands: brands(['Brave', '154'], ['Chromium', '154'], ['Not_A Brand', '24']), mobile: false } }).name).toBe('other');
    expect(identifyBrowser({ userAgent: ua.opera }).name).toBe('other');
  });

  it('falls back to the user-agent string when there are no client hints', () => {
    expect(identifyBrowser({ userAgent: ua.chrome(153) })).toEqual({ name: 'chrome', major: 153, mobile: false });
    expect(identifyBrowser({ userAgent: ua.edge(154) })).toEqual({ name: 'edge', major: 154, mobile: false });
    expect(identifyBrowser({ userAgent: ua.firefox })).toEqual({ name: 'other', major: null, mobile: false });
    expect(identifyBrowser({ userAgent: ua.safari })).toEqual({ name: 'other', major: null, mobile: false });
    expect(identifyBrowser({ userAgent: ua.chromeAndroid })).toEqual({ name: 'chrome', major: 154, mobile: true });
    expect(identifyBrowser({ userAgent: ua.chromeIos }).name).toBe('other');
  });
});

describe('estimatedLatestMajor', () => {
  it('never runs ahead of the four-weekly release schedule', () => {
    expect(estimatedLatestMajor(new Date('2025-10-28T12:00:00Z'))).toBe(142);
    // A year on: at most 13 four-weekly releases (the estimate counts 35-day steps, so a current browser is never refused); the estimate stays at or below that.
    const yearOn = estimatedLatestMajor(new Date('2026-10-27T12:00:00Z'));
    expect(yearOn).toBeGreaterThanOrEqual(152);
    expect(yearOn).toBeLessThanOrEqual(155);
  });

  it('does not go below the anchor for an earlier clock', () => {
    expect(estimatedLatestMajor(new Date('2020-01-01T00:00:00Z'))).toBe(142);
  });
});

describe('checkSupport (FR-019/AC1, VO-136)', () => {
  const latest = 154;
  it('accepts the latest two majors of Chrome and Edge on the desktop, and newer ones', () => {
    for (const name of ['chrome', 'edge', 'chromium'] as const) {
      expect(checkSupport({ name, major: 154, mobile: false }, latest)).toEqual({ supported: true });
      expect(checkSupport({ name, major: 153, mobile: false }, latest)).toEqual({ supported: true });
      expect(checkSupport({ name, major: 156, mobile: false }, latest)).toEqual({ supported: true });
    }
  });

  it('refuses older versions, other browsers and mobile browsers, saying why', () => {
    expect(checkSupport({ name: 'chrome', major: 152, mobile: false }, latest)).toEqual({ supported: false, reason: 'outdated', name: 'chrome', major: 152 });
    expect(checkSupport({ name: 'edge', major: null, mobile: false }, latest)).toEqual({ supported: false, reason: 'outdated', name: 'edge', major: null });
    expect(checkSupport({ name: 'other', major: null, mobile: false }, latest)).toEqual({ supported: false, reason: 'browser', name: 'other', major: null });
    expect(checkSupport({ name: 'chrome', major: 154, mobile: true }, latest)).toEqual({ supported: false, reason: 'mobile', name: 'chrome', major: 154 });
  });
});

describe('detectBrowserSupport', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const nav = (n: NavigatorLike) => detectBrowserSupport(n, now);

  it('reports an unsupported browser instead of failing silently (EC-16)', () => {
    expect(nav({ userAgent: ua.firefox }).supported).toBe(false);
    expect(nav({ userAgent: ua.safari }).supported).toBe(false);
    expect(nav({ userAgent: ua.chrome(120) }).supported).toBe(false);
    expect(nav({ userAgent: ua.chromeAndroid }).supported).toBe(false);
  });

  it('accepts a current Chrome, Edge and the bundled test browser', () => {
    expect(nav({ userAgent: ua.chrome(154), userAgentData: { brands: brands(['Google Chrome', '154'], ['Chromium', '154']), mobile: false } }).supported).toBe(true);
    expect(nav({ userAgent: ua.edge(155) }).supported).toBe(true);
    expect(nav({ userAgent: ua.headless }).supported).toBe(true);
  });

  it('never throws on an odd navigator', () => {
    expect(nav({ userAgent: '' }).supported).toBe(false);
    expect(nav({ userAgent: ua.chrome(154), userAgentData: { brands: [], mobile: false } }).supported).toBe(true);
  });
});
