# Living Canvas

A single-page canvas (React + React Flow + zustand) where the artifact is a graph of nodes and edges, and
the **storage substrate is a folder of plain text files** — Markdown per node, YAML per edge, Markdown per
memory, JSON for machine caches. Agent pipelines live on the canvas: nodes are roles, edges are data flows
with conditions, a lightweight executor runs them and writes its outputs back into the same tree.

The consequence that defines the design: **you can open the canvas folder in Obsidian or edit it with Git,
and the app reads your edits back.** Files are the source of truth; in-memory state is a cache of them.

> Everything in this repository is English — code, comments, UI strings, tests, docs. The UI is LTR.

---

## Run it

```bash
npm install
npm run dev         # http://localhost:3000  (binds 0.0.0.0, accepts any host for sandboxed previews)
npm test            # vitest run — 5 files / 63 tests, no jsdom, no extra config file
npm run typecheck   # tsc --noEmit, noUnusedLocals is ON
npm run build
```

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
├── lib/core.ts                  types · YAML · frontmatter · StorageAdapter ×4 · HTML safety
├── lib/engine.ts                behaviour: events · files · memory · execution · strokes · portability
├── lib/portable.ts              the export bundle + rebuilding a canvas from its files
├── lib/fs-access.ts             the File System Access adapter (a real folder on disk)
├── lib/__tests__/               63 regression tests
└── components/                  CanvasArea · SidePanels · Overlays · icons
```

## The three guarantees

1. **A canvas can be rebuilt from `canvases/<id>/**` alone** — no `graph.json`, no `state.json`. Tested.
2. **Text that can come from a user or a model is escaped before it is rendered.** The only tags that can
   exist in rendered node Markdown are `strong`, `em`, `code`. Tested.
3. **A lock is a moment of execution, never data.** Locks are written to files, and never restored on load.
   Tested.

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
now explains it. Trimming the snapshot (and the 40 MB `Living_Canvas-main.zip`) out of git is an open
housekeeping decision, not a code one.
