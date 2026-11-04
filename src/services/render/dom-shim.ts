// The minimal DOM the PlantUML engine's SVG writer needs inside a dedicated worker (spike-renderer.md, ported
// from spikes/renderer/public/worker-shim.js, whose output was byte-identical to the main thread for 188/188
// SVGs). It provides createElementNS, attributes (with XMLSerializer's `xmlns:` placement), children,
// textContent, style, processing instructions and XMLSerializer. Text is measured with OffscreenCanvas
// `measureText`, and getBBox uses the font bounding box, which is what makes the layout match.
//
// DOMParser and importNode are deliberately missing: the engine uses them only to embed SVG images, and a
// diagram that needs them fails with an identifiable error instead of rendering differently.
//
// Install it only after viz-global.js has loaded: that script treats a defined `document` as a page.

/** The 2D context surface the engine and `getBBox` use for text. */
export interface MeasureContext {
  font: string;
  measureText(text: string): { width: number; fontBoundingBoxAscent: number; fontBoundingBoxDescent: number };
}

/** Creates a 2D context for measuring text; OffscreenCanvas in the worker, substitutable in tests. */
export type ContextFactory = () => MeasureContext | null;

const offscreenContext: ContextFactory = () =>
  typeof OffscreenCanvas === 'undefined'
    ? null
    : (new OffscreenCanvas(1, 1).getContext('2d') as unknown as MeasureContext | null);

const escText = (s: unknown): string => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: unknown): string => escText(s).replace(/"/g, '&quot;');

interface Env {
  missing: Set<string>;
  newContext: ContextFactory;
  measure: MeasureContext | null;
}

class ShimNode {
  childNodes: ShimNode[] = [];
  parentNode: ShimNode | null = null;
  ownerDocument: ShimDocument;

  constructor(doc: ShimDocument | null) {
    this.ownerDocument = doc ?? (this as unknown as ShimDocument);
  }

  appendChild<T extends ShimNode>(c: T): T {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }

  insertBefore<T extends ShimNode>(c: T, ref: ShimNode | null): T {
    if (!ref) return this.appendChild(c);
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.childNodes.splice(this.childNodes.indexOf(ref), 0, c);
    return c;
  }

  removeChild<T extends ShimNode>(c: T): T {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) this.childNodes.splice(i, 1);
    c.parentNode = null;
    return c;
  }

  get firstChild(): ShimNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): ShimNode | null {
    return this.childNodes.at(-1) ?? null;
  }

  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(v: unknown) {
    this.childNodes = [];
    if (v !== '' && v != null) this.appendChild(new ShimText(this.ownerDocument, String(v)));
  }

  serialize(_isRoot: boolean, _declared?: ReadonlySet<string>): string {
    return '';
  }
}

class ShimText extends ShimNode {
  readonly nodeType = 3;
  data: string;

  constructor(doc: ShimDocument, data: string) {
    super(doc);
    this.data = data;
  }

  override get textContent(): string {
    return this.data;
  }

  override set textContent(v: unknown) {
    this.data = String(v);
  }

  override serialize(): string {
    return escText(this.data);
  }
}

class ShimProcessingInstruction extends ShimNode {
  readonly nodeType = 7;

  constructor(
    doc: ShimDocument,
    readonly target: string,
    readonly data: string,
  ) {
    super(doc);
  }

  override serialize(): string {
    return `<?${this.target} ${this.data}?>`;
  }
}

class Style {
  props = new Map<string, unknown>();
  setProperty(k: string, v: unknown): void {
    this.props.set(k, v);
  }
}

/** `element.style`: `setProperty` and camelCase assignment both land in one ordered property map. */
const styleProxy = (): Style =>
  new Proxy(new Style(), {
    get: (t, k) => (k in t ? t[k as keyof Style] : t.props.get(String(k))),
    set: (t, k, v) => {
      t.props.set(String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v);
      return true;
    },
  });

class ShimElement extends ShimNode {
  readonly nodeType = 1;
  readonly tagName: string;
  readonly nodeName: string;
  readonly localName: string;
  readonly attrs = new Map<string, string>();
  readonly attrNs = new Map<string, string>();
  readonly style = styleProxy();

  constructor(
    doc: ShimDocument,
    readonly namespaceURI: string | null,
    tag: string,
    private readonly env: Env,
  ) {
    super(doc);
    this.tagName = this.nodeName = this.localName = tag;
  }

  setAttribute(k: string, v: unknown): void {
    this.attrs.set(k, String(v));
  }

  setAttributeNS(ns: string | null, k: string, v: unknown): void {
    this.attrs.set(k, String(v));
    if (ns && k.includes(':')) this.attrNs.set(k, ns);
  }

  getAttribute(k: string): string | null {
    return this.attrs.has(k) ? this.attrs.get(k)! : null;
  }

  hasAttribute(k: string): boolean {
    return this.attrs.has(k);
  }

  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }

  getContext(kind: string): MeasureContext | null {
    return kind === '2d' ? this.env.newContext() : null;
  }

  /** Only text is measured this way by the engine; the same font metrics as canvas `measureText`. */
  getBBox(): { x: number; y: number; width: number; height: number } {
    const first = this.firstChild instanceof ShimElement ? this.firstChild : null;
    const size = parseFloat(first?.getAttribute('font-size') ?? this.getAttribute('font-size') ?? '14');
    const family = first?.getAttribute('font-family') ?? this.getAttribute('font-family') ?? 'sans-serif';
    const ctx = (this.env.measure ??= this.env.newContext());
    if (!ctx) {
      this.env.missing.add('measureText');
      throw new Error('Text measurement is not available in this worker');
    }
    ctx.font = `${size}px ${family}`;
    const m = ctx.measureText(this.textContent);
    return {
      x: 0,
      y: -m.fontBoundingBoxAscent,
      width: m.width,
      height: m.fontBoundingBoxAscent + m.fontBoundingBoxDescent,
    };
  }

  /** Like XMLSerializer: a prefix is declared just before the first attribute that needs it, once per subtree. */
  override serialize(isRoot: boolean, declared: ReadonlySet<string> = new Set()): string {
    const scope = new Set(declared);
    const attrs = [...this.attrs]
      .map(([k, v]) => {
        const prefix = k.split(':')[0]!;
        let decl = '';
        if (this.attrNs.has(k) && !scope.has(prefix)) {
          scope.add(prefix);
          decl = ` xmlns:${prefix}="${this.attrNs.get(k)}"`;
        }
        return `${decl} ${k}="${escAttr(v)}"`;
      })
      .join('');
    const props = this.style.props;
    const style = props.size ? ` style="${escAttr([...props].map(([k, v]) => `${k}:${String(v)}`).join(';'))}"` : '';
    const xmlns = isRoot && this.namespaceURI && !this.attrs.has('xmlns') ? ` xmlns="${this.namespaceURI}"` : '';
    const inner = this.childNodes.map((c) => c.serialize(false, scope)).join('');
    return inner
      ? `<${this.tagName}${xmlns}${attrs}${style}>${inner}</${this.tagName}>`
      : `<${this.tagName}${xmlns}${attrs}${style}/>`;
  }
}

class ShimDocument extends ShimNode {
  readonly body: ShimElement;
  readonly head: ShimElement;
  documentElement: ShimElement | null = null;

  constructor(private readonly env: Env) {
    super(null);
    this.body = new ShimElement(this, null, 'body', env);
    this.head = new ShimElement(this, null, 'head', env);
  }

  createElementNS(ns: string | null, tag: string): ShimElement {
    return new ShimElement(this, ns, tag, this.env);
  }

  createElement(tag: string): ShimElement {
    return new ShimElement(this, null, tag, this.env);
  }

  createTextNode(s: unknown): ShimText {
    return new ShimText(this, String(s));
  }

  createProcessingInstruction(target: string, data: string): ShimProcessingInstruction {
    return new ShimProcessingInstruction(this, target, data);
  }

  getElementById(): null {
    this.env.missing.add('getElementById');
    return null;
  }

  importNode(): never {
    this.env.missing.add('importNode');
    throw new Error('importNode is not supported in the render worker');
  }
}

export interface DomShim {
  /** DOM features the engine asked for that the shim does not provide, for diagnosis. */
  readonly missing: ReadonlySet<string>;
}

/**
 * Installs `document`, `XMLSerializer` and a refusing `DOMParser` on `scope` (the worker's global object).
 * Call it after viz-global.js, themes.js, openiconic.js and emoji.js have loaded and before plantuml.js runs.
 */
export function installDomShim(scope: object, newContext: ContextFactory = offscreenContext): DomShim {
  const env: Env = { missing: new Set(), newContext, measure: null };
  const target = scope as Record<string, unknown>;
  target.document = new ShimDocument(env);
  target.XMLSerializer = class {
    serializeToString(n: ShimNode): string {
      return n.serialize(true);
    }
  };
  target.DOMParser = class {
    parseFromString(): never {
      env.missing.add('DOMParser');
      throw new Error('DOMParser is not supported in the render worker');
    }
  };
  return { missing: env.missing };
}
