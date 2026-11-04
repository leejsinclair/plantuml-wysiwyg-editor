# Constitution: PlantUML Wireframe and Screen Flow Editor

Input for Speckit `/speckit.constitution`. These principles govern every phase (specification, planning, tasks and implementation). Where a later decision conflicts with a principle, the principle wins unless this document is amended.

The product requirements are in [product-spec.md](product-spec.md).

## Principles

1. **Visual-first:** Users must not need to learn PlantUML, Salt or activity diagram syntax to create wireframes and screen flows.
2. **Structured by design:** Interfaces are assembled from Salt grids, containers and UI components, not arbitrary pixel positioning. Screen flows are assembled from steps, decisions, loops and swimlanes, not free-form nodes and arrows.
3. **Standards-based output:** Content the editor generates always renders. Every project can be downloaded as a standard `.puml` file, and everything the editor generated in it renders in standard PlantUML tooling outside the application. Content the user authored that cannot be rendered is kept unchanged, never dropped and never a reason to block a download, and the user is told which blocks are affected.
4. **Never lose user work:** Source is the authoritative record. The editor changes only what the user edited, preserves everything it does not understand, and never silently discards or overwrites user-authored content.
5. **Predictable editing:** Visual changes, source changes, undo and redo behave consistently.
6. **Local and private:** Diagram content never leaves the user's browser. Rendering and storage happen locally, and the application works offline once loaded.
7. **Accessible to non-developers:** Controls and terminology are understandable to business analysts and product owners, and every editing operation has a keyboard alternative.
8. **Developer-friendly handover:** Generated source is readable, maintainable and usable outside the application.
9. **Testable core:** The component model, source parsing and generation, and validation logic are testable independently of the user interface.
