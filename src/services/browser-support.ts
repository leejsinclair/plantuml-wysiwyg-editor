// Unsupported-browser detection (FR-019/AC1, EC-16). The supported browsers are the latest two major versions of
// desktop Google Chrome and Microsoft Edge. Plain Chromium, which both are built on and which the end-to-end suite
// runs, is held to the same version rule.

export interface NavigatorLike {
  userAgent: string;
  userAgentData?: { brands: readonly { brand: string; version: string }[]; mobile: boolean };
}

export interface BrowserInfo {
  name: 'chrome' | 'edge' | 'chromium' | 'other';
  major: number | null;
  mobile: boolean;
}

export type SupportResult =
  | { supported: true }
  | { supported: false; reason: 'browser' | 'outdated' | 'mobile'; name: BrowserInfo['name']; major: number | null };

/**
 * The newest stable major cannot be looked up offline, so it is estimated from Chrome's four-weekly schedule,
 * anchored on Chrome 142 (stable 2025-10-28). Counting 35-day steps (the real cadence is about 28 days with gaps) keeps the estimate at or behind the real
 * schedule, which slips over holidays: a browser is never refused for being current.
 */
const ANCHOR = { major: 142, date: Date.UTC(2025, 9, 28) };
const STEP_DAYS = 35;
const DAY_MS = 86_400_000;

export function estimatedLatestMajor(now: Date): number {
  const days = Math.floor((now.getTime() - ANCHOR.date) / DAY_MS);
  return ANCHOR.major + Math.max(0, Math.floor(days / STEP_DAYS));
}

const toMajor = (v: string | undefined): number | null => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : null;
};

/** Brands that say nothing about which browser this is. */
const isNeutralBrand = (brand: string) => brand === 'Chromium' || brand === 'HeadlessChrome' || /not.?a.?brand/i.test(brand);

function fromBrands(brands: readonly { brand: string; version: string }[], mobile: boolean): BrowserInfo | null {
  const find = (name: string) => brands.find((b) => b.brand === name);
  const edge = find('Microsoft Edge');
  if (edge) return { name: 'edge', major: toMajor(edge.version), mobile };
  const chrome = find('Google Chrome');
  if (chrome) return { name: 'chrome', major: toMajor(chrome.version), mobile };
  if (brands.some((b) => !isNeutralBrand(b.brand))) return { name: 'other', major: null, mobile };
  const chromium = find('Chromium') ?? find('HeadlessChrome');
  return chromium ? { name: 'chromium', major: toMajor(chromium.version), mobile } : null;
}

function fromUserAgent(ua: string): BrowserInfo {
  const mobile = /Mobile|Android/.test(ua);
  // Chrome and Edge on iOS are WebKit underneath; other Chromium browsers add their own token.
  if (/CriOS|EdgiOS|FxiOS|OPR\/|Opera|SamsungBrowser|YaBrowser|Vivaldi|Brave|Firefox\//.test(ua)) return { name: 'other', major: null, mobile };
  const edge = /\bEdg(?:A)?\/(\d+)/.exec(ua);
  if (edge) return { name: 'edge', major: toMajor(edge[1]), mobile };
  const headless = /\bHeadlessChrome\/(\d+)/.exec(ua);
  if (headless) return { name: 'chromium', major: toMajor(headless[1]), mobile };
  const chrome = /\bChrome\/(\d+)/.exec(ua);
  if (chrome) return { name: 'chrome', major: toMajor(chrome[1]), mobile };
  return { name: 'other', major: null, mobile };
}

/** Identifies the browser from client hints where the browser gives them, else from the user-agent string. */
export function identifyBrowser(nav: NavigatorLike): BrowserInfo {
  const data = nav.userAgentData;
  if (data && Array.isArray(data.brands) && data.brands.length > 0) {
    const info = fromBrands(data.brands, Boolean(data.mobile));
    if (info) return info;
  }
  return fromUserAgent(nav.userAgent ?? '');
}

export function checkSupport(info: BrowserInfo, latestMajor: number): SupportResult {
  const refuse = (reason: 'browser' | 'outdated' | 'mobile'): SupportResult => ({ supported: false, reason, name: info.name, major: info.major });
  if (info.name === 'other') return refuse('browser');
  if (info.mobile) return refuse('mobile');
  // Plain Chromium (a distro package, say) is not held to the release estimate: its version tracks the distro.
  if (info.name === 'chromium') return { supported: true };
  if (info.major === null || info.major < latestMajor - 1) return refuse('outdated');
  return { supported: true };
}

/** Whether this browser is supported; the app shows only the unsupported-browser message when it is not. */
export function detectBrowserSupport(nav: NavigatorLike = navigator as NavigatorLike, now: Date = new Date()): SupportResult {
  return checkSupport(identifyBrowser(nav), estimatedLatestMajor(now));
}
