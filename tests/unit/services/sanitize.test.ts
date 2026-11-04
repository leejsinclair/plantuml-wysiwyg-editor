// @vitest-environment jsdom
// DOMPurify needs a DOM, so this unit test runs in jsdom; the module runs on the main thread.
import { describe, expect, it } from 'vitest';
import { isAllowedHref, sanitizeSvg } from '../../../src/services/render/sanitize.ts';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function svg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50">${body}</svg>`;
}

function parse(markup: string): Document {
  return new DOMParser().parseFromString(markup, 'image/svg+xml');
}

describe('isAllowedHref (R-8)', () => {
  it('keeps internal fragments and embedded images only', () => {
    expect(isAllowedHref('#Login')).toBe(true);
    expect(isAllowedHref('#')).toBe(true);
    expect(isAllowedHref(PNG)).toBe(true);
    expect(isAllowedHref('DATA:IMAGE/svg+xml;base64,PHN2Zy8+')).toBe(true);
  });

  it('refuses everything else', () => {
    for (const href of [
      'https://example.com/',
      'http://example.com/x.png',
      '//example.com/x',
      'javascript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:application/javascript,alert(1)',
      'file:///etc/passwd',
      'relative/path.png',
      ' #fragment-with-leading-space',
      '',
    ]) {
      expect(isAllowedHref(href), href).toBe(false);
    }
  });
});

describe('sanitizeSvg (VO-071, FR-017/AC4)', () => {
  it('removes scripts', () => {
    const out = sanitizeSvg(svg('<script>alert(1)</script><text x="1" y="10">Hello</text>'));
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain('alert');
    expect(parse(out).querySelector('text')?.textContent).toBe('Hello');
  });

  it('removes event handlers', () => {
    const out = sanitizeSvg(svg('<rect width="10" height="10" onclick="alert(1)" onmouseover="x()"/>'));
    expect(out).not.toMatch(/onclick|onmouseover/i);
    expect(parse(out).querySelector('rect')?.getAttribute('width')).toBe('10');
  });

  it('removes an svg onload handler', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><g/></svg>');
    expect(out).not.toMatch(/onload/i);
    expect(out).toMatch(/^<svg/);
  });

  it('removes external link targets but keeps the link text', () => {
    const out = sanitizeSvg(
      svg('<a href="https://example.com/" xlink:href="https://example.com/"><text>Out</text></a>'),
    );
    expect(out).not.toContain('example.com');
    expect(parse(out).querySelector('text')?.textContent).toBe('Out');
  });

  it('removes javascript: links', () => {
    const out = sanitizeSvg(svg('<a xlink:href="javascript:alert(1)"><text>x</text></a>'));
    expect(out).not.toMatch(/javascript/i);
  });

  it('removes external images and references from use elements', () => {
    const out = sanitizeSvg(
      svg('<image href="http://example.com/a.png" width="1" height="1"/><use xlink:href="http://example.com/s.svg#a"/>'),
    );
    expect(out).not.toContain('example.com');
  });

  it('removes external url() references in attributes and style sheets', () => {
    const out = sanitizeSvg(
      svg(
        '<style>@import url("https://example.com/x.css"); rect { fill: url(https://example.com/p.svg#p) }</style>' +
          '<rect width="1" height="1" style="fill: url(https://example.com/p.svg#p)" filter="url(http://example.com/f)"/>',
      ),
    );
    expect(out).not.toContain('example.com');
    expect(parse(out).querySelector('rect')?.getAttribute('width')).toBe('1');
  });

  it('removes foreignObject content', () => {
    const out = sanitizeSvg(svg('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'));
    expect(out).not.toMatch(/foreignObject/i);
  });

  it('keeps internal links (linked flow steps)', () => {
    const out = sanitizeSvg(svg('<a href="#Login" xlink:href="#Login"><text>Sign in</text></a>'));
    const link = parse(out).querySelector('a');
    expect(link?.getAttribute('href')).toBe('#Login');
    expect(link?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#Login');
    expect(link?.textContent).toBe('Sign in');
  });

  it('keeps embedded images', () => {
    const out = sanitizeSvg(svg(`<image width="1" height="1" xlink:href="${PNG}"/>`));
    expect(parse(out).querySelector('image')?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(PNG);
  });

  it('keeps internal url() references such as gradients and filters', () => {
    const out = sanitizeSvg(
      svg('<defs><linearGradient id="g"/></defs><rect width="1" height="1" fill="url(#g)" style="fill: url(#g)"/>'),
    );
    const rect = parse(out).querySelector('rect');
    expect(rect?.getAttribute('fill')).toBe('url(#g)');
    expect(rect?.getAttribute('style')).toContain('url(#g)');
  });

  it('keeps ordinary diagram markup, including non-English text', () => {
    const out = sanitizeSvg(
      svg('<g><rect x="1" y="2" width="3" height="4" fill="#FEFECE"/><text x="5" y="6" font-family="sans-serif">Zahlung prüfen — 支払い</text><path d="M0 0 L1 1"/></g>'),
    );
    const doc = parse(out);
    expect(doc.querySelector('rect')?.getAttribute('fill')).toBe('#FEFECE');
    expect(doc.querySelector('text')?.textContent).toBe('Zahlung prüfen — 支払い');
    expect(doc.querySelector('path')?.getAttribute('d')).toBe('M0 0 L1 1');
  });

  it('does not change how a second call behaves (no hook leaks into the global DOMPurify)', async () => {
    const { default: DOMPurify } = await import('dompurify');
    const out = DOMPurify.sanitize('<a href="https://example.com/">x</a>');
    expect(out).toContain('https://example.com/');
    expect(sanitizeSvg(svg('<a href="https://example.com/"><text>x</text></a>'))).not.toContain('example.com');
  });
});
