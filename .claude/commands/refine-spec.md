---
description: Run the BA / UX / architect review team over product-spec.md, stop to ask the product owner questions, then reach consensus and overwrite the spec with the revised version
argument-hint: "[path/to/product-spec.md]"
---

# Refine the product specification

You (the main session) are the **facilitator** for a three-specialist specification-review team. Subagents cannot launch subagents, so you launch every specialist, pass material between them, keep the findings register, talk to the product owner (the user), and do all file writing yourself.

The specialists are the project subagents:

- `spec-ba`: Business Analyst (finding IDs `BA-nn`)
- `spec-ux`: UX expert (finding IDs `UX-nn`)
- `spec-architect`: Developer / Technical Architect (finding IDs `TA-nn`)

Specification path argument: `$ARGUMENTS` (if empty, locate `product-spec.md` as described in Stage 0).

## Principles

- **The goal is the smallest sufficiently complete, coherent and testable specification** that lets a capable coding agent build the intended product while preserving the product owner's intent and the human team's ability to evaluate the result. It is not the longest possible spec.
- **Keep changes traceable.** Don't silently remove requirements. Don't turn assumptions into approved decisions. Never invent product decisions.
- **Distinguish verified behaviour from reasoned analysis**, especially for PlantUML behaviour.
- **File boundary.** The only files this command may write in the repository are `product-spec.md` and the one-time backup `product-spec.original.md`. Never touch application source, dependencies, configuration, tests, `constitution.md`, `setup.md` or any other file. Drafts and working notes go in the session scratchpad directory (from the system prompt; if none is listed, create one with `mktemp -d` outside the repository).
- **Facilitate, don't take over.** Let each specialist assess in their own role. Your job is to integrate, resolve what evidence can resolve, and surface what only the product owner can decide.

## Working with the specialists

- Every subagent launch starts cold. Each prompt must be self-contained: state the **mode** (`independent assessment`, `cross-functional challenge` or `final review`), the absolute path of the spec and its linked documents, the scratchpad path, and paste in any reports, register entries, product-owner answers or draft paths the mode needs. You may continue an earlier specialist with SendMessage to keep its context, if available.
- Give `spec-architect` the scratchpad path (or a subdirectory of it) for PlantUML experiments, and remind it to keep all files outside the repository.
- The product owner expects the in-browser renderer to be the npm `plantuml` package (<https://www.jsdelivr.com/package/npm/plantuml>). Treat this as a stated preference to assess, not an approved decision: the §3.5 feasibility gate still stands. Don't write it into the spec as decided unless the user confirms it in Stage 4.
- Their reports are not shown to the user. Relay what matters.
- If a specialist returns an incomplete or off-format report, ask it again with the gap named, rather than filling the gap yourself.

---

## Stage 0: Orient

1. Locate the spec. If `$ARGUMENTS` is a path, use it. Otherwise find `product-spec.md` in the repository (excluding dependency and build directories). If there is more than one, **stop and ask the user which is authoritative.** If there is none, stop and say so.
2. Read the spec in full, and every document it links to or depends on (currently `constitution.md` and `setup.md`; follow any further local links).
3. Note, in a scratchpad file, for use in later stages:
   - repository conventions (heading structure, section numbering, requirement ID scheme such as `FR-nnn`, acceptance-criteria style, use of "(decision)" markers, cross-reference style);
   - existing decisions that must be preserved (every "(decision)" in the spec and each constitution principle);
   - process requirements from `setup.md` that bear on the spec (e.g. required diagrams and traceability). If any would require creating files other than `product-spec.md`, do not create them: record it, and raise it as a product-owner question in Stage 4 if it matters.
   - whether `product-spec.original.md` already exists.
4. Make no file changes in the repository.

## Stage 1: Independent assessment

Launch `spec-ba`, `spec-ux` and `spec-architect` **in parallel** (one message, three Agent calls) in **independent assessment** mode. Do not share any specialist's output with another at this stage. No file edits.

Save each report to the scratchpad.

## Stage 2: Cross-functional challenge

Launch the three specialists again (in parallel) in **cross-functional challenge** mode. Give each the other two specialists' Stage 1 reports in full, plus its own.

Ask each to challenge the others' significant findings, assess trade-offs, and revise its own findings. Direct particular attention to conflicts between **usability, technical fidelity and scope**, and ask all three to investigate the following questions **without presupposing the answers**:

1. Should the visual editor restrict users to a Salt (and activity) subset, or preserve constructs it cannot edit? Where is the line?
2. How should unsupported syntax be handled so nothing is silently lost?
3. For invalid layouts: prevent, warn, or allow?
4. How should nested grids be created, navigated, understood and edited?
5. What exactly happens when switching between visual and source editing (including while source is invalid or mid-edit)?

Then, yourself:

- Merge duplicates across the three reports (keep the original IDs as aliases).
- Resolve what can be resolved from the spec, repository or the architect's verified evidence, and say how it was resolved.
- Record genuine disagreements as such, with each position stated fairly. Do not manufacture consensus.
- If a disagreement hinges on a factual PlantUML question, send it back to `spec-architect` for verification before treating it as a product decision.

## Stage 3: Prioritise

Build a **findings register** in the scratchpad:

| ID | Finding | Classification | Severity | Affected section | Consequence | Recommended resolution | Decision status |
|----|---------|----------------|----------|------------------|-------------|------------------------|-----------------|

- Classification is one of: confirmed defect · missing requirement · ambiguous requirement · conflicting requirements · technical risk · UX recommendation · optional enhancement · product-owner decision required.
- Severity is Critical / High / Medium / Low; where specialists disagreed on severity, record the agreed rating, or the range and why.
- Decision status is one of: **resolved by evidence** · **agreed by specialists** · **needs product-owner decision** · **disagreement recorded** · **deferred (non-blocking)**.
- Order by severity, then by how much other work depends on it.

## Stage 4: Product-owner clarification — STOP HERE

Present to the user, in chat:

**A. Specification assessment of the original**: overall quality and readiness, strengths, gaps, and the principal product and technical risks. Summarise each specialist's assessment in a few lines.

**B. The prioritised findings register** with decision status (the full register may be long; show Critical and High in full and summarise Medium/Low by theme, offering the rest on request, or write the full register to a scratchpad file and give its absolute path).

**Top cross-functional findings**: the handful where usability, fidelity and scope pull against each other, with the specialists' positions.

**Product-owner questions**, in manageable groups (by theme, roughly 3–6 questions per group, most blocking first). For each:

- **Decision:** what needs deciding.
- **Why it matters.**
- **Options.**
- **Recommendation** (and which specialists support it).
- **Consequence of leaving it unresolved.**

Only ask what the spec, repository or reliable technical evidence cannot answer. Where you propose to proceed on a non-blocking provisional assumption, label it explicitly as an **assumption** so the user can overrule it.

**Do not modify any files. End your turn and wait for the user's reply.**

---

## Stage 5: Consensus (after the user answers)

1. Record the user's answers in the register. Answers the user didn't give remain open; don't infer them. Treat anything the user marks as provisional as an assumption, not a decision.
2. Draft the revised specification **in the scratchpad**, never in the repository. Start from the current `product-spec.md` and keep its established structure, numbering and conventions where they still make sense. The draft must:
   - describe a coherent product, with users and goals clear;
   - define scope and explicit exclusions;
   - describe key workflows and system behaviour;
   - use stable requirement IDs (keep existing IDs; add new IDs after the last used; never renumber silently);
   - give testable acceptance criteria for significant requirements;
   - cover error paths, boundaries and recovery;
   - specify interaction expectations where they materially affect usability or implementation;
   - define the supported Salt (and activity) constructs, and how unsupported constructs are handled;
   - clarify source-to-visual and visual-to-source behaviour;
   - document material technical constraints without dictating incidental implementation;
   - list dependencies, assumptions, unresolved decisions (as **open decisions**) and out-of-scope items;
   - avoid duplicate or contradictory requirements.
3. Keep a change log in the scratchpad as you go (finding ID → what changed in which section), including every requirement removed or merged and why.
4. Run the challenge and revision cycle: send the draft path, the register, the user's answers and the change log to all three specialists (in parallel, **cross-functional challenge** mode against the draft). Integrate justified points, and repeat until the three specialists agree on the revised specification, or have explicitly recorded each remaining disagreement as an open decision in the draft. If the same disagreement persists for three rounds, record it as an open decision and move on; if it is blocking, tell the user.
5. Do not write to `product-spec.md` during this stage.

## Stage 6: Final review, then write

1. Send the draft to all three specialists (in parallel) in **final review** mode:
   - `spec-ba` checks completeness, traceability and testability;
   - `spec-ux` checks workflow coherence, usability and consistency;
   - `spec-architect` checks feasibility, technical fidelity and implementation clarity;
   - each also looks for **defects introduced by the revisions**.
2. Fix justified findings in the scratchpad draft and repeat final review until:
   - there are no known Critical issues;
   - High issues are resolved, or recorded in the spec as blockers / open decisions;
   - acceptance criteria are testable;
   - technical limitations are explicit.

   Don't chase minor wording or subjective preferences.
3. Only after **all three** specialists return `SIGN-OFF: yes`:
   1. If `product-spec.original.md` does not exist, copy the current `product-spec.md` to `product-spec.original.md`. If it already exists, leave it untouched.
   2. Overwrite `product-spec.md` with the consensus draft.
   3. Confirm existing requirements are preserved unless the change summary explains their removal; nothing unresolved is presented as decided (each is marked as an open decision in the spec); no product decisions were invented.
   4. Do not put the change summary or readiness assessment inside the spec. Report them in chat.

## Final deliverables (in chat)

**C. Confirmation**: that `product-spec.md` was overwritten, and whether `product-spec.original.md` was created now or already existed (and was left untouched).

**D. Change summary**: material changes; requirements added, removed (with reasons) and clarified; scope decisions; assumptions introduced; decisions still required from the user.

**E. Readiness assessment**, one row per dimension: business completeness · UX and workflow clarity · technical feasibility · acceptance-criteria quality · error and edge-case coverage · testability. For each: **status**, **evidence**, **remaining blockers**. End with one verdict: **ready for implementation**, **ready after specified decisions** (list them), or **not yet ready** (say why).

(A and B were delivered at Stage 4; refer back to them, and note any significant changes to the register since then.)
