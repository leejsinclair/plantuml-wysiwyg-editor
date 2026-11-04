# Contracts: PlantUML Wireframe and Screen Flow Editor

The feature exposes no network API and no command-line interface. It exposes three interfaces that consumers and tests code against:

| Contract | Consumer | File |
| -------- | -------- | ---- |
| Project file format (`.puml`) | Standard PlantUML tooling, developers receiving a handover, re-import, the command-line oracle | [project-file.md](project-file.md) |
| User interface | Users, assistive technology, Playwright and Testing Library tests | [ui.md](ui.md) |
| Core module API (`src/core`) and cross-context messages | Vitest unit tests, `src/services`, `src/ui` | [core-api.md](core-api.md) |

## Source of identifiers

The spec has no **Verbatim Constraints** section, so no identifier was pinned by the requester. Every user-facing string, status name, command label, name pattern and source form below is copied exactly from [spec.md](../spec.md) (including the `…` character, U+2026, in "Move to…" and "Saving…"). Where an identifier is a plan-level choice rather than spec text, it is marked **(plan)** and can change without a spec change.

## Rules for implementers

- Interface strings live only in `src/ui/messages/en.ts` (R-11, FR-016/AC8). The strings in [ui.md](ui.md) are the catalogue's required English values.
- Tests locate controls by ARIA role and accessible name using the strings in [ui.md](ui.md), not by CSS selectors or test IDs.
- Status values in the core API use the same strings as the user interface, so a test can compare core output with what the project panel shows.
