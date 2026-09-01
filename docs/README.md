# Documentation map

Two rules decide where a sentence belongs, and they are the whole design of this folder:

1. **`ARCHITECTURE.md` is the mechanism.** How a file looks, what a function does, which branch `hydrate` takes
   — one home, no restatement. Everything else here links into it and never copies it.
2. **A document earns its place by naming what it changes.** A doc with no code reference, no test and no
   decision attached is an idea, and ideas live in `notes/ideas.md`.

Restating is the failure mode this folder is built against. The project spent a phase with two files describing
one graph (`graph.json` and `nodes/*.md`) and the fix was deletion, not a better precedence rule
(`decisions/adr-002-graph-json-deleted.md`). A folder of paraphrased summaries of a reference doc is the same
bug wearing prose: so one home per fact, links instead of copies, and a gate that fails when a link rots.

## What lives where

| path | holds | never here |
|---|---|---|
| `ARCHITECTURE.md` | every mechanism, byte for byte | scheduling, taste about future work |
| `decisions/` | **why** — one ADR per decision, 40 body lines, `proposed` / `accepted` / `superseded` | mechanism (link it), TODO lists |
| `patterns/` | design proposals for a gap we intend to close, each with a code or test reference | decisions nobody took; features that already exist |
| `roadmap/` | the only owner of *when*; `- [x]` means "shipped and guarded" | a `[x]` with no test or doc behind it |
| `research/` | dated synthesis, read once and cited | authority: evidence, not a spec |
| `notes/ideas.md` | everything not yet a decision, including product identity | decision language ("accepted", "decided") |
| `archive/` | superseded docs, each naming what replaced it | silence about why it died |

## Format, and the gate that enforces it

Every doc under a content directory (`decisions/`, `patterns/`, `roadmap/`, `research/`, `notes/`) opens with
frontmatter that starts at byte zero — no leading blank line, which is how a `phase` field silently stops
existing:

    title: Hard output validation
    status: accepted
    updated: 2026-09-01
    sources: [src/lib/engine.ts#validateAgainstContract, docs/ARCHITECTURE.md#4.9.1]

`sources` is not decoration. Each entry is resolved by `scripts/check-docs.mjs`: a `src/path#symbol` must
contain that symbol, a `docs/file#section` must have that heading, a test file must exist. A reference that no
longer resolves is a document that has already died quietly, and the gate would rather fail today than be
believed in three months. The convention follows from that: **a reference is written as a path**
(`src/lib/engine.ts#hydrate`, `docs/ARCHITECTURE.md#5.2`, `scripts/check-english.mjs`) **or as a test file or ADR
name** (`schema.test.ts`). A bare `state.json` in prose is a sentence about the file format, not a citation, and
the checker deliberately does not read it as one.

Also enforced, because conventions without checks last a month: `status` must be legal for its directory, a
`superseded` doc must name its successor, an ADR body is capped at 40 lines, every ADR is listed in
`decisions/README.md`, and **`phase:` is banned everywhere** — scheduling is a filename in `roadmap/`, so
moving a commitment between phases is a one-line edit instead of a corpus-wide sweep.

Run it with `node scripts/check-docs.mjs`; CI runs it next to the other two repository gates
(`docs/ARCHITECTURE.md#11.3`).

## Language

Everything tracked here is English — code, comments, UI strings, tests, docs — because `scripts/check-english.mjs`
fails on RTL or bidi text in any tracked file. Persian design conversation is welcome; it happens outside the
repository, which is also where the original Persian design documents live (`Living_Canvas-main/` at the repo
root, git-ignored). The alternative — a bilingual corpus — was weighed and rejected: half of every document
would be un-gated, and the documents that drift are the ones nobody can check.
