# Contract: Core module API and cross-context messages

`src/core` is pure TypeScript with no DOM or browser imports (constitution principle 9). Unit tests code against these signatures. Module paths follow the plan's project structure. Names and shapes are plan-level; enumerated string values that appear in the user interface are copied exactly from the spec.

## 1. Shared types

```ts
// core/source/edits.ts
export interface TextEdit { start: number; end: number; text: string }   // offsets into the source string
export function applyEdits(source: string, edits: readonly TextEdit[]): string;
export function invertEdits(source: string, edits: readonly TextEdit[]): TextEdit[];

// Status strings are the user-interface strings (FR-010/AC1).
export type BlockStatus =
  | 'Editable' | 'Has locked parts' | 'Source only' | 'Error' | 'Older format' | 'Cannot be rendered';
export type RenderStatus = 'Not yet checked' | 'rendered' | 'failed';
export type SourceCategory = 1 | 2 | 3 | 4;
export type BlockKind = 'screen' | 'flow' | 'other';
```

## 2. Source and blocks

```ts
// core/source/decode.ts
export type DecodeResult =
  | { ok: true; text: string; bom: boolean }
  | { ok: false; reason: 'not-utf8' | 'binary' };
export function decode(bytes: Uint8Array): DecodeResult;
export function encode(text: string, bom: boolean): Uint8Array;   // decode → encode is byte-identical

// core/blocks/split.ts
export type Segment =
  | { type: 'block'; start: number; end: number; opener: string; name: string | null }
  | { type: 'text'; start: number; end: number };
export function split(source: string): Segment[];   // segments cover the source exactly, in order

// core/blocks/classify.ts
export interface Classification {
  kind: BlockKind;
  category: SourceCategory;
  status: Exclude<BlockStatus, 'Cannot be rendered'>;   // the renderer adds that one
  reason: string | null;                                // plain-language message key
  problem?: { line: number; messageKey: string };       // category 3 only
  dependsOnInclude: boolean;
}
export function classify(blockText: string): Classification;

// core/blocks/convert.ts — "Convert to current format" (OD-5)
export function convertOlderFormat(source: string, block: Segment): TextEdit[];

// core/blocks/redivide.ts — on leaving the source view (FR-004/AC10)
export interface Redivision { edits: TextEdit[]; removedLinkedScreens: string[]; removesLastBlock: boolean }
export function redivide(source: string, blockStart: number, blockEnd: number): Redivision | null;  // null: still one block
```

## 3. Salt and activity

```ts
// core/salt/parser.ts and core/activity/parser.ts: lossless trees (R-3)
export interface Node { kind: string; start: number; end: number; children: Node[] }
export function parseSalt(blockText: string): { tree: Node; model: ScreenModel; errors: ParseError[] };
export function parseActivity(blockText: string): { tree: Node; model: FlowModel; errors: ParseError[] };
export interface ParseError { line: number; messageKey: string }

// Element addressing: a path of child indexes from the root grid (screen) or main path (flow).
export type Path = readonly number[];

// Every operation returns edits, never a new source string.
export type OpResult =
  | { ok: true; edits: TextEdit[]; select: Path; announceKey: string; historyName: string }
  | { ok: false; messageKey: string };   // FR-008/AC3: refused before anything changes

// core/salt/ops/*
export function insert(model: ScreenModel, selection: Path | null, item: PaletteItem): OpResult;
export function remove(model: ScreenModel, target: Path): OpResult;
export function move(model: ScreenModel, target: Path, to: Destination): OpResult;
export function moveByKey(model: ScreenModel, target: Path, dir: 'up' | 'down' | 'left' | 'right'): OpResult;
export function wrap(model: ScreenModel, target: Path, as: 'grid' | 'group box'): OpResult;
export function unwrap(model: ScreenModel, target: Path): OpResult;
export function setProperty(model: ScreenModel, target: Path, prop: string, value: unknown): OpResult;
// core/salt/destinations.ts — shared by drag and drop and "Move to…" (R-7)
export function validDestinations(model: ScreenModel, target: Path): Destination[];
// core/salt/labels.ts — "Table" | "Button bar" | "Form" | "Row" | "Column" | "Grid"
export function gridLabel(grid: GridModel): 'Table' | 'Button bar' | 'Form' | 'Row' | 'Column' | 'Grid';

// core/activity/ops/* mirror the Salt operations for steps, decisions, loops, notes, lanes and links.
export function setLink(flow: FlowModel, step: Path, screenId: string | null): OpResult;
export type LinkState = 'valid' | 'broken' | 'ambiguous';
```

`PaletteItem` values are the palette labels in [ui.md](ui.md) section 6. `Destination` identifies a container plus an empty cell, "at the end", or "before"/"after" an element.

## 4. Escaping

```ts
// core/salt/escape.ts, core/activity/escape.ts
export function escapeSaltText(text: string, ctx: { firstCellOfRow: boolean }): string;
export function unescapeSaltText(source: string): string;          // unescape(escape(t)) === t
export function escapeStepLabel(label: string, linked: boolean): string;
```

Trigger rules are in [project-file.md](project-file.md) section 8.

## 5. Names

```ts
// core/names/names.ts (R-12, section 3.6)
export function normalise(typed: string): string;                 // commit conversion; '' when nothing remains
export function fold(name: string): string;                       // NFC + toLowerCase(toUpperCase())
export function isAllowed(name: string): boolean;
export function generate(base: 'screen' | 'flow' | { fromLabel: string } | { copyOf: string | null },
                         taken: ReadonlySet<string>): string;     // "Screen-n", "Screen-flow", "Copy-of-<name>", "-2", "-3", …
export type RenameResult =
  | { ok: true; name: string; linkEdits: TextEdit[] }
  | { ok: false; reason: 'empty' } | { ok: false; reason: 'duplicate'; conflictsWith: string };
```

## 6. Project and history

```ts
// core/project/project.ts
export interface ProjectState {
  source: string;
  bom: boolean;
  flowIndex: number | null;              // position in file order of the flow block (R-4)
  lastWorking: Record<number, string>;   // block position → last working source
}
export interface BlockView {
  key: string; index: number; kind: BlockKind; name: string | null;
  status: BlockStatus; renderStatus: RenderStatus; reason: string | null;
  incomingLinks: number;                 // screens only (FR-015/AC2)
  nameFlag: 'not-allowed' | 'not-nfc' | 'duplicate' | null;
}
export function blocks(state: ProjectState, renders: ReadonlyMap<string, RenderStatus>): BlockView[];
export function importFile(bytes: Uint8Array, fileName: string): DecodeResult & { state?: ProjectState; openKey?: string };

// core/project/screens.ts: add, rename, duplicate, reorder, delete → OpResult (placement as project-file.md section 7)

// core/history/history.ts
export interface Entry { name: string; edits: TextEdit[]; inverse: TextEdit[]; select: { block: string; path: Path } }
export interface History {
  push(entry: Entry): void;              // keeps at least the 200 most recent entries
  undo(): Entry | null; redo(): Entry | null;
  undoName(): string | null; redoName(): string | null;
  clear(): void;
}
```

## 7. Cross-context messages (services)

### Render worker (`services/render/render.worker.ts`, R-1)

```ts
type ToWorker   = { type: 'render'; id: number; lines: string };
type FromWorker =
  | { type: 'ready' }
  | { type: 'svg'; id: number; svg: string }              // unsanitised; the main thread runs sanitize()
  | { type: 'error'; id: number; message: string };       // renderer's own message, shown as a rendering problem
```

One request at a time. If no reply arrives within 10 s, the main thread terminates the worker, reports the block "Not yet checked" and starts a new worker. The worker sets `PLANTUML_STDLIB_LOADER` and `PLANTUML_FILE_LOADER` to callbacks that always refuse and never sets `PLANTUML_STDLIB_BASE`. It calls `renderToString(lines, onSuccess, onError, { maxSvgSize: 0 })`.

### Tabs (`services/storage/tabs.ts`, R-5)

- Web Lock name: the project ID, requested with `{ ifAvailable: true }`. Holding it means this tab edits the project.
- `BroadcastChannel` name **(plan)**: `"plantuml-editor"`.

```ts
type TabMessage =
  | { type: 'project-renamed'; projectId: string; name: string }
  | { type: 'project-deleted'; projectId: string }
  | { type: 'handover-request'; projectId: string }        // "Edit here instead"
  | { type: 'handover-flushed'; projectId: string };      // pending writes saved and lock released
```
