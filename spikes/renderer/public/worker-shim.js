// Dedicated worker with the minimal DOM the engine's SVG writer uses: createElementNS, attributes, children,
// textContent, style, processing instructions, XMLSerializer, and canvas text measurement through OffscreenCanvas.
self.window = self;
const missing = new Set();
const measureCtx = new OffscreenCanvas(1, 1).getContext('2d');

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

class Node {
  constructor(doc) { this.ownerDocument = doc; this.childNodes = []; this.parentNode = null; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
  insertBefore(c, ref) { if (!ref) return this.appendChild(c); if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, c); return c; }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes.at(-1) ?? null; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes = []; if (v !== '' && v != null) this.appendChild(new Text(this.ownerDocument, String(v))); }
}
class Text extends Node {
  constructor(doc, data) { super(doc); this.data = data; this.nodeType = 3; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
  serialize() { return escText(this.data); }
}
class PI extends Node {
  constructor(doc, target, data) { super(doc); this.target = target; this.data = data; this.nodeType = 7; }
  serialize() { return `<?${this.target} ${this.data}?>`; }
}
class Style {
  constructor() { this.props = new Map(); }
  setProperty(k, v) { this.props.set(k, v); }
}
const styleProxy = () => new Proxy(new Style(), {
  get: (t, k) => (k in t ? t[k] : t.props.get(k)),
  set: (t, k, v) => { t.props.set(String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v); return true; },
});
class Element extends Node {
  constructor(doc, ns, tag) { super(doc); this.namespaceURI = ns; this.tagName = this.nodeName = this.localName = tag; this.attrs = new Map(); this.attrNs = new Map(); this.nodeType = 1; this.style = styleProxy(); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  setAttributeNS(ns, k, v) { this.attrs.set(k, String(v)); if (ns && k.includes(':')) this.attrNs.set(k, ns); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  getContext(kind) { return kind === '2d' ? new OffscreenCanvas(1, 1).getContext('2d') : null; }
  getBBox() {
    // Only text is measured this way by the engine (D6D); same font metrics as canvas measureText.
    const size = parseFloat(this.firstChild?.getAttribute?.('font-size') ?? this.getAttribute('font-size') ?? 14);
    const family = this.firstChild?.getAttribute?.('font-family') ?? this.getAttribute('font-family') ?? 'sans-serif';
    measureCtx.font = `${size}px ${family}`;
    const m = measureCtx.measureText(this.textContent);
    return { x: 0, y: -m.fontBoundingBoxAscent, width: m.width, height: m.fontBoundingBoxAscent + m.fontBoundingBoxDescent };
  }
  serialize(isRoot, declared = new Set()) {
    // Like XMLSerializer: declare a prefix just before the first attribute that needs it, once per subtree.
    const scope = new Set(declared);
    const attrs = [...this.attrs].map(([k, v]) => {
      const prefix = k.split(':')[0];
      let decl = '';
      if (this.attrNs.has(k) && !scope.has(prefix)) { scope.add(prefix); decl = ` xmlns:${prefix}="${this.attrNs.get(k)}"`; }
      return `${decl} ${k}="${escAttr(v)}"`;
    }).join('');
    const style = this.style.props.size ? ` style="${escAttr([...this.style.props].map(([k, v]) => `${k}:${v}`).join(';'))}"` : '';
    const xmlns = isRoot && this.namespaceURI && !this.attrs.has('xmlns') ? ` xmlns="${this.namespaceURI}"` : '';
    const inner = this.childNodes.map((c) => c.serialize(false, scope)).join('');
    return inner ? `<${this.tagName}${xmlns}${attrs}${style}>${inner}</${this.tagName}>` : `<${this.tagName}${xmlns}${attrs}${style}/>`;
  }
}
class Document extends Node {
  constructor() { super(null); this.ownerDocument = this; this.body = new Element(this, null, 'body'); this.head = new Element(this, null, 'head'); this.documentElement = null; }
  createElementNS(ns, tag) { return new Element(this, ns, tag); }
  createElement(tag) { return new Element(this, null, tag); }
  createTextNode(s) { return new Text(this, s); }
  createProcessingInstruction(t, d) { return new PI(this, t, d); }
  getElementById() { missing.add('getElementById'); return null; }
  importNode() { missing.add('importNode'); throw new Error('importNode not supported in worker'); }
}
// Installed after the support scripts load: viz-global.js treats a defined `document` as a page.
self.installDom = () => {
  self.document = new Document();
  self.XMLSerializer = class { serializeToString(n) { return n.serialize(true); } };
  self.DOMParser = class { parseFromString() { missing.add('DOMParser'); throw new Error('DOMParser not supported in worker'); } };
};

importScripts('/worker.js');
self.SHIM_MISSING = missing;
