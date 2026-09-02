# Living Canvas

A single-page canvas (React + React Flow + zustand) where the artifact is a graph of nodes and edges, and
the **storage substrate is a folder of plain text files** — Markdown per node (its position included), YAML per
edge, Markdown per memory, JSON for the role contracts and their schemas. Agent pipelines live on the canvas:
nodes are roles, edges are data flows with conditions, a lightweight executor runs them and writes its outputs
back into the same tree. There is one file per thing, and one source of truth per file: no `graph.json`
competing with the node files, and `state.json` is a cache that nothing is allowed to trust.

The consequence that defines the design: **you can open the canvas folder in Obsidian or edit it with Git,
and the app reads your edits back.** Files are the source of truth; in-memory state is a cache of them.

> Code, comments, UI strings and tests are English, and the UI is LTR. `docs/` may be Persian — the owner reads
> it there. Invisible bidi characters are banned in every tracked file (U+200B, U+200D–200F, U+202A–202E,
> U+2066–2069); U+200C is allowed in `docs/` only, because Persian cannot be spelled without it.
> `scripts/check-english.mjs` enforces exactly that line.

---

## Run it

```bash
npm install
npm run dev         # http://localhost:3000  (binds 0.0.0.0, accepts any host for sandboxed previews)
npm test            # vitest run — 7 files / 118 tests, no jsdom, no extra config file
npm run typecheck   # tsc --noEmit, noUnusedLocals is ON
npm run build       # tsc --noEmit && vite build — types are part of the build
node scripts/check-english.mjs   # the language rule above, as CI runs it
node scripts/check-docs.mjs      # docs/ gate: frontmatter, legal statuses, every citation resolving
node scripts/check-palette.mjs   # appearance gate: theme registry, contrast per theme, one place per colour
node scripts/doc-anchors.mjs     # regenerate the line anchors in ARCHITECTURE.md §3.4 (--check to gate)
```
CI is committed as `ci/github-actions.yml` (typecheck → test → build → language gate → docs gate → palette gate).
Activating it is one command:
`cp ci/github-actions.yml .github/workflows/ci.yml`. The agent account on this branch is not allowed to create files
under `.github/workflows/` (a GitHub App permission), so that copy needs someone with repository access. Until it
lands, the five commands above are the gate.

## Read it

**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** is the canonical document, and it is written to be
sufficient on its own: five invariants, the layer map, every module's API, every file format byte for byte,
every control flow, the test strategy, the debt list, and the open design questions. It is structured as a
tree — trunk (what and why) → branches (modules) → twigs (formats and flows) — so you can stop reading at
whichever level you need.

[`docs/ui-spec.md`](docs/ui-spec.md) is the sibling that answers a different question — not *how it renders* but
*what it must look like*, one row per claim, each with its number, its storage location and its status. The palette
gate (`scripts/check-palette.mjs`) is what keeps that document from drifting back into taste: theme ids must exist
in CSS, and six text/accent roles must clear WCAG contrast against each theme's own background.

```
src/
├── main.tsx · App.tsx           boot, error surface, layout
├── state.ts                     constants, types, factories, seed data
├── store.ts                     zustand store + the actions façade (the only UI-facing API)
├── lib/core.ts                  types · YAML · frontmatter · StorageAdapter ×4 · HTML safety · output schemas
├── lib/engine.ts                behaviour: events · files · memory · execution · strokes · portability
├── lib/portable.ts              the export bundle + rebuilding a canvas from its files
├── lib/fs-access.ts             the File System Access adapter (a real folder on disk)
├── lib/__tests__/               126 tests, production code only (no fixtures that reimplement a serialiser)
└── components/                  CanvasArea · SidePanels · Overlays · icons
```

## The three guarantees

1. **A canvas can be rebuilt from `canvases/<id>/**` alone** — `state.json` is optional and `graph.json` does
   not exist any more. Tested.
2. **Text that can come from a user or a model is escaped before it is rendered.** The only tags that can
   exist in rendered node Markdown are `strong`, `em`, `code`. Tested.
3. **A lock is a moment of execution, never data.** Locks are written to files, and never restored on load.
   Tested.
4. **A contract that is not enforced is not a contract.** Each role's `output_contract.validator` names
   `library/schemas/<role>.schema.json`, and the executor reads that file before it delivers anything: a missing
   schema, an unparsable one, an unsupported keyword or an output outside its declared range fails the node, is
   written to the run ledger, and shows up on the node card. `validator: null` is the only opt-out, and it is a
   line in the user's own node file. Tested.

A **fresh canvas is a blank board, not a demo**: one "Start here" note, the four memory documents, the four
role definitions and their schemas. No pre-built four-agent pipeline, no output box, no built-in template — the
shape is yours to draw, the guarantees above are what the app brings.

## Portability

| mode | works in | what it does |
|---|---|---|
| **Live folder** (File System Access) | Chrome, Edge | attach a real folder: the picked directory *is* `canvases/<id>/`; every write lands on disk, synchronously; the File Tree shows the folder, not the state; `ensureStructure` builds the skeleton in an empty or freshly cloned folder |
| **Bundle** `.livingcanvas.json` | any browser | every file of the tree inside one JSON, with version and canvas-id guards, a preview before apply, and a per-file reason for anything skipped |
| **HTTP adapter** | phase 2 | the same `StorageAdapter` over a FastAPI backend — implemented in the client, no server in this repo yet |

## Legacy material

`Living_Canvas-main/` is the original snapshot of the project (its own `src/` and three long Persian design
documents: architecture, UI/UX spec, Nexus+City concept). It is **not built and not canonical**; `docs/ARCHITECTURE.md`
supersedes it, and §11.1 of that document maps every `§` reference in the code comments to the section that
now explains it.

The snapshot is git-ignored, so the live tree contains only the app. There used to be a `Living_Canvas-main.zip`
next to it as well; it is deleted, on purpose — an archive of files that are already on disk, sitting beside the
files, is how a repository grows a copy nobody remembers to update. Nothing is lost: the snapshot is still tracked
on `main`, so a working copy is one command away.

```bash
git archive origin/main Living_Canvas-main | tar -x    # restore the ignored snapshot (~469 KB)
```

Its three design documents are unmodified and untranslated, in Persian, and they stay that way: they are history,
not spec. `docs/` is where the live ones are — in whatever language each of them is easiest to read.
