

# Living Canvas

> A framework-independent blackboard where AI agents and humans collaborate on an infinite canvas. Files are the source of truth; state is just a cache.

[![Tests](https://img.shields.io/badge/tests-319%20passing-brightgreen)]()
[![Lines](https://img.shields.io/badge/source-17k%20LOC-blue)]()
[![ADRs](https://img.shields.io/badge/ADRs-47-purple)]()
[![License](https://img.shields.io/badge/license-see%20LICENSE-lightgrey)]()

A single-page canvas (React + React Flow + Zustand) where the artifact is a graph of nodes and edges, and the **storage substrate is a folder of plain text files** — Markdown per node (its position included), YAML per edge, Markdown per memory, JSON for the role contracts and their schemas. Agent pipelines live on the canvas: nodes are roles, edges are data flows with conditions, a lightweight executor runs them and writes its outputs back into the same tree. There is one file per thing, and one source of truth per file: no `graph.json` competing with the node files, and `state.json` is a cache that nothing is allowed to trust.

The consequence that defines the design: **you can open the canvas folder in Obsidian or edit it with Git, and the app reads your edits back.** Files are the source of truth; in-memory state is a cache of them.

> Code, comments, UI strings and tests are English, and the UI is LTR. `docs/` may be Persian — the owner reads it there. Invisible bidi characters are banned in every tracked file (U+200B, U+200D–200F, U+202A–202E, U+2066–2069); U+200C is allowed in `docs/` only, because Persian cannot be spelled without it. `scripts/check-english.mjs` enforces exactly that line.

---

## Visual Showcase

### Pipeline Overview & Execution State
*Multi-agent pipeline with conditional data flows, per-node locks, and a live execution ledger.*

![Pipeline Overview](https://raw.githubusercontent.com/mahla-sys/Living_Canvas/main/screenshots/real-time-execution.png)

---

### File-Substrate Architecture
*Every node, edge, and memory is a plain Markdown/YAML file. No database, no black box.*

![File Substrate Architecture](https://raw.githubusercontent.com/mahla-sys/Living_Canvas/main/screenshots/file-substrate-architecture.png)

---

### Agent Configuration & Context Contract
*Each agent operates under a strict read/write path contract and output schema validation.*

| Agent Configuration | Context Contract |
| :---: | :---: |
| ![Agent Configuration](https://raw.githubusercontent.com/mahla-sys/Living_Canvas/main/screenshots/agent-configuration.png) | ![Context Contract](https://raw.githubusercontent.com/mahla-sys/Living_Canvas/main/screenshots/context-contract.png) |

---

### Multi-Model Support
*Swap between Simulator, Gemini, Mistral, and DeepSeek without changing the architecture.*

![Multi-Model Settings](https://raw.githubusercontent.com/mahla-sys/Living_Canvas/main/screenshots/multi-model-settings.png)

---

## What Makes This Different

| Typical AI Agent Frameworks | Living Canvas |
|---|---|
| Cloud-locked state in proprietary databases | **Plain-text files on disk (Git-diffable, Obsidian-compatible)** |
| Framework bloat (LangChain, AutoGen) | **Zero framework dependency — custom DAG executor** |
| Black-box agents | **Full transparency: every thought, decision, and tool call is logged** |
| No security boundaries between agents | **Context contracts: each agent has explicit read/write path allow-lists** |
| Output is whatever the model returns | **Output schema validation before any byte is written** |
| Human is out of the loop | **Human-in-the-loop approval gates at any node** |

---

## Architecture at a Glance

```
┌──────────────────────────────────────────┐
│  React UI (Canvas · Panels · Overlays)   │
└────────────────┬─────────────────────────┘
                 │
┌────────────────▼─────────────────────────┐
│  Zustand Store + Actions Façade          │
└────────────────┬─────────────────────────┘
                 │
┌────────────────▼─────────────────────────┐
│  Engine: Events · Run · Memory · Ledger  │
└────┬───────────────────────────┬─────────┘
     │                           │
┌────▼──────────┐    ┌───────────▼────────┐
│  Portable     │    │  FS Access Adapter │
│  (Bundle)     │    │  (Real folder)     │
└────┬──────────┘    └───────────┬────────┘
     │                           │
┌────▼───────────────────────────▼────────┐
│  Core: Types · YAML · Storage ×4 · HTML │
│  Safety · Output Schema Validator        │
└──────────────────────────────────────────┘
```

---

## Run it

```bash
npm install
npm run dev         # http://localhost:3000  (binds 0.0.0.0, accepts any host for sandboxed previews)
npm test            # vitest run — 31 files / 319 tests
npm run typecheck   # tsc --noEmit, noUnusedLocals is ON
npm run build       # tsc --noEmit && vite build — types are part of the build
node scripts/check-english.mjs   # the language rule above, as CI runs it
node scripts/check-docs.mjs      # docs/ gate: frontmatter, legal statuses, every citation resolving
node scripts/check-palette.mjs   # appearance gate: theme registry, contrast per theme, one place per colour
node scripts/doc-anchors.mjs     # regenerate the line anchors in ARCHITECTURE.md §3.4 (--check to gate)
node scripts/check-facts.mjs     # regenerate every count the docs quote (--check to gate)
```

CI is **defined** at [`ci/github-actions.yml`](ci/github-actions.yml) — typecheck → test → build → language gate → docs gate → palette gate → anchor gate → facts gate — but it is **not wired up**. Activating it is one commit by someone with repository access:

```bash
cp ci/github-actions.yml .github/workflows/ci.yml && git add .github && git commit -m "ci: activate"
```

---

## Read it

**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** is the canonical document, and it is written to be sufficient on its own: five invariants, the layer map, every module's API, every file format byte for byte, every control flow, the test strategy, the debt list, and the open design questions. It is structured as a tree — trunk (what and why) → branches (modules) → twigs (formats and flows) — so you can stop reading at whichever level you need.

[`docs/ui-spec.md`](docs/ui-spec.md) is the sibling that answers a different question — not *how it renders* but *what it must look like*, one row per claim, each with its number, its storage location and its status.

```
src/
├── main.tsx · App.tsx           boot, error surface, layout
├── state.ts                     constants, types, factories, seed data
├── store.ts                     zustand store + the actions façade (the only UI-facing API)
├── lib/core.ts                  types · YAML · frontmatter · StorageAdapter ×4 · HTML safety · output schemas
├── lib/engine.ts                behaviour: events · files · memory · execution · strokes · portability
├── lib/portable.ts              the export bundle + rebuilding a canvas from its files
├── lib/fs-access.ts             the File System Access adapter (a real folder on disk)
├── lib/__tests__/               319 tests, production code only
└── components/                  CanvasArea · SidePanels · Overlays · icons
```

---

## The Four Guarantees

1. **A canvas can be rebuilt from `canvases/<id>/**` alone** — `state.json` is optional and `graph.json` does not exist any more. Tested.
2. **Text that can come from a user or a model is escaped before it is rendered.** The only tags that can exist in rendered node Markdown are `strong`, `em`, `code`. Tested.
3. **A lock is a moment of execution, never data.** Locks are written to files, and never restored on load. Tested.
4. **A contract that is not enforced is not a contract.** Each role's `output_contract.validator` names `library/schemas/<role>.schema.json`, and the executor reads that file before it delivers anything: a missing schema, an unparsable one, an unsupported keyword or an output outside its declared range fails the node, is written to the run ledger, and shows up on the node card. `validator: null` is the only opt-out, and it is a line in the user's own node file. Tested.

A **fresh canvas is a blank board, not a demo**: one "Start here" note, the four memory documents, the four role definitions and their schemas. No pre-built four-agent pipeline, no output box, no built-in template — the shape is yours to draw, the guarantees above are what the app brings.

---

## Tech Stack

- **Runtime:** Node.js 22, TypeScript 5.7
- **Frontend:** React 18, React Flow, Zustand 5, Tailwind CSS v4
- **Storage:** File System Access API, IndexedDB, HTTP adapter (phase 2)
- **LLM Providers:** Gemini, Mistral, DeepSeek, Ollama (local)
- **Testing:** Vitest (319 tests), Playwright (e2e), axe (a11y)
- **Quality Gates:** 5 custom CI scripts (docs, palette, language, anchors, facts)

---

## Portability

| Mode | Works in | What it does |
|---|---|---|
| **Live folder** (File System Access) | Chrome, Edge | Attach a real folder: the picked directory *is* `canvases/<id>/`; every write lands on disk, synchronously; the File Tree shows the folder, not the state |
| **Bundle** `.livingcanvas.json` | Any browser | Every file of the tree inside one JSON, with version and canvas-id guards, a preview before apply, and a per-file reason for anything skipped |
| **HTTP adapter** | Phase 2 | The same `StorageAdapter` over a FastAPI backend — implemented in the client, no server in this repo yet |

---

## Roadmap

| Phase | Status | Focus |
|---|---|---|
| **Phase 1** | ✅ Done | File-substrate canvas, StorageAdapter ×4, execution engine, 319 tests |
| **Phase 2** | 🚧 Active | Real LLM integration, MCP server, multi-canvas vault |
| **Phase 3** | 📋 Planned | Agent personality, three-layer memory, WebGL rendering |
| **Phase 4** | 📋 Planned | Real-time collaboration (CRDT), cloud sync, i18n |
| **Phase 5** | 🌌 Vision | Self-building: Living Canvas designs and builds its own next version |

---

## Legacy Material

`Living_Canvas-main/` is the original snapshot of the project (its own `src/` and three long Persian design documents: architecture, UI/UX spec, Nexus+City concept). It is **not built and not canonical**; `docs/ARCHITECTURE.md` supersedes it.

The snapshot is git-ignored, so the live tree contains only the app. Nothing is lost: the snapshot is still tracked on `main`.

```bash
git archive origin/main Living_Canvas-main | tar -x    # restore the ignored snapshot (~469 KB)
```

---

## Author

**Mahla Taghi Mosleh** — Backend Architect | AI Orchestration

- Email: mahla.systems@proton.me
- GitHub: [@mahla-sys](https://github.com/mahla-sys)
- Telegram: [@mahla_systems](https://t.me/mahla_systems)

---

## License

See [LICENSE](LICENSE) for details.

