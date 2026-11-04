// Image export (T170; FR-014/AC2, AC3, R-9).
//
// - SVG export downloads the SVG the preview shows: the render queue's sanitised SVG, sanitised once more as
//   the preview does, made standalone (namespace declared, HTML-only entities written as numeric references so
//   the file is well-formed XML).
// - PNG export draws that same SVG into a canvas at exactly 2× its natural width and height, whatever the
//   screen's pixel density, and saves it with `toBlob('image/png')`.
// - Nothing is fetched: the SVG is loaded from a `data:` URL and saved through a `Blob` link.

/** PNG is always drawn at twice the SVG's natural size (spec clarification, FR-014/AC3). */
export const PNG_SCALE = 2;

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface SvgSize {
  readonly width: number;
  readonly height: number;
}

/** The root `<svg …>` start tag, or `null`. */
function rootTag(svg: string): string | null {
  return /<svg\b[^>]*>/i.exec(svg)?.[0] ?? null;
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

/** A positive length in user units or px; `null` for percentages, other units or nothing. */
function pixels(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/i.exec(value);
  const n = match ? Number(match[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The SVG's natural size in whole pixels: the root's `width` and `height`, else its inline style, else its
 * `viewBox`. `null` when none of them gives a size.
 */
export function svgSize(svg: string): SvgSize | null {
  const tag = rootTag(svg);
  if (!tag) return null;
  const style = attribute(tag, 'style') ?? '';
  const fromStyle = (prop: string) => pixels(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(style)?.[1]);
  let width = pixels(attribute(tag, 'width')) ?? fromStyle('width');
  let height = pixels(attribute(tag, 'height')) ?? fromStyle('height');
  if (width === null || height === null) {
    const box = (attribute(tag, 'viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
    if (box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) {
      width ??= box[2]!;
      height ??= box[3]!;
    }
  }
  if (width === null || height === null) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * The preview's SVG markup as a standalone file: the SVG namespace is declared on the root, and `&nbsp;` (which
 * the HTML serialiser writes but XML does not define) becomes `&#160;`. The image is otherwise unchanged.
 */
export function standaloneSvg(markup: string): string {
  let out = markup.replace(/&nbsp;/g, '&#160;');
  const tag = rootTag(out);
  if (tag && attribute(tag, 'xmlns') === null) out = out.replace(/<svg\b/i, `<svg xmlns="${SVG_NS}"`);
  return out;
}

/** Characters that cannot appear in a file name (R-9); control characters are replaced too. */
const NOT_IN_FILE_NAME = new Set('\\/:*?"<>|');

/** "<project> - <block>.<ext>", with characters a file name cannot hold replaced by `-`. */
export function imageFileName(project: string, block: string, extension: 'svg' | 'png'): string {
  const base = [...`${project} - ${block}`]
    .map((ch) => (NOT_IN_FILE_NAME.has(ch) || ch.charCodeAt(0) < 0x20 || ch === '\u007f' ? '-' : ch))
    .join('');
  return `${base}.${extension}`;
}

/** Offers `blob` as a download named `fileName`. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked after the click has been handled, so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Downloads the SVG. */
export function exportSvg(svg: string, fileName: string, save: (blob: Blob, fileName: string) => void = saveBlob): void {
  save(new Blob([svg], { type: 'image/svg+xml' }), fileName);
}

/** Browser parts the PNG export uses, replaceable in tests. */
export interface PngDeps {
  loadImage(url: string): Promise<HTMLImageElement>;
  createCanvas(): HTMLCanvasElement;
}

const browserPngDeps: PngDeps = {
  loadImage: (url) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'sync';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The SVG could not be loaded as an image'));
      image.src = url;
    }),
  createCanvas: () => document.createElement('canvas'),
};

/** Rasterises `svg` at exactly `PNG_SCALE`× its natural size. */
export async function svgToPng(svg: string, deps: PngDeps = browserPngDeps): Promise<Blob> {
  const image = await deps.loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const size = svgSize(svg) ?? { width: image.naturalWidth, height: image.naturalHeight };
  if (!(size.width > 0 && size.height > 0)) throw new Error('The SVG has no size');
  const canvas = deps.createCanvas();
  canvas.width = size.width * PNG_SCALE;
  canvas.height = size.height * PNG_SCALE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The PNG could not be created'))), 'image/png');
  });
}

/** Downloads the SVG as a PNG at 2×. Rejects when the image cannot be drawn. */
export async function exportPng(
  svg: string,
  fileName: string,
  deps: PngDeps = browserPngDeps,
  save: (blob: Blob, fileName: string) => void = saveBlob,
): Promise<void> {
  save(await svgToPng(svg, deps), fileName);
}
