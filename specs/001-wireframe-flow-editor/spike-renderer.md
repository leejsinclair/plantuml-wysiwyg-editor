# Renderer feasibility spike (OD-1, T001)

**Date**: 2026-10-27 | **Candidate**: `@plantuml/core` 1.2026.9 | **Oracle**: `plantuml-1.2026.9.jar` on OpenJDK 27 | **Browser**: Playwright Chromium (headless), 16-core dev machine | **Harness**: [spikes/renderer/](../../spikes/renderer/) (`node run.mjs <mode>`)

## Verdict

**The gate passes, with one amendment to R-1.** The engine cannot run in a bare Web Worker: every render throws `ReferenceError: document is not defined`, because it builds the SVG with `document.createElementNS` and serialises it with `XMLSerializer`. With a minimal DOM shim installed in the worker after the support scripts load, all six criteria pass. The worker output is byte-identical to the official main-thread host for all 188 rendered SVGs.

## Hosts compared

| Host | Result | Longest main-thread stall during renders |
| ---- | ------ | ---------------------------------------- |
| Dedicated worker, no DOM | Fails: `document is not defined` on every render | n/a |
| Main thread (official usage) | Works | 139 to 244 ms |
| Sandboxed iframe (`allow-scripts`, opaque origin) | Works, but Chromium runs it in the page's process | 148 ms |
| **Dedicated worker + DOM shim** | **Works, SVG byte-identical to main thread (188/188)** | **16 to 19 ms** (the probe interval) |

The shim ([spikes/renderer/public/worker-shim.js](../../spikes/renderer/public/worker-shim.js), about 90 lines) provides `createElementNS`, attributes (including `setAttributeNS` with `XMLSerializer`'s `xmlns:` placement), children, `textContent`, `style`, processing instructions and `XMLSerializer`. It measures text with `OffscreenCanvas` `measureText`, and `getBBox` uses the font bounding box, which is what makes the layout match. It is installed after `viz-global.js` loads, because that script treats a defined `document` as a page. `DOMParser` and `importNode` are not provided. The engine uses them only to embed SVG images. A diagram that needs them fails with an identifiable error instead of rendering differently.

## Criteria

| # | Criterion | Result | Evidence |
| - | --------- | ------ | -------- |
| 1 | Same success or failure per block as the command-line tool, on a corpus with non-English names and the escaping cases | **Pass** | 194 cases: 191 same, 0 different. 3 include cases differ on purpose: the browser refuses every include (FR-017/AC3), and the jar resolves its bundled stdlib. The editor never sends include-dependent blocks to the renderer (section 4.2). |
| 2 | Download size and start time recorded; preview within 3 s per reference-project block | **Pass** | Five files: 7.06 MB raw, 2.37 MB gzip, 1.89 MB brotli (`plantuml.js` 3.36 MB raw, 1.11 MB gzip; `viz-global.js` 1.45 / 0.60; `emoji.js` 1.88 / 0.62; `themes.js` 0.33 / 0.03; `openiconic.js` 0.05 / 0.01). Worker ready in 250 to 400 ms locally. Renders: reference screen 20 to 50 ms, reference flow 55 to 107 ms, slowest case 203 ms. These are dev-machine numbers. SC-006 is re-measured on the reference laptop in T174. |
| 3 | All assets bundled; no network, file or include loading | **Pass** | Zero requests outside the app's origin in either pass. `PLANTUML_STDLIB_LOADER` and `PLANTUML_FILE_LOADER` were called and refused (`c4.min.js`, `common.puml`). A URL include failed with no request. |
| 4 | Renders without blocking editing, one request at a time | **Pass (worker + shim only)** | Main-thread stall ≤ 19 ms with the shim, against 139 to 244 ms on the main thread. Requests are posted one at a time. A terminated worker restarts in about 250 to 400 ms, which is the cost of the 10 s abandonment (FR-017/AC5). |
| 5 | Failures are identifiable | **Pass, with a rule** | There are two shapes. (a) `onError` with a Java exception name, for example `java.lang.IndexOutOfBoundsException`, with no line. (b) `onSuccess` with an error image, whose first `<text>` starts `PlantUML version`, whose second holds `(line N)`, and whose last holds the message (seen for older-format Salt and includes). The render queue must classify (b) as a failure and extract line and message. |
| 6 | Every file, including on-demand ones, can be kept for offline use | **Pass** | Only five fixed engine files are ever fetched. A replay pass that served only the first pass's files aborted nothing and gave identical results for all 194 cases. |

## Changes this requires downstream

- **R-1 / T022 (render worker)**: run the engine in a dedicated worker with the DOM shim installed after `importScripts` of `viz-global.js`, `themes.js`, `openiconic.js` and `emoji.js`. Set `self.window = self` first (the sprite files assign to `window`). Loaders call `err` (not `return false`, which would fall back to a script tag that does not exist in a worker).
- **R-10 / T003, T004**: bundle and precache `emoji.js` too (`<:name:>` emoji in labels).
- **T033 (render queue)**: classify error images as failures (criterion 5 rule).
- **T016, T017, T040 (escaping)**: the candidate escapes below are confirmed in both renderers.

## Escaping results (both renderers, row's first cell and later cell)

| Text | Raw | `~` prefix | `<U+hhhh>` | Notes |
| ---- | --- | ---------- | ---------- | ----- |
| `{` | render fails | render fails | **literal** | |
| `}`, `\|` | text lost | text lost | **literal** | |
| `[x`, `"q` | literal | literal | literal | escaping is harmless |
| `(a`, `^a` | literal | `~` stays visible | literal | `~` is not a safe general escape |
| `*a`, `.`, `...`, `**b**`, `//i//`, `__u__`, `""m""`, `--s--` | interpreted | literal | **literal** | |
| `==a`, `~~w~~` | interpreted | interpreted | **literal** | |
| `a.b`, `5 * 3` | literal | literal | literal | written unchanged (FR-003/AC6) |
| `Title`, `Header 1`, `Legend`, `caption x`, `skinparam x` as a row's first cell | removed | removed | removed | **a leading U+200B (zero-width space) keeps them**; later cells are literal raw |
| Linked step label `Pick [x] or ]] \| y` | literal, link kept | `~` breaks it | **literal, link kept** | |

`<U+hhhh>` is the one escape that works everywhere. The command-word case needs the invisible U+200B prefix, and unescaping a row's first cell removes one leading U+200B. Text the user types that itself contains `<U+` must have its `<` written as `<U+003C>`, so a round trip stays exact.

## Other observations

- PlantUML silently renders Salt with two root grids and with text after the root grid, and renders an activity `if` with no `endif`. This confirms that the editor's own grammar, not the renderer, has to decide categories (section 4).
- Older-format Salt (`salt` inside `@startuml`) fails in both renderers ("Syntax Error? Assumed diagram type: sequence"), as the spec expects.
- The in-browser error image shows `PlantUML version $version$`. The editor shows its own wording and the message line, not the image.
