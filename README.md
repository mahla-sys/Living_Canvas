# Living Canvas

A single-page canvas (React + React Flow + zustand) where the artifact is a graph of nodes and edges, and
the **storage substrate is a folder of plain text files** — Markdown per node (its position included), YAML per
edge, Markdown per memory, JSON for the role contracts and their schemas. Agent pipelines live on the canvas:
nodes are roles, edges are data flows with conditions, a lightweight executor runs them and writes its outputs
back into the same tree. There is one file per thing, and one source of truth per file: no `graph.json`
competing with the node files, and `state.json` is a cache that nothing is allowed to trust.

The consequence that defines the design: **you can open the canvas folder in Obsidian or edit it with Git,
and the app reads your edits back.** Files are the source of truth; in-memory state is a cache of them.

> Everything in this repository is English — code, comments, UI strings, tests, docs. The UI is LTR.

---

## Run it

```bash
npm install
npm run dev         # http://localhost:3000  (binds 0.0.0.0, accepts any host for sandboxed previews)
npm test            # vitest run — 7 files / 118 tests, no jsdom, no extra config file
npm run typecheck   # tsc --noEmit, noUnusedLocals is ON
npm run build       # tsc --noEmit && vite build — types are part of the build
node scripts/check-english.mjs   # the English-only rule, as CI runs it
node scripts/doc-anchors.mjs     # regenerate the line anchors in ARCHITECTURE.md §3.4 (--check to gate)
```
CI is committed as `ci/github-actions.yml` (typecheck → test → build → English gate). Activating it is one command:
`cp ci/github-actions.yml .github/workflows/ci.yml`. The agent account on this branch is not allowed to create files
under `.github/workflows/` (a GitHub App permission), so that copy needs someone with repository access. Until it
lands, the four commands above are the gate.

## Read it

**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** is the canonical document, and it is written to be
sufficient on its own: five invariants, the layer map, every module's API, every file format byte for byte,
every control flow, the test strategy, the debt list, and the open design questions. It is structured as a
tree — trunk (what and why) → branches (modules) → twigs (formats and flows) — so you can stop reading at
whichever level you need.

```
src/
├── main.tsx · App.tsx           boot, error surface, layout
├── state.ts                     constants, types, factories, seed data
├── store.ts                     zustand store + the actions façade (the only UI-facing API)
├── lib/core.ts                  types · YAML · frontmatter · StorageAdapter ×4 · HTML safety · output schemas
├── lib/engine.ts                behaviour: events · files · memory · execution · strokes · portability
├── lib/portable.ts              the export bundle + rebuilding a canvas from its files
├── lib/fs-access.ts             the File System Access adapter (a real folder on disk)
├── lib/__tests__/               118 tests, production code only (no fixtures that reimplement a serialiser)
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
now explains it. The snapshot and its `Living_Canvas-main.zip` archive are **no longer tracked** — they are git-ignored local
material, so a fresh clone contains only the live app. The archive was repacked down to its reference material
(25 files, ~123 KB) after `node_modules` and build output were stripped out of it; the design documents inside
it are the point, and they are unmodified. Re-add them with `git add -f` if the
history of the design documents is ever needed in the repository again.
