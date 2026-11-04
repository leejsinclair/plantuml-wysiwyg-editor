# PlantUML Wireframe and Screen Flow Editor

A browser editor for PlantUML Salt wireframes and activity-diagram screen flows. Build screens from a palette on a structured canvas, link flow steps to screens, and keep the result as one ordinary `.puml` file. Everything runs in the browser: nothing you draw is sent anywhere, and after one visit the app works offline.

## Run

Requires Node 22 or later.

```bash
npm install
npm run dev        # development server
npm run build      # type-check and production build into dist/
npm run preview    # serve the production build
```

## Test

| Command | What it runs |
| ------- | ------------ |
| `npm run test:unit` | Vitest, `unit` (Node: `tests/unit`) and `ui` (jsdom: `tests/ui`) projects |
| `npm run test:oracle` | Compares generated source with the PlantUML command-line tool (needs Java and the jar, below) |
| `npm run test:e2e` | Builds, then runs Playwright against `vite preview` (Chrome and Edge) |
| `npm run lint` | ESLint, including the layer-boundary rule |

Focused run: `npm run test:unit -- -t "<test name>"`.

### The oracle jar and Java

The oracle tests render with the real PlantUML. Install Java 17 or later, download `plantuml-1.2026.9.jar` into `tools/` (the jar is git-ignored), or point `PLANTUML_JAR` at it. The oracle runner fails loudly if Java or the jar is missing.

## Architecture

Three layers, with imports pointing one way: `ui` → `services` → `core`.

- `src/core`: pure TypeScript with no DOM. Decoding and splitting a file into blocks, lossless Salt and activity parsers, every edit operation (each returns text edits and never rewrites untouched text), names, links, history and the project model. ESLint forbids `core` importing from `ui` or `services` or using DOM globals.
- `src/services`: browser capabilities: IndexedDB storage and autosave, tab locking, file download and import, the render worker and queue, SVG sanitising, image export, and the service worker (`src/sw.ts`).
- `src/ui`: React 19 workspace: store, canvases, palette, outlines, properties, project panel, source view and preview.

The renderer is `@plantuml/core` in a Web Worker. `tests/e2e/oracle-parity.spec.ts` checks it against the jar.

### Slots

Each user story plugs into the shared workspace through a small slot registry (`src/ui/app/slots.ts`): `blockEditors` (by block kind), `toolbar`, `library`, `projectPanel`, `propertySections`, `commands`, `banners`, `sourceEdit` and `previewLink`. A feature adds a `register.tsx` in its own folder, and `src/main.tsx` loads every `src/ui/**/register.tsx` with `import.meta.glob`. Single slots refuse a second owner.

### Messages

Every UI string comes from the catalogue: `t(key, params)` in `src/ui/messages/en.ts`, which merges every `src/ui/messages/en/*.ts` part and fails on a duplicate key. Add a new area's strings in its own part; never put them in `shared.ts`. A test fails if a UI literal escapes the catalogue.

## Specification

The feature spec, plan, tasks and verification plan are in `specs/001-wireframe-flow-editor/`. Manual verification sessions are scripted in `specs/001-wireframe-flow-editor/tests/manual-verification.md`.
