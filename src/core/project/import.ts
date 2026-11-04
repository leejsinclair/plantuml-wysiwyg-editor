// Importing a `.puml` file as a new project (spec section 3.6 "Import", FR-006/AC5, AC6, AC13, AC14, AC17,
// data-model §7.6, contracts/core-api.md §6).
//
// - The bytes must be UTF-8 text (with or without a byte-order mark); a binary or non-UTF-8 file is refused and
//   nothing is created.
// - The stored source is the decoded text unchanged, with a leading U+FEFF when the file had a byte-order mark,
//   so a download gives the same bytes back (FR-020/AC2).
// - Every block is classified without the renderer; the first supported activity block is the flow.
// - An empty file gets one new screen; a file with no screen or flow keeps only other content and says why.
// - The block to open is the first visually editable screen, else the flow, else the first block.
//
// Deviation from the contract sketch: the core has no runtime block keys, so the result gives `openIndex`
// (a block position in file order) instead of `openKey`; the caller maps it to a key after loading.

import { decode } from '../source/decode.ts';
import { blocks, importSource, NEW_PROJECT_NAME, withKeys, type ProjectState } from './project.ts';

/** The message key of the status shown when a file holds no screen and no flow (EC-01). */
export const ONLY_OTHER_CONTENT_KEY = 'storage.import.onlyOtherContent';

const BOM = '﻿';

export interface ImportOptions {
  /** Names already in the library; a clash appends `today`. */
  readonly takenNames?: readonly string[];
  /** The import date as shown when appended, e.g. "2026-10-28". */
  readonly today?: string;
}

export type ImportResult =
  | { readonly ok: false; readonly reason: 'not-utf8' | 'binary' }
  | {
      readonly ok: true;
      readonly bom: boolean;
      readonly name: string;
      /** The project to store: `source` keeps a leading U+FEFF when the file had a byte-order mark. */
      readonly state: ProjectState;
      /** The block to open, in file order (FR-006/AC17). */
      readonly openIndex: number;
      /** A status to show about the project as a whole, or `null`. */
      readonly noticeKey: string | null;
    };

/** The project name for a file: its name without the extension, with `today` appended on a clash. */
export function projectNameFromFile(fileName: string, takenNames: readonly string[], today: string): string {
  const base = fileName.replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  const name = (dot > 0 ? base.slice(0, dot) : dot === 0 ? '' : base).trim() || NEW_PROJECT_NAME;
  return takenNames.includes(name) ? `${name} ${today}` : name;
}

/** The first screen that can be edited visually, else the flow, else the first block (FR-006/AC17). */
export function openIndexFor(state: ProjectState): number {
  let n = 0;
  const views = blocks(withKeys(state, () => `i${++n}`));
  const screen = views.find((b) => b.kind === 'screen' && (b.status === 'Editable' || b.status === 'Has locked parts'));
  if (screen) return screen.index;
  const flow = views.find((b) => b.kind === 'flow');
  return flow ? flow.index : 0;
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function importFile(bytes: Uint8Array, fileName: string, options: ImportOptions = {}): ImportResult {
  const decoded = decode(bytes);
  if (!decoded.ok) return { ok: false, reason: decoded.reason };
  const imported = importSource(decoded.text);
  // decode() strips the byte-order mark; the stored source keeps it so the download is byte-identical.
  // It is a text segment to split(), so block indices do not change.
  const state: ProjectState = decoded.bom ? { ...imported, source: BOM + imported.source } : imported;
  let n = 0;
  const views = blocks(withKeys(state, () => `i${++n}`));
  const onlyOther = views.length > 0 && views.every((b) => b.kind === 'other');
  return {
    ok: true,
    bom: decoded.bom,
    name: projectNameFromFile(fileName, options.takenNames ?? [], options.today ?? isoDate()),
    state,
    openIndex: openIndexFor(state),
    noticeKey: onlyOther ? ONLY_OTHER_CONTENT_KEY : null,
  };
}
