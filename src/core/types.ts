// Shared core types (contracts/core-api.md §1 and §3, data-model §4.2, §4.5 and §6.2).
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

/** A range of offsets in UTF-16 code units, `0 ≤ start ≤ end ≤ length`. Syntax nodes hold
 *  block-relative ranges; segments hold file-absolute ranges (data-model §4.2). */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

/** Replace `source.slice(start, end)` with `text`. Offsets are file-absolute. A list of edits
 *  for one operation never overlaps and is applied from the highest offset down. */
export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** Block status as shown in the project panel. The values are the exact interface strings
 *  (FR-010/AC1, contracts/ui.md §4). */
export type BlockStatus =
  | 'Editable'
  | 'Has locked parts'
  | 'Source only'
  | 'Error'
  | 'Older format'
  | 'Cannot be rendered';

export const BLOCK_STATUSES: readonly BlockStatus[] = [
  'Editable',
  'Has locked parts',
  'Source only',
  'Error',
  'Older format',
  'Cannot be rendered',
];

/** Render status of a block's current text. "Not yet checked" is the interface string; the
 *  other two are internal states shown through the preview and the block status. */
export type RenderStatus = 'Not yet checked' | 'rendered' | 'failed';

export const RENDER_STATUSES: readonly RenderStatus[] = ['Not yet checked', 'rendered', 'failed'];

/** Spec section 4: 1 supported, 2 unsupported constructs, 3 invalid, 4 cannot be rendered. */
export type SourceCategory = 1 | 2 | 3 | 4;

export type BlockKind = 'screen' | 'flow' | 'other';

/** Structural path: child indexes from the root grid (screen) or main path (flow). */
export type Path = readonly number[];

/** Single selection inside one block (data-model §6.2). */
export interface Selection {
  readonly blockKey: string;
  readonly path: Path;
}

/** Values substituted into a catalogue message. Diagram content is passed through unchanged. */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * A problem found by the editor's grammar (data-model §4.5).
 * - `syntax`: category 3, invalid or incomplete source.
 * - `ignoredContent`: several root grids or text after the root grid; worded differently from
 *   syntax errors because the content will not appear in the image (FR-008/AC8, EC-08).
 * - `unsupported`: why a block is source-only or a part is locked.
 * Rendering problems are never diagnostics (they are render results).
 */
export type DiagnosticKind = 'syntax' | 'ignoredContent' | 'unsupported';

export interface Diagnostic {
  readonly kind: DiagnosticKind;
  /** 1-based line within the block, used by "Fix in source" (FR-004/AC4). */
  readonly line: number;
  /** Block-relative. */
  readonly range: TextRange;
  readonly messageKey: string;
  readonly params?: MessageParams;
}

/** Every operation returns edits, never a new source string. A refused operation changes
 *  nothing (FR-008/AC3). */
export type OpResult =
  | {
      readonly ok: true;
      readonly edits: readonly TextEdit[];
      readonly select: Path;
      readonly announceKey: string;
      readonly announceParams?: MessageParams;
      /** A message key naming the action on the undo and redo controls; `announceParams` fill it too. */
      readonly historyName: string;
    }
  | { readonly ok: false; readonly messageKey: string; readonly params?: MessageParams };
