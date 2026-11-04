// Sanitising rendered SVG before it is shown inline (R-8, FR-017/AC4).
//
// DOMPurify's SVG profile removes scripts, event handlers and foreign content. On top of it,
// every `href` / `xlink:href` must be an internal `#fragment` (linked flow steps, `<use>`) or an
// embedded `data:image/…` image, and every CSS `url(…)` must point at a fragment or an embedded
// image, so nothing in a rendered diagram can reach the network.
import createDOMPurify, { type DOMPurify } from 'dompurify';

const HREF_ATTRIBUTES = new Set(['href', 'xlink:href']);
const EMBEDDED_IMAGE = /^data:image\//i;
const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/gis;

/** An href the sanitised SVG may keep: `#fragment` or `data:image/…`, exactly as written. */
export function isAllowedHref(value: string): boolean {
  return value.startsWith('#') || EMBEDDED_IMAGE.test(value);
}

/** True when CSS text loads anything from outside the SVG. */
function hasExternalCssReference(css: string): boolean {
  if (/@import/i.test(css)) return true;
  for (const match of css.matchAll(CSS_URL)) {
    if (!isAllowedHref((match[2] ?? '').trim())) return true;
  }
  return false;
}

let purifier: DOMPurify | null = null;

/** A private DOMPurify instance, so these hooks never affect other users of the library. */
function getPurifier(): DOMPurify {
  if (purifier) return purifier;
  const instance = createDOMPurify(window);
  instance.addHook('uponSanitizeAttribute', (_node, data) => {
    const name = data.attrName.toLowerCase();
    if (HREF_ATTRIBUTES.has(name) && !isAllowedHref(data.attrValue)) data.keepAttr = false;
    else if (/url\(|@import/i.test(data.attrValue) && hasExternalCssReference(data.attrValue)) data.keepAttr = false;
  });
  instance.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style' && hasExternalCssReference(node.textContent ?? '')) node.textContent = '';
  });
  purifier = instance;
  return instance;
}

/** Returns the SVG markup with everything unsafe removed. Runs on the main thread. */
export function sanitizeSvg(svg: string): string {
  return getPurifier().sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}
