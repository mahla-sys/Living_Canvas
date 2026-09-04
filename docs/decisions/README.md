# Architecture decisions

An ADR here records *why*, and nothing else. The 40-line body cap is enforced by `scripts/check-docs.mjs` on
purpose: a decision that needs more space is a spec, and specs belong in `ARCHITECTURE.md`.

Format — frontmatter at byte zero, then Context / Decision / Why / Consequences:

    title: One canvas per attached folder
    status: proposed            # proposed | accepted | superseded
    updated: 2026-09-01
    sources: [src/lib/fs-access.ts#toRelativePath, docs/ARCHITECTURE.md#10]
    superseded_by: adr-006-…    # required when status: superseded

## Index

| # | file | status | note |
|---|---|---|---|
| 001 | *(no file yet)* | — | product identity is an open question, kept in `../notes/ideas.md#product-identity`. The number is reserved for whoever answers it |
| 002 | `adr-002-graph-json-deleted.md` | accepted | structure 1.4 |
| 003 | `adr-003-hard-output-validation.md` | accepted | structure 1.4 |
| 004 | `adr-004-run-ledger.md` | accepted | structure 1.3 |
| 005 | `adr-005-single-canvas-per-folder.md` | **proposed** | documents current behaviour and asks for a ruling; `ARCHITECTURE.md#10` Q2 is still open |
| 006 | `adr-006-theme-is-device-scoped.md` | accepted | theme lives in `lc-settings`, never in a canvas file; the owner's ruling of 2026-09-02 is quoted in the ADR |
| 007 | `adr-007-settings-live-behind-two-functions.md` | accepted | `lc-settings` is a seam in the strong sense: three functions in `core.ts`, no other reader or writer |
| 008 | `adr-008-agent-model-selects-the-model.md` | accepted | `agent.model` is an input to execution; the provider is derived from the model name |
| 009 | `adr-009-layout-is-canvas-content-focus-mode-is-not.md` | accepted | panel widths in `canvas.yaml`, focus mode in memory — the three-way rule for interface state |
| 010 | `adr-010-accent-is-a-role-and-plum-is-default.md` | accepted (clause 3 superseded by 011) | `--color-lc-accent` / `--color-lc-warn` as roles rather than palette steps, amber kept only as canvas data |
| 011 | `adr-011-accent-must-differ-in-hue-from-ink.md` | accepted | an accent must sit at least 60° from its own theme's ink hue (or, on an achromatic ramp, carry enough chroma), enforced by the palette gate; `botanical` is the default again |
| 029 | `adr-029-mistral-api-integration.md` | accepted | integrates Mistral API provider and configures default Mistral API key |
| 028 | `adr-028-remove-left-panel-canvas-manager-and-configure-api-key.md` | accepted | removes redundant Canvas Manager banner from left panel and configures default DeepSeek API key |
| 027 | `adr-027-docked-right-panel-chat.md` | accepted | docks conversational interfaces inside right panel, provides top navigation options for inspector, chat, and canvas |
| 026 | `adr-026-topbar-actions-and-status-cleanup.md` | accepted | removes redundant bottom panel toggles, adds topbar new canvas and manager copilot actions |
| 025 | `adr-025-bootstrap-self-building.md` | proposed | UI-awareness tools and Manager agent for self-building |
| 022 | `adr-022-function-calling-loop-and-canvas-tools.md` | accepted | model-driven function calling loop in askModel with 10 canvas tools, strict contract gating, and ledger logging |
| 021 | `adr-021-mounted-root-height-boundary-playwright.md` | accepted | closes height chain breakage at data-lc-mounted so laptop viewports don't push status bar off-screen |
| 020 | `adr-020-laptop-viewport-fit-and-scrolling.md` | accepted | viewport fit contract (fixed inset-0, dvh), middle container overflow clamping so panels scroll on laptops |
| 019 | `adr-019-side-panel-scroll-ergonomics.md` | accepted | adds bottom padding and high-contrast scrollbar hover to left and right side panels |
| 018 | `adr-018-node-shape-badge-layering.md` | accepted | separates clip-path from the badge overlay container so badges and handles remain unclipped on geometric shapes |
| 017 | `adr-017-status-bar-speaks-in-words.md` | accepted | the status bar prints a sentence per execution state from a total `Record`, so a new enum value breaks the build instead of leaking to the reader |
| 016 | `adr-016-search-filters-and-status-is-derived.md` | accepted | the left panel's filter is local state and its status glyph is derived from execution and agent status — neither is stored, so neither can drift from its source |
| 015 | `adr-015-inspector-tabs-show-only-what-has-a-file.md` | accepted | Diary and Logs read real files; Status shows real execution state; no CPU/memory bar, because no source for it exists |
| 014 | `adr-014-layout-height-is-a-build-contract.md` | accepted | the bundler dropped `html` from a shared selector list and the browser discarded the whole rule, so nothing could scroll; `check-css.mjs` reads `dist/` and not only the source |
| 013 | `adr-013-pause-is-cooperative.md` | accepted | pause stops the queue at the next node boundary with `run_id` intact, so the in-flight node keeps its output; step is one node then pause |
| 012 | `adr-012-run-scope-is-runtime.md` | accepted | a run scope is a moment of work: `computeOrder` takes a subset, dependencies are counted only inside it, and nothing about the choice is written to the canvas |

## House rules

- `proposed` → `accepted` happens when the owner of the product says so, in a commit message or a review.
  Documenting a decision is not making one, and the person writing about the code does not approve their own
  reading of it.
- **Supersede, do not edit.** A decision that changed gets `status: superseded` plus `superseded_by:`; the reason
  it was made in the first place is the part nobody can reconstruct later.
- An ADR may state a consequence ("a boot now lists `nodes/*.md`") but not a mechanism. The line that describes
  how the code works belongs in `ARCHITECTURE.md`, and this file is where the argument lives.
- Ideas are not decisions. If you cannot name the line of code that moved because of it, it is a note.
