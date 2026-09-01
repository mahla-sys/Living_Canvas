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

## House rules

- `proposed` → `accepted` happens when the owner of the product says so, in a commit message or a review.
  Documenting a decision is not making one, and the person writing about the code does not approve their own
  reading of it.
- **Supersede, do not edit.** A decision that changed gets `status: superseded` plus `superseded_by:`; the reason
  it was made in the first place is the part nobody can reconstruct later.
- An ADR may state a consequence ("a boot now lists `nodes/*.md`") but not a mechanism. The line that describes
  how the code works belongs in `ARCHITECTURE.md`, and this file is where the argument lives.
- Ideas are not decisions. If you cannot name the line of code that moved because of it, it is a note.
