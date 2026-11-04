// Downloading a project as one `.puml` file (FR-006/AC4, AC8, FR-014/AC1, AC6, EC-12, R-9).
//
// - The file is the stored source exactly: a leading U+FEFF becomes the byte-order mark, and line endings and
//   the final newline are kept. Every block is included unchanged, whatever its status.
// - The file name is the project name with characters that cannot appear in a file name replaced by `-`.
// - The report lists the blocks standard PlantUML will report errors for (those the editor detects and those the
//   renderer has reported), how many blocks the renderer has not yet checked, and whether the screen flow would
//   become other content on re-import (it is invalid or source-only).
// - Only this download marks a project downloaded (data-model §7.5); the caller records it.

import type { BlockView } from '../../core/project/project.ts';

export interface DownloadReport {
  /** Blocks that cannot be rendered, in file order. */
  readonly unrenderable: readonly BlockView[];
  /** Blocks not in `unrenderable` that the renderer has not yet checked. */
  readonly notChecked: number;
  /** The screen flow, when it would be imported as other content. */
  readonly flowWillBeOther: BlockView | null;
}

const UNRENDERABLE = new Set(['Error', 'Older format', 'Cannot be rendered']);

export function downloadReport(views: readonly BlockView[]): DownloadReport {
  const unrenderable = views.filter((b) => UNRENDERABLE.has(b.status) || b.renderStatus === 'failed' || b.classification.dependsOnExternal);
  const notChecked = views.filter((b) => !unrenderable.includes(b) && b.renderStatus === 'Not yet checked').length;
  const flow = views.find((b) => b.kind === 'flow') ?? null;
  return { unrenderable, notChecked, flowWillBeOther: flow && !flow.classification.flowCandidate ? flow : null };
}

// Windows forbids <>:"/\|?* and control characters; a name may not end with a dot or space.
const FORBIDDEN = /[<>:"/\\|?*]/g;
const isControl = (ch: string): boolean => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f;
const RESERVED = /^(?:con|prn|aux|nul|com\d|lpt\d)$/i;

/** The download file name for a project name (R-9). */
export function downloadFileName(projectName: string): string {
  let base = [...projectName.normalize('NFC')]
    .map((ch) => (isControl(ch) ? '-' : ch))
    .join('')
    .replace(FORBIDDEN, '-').trim().replace(/[. ]+$/, '');
  if (base === '' || /^-+$/.test(base)) base = 'project';
  if (RESERVED.test(base)) base = `${base}-project`;
  return `${base}.puml`;
}

/** The file's contents: the source as UTF-8, with no line-ending conversion. */
export function projectBlob(source: string): Blob {
  return new Blob([source], { type: 'text/plain;charset=utf-8', endings: 'transparent' });
}

/** Saves a blob through a temporary link, as the browser's own download. */
export function saveBlob(blob: Blob, fileName: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  doc.body.append(link);
  link.click();
  link.remove();
  // Revoked later, so the browser has started reading it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export interface DownloadInput {
  readonly name: string;
  readonly source: string;
  readonly views: readonly BlockView[];
}

export interface DownloadOptions {
  readonly save?: (blob: Blob, fileName: string) => void;
}

/** Downloads the project and returns what the notices need. Always succeeds; nothing is left out. */
export function downloadProject(input: DownloadInput, options: DownloadOptions = {}): DownloadReport & { readonly fileName: string } {
  const fileName = downloadFileName(input.name);
  (options.save ?? saveBlob)(projectBlob(input.source), fileName);
  return { ...downloadReport(input.views), fileName };
}
