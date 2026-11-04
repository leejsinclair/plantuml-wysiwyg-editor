# Validation report: PlantUML Wireframe and Screen Flow Editor

Run on 2026-10-28 against the production build, Playwright Chromium (the branded Chrome and Edge channels are not installed on this machine, so those two projects were not run), Java 17+ with `plantuml-1.2026.9.jar`.

## Commands

| Command | Result |
| ------- | ------ |
| `npm run lint` | clean |
| `npm run build` (type-check and production build) | passes |
| `npm run test:unit` | 74 files, 1348 tests pass |
| `npm run test:oracle` | 6 files, 184 tests pass |
| `npx playwright test --project=chromium` | 72 tests pass |

## Success Criteria

| SC | Verified by | Result |
| -- | ----------- | ------ |
| SC-001 usability | MV-001 (people) | Pending: needs the sessions in `manual-verification.md` |
| SC-002 hierarchy comprehension | MV-002 (people) | Pending: same sessions |
| SC-003 accessibility | VO-105 `a11y.spec.ts` (axe, WCAG 2.2 AA, every workspace state), VO-100 and VO-101 `keyboard-only.spec.ts` | Automated part passes. Screen-reader part pending (MV-003) |
| SC-004 correctness | VO-046 `tests/oracle/generated.test.ts`, VO-073 `oracle-parity.spec.ts`, `salt-ops`, `flow-ops`, `links`, `convert` oracle tests | Pass |
| SC-005 fidelity | VO-062 `roundtrip.test.ts`, VO-020 edit-fidelity tests, `us3-import.spec.ts` byte-identical download | Pass |
| SC-006 responsiveness | VO-137 `perf/reference.spec.ts` on `tests/corpus/reference/reference-project.puml` | Pass on this machine: canvas ≤ 100 ms, source ≤ 200 ms, preview ≤ 3 s. Re-run on the reference laptop; `PERF_SLACK` relaxes thresholds on a slower machine |
| SC-007 durability | VO-009, VO-010, VO-075 `us2-storage.spec.ts`, `autosave.test.ts` | Pass |
| SC-008 privacy and offline | VO-074 `privacy.spec.ts`, VO-135 `offline.spec.ts` | Pass |
| SC-009 traceability | Exempt (plan) | n/a |

## Defects found by this run and fixed

- Nested containers (a Form, Group box or Row inside a cell) were drawn as an empty placeholder, so a screen could not be edited inside them. `SaltCanvas` now draws the nested grid inside its cell (owner: T077).
- A brand-new project did not show the empty-screen prompt. `isEmptyScreen` now treats a root with no rows as empty (T077).
- Opening an imported file whose first block is not the block chosen for opening looped between two routes and crashed React (error 185). `App` no longer treats its own route write as navigation (T047).
- The tab read-only role never reached the workspace, so a second tab stayed editable. `main.tsx` now passes `useProjectReadOnly` to `Workspace` (T093, T099).
- WCAG 2.2 target size (2.5.8): palette and delete buttons were under 24 × 24 px. Every button, select, checkbox and radio now has a 24 px minimum (T049).
- "Back to flow" showed on every block and "Open screen" Ctrl+Enter was not bound. "Back to flow" is now shown only after "Open screen", and the shortcut works from anywhere (T166).
- Several end-to-end specs written earlier had never run and used selectors that did not match the app. They now run and pass.

## Not run

- Chrome and Edge channels (`--project=chrome`, `--project=msedge`): browsers not installed here. Run `npm run test:e2e` on a machine with both.
- MV-001 to MV-005: need people. See `manual-verification.md`.
