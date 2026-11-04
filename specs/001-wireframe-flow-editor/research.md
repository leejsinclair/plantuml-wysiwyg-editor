# Research: PlantUML Wireframe and Screen Flow Editor

Phase 0 decisions for [plan.md](plan.md). The repository holds no application code yet, so every stack choice is made here. Each entry is Decision / Rationale / Alternatives considered. The spec has no open `NEEDS CLARIFICATION` markers.

## R-1 Renderer: `@plantuml/core` 1.2026.9 in a dedicated Web Worker

**Decision.** Use the official TeaVM build published on npm as `@plantuml/core`, pinned to exactly `1.2026.9` (MIT licensed from 1.2026.6). It runs inside one dedicated Web Worker that the editor starts after it is interactive. The worker calls `renderToString(lines, onSuccess, onError, { maxSvgSize: 0 })` for one block at a time. The main thread enforces the 10 second limit: when it is exceeded, it terminates the worker, reports the block as "Not yet checked" and starts a fresh worker for the next request. `viz-global.js` is handed to the engine as `globalThis.PLANTUML_VIZ` inside the worker. `themes.js` and `openiconic.js` are bundled and registered in the worker. `PLANTUML_STDLIB_LOADER` and `PLANTUML_FILE_LOADER` are set to callbacks that always refuse, and `PLANTUML_STDLIB_BASE` is never set, so `!include`, URLs and local files are never resolved.

**Rationale.** It is the candidate named by OD-1, and 1.2026.9 (released 2026-10-17) is the first release whose changelog adds Salt to the TeaVM build. Its documented API gives SVG as a string with separate error callbacks, which is what sanitising, export and the "rendering problem" message area need (FR-005/AC3, FR-017/AC4). `renderToString` cannot be cancelled, so terminating the worker is the only way to abandon a stuck render without blocking editing (FR-017/AC5, AC2). The package documents loader callbacks for Web Worker hosts, which makes the no-network rule enforceable inside the worker (FR-017/AC3, AC8). `maxSvgSize` defaults to 8192 px, which a large screen could exceed and which standard PlantUML does not enforce, so it is switched off to keep the in-browser result in step with the command-line oracle.

**Alternatives considered.** Rendering on the main thread: rejected because a long render would freeze editing. A server-side PlantUML: rejected by the constitution (principle 6) and FR-017. Pinning `1.2026.8`: rejected because that build has no Salt.

**Spike result (2026-10-27, [spike-renderer.md](spike-renderer.md)).** The gate passed with one amendment. The engine needs a DOM, so the worker installs a minimal DOM shim (`createElementNS`, `XMLSerializer`, `OffscreenCanvas` text measurement) after the support scripts load. Its output is byte-identical to the main-thread host. `emoji.js` is also bundled and precached. The loader callbacks call `err` rather than returning `false`.

**Feasibility gate.** The spike in the spec's Dependencies (OD-1) still decides whether this holds. It is planned as the first task phase and is scored against its six criteria. The plan records the unpacked package size as 7.2 MB, so the download size and start time must be measured, not assumed.

## R-2 Language, build and UI framework

**Decision.** TypeScript (strict) built with Vite into static files. The user interface uses React 19. No server code.

**Rationale.** The output must be static files that run offline (FR-017/AC1, FR-018). Vite produces that with no configuration beyond the worker and the service worker. React's accessible-component ecosystem and testing tools (Testing Library, axe) match the WCAG 2.2 AA target (SC-003). TypeScript's types make the editor model, the text edits and the renderer messages checkable at compile time.

**Alternatives considered.** Svelte or Lit: workable, but they offer less mature accessibility testing tools and fewer examples of tree and grid keyboard patterns. A framework-free DOM: rejected because the workspace has a dozen interdependent regions and would end up hand-building a renderer.

## R-3 Source representation: a lossless syntax tree, with every edit as a text patch

**Decision.** The source text of the project is the only stored truth. A hand-written lexer and recursive-descent parser for each language (Salt, activity) turn a block's text into a lossless syntax tree. Every character belongs to exactly one token, whitespace and comments included, and every node knows its start and end offsets. The editor model (grids, cells, components; flow elements, lanes, notes) is derived from that tree. A visual operation never regenerates a block. It computes a small list of text edits (`{ start, end, text }`) against the current source, applies them, and re-parses the block. Undo stores the inverse edits.

**Rationale.** This is the strategy the spec's Dependencies ask the plan to choose. Byte-identical round trips (FR-004/AC6, FR-020, SC-005) then hold by construction: nothing the user did not touch is ever rewritten, and line endings, the byte-order mark and the final newline stay in the string untouched. Category decisions (supported, locked parts, source-only, invalid) come from the grammar, synchronously and without the renderer (spec section 4). Undo, re-parse after typing and visual edits share one mechanism, because each is a text change followed by a parse (FR-007/AC5). The reference project (about 500 components) is small enough that re-parsing a whole block on every edit fits the 100 ms target (SC-006).

**Alternatives considered.** A model-first design that regenerates source from the model: rejected because it cannot keep comments, spacing and unknown constructs byte-identical. A parser generator (Lezer, Chevrotain, tree-sitter): rejected because Salt's grammar is line- and cell-oriented with many lexical special cases (escapes, creole, command words), and a generated parser would still need hand-written trivia handling. Lezer is still used for highlighting in the source view (R-6), where losslessness does not matter.

## R-4 Block splitting and identity

**Decision.** A file is split into an ordered list of segments: blocks (from an `@start…` line to its matching `@end…` line) and the text between blocks. Concatenating the segments always reproduces the file exactly. Within a session, a block has a runtime key that survives edits and reorders. Stored metadata identifies blocks by their position in file order (the flow's position, and the last working version of each position). Every reorder, insert, delete and re-division updates those positions in the same write.

**Rationale.** The spec has no identity for unnamed or duplicate-named blocks, and positions are what the file itself preserves. Keeping keys runtime-only adds nothing to the downloaded file, so storage introduces no proprietary format (section 3.6).

**Alternatives considered.** Identifying blocks by name: rejected because imported blocks may be unnamed or duplicated (FR-011/AC10, AC11). Comment markers written into the file: rejected because they would change downloads.

## R-5 Storage, autosave and tabs

**Decision.** IndexedDB through the `idb` wrapper, with a `projects` store holding each project as one record (source plus metadata, see [data-model.md](data-model.md)). Each save writes the whole record in one transaction, so a write either completes or leaves the previous version (section 3.6). Autosave runs at most 500 ms after the last change, which leaves room within the 2 second commit limit. It flushes on `visibilitychange` and `pagehide`. A failed write is reported at once and retried with backoff (1 s, 2 s, 4 s, then every 10 s) until it succeeds. One editing tab per project uses the Web Locks API (`navigator.locks.request(projectId, { ifAvailable: true })`). A `BroadcastChannel` carries library changes (rename, delete) and "Edit here instead" handover requests. Persistent storage is requested with `navigator.storage.persist()`.

**Rationale.** IndexedDB is the only browser store with enough quota for the reference project plus the last working versions, and with atomic transactions. Web Locks are released automatically when a tab closes or crashes, which a heartbeat in storage cannot guarantee. Both APIs are available in every supported browser (FR-019). The retry schedule meets "retries and returns to All changes saved" (FR-006/AC7) without spinning on a full disk.

**Alternatives considered.** `localStorage`: rejected because it is synchronous, about 5 MB, and has no transactions. The Origin Private File System: workable, but it adds file handling for no gain over one record per project. A heartbeat lock in IndexedDB: rejected because a crashed tab would hold it until it timed out.

## R-6 Source view

**Decision.** CodeMirror 6, with a small Lezer-based highlighter for Salt and activity syntax, one editor instance per open block, and a read-only instance for the whole-file view.

**Rationale.** It is accessible (a real `contenteditable` with screen-reader support), allows Esc to be bound without trapping focus (FR-009/AC15), supports line focus for "Fix in source", and has decorations for briefly highlighting changed lines (section 4.2). Its change transactions tell the editor what was typed and when typing pauses (300 ms).

**Alternatives considered.** Monaco: rejected because it is several megabytes larger and harder to keep keyboard-accessible inside a multi-region workspace. A plain `<textarea>`: rejected because it has no highlighting or decorations.

## R-7 Drag and drop on canvas, outline and flow

**Decision.** `@dnd-kit/core`, with pointer and touch sensors that need a movement or a short press before a drag starts. Drop targets are computed from the same "valid destinations" function that feeds "Move to…".

**Rationale.** Activation constraints stop taps from turning into moves (FR-009/AC7). Sharing the destination function with "Move to…" means dragging and keyboard moves can never disagree about what is allowed (FR-008/AC3, FR-009/AC2).

**Alternatives considered.** The native HTML drag-and-drop API: rejected because it does not work on touch, and its drag image cannot show invalid targets. A hand-written pointer implementation: rejected as more code for the same result.

## R-8 Sanitising rendered SVG

**Decision.** DOMPurify with its SVG profile, plus a hook that removes any `href` or `xlink:href` that is not a `#fragment` or a `data:image/…` URL. The sanitised SVG is shown inline, so that clicks on linked steps can be handled (FR-015/AC6).

**Rationale.** FR-017/AC4 needs scripts, event handlers and external references removed while internal links and embedded images are kept. DOMPurify is the standard, maintained tool for this. Inline SVG is needed because `<img>` would stop link clicks.

**Alternatives considered.** Displaying through `<img src="data:…">`: safe, but it loses clickable steps. A hand-written sanitiser: rejected as a security risk.

## R-9 Export, download, import and clipboard

**Decision.** SVG export downloads the sanitised SVG string. PNG export draws that same SVG into a canvas at exactly twice its natural width and height and saves it with `toBlob('image/png')` (FR-014/AC3). `.puml` download writes the source string with its original line endings and byte-order mark, as a `Blob` link named after the project (characters that cannot appear in a file name are replaced with `-`). Import reads the file as bytes and decodes it with `TextDecoder('utf-8', { fatal: true })`. A decode error, or a NUL byte in the content, rejects the file as non-UTF-8 or binary (FR-006/AC13). Copy uses `navigator.clipboard.writeText`.

**Rationale.** These are standard platform APIs, so no dependency is needed. A fatal decoder is the exact test for "not UTF-8", and a NUL byte is a reliable sign of a binary file that happens to be valid UTF-8.

**Alternatives considered.** A PNG produced by the renderer: rejected because the browser build only returns SVG and the spec requires PNG to be a rasterisation of the same SVG.

## R-10 Offline

**Decision.** A Workbox-generated service worker (`vite-plugin-pwa`, `injectManifest`) that precaches every built file, including `plantuml.js`, `viz-global.js`, `themes.js` and `openiconic.js`.

**Rationale.** FR-018 needs the application, preview and export to work offline after one visit, including after a restart. Precaching at install covers files the renderer would otherwise fetch on demand (spike criterion 6).

**Alternatives considered.** Runtime caching only: rejected because a file first needed while offline would be missing.

## R-11 Interface text

**Decision.** All interface strings live in one typed message catalogue (`src/ui/messages/en.ts`) and are looked up by key through a small `t(key, params)` function. No internationalisation library.

**Rationale.** FR-016/AC8 asks for English text kept separate from code so that it can be translated later. One catalogue with typed keys does that without a dependency. Plural handling uses `Intl.PluralRules`.

**Alternatives considered.** FormatJS or i18next: rejected because there is only one language to support now (simplified: one catalogue; add a library when a second language is commissioned).

## R-12 Name rules

**Decision.** Names are normalised with `String.prototype.normalize('NFC')`. They are compared after NFC plus a locale-independent case fold (`toLowerCase()` of `toUpperCase()`, which maps for example ß and ẞ together). Letters and marks are tested with the Unicode property escapes `\p{L}`, `\p{M}` and `\p{Nd}`. Shortening to 64 characters works on grapheme clusters (`Intl.Segmenter`), so a letter is never split from its combining marks (section 3.6).

**Rationale.** These are built into every supported browser and into Node for tests, and they implement the spec's rules directly.

**Alternatives considered.** A Unicode library: not needed.

## R-13 Testing and oracles

**Decision.** Four kinds of test, as the developer's proposal for the project's tooling:

- Vitest for the core: parsers, round trips, operations, names, escapes and history. It runs in Node with no DOM.
- Vitest with jsdom and Testing Library for UI components and keyboard behaviour.
- Playwright for end-to-end tests on Chrome and Edge, including offline, multiple tabs, storage failure, performance and network checks. Accessibility scans use `@axe-core/playwright`.
- A command-line oracle suite that runs the PlantUML command-line tool, pinned to the renderer's version (`plantuml-1.2026.9.jar` under Java 17 or later), on every corpus file and every generated block. It checks that each block renders without error, and compares the result per block with the in-browser renderer driven by Playwright (FR-017/AC7, SC-004).

**Rationale.** The core is testable without the user interface (constitution principle 9). The spec names the command-line tool as a second oracle. Real Chromium and Edge are needed for workers, IndexedDB, Web Locks, service workers and the clipboard.

**Alternatives considered.** Jest: workable, but slower with ESM and Vite. Cypress: no multi-tab support.

**Process note.** The integrated TDD process takes verification commands only from what the project already defines. The repository defines none yet, so the Verification Plan declares none. The first setup task adds the package scripts, and declaring them in the plan's Verification commands table then switches the checks on (see [plan.md](plan.md#verification-plan)).

## R-14 Application state

**Decision.** A small external store (a plain object with `subscribe` and `getSnapshot`) read through React's `useSyncExternalStore`. It holds the open project's source, the derived block models (memoised per block on source text), the selection, history and transient UI state.

**Rationale.** All editing state follows from the source plus the selection, so a general-purpose state library adds nothing. Memoising on block text keeps re-parsing to the block that changed.

**Alternatives considered.** Redux or Zustand: more surface area than the state needs.

## R-15 Block lifecycle

**Decision.** Each block's status is computed from three inputs: its category from the editor's grammar, whether its source view has focus, and its last render result. It is never stored as a separate state machine. Only the last working version and which block is the flow are stored.

**Rationale.** The states in [block-sync-states.puml](diagrams/block-sync-states.puml) are all derivable. Deriving them removes a whole class of "status out of step with source" defects, which is what "never lose user work" (constitution principle 4) depends on.

**Alternatives considered.** A stored per-block state machine: rejected because it duplicates what the source and grammar already say.
