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
| 010 | `adr-010-accent-is-a-role-and-plum-is-default.md` | accepted | `--color-lc-accent` / `--color-lc-warn` as roles rather than palette steps, amber kept only as canvas data, `plum` is the default theme |

## House rules

- `proposed` → `accepted` happens when the owner of the product says so, in a commit message or a review.
  Documenting a decision is not making one, and the person writing about the code does not approve their own
  reading of it.
- **Supersede, do not edit.** A decision that changed gets `status: superseded` plus `superseded_by:`; the reason
  it was made in the first place is the part nobody can reconstruct later.
- An ADR may state a consequence ("a boot now lists `nodes/*.md`") but not a mechanism. The line that describes
  how the code works belongs in `ARCHITECTURE.md`, and this file is where the argument lives.
- Ideas are not decisions. If you cannot name the line of code that moved because of it, it is a note.
