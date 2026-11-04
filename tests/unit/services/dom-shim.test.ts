import { describe, expect, it } from 'vitest';
import { installDomShim, type MeasureContext } from '../../../src/services/render/dom-shim.ts';

// A fixed-width font: every character is 0.5em wide, ascent 0.8em, descent 0.2em.
const fakeContext = (): MeasureContext => {
  const ctx = {
    font: '',
    measureText(text: string) {
      const size = parseFloat(ctx.font);
      return { width: text.length * size * 0.5, fontBoundingBoxAscent: size * 0.8, fontBoundingBoxDescent: size * 0.2 };
    },
  };
  return ctx;
};

interface Doc {
  createElementNS(ns: string | null, tag: string): El;
  createTextNode(s: string): El;
  createProcessingInstruction(t: string, d: string): El;
  importNode(): never;
}
interface El {
  appendChild(c: El): El;
  insertBefore(c: El, ref: El | null): El;
  removeChild(c: El): El;
  setAttribute(k: string, v: unknown): void;
  setAttributeNS(ns: string | null, k: string, v: unknown): void;
  getAttribute(k: string): string | null;
  getBBox(): { x: number; y: number; width: number; height: number };
  getContext(kind: string): MeasureContext | null;
  textContent: string;
  firstChild: El | null;
  style: Record<string, unknown> & { setProperty(k: string, v: unknown): void };
}

function setup() {
  const scope: Record<string, unknown> = {};
  const shim = installDomShim(scope, fakeContext);
  const doc = scope.document as Doc;
  const serializer = new (scope.XMLSerializer as new () => { serializeToString(n: El): string })();
  return { scope, shim, doc, serialize: (n: El) => serializer.serializeToString(n) };
}

const SVG = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

describe('render worker DOM shim', () => {
  it('serialises an SVG tree like XMLSerializer', () => {
    const { doc, serialize } = setup();
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('width', 10);
    const g = svg.appendChild(doc.createElementNS(SVG, 'g'));
    const text = g.appendChild(doc.createElementNS(SVG, 'text'));
    text.setAttribute('x', '1');
    text.textContent = 'a < b & "c"';
    g.appendChild(doc.createElementNS(SVG, 'rect'));
    expect(serialize(svg)).toBe(
      `<svg xmlns="${SVG}" width="10"><g><text x="1">a &lt; b &amp; "c"</text><rect/></g></svg>`,
    );
  });

  it('declares a namespace prefix once, before the first attribute that needs it', () => {
    const { doc, serialize } = setup();
    const svg = doc.createElementNS(SVG, 'svg');
    const a = svg.appendChild(doc.createElementNS(SVG, 'a'));
    a.setAttribute('id', 'x');
    a.setAttributeNS(XLINK, 'xlink:href', '#Login');
    const b = a.appendChild(doc.createElementNS(SVG, 'a'));
    b.setAttributeNS(XLINK, 'xlink:href', '#Home');
    expect(serialize(svg)).toBe(
      `<svg xmlns="${SVG}"><a id="x" xmlns:xlink="${XLINK}" xlink:href="#Login"><a xlink:href="#Home"/></a></svg>`,
    );
  });

  it('escapes attribute values and writes style properties in order', () => {
    const { doc, serialize } = setup();
    const el = doc.createElementNS(SVG, 'text');
    el.setAttribute('title', 'a "b" <c>');
    el.style.setProperty('fill', 'red');
    el.style.fontSize = '12px';
    expect(el.style.fill).toBe('red');
    expect(serialize(el)).toBe(`<text xmlns="${SVG}" title="a &quot;b&quot; &lt;c&gt;" style="fill:red;font-size:12px"/>`);
  });

  it('moves, inserts and removes children', () => {
    const { doc, serialize } = setup();
    const root = doc.createElementNS(null, 'r');
    const other = doc.createElementNS(null, 'o');
    const a = root.appendChild(doc.createElementNS(null, 'a'));
    root.insertBefore(doc.createElementNS(null, 'b'), a);
    other.appendChild(a);
    expect(serialize(root)).toBe('<r><b/></r>');
    expect(serialize(other)).toBe('<o><a/></o>');
    other.removeChild(a);
    expect(serialize(other)).toBe('<o/>');
  });

  it('writes processing instructions', () => {
    const { doc, serialize } = setup();
    const root = doc.createElementNS(SVG, 'svg');
    root.appendChild(doc.createProcessingInstruction('plantuml', '1.2026.9'));
    expect(serialize(root)).toBe(`<svg xmlns="${SVG}"><?plantuml 1.2026.9?></svg>`);
  });

  it('measures text with the font bounding box of the first child or the element', () => {
    const { doc } = setup();
    const text = doc.createElementNS(SVG, 'text');
    text.setAttribute('font-size', '20');
    text.textContent = 'abcd';
    expect(text.getBBox()).toEqual({ x: 0, y: -16, width: 40, height: 20 });

    const g = doc.createElementNS(SVG, 'g');
    const inner = g.appendChild(doc.createElementNS(SVG, 'text'));
    inner.setAttribute('font-size', '10');
    inner.textContent = 'ab';
    expect(g.getBBox()).toEqual({ x: 0, y: -8, width: 10, height: 10 });

    const plain = doc.createElementNS(SVG, 'text');
    plain.textContent = 'a';
    expect(plain.getBBox().width).toBe(7); // 14px default
    expect(plain.getContext('2d')).not.toBeNull();
    expect(plain.getContext('webgl')).toBeNull();
  });

  it('refuses DOMParser and importNode and records them as missing', () => {
    const { scope, shim, doc } = setup();
    const parser = new (scope.DOMParser as new () => { parseFromString(): never })();
    expect(() => parser.parseFromString()).toThrow(/not supported/);
    expect(() => doc.importNode()).toThrow(/not supported/);
    expect([...shim.missing].sort()).toEqual(['DOMParser', 'importNode']);
  });
});
