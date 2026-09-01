# Documentation map

Two rules decide where a sentence belongs, and they are the whole design of this folder:

1. **`ARCHITECTURE.md` is the mechanism.** How a file looks, what a function does, which branch `hydrate` takes
   — one home, no restatement. Everything else here links into it and never copies it.
2. **A document earns its place by naming what it changes.** A doc with no code reference, no test and no
   decision attached is an idea, and ideas live in `notes/ideas.md`.
3. **If a sentence has no home, it goes to `inbox.md` with its cost attached.** Unplaced is not the same as
   deleted: a question that was silently dropped is a decision nobody made, arriving later as a bug report.

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
| `ui-spec.md` | what the interface must **look like**, row by row: value + storage location + status | the mechanism behind it; a taste without a number |
| `inbox.md` | every open question and every idea with no home, ranked by the cost of not answering | content that already has a home |

## Format, and the gate that enforces it

Every doc under a content directory (`decisions/`, `patterns/`, `roadmap/`, `research/`, `notes/`) and every
file at the root of `docs/` except this map and `ARCHITECTURE.md` opens with frontmatter starting at byte zero —
no leading blank line, which is how a `phase` field silently stops existing:

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

`related:` is optional and, like every other key, a single inline list — the parser understands
`related: [a, b]` and nothing else, on purpose: a format that cannot hold a hidden second truth is a feature here.

Run it with `node scripts/check-docs.mjs`; CI runs it next to the other two repository gates
(`docs/ARCHITECTURE.md#11.3`).

## Language

`docs/` may be Persian. The owner is the reader, and a document that gets read is worth more than a document
that is uniform — so the corpus is bilingual by decision: `ARCHITECTURE.md`, this map and the ADRs written before
the ruling stay English, `ui-spec.md` and `inbox.md` are Persian, and a new file may be either.

What did **not** change: code, comments, UI strings and tests are English, because a tool that reads the
repository (`scripts/doc-anchors.mjs`, a grep, an agent with no locale) should never have to transliterate.
`scripts/check-english.mjs` enforces exactly that split — RTL script is rejected in every tracked path outside
`docs/`, and **bidi control characters (U+200B, U+200F/200E, U+202A–202E, U+2066–2069) are rejected everywhere,
`docs/` included**. A Persian document is welcome; a Persian document carrying an invisible override is a
different class of failure — the one that corrupts diffs, `grep` and another AI's reading of a line. The single
exception is **U+200C ZWNJ, allowed in `docs/` and banned outside it**: Persian cannot be spelled without the
non-joiner, so in `docs/` it is orthography, and anywhere else it is a bug.

Nobody is translating the existing English documents. Rewriting a doc that is already true costs more than
reading one in a language you already read; the money goes into the documents that do not exist yet.
