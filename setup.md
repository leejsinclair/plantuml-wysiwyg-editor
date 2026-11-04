# PlantUML Wireframe and Screen Flow Editor: Setup and Specification Process

## Documents

| Document | Purpose | Speckit use |
| -------- | ------- | ----------- |
| [constitution.md](constitution.md) | Product principles that govern every phase | `/speckit.constitution` |
| [product-spec.md](product-spec.md) | Product vision, scope, requirements and acceptance criteria | `/specify` input |
| setup.md (this file) | Tooling, specification validation steps and required diagrams | Process guidance for the specification phase |

## Specification validation and planning

Before approving the specification and creating the implementation plan:

1. Inspect the reference repository (mermaid-editor-wysiwyg) and record the UX patterns to adopt: interaction patterns, panel layout, terminology and feedback. Do not assume its technical implementation or rendering pipeline is reusable.
2. Verify the supported Salt and activity diagram syntax and rendering behaviour against authoritative PlantUML documentation and representative examples, including named diagram blocks, multiple blocks per file, the accepted forms of Salt blocks and the convention for referencing screens from flow steps.
3. Define a supported initial component, layout and flow-element subset.
4. Resolve source round-tripping and unsupported-construct handling for both Salt and activity blocks, in line with product-spec section 4.1.
5. Establish representative examples covering forms, tables, nested layouts, navigation, a multi-screen project with a screen flow containing decisions, and the performance reference project (product-spec section 6).
6. Convert the functional requirements into testable scenarios before implementation tasks are defined.
7. Ensure acceptance tests cover valid output, layout correctness, round-trip editing, invalid input, error recovery and preservation of user work.
8. Identify unresolved architectural decisions and leave them for the technical planning phase where appropriate.
   - Complete the in-browser renderer feasibility spike (product-spec section 3.5) and record its findings: Salt and activity coverage, download size and render time.
9. Model the key UI flows as activity diagrams and the block sync states as a state diagram (see below), and confirm they agree with the functional requirements and acceptance criteria.

### UI flow diagrams

The specification must include UI flow charts, written as PlantUML activity diagrams, that show how users move through the editor and how the application responds.

**Format:**

- Use PlantUML activity diagram syntax (the newer `start` / `:action;` / `if` / `stop` form), so that the diagrams are written in the same toolchain as the product.
- Store each diagram as source (`.puml`) alongside the specification, and embed or link it from the relevant section.
- Each diagram must render without errors in standard PlantUML.
- Use swimlanes to show who acts at each step, for example **User**, **Editor**, **Parser/Validator**, **Renderer** and **Storage**.
- Name decision points and outcomes in user-facing terms, not implementation terms.

**Required flows (at minimum):**

| Flow | Must show | Related requirements |
| ---- | --------- | -------------------- |
| Create a new wireframe | Empty workspace → add components → configure properties → preview → export | FR-001, FR-003, FR-014 |
| Insert and arrange components | Select a container, insert or move a component (drag-and-drop **and** keyboard alternative), check validity, reject or explain an invalid placement | FR-002, FR-008, FR-009 |
| Edit component properties | Select → edit property → update model, source and preview; prevent combinations that cannot be represented | FR-003 |
| Edit source directly | Source edit → classify as fully supported / valid with unsupported constructs / invalid or incomplete → update the visual model, show locked blocks, or lock the block with an error | FR-004, FR-010 |
| Render preview | Render request → success, or failure with the last valid preview kept and the error shown separately from source errors | FR-005 |
| Import a file | Choose `.puml` file → classify the source (the four categories in product-spec section 4) → create project with full visual editing, locked blocks, or source-only blocks | FR-006, FR-010 |
| Project library and autosave | Open app → restore library → open / create / duplicate / delete project → each edit autosaves → storage failure reported with backup advice | FR-006 |
| Download, export and copy | Choose `.puml` download, SVG/PNG export or copy source → check the block can be rendered (for images) → produce output or explain why not → record last-downloaded time | FR-006, FR-014 |
| Undo / redo | Visual or source change → history entry → undo/redo restores structure, properties and source together | FR-007 |
| Recover from errors | Parse or render failure → inspect the source → revert the block to its last valid source or keep editing the source | FR-004, FR-005, FR-010 |
| Manage screens | Add / rename / delete screen → check flow references → warn and show affected steps → apply or cancel | FR-011, FR-013 |
| Build a screen flow | Add step / decision / loop / swimlane → check the flow is representable → update flow, source and preview, or explain the rejection | FR-012 |
| Navigate flow ↔ screens | Select linked step → open wireframe → edit → return to flow; handle a missing screen | FR-013 |

### Block sync state diagram

The specification must include a PlantUML state diagram describing the state of a single block (screen or screen flow) and the transitions between states. At minimum it must cover:

- **In sync:** visual model, source and stored copy agree.
- **Source being edited:** the user is typing in the source view; the visual model updates after a pause.
- **Source invalid (locked):** the canvas shows the last valid state, read-only.
- **Contains locked blocks:** valid, with unsupported content shown as locked placeholders.
- **Source-only:** unsupported content that cannot be isolated.
- **Render failed:** source valid, preview failed; the last valid preview is kept.
- **Storage failed:** an autosave write failed; the previous stored version is intact.

Each transition must name its trigger (for example "user pauses typing", "user reverts to last valid source", "autosave retry succeeds") and must correspond to at least one acceptance criterion in FR-004, FR-005, FR-006 or FR-010.

### Traceability

- Every decision branch in a flow diagram and every transition in the state diagram must correspond to at least one acceptance criterion or testable scenario. Any branch or transition without one shows a gap in the specification.
- Every acceptance criterion that describes an error, warning or recovery path must appear on at least one diagram.
- Keep the diagrams up to date when requirements change during refinement (including during grill-me sessions).

The outcome must be a reviewed, testable product specification. Do not begin implementation as part of the specification phase.

## Tooling

Speckit: [Speckit](https://github.com/github/spec-kit)

Speckit extensions:

- [Grill me integrated](https://github.com/leejsinclair/speckit-grill-specify)
- [TDD integrated](https://github.com/leejsinclair/speckit-tdd-integrated)
- [Spec Viewer and Kanban Board](https://github.com/leejsinclair/rich-specification-viewer)
- [Claude Mod - Mini Kanban](https://github.com/leejsinclair/speckit-mod-micro-kanban)

EndevorOS:

`sudo pacman -S plantuml graphviz`