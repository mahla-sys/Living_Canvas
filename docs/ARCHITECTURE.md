# Living Canvas — Architecture

**Version 1.4 (handoff edition) · 2026-09-01 · language: English, everywhere (code, UI, docs, tests)**

This document is written for a reader who **does not have the repository open**. It is meant to be
sufficient on its own: every module, every file format, every flow, every invariant. When this text and
the code disagree, the code wins and this document is a bug — fix the document.

---

## How to read this document (it is a tree, on purpose)

The structure is trunk → branch → twig. Read level 0 and 1 and you understand the project. Read level 2
and you can reason about any change. Level 3+ is the detail you come back for when you touch a branch.

| Level | Sections | What you get |
|---|---|---|
| **Trunk** | `0` what it is, `1` the five laws, `2` layer map | the whole shape of the thing, in 10 minutes |
| **Branches** | `3` modules | every file: its job, its API, who calls it, what breaks without it |
| **Twigs** | `4` data formats, `5` flows, `6` UI | byte-exact formats, step-by-step control flow, screen anatomy |
| **Immune system** | `7` tests | what each test guards, how to add one without weakening it |
| **Pruning** | `8` non-goals, `9` debt | what we refuse to do, and exactly where it still hurts |
| **Next ring** | `10` open questions, `11` legacy anchors | decisions waiting for the owner |

Naming convention in the repo: files and identifiers are English; Persian digits (`U+06F0-U+06F9`) and RTL markup
are **not** allowed anywhere in the app. There are zero `dir="rtl"`, zero `toLocaleString("fa-IR")`,
zero Persian string literals in `src/` — the LTR layout is the layout.

---

# 0. The trunk

## 0.1 What it is

Living Canvas is a **single-page canvas editor** (React + React Flow + zustand, no backend in phase 1)
where the artifact is a graph of nodes and edges, and the **storage substrate is a folder of plain text
files** — Markdown with YAML frontmatter for nodes, YAML for edges, Markdown for memories, JSON for
machine caches. An agent pipeline is expressed *on the canvas*: nodes are roles/steps, edges are data
flows with conditions, and a lightweight executor runs them, writing its outputs back into the same tree.

The value proposition, in one sentence: **the canvas is a folder you can `git diff`, open in Obsidian, and
hand to a human — and the app is one reader/writer of that folder, not the owner of a private database.**

## 0.2 The bet

Every design decision below follows from one bet: **files are the source of truth; in-memory state is a
cache of them.** Consequences that look like costs and are actually the point:

- An external edit (Obsidian, `git pull`, a text editor) is a first-class operation. There is a
  "reload from disk" button, and file content **overrides** the machine cache on load (§5.2).
- A canvas can be rebuilt from files alone, with no `graph.json`/`state.json` at all. That path is tested.
- Export is not a state dump; it is a copy of the tree (`§4.10`). Import is not "load state"; it is
  "write these files, then hydrate from them".
- The unit of portability is `canvases/<id>/`, not a database row.

The consequence we paid for, and keep paying: **there are two readers of the same data** (the fast JSON
path and the Markdown path) and they must never disagree. That is why the serialisers and parsers live in
exactly one file (`src/lib/core.ts`) and why the tests round-trip through them instead of hand-writing
fixtures (§7).

## 0.3 The shape, in one diagram

```
                    ┌──────────────────────────────────────────────┐
   browser only     │  React UI  (CanvasArea · SidePanels · Overlays) │
                    └───────────────┬──────────────────────────────┘
                                    │ reads slices / calls actions
                    ┌───────────────▼──────────────────────────────┐
                    │  store.ts   zustand store + actions façade    │  ← the only mutable state
                    └───────────────┬──────────────────────────────┘
                                    │ delegates every behaviour
                    ┌───────────────▼──────────────────────────────┐
   behaviour        │  lib/engine.ts  events · artifacts · run ·     │
                    │  memory · snapshots · strokes · templates ·   │
                    │  portability (export/import/folder attach)    │
                    └──────┬──────────────────────┬────────────────┘
                           │                      │
        ┌──────────────────▼───────┐   ┌──────────▼─────────────────┐
        │ lib/portable.ts  bundle, │   │ lib/fs-access.ts  Folder   │   ← leaves that talk to the world
        │ rebuild-from-files       │   │ adapter (File System Access)│
        └──────────┬───────────────┘   └──────────┬─────────────────┘
                   │                              │
        ┌──────────▼──────────────────────────────▼─────────────────┐
        │ lib/core.ts  types · YAML · frontmatter · StorageAdapter   │   ← no imports from inside the project
        │ (IndexedDB / HTTP / memory / folder) · HTML safety         │
        └──────────▲────────────────────────────────────────────┬────┘
                   │                                            │
        ┌──────────┴───────────────┐              ┌─────────────▼──────────┐
        │ state.ts  constants,     │              │ components/icons.tsx    │  (pure SVG, no deps)
        │ factories, seed data     │              └─────────────────────────┘
        └──────────────────────────┘
```

Storage is behind one interface with four implementations, swappable at runtime:

```
   StorageAdapter  ──► IndexedDBStorageAdapter   (default, browser, LRU-cached)
                   ──► FsAccessStorageAdapter     (a real folder on disk; Chrome/Edge)
                   ──► HttpStorageAdapter          (a FastAPI backend; phase 2)
                   ──► MemoryStorageAdapter        (no-IndexedDB browsers, import preview, tests)
```

---

# 1. The five laws

These are the invariants. Everything else is detail that can move.

### Law 1 — Files are the substrate; state is a cache.
Anything the user can see must be reconstructible from `canvases/<id>/**`. If you add a field, you add
it to the file format **and** to the reader (`nodeToMarkdown` + `parseNodeDoc`, `edgeToYaml` +
`parseEdgeDoc`, `memoryToMd` + `parseMemoryDoc`). A field that only lives in `state.json` is a bug in
waiting, because a folder import must not lose it — and it will.

### Law 2 — Escape before render. Always, before an AI tool writes into a node.
Any text that can originate from a user or a model goes through `mdInline()` (which calls `escapeHtml()`
first and only then applies `**bold**` / `_em_` / `` `code` ``). Never `dangerouslySetInnerHTML` on a raw
string. The only tags that may exist in rendered node Markdown are `strong`, `em`, `code` — there is a
test asserting exactly that. This law exists because phase 2 pipes model output straight into node
content; a `<img onerror>` in a summary would otherwise be a stored XSS with a human-in-the-loop UX on
top of it.

### Law 3 — A lock is a moment of execution, never data.
`node.data.lock` is set when a run touches a node and cleared when it ends. It is **written** to the node
file (so a folder is honest about what happened) but **never restored** on hydrate/import: a lock read
back from disk would freeze the UI forever after a crash. Likewise `agent.status: running` degrades to
`idle` on load, while `done` is kept (it is a real checkpoint). See `§12.5` in the legacy anchors (§11).

### Law 4 — One adapter, one contract.
All I/O goes through `StorageAdapter` (9 methods, §3.1.4). No component or engine function calls
`indexedDB`, `fetch`, `localStorage` or `showDirectoryPicker` directly — except `lib/fs-access.ts` (the
adapter itself) and `engine`'s root-handle persistence, which are the two sanctioned seams.
The contract detail that bit us once and is now law: **`listDirectory` returns files with their names and
directories with a trailing `/`** (`listChildren()` in core is the single implementation of that rule).
`hydrate()` strips the trailing `/` to get a folder name. The previous filter (`!p.includes("/")`)
silently dropped everything inside a subfolder — user templates vanished on refresh.

### Law 5 — Dependencies point down, never up.
`core` imports nothing. `state` imports `core`. `portable` imports `core`+`state`. `fs-access` imports
`core`. `engine` imports `core`,`state`,`portable`,`fs-access`. `store` imports the above. Components
import `store` (+ `core`/`state` for types and constants). **Never** the reverse: if `core` needs
something from `engine`, that thing is in the wrong file (this is how we avoided a cycle when portability
landed — `portable.ts` is a sibling of `engine`, not a child).

The only tolerated upward edges, and why: `Overlays.tsx → lib/fs-access` (the modal must know whether the
browser can attach a folder before offering it) and `SidePanels.tsx → lib/engine` (`flushPending` before
reading the live tree). Both are read-only helpers; if a third one appears, introduce `src/lib/capabilities.ts`
instead of growing the exceptions.

---

# 2. The layer map (files, sizes, ownership)

```
src/
├── main.tsx                    100  L   boot, global error surface, React error boundary
├── App.tsx                      38  L   layout: LeftPanel | canvas+console | RightPanel, then overlays
├── state.ts                    474  L   ★ constants, types re-exports, factories, seed workspace data
├── store.ts                    381  L   ★ zustand store + Actions façade (the only UI-facing API)
├── index.css                   342  L   design tokens (dark botanical), .lc-md-*, .lc-import-*, chip
├── lib/
│   ├── core.ts                 865  L   ★ types · YAML · frontmatter · StorageAdapter×4 · HTML safety
│   ├── engine.ts              2032  L   ★ all behaviour: events, files, run, contracts, tools, ledger, strokes
│   ├── portable.ts             439  L   ★ bundle build/parse, rebuild-canvas-from-files, download helpers
│   ├── fs-access.ts            343  L   ★ File System Access adapter, ensureStructure, read/write a folder
│   ├── test-helpers.ts          61  L   test-only wrappers around the REAL serialisers
│   └── __tests__/             1226  L   92 tests in 6 files (§7)
└── components/
    ├── CanvasArea.tsx           729  L   ★ React Flow: node shapes, drawing layer, approval banner
    ├── SidePanels.tsx          839  L   ★ library/files tabs, file tree, live folder tree, inspector
    ├── Overlays.tsx             753  L   ★ TopBar, console, chat, history, settings, PortModal, toasts
    └── icons.tsx               121  L   inline SVG icon set (no icon dependency)
```

★ = the file you must understand before changing that area. Total: **8 743 lines** in 20 files (8 401 of it TypeScript). `package.json` carries **4 runtime dependencies**
(react, react-dom, @xyflow/react, zustand) and 8 dev ones — the eleven unused libraries are gone, and
`scripts/check-english.mjs` is not a dependency: a plain node script that CI calls (§11.3).
Everything is client-side; there is no build-time codegen, no runtime dependency on a server, and no
`index.html` script tag other than the module entry.

Two files are large on purpose (`engine.ts`, `core.ts`) — they are the places where "one writer, one
reader" can be enforced by eye. They are internally sectioned with `/* ---------------- name ---------------- */`
banners, and the sections are the real module boundaries: splitting them into more files is a *later*
decision that must not change behaviour (§10 Q3).

---

# 3. Branches — one section per module

## 3.1 `src/lib/core.ts` (865 lines) — types, serialisers, storage, HTML safety

No imports from inside the project. This is the only file allowed to know how a file looks on disk and how
a folder is listed. Six sections, in this order:

### 3.1.1 Domain types (verbatim contracts; the UI renders exactly these)

```ts
type NodeType = "note" | "agent" | "folder" | "output-box"
              | "pipeline-step" | "file" | "shape" | "drawing";
type ViewMode  = "dot" | "name" | "card" | "markdown";
type ShapeKind = "rectangle" | "circle" | "diamond" | "hexagon" | "card" | "empty";
type AgentStatus = "idle" | "running" | "done" | "failed" | "waiting";
type EdgeType  = "flow" | "relation" | "event-flow" | "blackboard" | "direct-message";

interface ContextContract {            // the security boundary for agents (§9 legacy anchor)
  allowed_read_paths: string[];        // the ONLY paths an agent may read
  allowed_write_paths: string[];       // the ONLY paths an agent may write
  output_contract: { format: string; required_fields: string[]; save_to: string };
}

interface AgentConfig {
  role_id: string; system_prompt: string; model: string; tools: string[];
  status: AgentStatus; max_steps: number; max_tokens: number;
  require_approval: boolean;           // true ⇒ the run pauses after this node
  context_contract: ContextContract;
}

interface LCNodeData {                 // React Flow node.data — the whole node
  [key: string]: unknown;              // (index signature: React Flow demands it)
  nodeType, title, shape, color, viewMode, content, created_by, created_at, updated_at;
  animation: { type: "breathe" | "pulse" | "none"; speed: number };
  style:  { strokeColor: string; strokeWidth: number; fillStyle: "solid"|"hachure"|"empty"; opacity: number };
  lock:   { status: "free" | "locked"; locked_by: string | null; locked_at: string | null };
  agent:  AgentConfig | null;          // null for every non-agent node
}

interface LCEdgeData {
  edgeType: EdgeType; label: string;
  line_style: "solid" | "dashed" | "dotted";
  animation: "none" | "flow" | "pulse";
  trigger: { type: "on_completed" | "manual" | "condition"; condition: string };
  config:  { communication: "blackboard" | "direct" | "none" };
}

interface MemDoc { path; title; body; updated_at; last_accessed; confidence: number; source: "system"|"agent"|"user" }
interface OutputEntry { file; type; description; content }        // one file in outputs/<node>/
interface ChatMsg { role: "user"|"agent"|"system"; text: string; at: string }
interface SnapshotMeta { id; at; label; node_count; edge_count; status }
interface Stroke { id; canvas_id; tool: "pen"|"highlight"; color; width; points: {x,y}[]; author; created_at }
interface Settings { provider: "sim"|"deepseek"; apiKey; model; owner; simDelay; backendUrl; workspaceRoot?: string|null }
interface ExecutionState { run_id; canvas_id; current_node_id; queue: string[]; completed: string[];
                           context: Record<string,unknown>;
                           status: "idle"|"running"|"paused"|"waiting_approval"|"completed"|"failed"|"stopped";
                           started_at }
type BusEventType = 28 literals (node.*, edge.*, run.*, lock.*, memory.updated, output.written,
                      snapshot.*, stroke.*, chat.message, file.written, validation.failed, system)
```

Adding a `BusEventType` is safe (it is a union used by `emit` and the console renderer); removing one is a
breaking change for the event log filter in `ActivityConsole`.

### 3.1.2 Utils

| export | signature | note |
|---|---|---|
| `uid(p="id")` | `→ "id-<base36 time>-<seq+rand>"` | sortable enough, no dependency |
| `nowIso()` / `nowStamp()` | `→ "…Z"` / `"2026-09-01T16-11-47"` | `nowStamp` is filename-safe (used for snapshot ids) |
| `fmtClock(iso)` | `→ "16:42:03"` | `en-GB` + `hourCycle:"h23"`, never Persian digits |
| `fmtDate(iso)` | `→ "2026-09-01"` | ISO slice — locale-free and sortable |
| `sleep(ms)`, `clamp(a,b,n)` | | |
| `debounce(fn, ms)` | `→ fn & { flush(): void; pending(): boolean }` | **the `flush`/`pending` members exist for Export** |
| `EMPTY_ARR` | `never[]`, frozen by convention | stable empty-array selector; prevents infinite re-render loops in zustand selectors |

### 3.1.3 HTML safety (Law 2)

```ts
const HTML_ESCAPES: Record<string,string>   // & < > " '  (deliberately NOT backtick: it must survive for `code`)
export function escapeHtml(s: string): string
export function mdInline(raw: string): string   // escape → then **bold**, _em_, `code` → returns HTML string
```
Order is the whole security property. `mdInline` escapes first, so the only tags in its output are the
three it inserts itself. Both `HTML_ESCAPES` and the replace-character-class in `escapeHtml` must stay in
sync — a backtick in the class silently killed every inline code span once.

### 3.1.4 `StorageAdapter` — the only I/O surface

```ts
export interface StorageAdapter {
  readFile(path): Promise<string>;          // rejects on a missing file (hydrate relies on that)
  writeFile(path, content): Promise<void>;  // creates parent "folders" implicitly (key-per-path model)
  listDirectory(path): Promise<string[]>;   // files bare, dirs with trailing "/"   ← Law 4
  deleteFile(path): Promise<void>;          // idempotent
  exists(path): Promise<boolean>;
  readJson<T>(path): Promise<T>;            // JSON.parse(readFile)
  writeJson<T>(path, data): Promise<void>;
  allPaths(): Promise<string[]>;            // full logical path list — backs collect/export/hydrate
  clear(): Promise<void>;                   // canvas-scoped, never global
}
```

Four implementations, same contract, different worlds:

| adapter | where it writes | `allPaths` | notes |
|---|---|---|---|
| `IndexedDBStorageAdapter(dbName="living-canvas")` | DB `files` store, `keyPath:"path"`, one record per file | `getAllKeys` + a `seen` set of this session's writes | 80-entry `LruCache`; on any error sets `useMem=true` and keeps working in memory |
| `FsAccessStorageAdapter(dirHandle, rootPrefix)` | real files in the picked folder | `walkDir` (files only, skips dotfiles) | `adapterKind="fs"`; strips the `canvases/<id>/` prefix so the picked folder *is* the canvas dir; rejects `..`; `clear()` only inside the canvas dir |
| `HttpStorageAdapter(base, canvasId)` | FastAPI `PUT/GET/DELETE {base}/api/canvases/{id}/…` | server listing normalised to relative paths | 120-entry cache; tolerant of servers returning full paths |
| `MemoryStorageAdapter()` | a `Map` | keys ∪ `seen` | for Safari private mode, import preview, and tests |

Selection & swap:

```ts
export function createDefaultStorage(dbName = "living-canvas"): StorageAdapter
   // indexedDB + window.localStorage present → IndexedDB adapter; else memory adapter.
   // It *constructs* eagerly: a constructor that threw here would take the whole app down at module load.
export let storage: StorageAdapter = createDefaultStorage();
export function setStorage(s: StorageAdapter)   // live binding: every importer sees the new adapter
export function storageMode(): "idb"|"fs"|"http"|"memory"   // reads `adapterKind`, no circular import
```

`setStorage` + ESM live bindings is how folder attachment works without touching a single writer call site
(§5.6). `storageMode()` exists because the File Tree must not read state in folder mode, and because the
TopBar chip tells the user where their data is.

### 3.1.5 Serialisers (write side) & the mini-YAML reader (read side)

```ts
export function toYaml(obj, indent = 0): string          // nested maps, scalars, lists (incl. list of objects)
const  yv(v): string                                     // scalar quoting: doubles-quote if /[:#\n"']/ or leading/trailing space;
                                                         // escapes \\ " \n \r \t (and control chars) — that is what makes
                                                         //   multi-line prompts survive inside one YAML line
export const frontmatter = (obj, body) => `---\n${toYaml(obj).trimEnd()}\n---\n\n${body.trim()}\n`;
export function extractFrontmatter(md): { yaml: string; body: string } | null   // null = no fence (partial file)
export function readFrontmatterYaml(md): { yaml: Record<string,unknown>|null; body: string }
export function nodeToMarkdown(id, d: LCNodeData, position?): string   // the full node file, §4.2
export function edgeToYaml(id, source, target, d: LCEdgeData): string  // the whole file is YAML, §4.3
export function memoryToMd(doc: MemDoc): string                        // §4.4
export const outputsIndexYaml(nodeId, entries): string                 // §4.5 index file
export const chatToMd(nodeId, title, msgs): string                     // §4.6
export const logText(lines): string                                     // §4.7
export function parseYaml(src): Record<string,unknown> | null          // block YAML only; null on garbage
```

`toYaml`/`parseYaml` are a matched pair with a tested identity: `parseYaml(toYaml(x))` deep-equals `x` for
everything our writers produce. **Unsupported by design**: flow style (`{a: 1}`), anchors/aliases, block
scalars (`|`, `>`), comments. If a hand-written file uses them, `parseYaml` returns `null` and the file is
reported as unreadable rather than silently mangled — that is deliberate: Obsidian users must see a real
error in the log, not a half-parsed node.

`nodeToMarkdown` writes `position` (rounded) and the **full** `system_prompt` + `context_contract`; the old
120-char truncation silently destroyed agent identity in the files-only path. It also writes `lock` — and
the reader ignores it (Law 3).

### 3.1.6 Path safety and folder listing (the two guards)

```ts
export function listChildren(allPaths: Iterable<string>, dir: string): string[]
   // files bare, dirs with a trailing "/", sorted, deduped. One implementation, all four adapters.
export function safeRelPath(p: string): string | null
   // null for: empty, absolute ("/x", "C:\x"), backslash, "..", ".", leading/trailing "/",
   // control chars, and anything that normalises outside the root. Unicode names are legal.
```
`safeRelPath` is called **after** any prefix stripping, on the final path (see `writeFilesToDirectory`) —
the first version stripped, then validated, which let `canvases/x/../evil.md` escape the folder.

## 3.2 `src/state.ts` (474 lines) — constants, factories, seed

Pure data + construction; no behaviour, no async, no I/O (one exception: `defaultSettings()` reads
`localStorage["lc-settings"]`, see debt §9.5).

| export | what it is |
|---|---|
| `APP_VERSION="0.1.0"`, `CANVAS_ID="nexus-edu-001"`, `ROOT="canvases/nexus-edu-001"` | the single-canvas build: everything hangs off `ROOT` |
| `interface AppState` | the store shape: `booted, bootLines, canvasId, canvas, nodes, edges, memory, outputs, chats, logs, snapshots, templates, strokes, execution, events, toasts, settings, saveState, typing, ui` |
| `memory` shape | `{ global, decisions, progress, user, agents: Record<nodeId, MemDoc> }` — the five documents of §6 legacy anchor |
| `ui` shape | `{ leftTab:"palette"|"files", fileViewer, historyOpen, settingsOpen, chatNodeId, consoleOpen, portOpen }` |
| `NODE_COLORS`, `NODE_TYPE_LABEL`, `PALETTE`, `MODELS` | presentation constants (palette cards: node/note/agent/output-box/pipeline-step/folder/shape) |
| `ROLES: RoleDef[]`, `roleById(id)` | the 4 built-in roles: understander, risk-analyst, solution-designer, decision-maker — each with `default_output_contract` (format/required_fields/validator/save_to) and `default_context_contract`. `risk-analyst` requires a numeric `risk_score` field, which is what the seed's conditional edge reads — not a value the engine hardcodes |
| `makeNodeData(type, title, owner, partial?)` | the single place a node's defaults are decided (also stamps `updated_at: nowIso()` — this is why tests project instead of deep-comparing) |
| `makeEdgeData(partial?)`, `makeMemDoc(path,title,body,confidence,source)` | same, for edges/memories |
| `makeAgentConfig(nodeId, roleId, opts?)` + `AgentConfigOverrides` | role defaults → a node's `AgentConfig`. `opts.context_contract` is merged **list by list**, because a caller that narrows `allowed_read_paths` must not silently drop `allowed_write_paths` or the output contract |
| `emptyExecution()`, `defaultSettings()`, `builtinTemplateInfo()` | initial slices |
| `BUILTIN_TEMPLATE: TemplateSpec` | the 5-node/4-edge "Fast pipeline" shipped in code and mirrored to `library/templates/quick-pipeline/` on first boot |
| `seedNodes/seedEdges/seedMemories` (internal) | the demo workspace: 1 note + 4 agents + 1 output box + 5 edges |

## 3.3 `src/store.ts` (381 lines) — zustand store and the `actions` façade

```ts
export const useStore = create<AppState & { actions: Actions }>()((set, get) => ({ ...initialState, actions }))
```
Two halves, and the discipline is the point:

1. **The store slice** — React Flow writes go through `onNodesChange` / `onEdgesChange` (position,
   selection) and then call `touch(api)` so the debounced file save happens. No other component may mutate
   a node/edge array.
2. **The `actions` object** — the entire API the UI is allowed to call (58 members). Each is a two-line
   delegation: resolve `api = { get, set }`, forward to `engine`, done. Nothing in `actions` writes a file
   or builds a string itself.

Notable behaviour living here (small but load-bearing):
- `removeNode` / node drag: blocked while the node is locked by a run (Law 3), with a `warn` toast.
- `updateSettings` vs `saveSettingsLocal`: only the latter persists to `localStorage`.
- `updateCanvas` rewrites `canvas-overview.md` (agents read that file first) — a 3-line convenience that
  exists so the overview never drifts from the canvas metadata.
- Storage/port actions (added with the portability work): `storageMode, flushSave, reloadFromDisk,
  attachFolder, detachFolder, exportJson, exportFolder, importFolder, importJsonFile, previewImport,
  commitImport, setPortOpen, openStorageFile`.
- `openStorageFile(path)` reads the file **through the adapter**, not from state, in folder mode — so the
  File Tree shows bytes on disk, including files the app did not write.

## 3.4 `src/lib/engine.ts` (2032 lines) — every behaviour

`export interface EngineApi { get(): AppState; set(partial | (s)=>partial) }` — the shape `store` hands to
engine functions so engine never imports zustand. Sections, in file order:

| section | exports (with line anchors) | contract |
|---|---|---|
| **events** | `emit(api,type,msg)` 32, `toast(api,kind,text)` 37 | `emit` builds a `BusEvent` through `bus` and prepends it to `state.events` (cap 250). `bus.on` currently has **zero subscribers** — it is the seam for SSE/plugins later (§10 ideas) |
| **patching** | `getNode` 48, `patchNode(api,id,data,internal=false)` 55 | user edits are refused when `lock.status==="locked"` (§12.5); `internal=true` is how the executor itself writes |
| **artifacts** | `writeNodeArtifact(api,id,quiet)` 75, `writeEdgeArtifact` 82, `appendLog` 91, `writeCanvasOverview` → `overviewMd` (private) 103 | one node = one file; `quiet` suppresses the event (used in bulk loops). `nodePath`/`edgePath` are the only path builders |
| **saving** | `touch(api)` 181 (debounced 700 ms, flips `saveState`), `flushPending()` 187, `saveNow` (private) | every write sits on one promise chain so `flushPending` can await them all. **Export, reload and shutdown call it first** |
| **memory** | `MemoryManager.read/write/list` 231 | conflict rule: incoming `confidence` must strictly exceed the stored one, else the old entry is kept and a `memory.updated` event explains it; equal weight → replaced + "ask the user later". A write into a locked node is refused. Writes are checked against `allowed_write_paths`; reads resolve **any** allowed path against the real tree |
| **self-checks** | `testFallback` 314, `contractSelfTest` 336 | `contractSelfTest` = one allowed write + two attempted intrusions (global memory, another agent's memory) and reports in the console. This is the executable form of the context contract |
| **outputs** | `FIELD_DESC` 368, `writeOutputs(api,nodeId,entries,shared)` 385 | writes `outputs/<node>/index.yaml` + one file per entry; `shared=true` puts it under `outputs/shared/<node>/` (used by the collection box) |
| **LLM** | `askModel` (private) 397, `simFields` (private) 412, `buildEntries`/`validateOutput` 380 | provider `sim` returns templated, plausible phase-1 answers; `deepseek` POSTs to the configured endpoint and falls back to `sim` on any error (§12.6). `throw` on an empty response |
| **tools** | `TOOL_NAMES` 477, `hasTool` 481, `unknownTools` 488 | the vocabulary an agent may act through. `get_canvas_overview`/`get_agent_brief` are the harness (always on); every other name must be in `agent.tools`, or the step is skipped (`read_memory`, `write_memory`), the node fails (`write_output`), or the chat is refused (`chat_with_user`). `unknownTools` names what this app cannot run, so the log says so instead of pretending |
| **run ledger** | `startLedger` 504, `ledgerRow` 519, `endLedger` 540 | `runs/<run-id>.md`, one row per step: read-modify-write so a reload extends the same file, capped at 300 rows, closed with `**run completed/stopped/rejected**`. Format: §4.13 |
| **execution** | `findStart` 662, `executeNode` 669, `runPipeline` 926, `runSingle` 952, `resumeRun` 968, `rejectRun` 977, `stopRun` 985, `resetExecution` 1001 | `computeOrder` is Kahn over every runnable node — diamond-safe, disconnected nodes still queued, flow cycles reported. a lightweight state machine: `queue` + `completed` in `execution`, per-node lock with `run_id` as owner, `guard()` aborts on stop/reject, `require_approval` pauses with `status:"waiting_approval"`. Edge `trigger.type==="condition"` can skip a node. `max_steps` is enforced (§12.3). A snapshot is taken after each node |
| **contract matching** | `isPathAllowed` 564, `numericScope` 575, `evalCondition` 593 | one matcher for `allowed_read_paths` and `allowed_write_paths`: a directory entry (trailing `/`), an exact path, or a glob over **one** segment (`outputs/*/summary.md`). `evalCondition` is fail-closed and returns `{ ok, reason }` — see §5.8. `numericScope` lifts a node's numeric output fields into `execution.context`, so a condition reads data, not prose |
| **chat** | `sendChat(api,nodeId,text)` 1045 | appends to `chats/chat-<id>.md`; the simulated replies are per-role. A node without `chat_with_user` in `tools` still gets the user's message recorded, followed by an explicit refusal line — the gate stops the *reply*, never the record |
| **snapshots** | `takeSnapshot(api,label,quiet)` 1106, `restoreSnapshot(api,id)` 1127 | full graph JSON in `history/snapshot-<stamp>.json` + a `history/index.json`; the *body* of snapshots lives in IndexedDB, and `history/index.json` carries a pointer note |
| **strokes** | `clusterStrokes(strokes,gap=80)` 1171, `addStroke` 1208, `removeStroke`, `undoStroke`, `clearStrokes`, `convertStrokesToGraph(api,{nodeType,connect})` 1240 | union-find over bounding boxes; each cluster → one node, optionally chained in drawing order. Strokes are stored as one file per stroke (`strokes/<id>.json`) so the drawing layer is a document, not a bitmap |
| **graph CRUD** | `createNode(api,nodeType,pos,opts)` 1267, `deleteNode` 1300, `createEdge` 1320, `deleteEdge` 1332 | creating an agent node also creates its private memory file; deleting a node deletes its files and connected edges |
| **loaders** | `loadStrokes` 1342, `loadTemplates` 1361, `pickMemory`/memory reads 1367, **`hydrate(api)`** 1137 | `hydrate` is the heart — see §5.2 |
| **workspace** | `seedWorkspace(api)` 1470, `initWorkspace(api)` 1540, `reloadFromStorage` 1556, `resetWorkspace` 1570 | `initWorkspace` order is fixed: switch adapter for `backendUrl` → `maybeResumeWorkspace` → `hydrate`; if hydrate says "nothing here", it seeds |
| **templates/roles** | `saveTemplate(api,name)` 1589, `loadTemplate(api,id)` 1645, `saveRoleFromNode(api,nodeId)` 1703 | the `save_pipeline_template` / `load_pipeline_template` / `save_role` tools of §8 legacy anchor; refused mid-run |
| **portability** | `applyRootHandle` 1788, `attachWorkspaceFolder` 1802, `detachWorkspaceFolder` 1819, `pickCanvasFolder` 1830, `exportBundleText` 1852, `exportToJsonFile` 1866, `exportToFolder` 1882, `ImportPreview` 1903, `previewImportText` 1936, `applyImport` 1943, `importFromText` 1967, `importFromFolder` 1976, `importFromFile` 2006, `maybeResumeWorkspace` 2017 | see §5.5-§5.8 |

## 3.5 `src/lib/portable.ts` (439 lines) — the bundle and the file-first rebuild

Imported by `engine` and `store`; imports only `core` and `state` (deliberate: `engine` must not be a
dependency of the thing that reads its files). Three responsibilities:

1. **Collect/build**: `collectCanvasFiles({ excludeRuntime?, adapter?, filter? })` → `{ <logical path>: text }`
   (the `filter` exists to keep boot cheap, §5.2); `buildBundle(files, canvasId)` → the versioned envelope
   (§4.10); `bundleBytes(files)`.
2. **Parse/validate**: `parseBundleText(text)` → `ParseResult { ok, error?, files, skipped:[{path,reason?}], canvasId?, title?, nodes, edges, warnings }`.
   Accepts either the envelope or a raw path→content map; rejects `..`/absolute/foreign-`canvases/`
   paths (with a reason per file), rejects a newer `version`, rejects >32 MB, treats a missing
   `manifest.json` as a **warning**, not an error (hand-made vaults must still import).
3. **Rebuild**: `deriveCanvasFromFiles(files)` → `{ canvasTitle, nodes, edges, memory, unreadable[] }`
   from `nodes/*.md` + `edges/*.yaml` + `memory/**.md`, via `parseNodeDoc` / `parseEdgeDoc` /
   `parseMemoryDoc` — **this is what makes an Obsidian folder a canvas**, and the same code serves
   `hydrate` and Import. Rules: empty file ⇒ not a node (null ⇒ reported); invalid colour ⇒ default;
   unknown edge type ⇒ `flow`; edge to a missing node ⇒ dropped (React Flow would crash); `confidence`
   clipped to 0..1; locks never restored; `status:"running"` ⇒ `idle`.
   Helpers for the UI: `suggestFileName(canvasId, ext, taken)`, `downloadJson(name, text)`,
   `readFileAsText(file)`, `installFiles(files, {replace})`.

## 3.6 `src/lib/fs-access.ts` (343 lines) — the folder seam

```ts
export function isFsAccessSupported(): boolean            // "showDirectoryPicker" in window
export async function pickCanvasDirectory(): Promise<FsDirHandle>   // readwrite; AbortError on cancel
export async function ensurePermission(h, mode): Promise<boolean>   // query → prompt → grant
export function toRelativePath(logical, rootPrefix): string|null     // the map/reverse-map of Law 4
export const CANVAS_SUBDIRS: readonly string[]            // nodes, edges, memory/agents, outputs, logs, chats,
                                                           //   strokes, library/{templates,roles,shapes}, history,
                                                           //   assets, runs — the tree ensureStructure creates
export async function ensureStructure(dir): Promise<void> // creates the §2 skeleton; idempotent
export class FsAccessStorageAdapter implements StorageAdapter  // adapterKind = "fs"
export async function readCanvasFromDirectory(dir, opts?): Promise<CanvasFiles>   // read-only walk, skips >2MB files
export async function writeFilesToDirectory(dir, files, opts?): Promise<{written:number, failed:{path,reason}[]}>
export async function walkDir(dir, opts?): Promise<string[]>     // files only, never dirs
```
Two hard rules in here, both learned the expensive way:
- **validate after stripping the prefix.** `writeFilesToDirectory` strips `canvases/<id>/`, *then* runs
  `safeRelPath` on the remainder, so `canvases/x/../evil.md` cannot escape the picked folder.
- **no silent `catch` around handle calls.** An earlier revision called a method that did not exist
  (`getFsFileHandle`, a rename leftover); the `try/catch` swallowed it into "write failed". The mock FS in
  the tests is what caught it, not `tsc`.

## 3.7 `src/components/` — the view

Four files, 2 442 lines. They hold **no business logic**: they read slices with `useStore` selectors and
call `actions.*`.

| file | components | responsibilities |
|---|---|---|
| `CanvasArea.tsx` 729 | `Md`, `LcNode`, `AgentNodeCard`, `NoteNode`, `ShapeNode`, `LcEdge`, `DrawLayer`, `ConvertDialog`, `CanvasArea` (default) | registers React Flow `nodeTypes`/`edgeTypes`; renders node Markdown **only** through `mdInline`; the freehand layer (pointer capture → stroke → `actions.addStroke`); cluster→node conversion dialog; the human-approval banner; status/legend chips |
| `SidePanels.tsx` 839 | `Palette`, `Folder`, `FileRow`, `RealFileRow`, `LiveFolderTree`, `FileTree`, `TemplatesSection`, `LeftPanel`, `Section`, `Field`, `NodeInspector`, `EdgeInspector`, `CanvasInspector`, `RightPanel`, `FileViewer` | left panel = library (`palette`) or files; in folder mode the file tree is read from disk (`storage.listDirectory`), not from state; the inspector edits display/content/agent config/context contract, and runs the contract self-test |
| `Overlays.tsx` 753 | `TopBar`, `ActivityConsole`, `ChatPanel`, `HistoryModal`, `SettingsModal`, `PortModal`, `Toasts`, `BootOverlay`, `ModeRow`, `ActBtn` | `PortModal` is the Export/Import + folder-attach surface (preview → confirm). The save chip shows `idb / fs / http / memory` |
| `icons.tsx` 121 | 30+ inline SVGs | no icon library |

---

# 4. Twigs — the file formats, byte for byte

These samples were produced by the real serialisers (`nodeToMarkdown`, `edgeToYaml`, `memoryToMd`, `toYaml`),
not written by hand. Copy them: if you change a writer, these change, and the tests that compare
export→import byte-for-byte will tell you.

## 4.1 The tree (structure version `1.3`, everything below `canvases/<canvas-id>/`)

```
canvases/nexus-edu-001/
├── manifest.json            identity + versions; hydrate refuses a canvas without it
├── canvas.yaml              canvas metadata (title/owner/type/tags)
├── canvas-overview.md       the summary agents read first (frontmatter + prose)
├── nodes/<node-id>.md       one file per node            §4.2
├── edges/<edge-id>.yaml     one file per edge            §4.3
├── memory/
│   ├── global.md  decisions.md  progress.md  user.md      the four shared docs
│   └── agents/<node-id>.md  private memory per agent      §4.4
├── outputs/<node-id>/index.yaml + <file>                   §4.5
├── logs/<node-id>/<date>.log                               §4.7
├── runs/<run-id>.md             one append-only ledger per run  §4.13
├── chats/chat-<node-id>.md                                 §4.6
├── strokes/<stroke-id>.json                                §4.8
├── library/
│   ├── templates/<template-id>/template.json|yaml + nodes/…  §4.9
│   ├── roles/<role-id>.json
│   └── shapes/<shape-id>.json
├── history/index.json + snapshot-<stamp>.json              §4.11
├── graph.json               machine cache (React Flow nodes+edges)
└── state.json               machine cache (everything else in AppState)
```

`library/` and `history/` and `graph.json`/`state.json` are **not** required: a folder containing only
`manifest.json`, `canvas.yaml`, `nodes/`, `edges/`, `memory/` is a valid canvas and hydrates fully (§5.2,
tested). That is the whole point of the file-first design.

## 4.2 `nodes/<id>.md` — one node

```yaml
---
id: node-001
type: agent
title: Understand the problem
position:
  x: 340
  y: 250
  z: 0
shape: card
color: "#e8b04b"
animation:
  type: breathe
  speed: 1
viewMode: card
style:
  strokeColor: "#0b1312"
  strokeWidth: 2
  fillStyle: solid
  opacity: 100
metadata:
  created_by: mahla
  created_at: "2026-09-01T16:34:09.947Z"
  updated_at: "2026-09-01T16:34:09.947Z"
lock:
  status: free
  locked_by: null
  locked_at: null
agent:
  role_id: understander
  system_prompt: "You are the \"Understand the problem\" agent. Read the canvas summary and your own memory, then make the core problem explicit. …"
  model: deepseek-chat
  tools:
    - read_memory
    - write_memory
    - chat_with_user
    - write_output
  status: idle
  max_steps: 6
  max_tokens: 4000
  require_approval: false
  context_contract:
    allowed_read_paths:
      - canvas-overview.md
      - nodes/node-001.md
      - memory/agents/node-001.md
      - "outputs/*/summary.md"
    allowed_write_paths:
      - outputs/node-001/
      - memory/agents/node-001.md
      - logs/node-001/
    output_contract:
      format: markdown
      required_fields:
        - summary
        - problem_statement
        - questions_asked
      save_to: outputs/node-001/
---

## Role

Pull the problem out of ambiguity.
```

Reader: `parseNodeDoc(path, md)` in `portable.ts`. Rules the reader applies (and that a hand-written file
must respect):
- No frontmatter fence ⇒ `null` ⇒ reported as unreadable (never a silently empty node). An **empty file**
  is unreadable too — it does not create an empty node.
- `type` not in `NodeType` ⇒ `note`. `color` not matching `^#[0-9a-f]{3,8}$` ⇒ the per-type default.
  `shape`/`viewMode` invalid ⇒ defaults (`card`/`markdown` by type).
- `position` absent ⇒ `{x:0,y:0}` — the value from `graph.json` wins when that cache exists (§5.2).
- `lock` is read and **discarded** (Law 3). `agent.status === "running"` ⇒ `idle`; `done` is kept.
- `agent` present without `system_prompt` ⇒ the role's prompt is substituted, so a partial hand edit
  cannot produce a contentless agent.
- Body (everything after the fence) ⇒ `data.content`.
- `context_contract.allowed_*_paths` entries are matched by `isPathAllowed` (§3.4): a trailing `/` grants a whole
  directory, an exact path grants that file, and `*` grants exactly one path segment. A hand-written file may use
  any of the three; anything else is read literally, which is the same as granting nothing.

## 4.3 `edges/<id>.yaml` — one edge (the whole file is YAML; no frontmatter)

```yaml
id: edge-001
source: node-001
target: node-002
type: flow
label: problem statement
line_style: solid
animation: flow
trigger:
  type: condition
  condition: "{{ risk_score < 7 }}"
config:
  communication: blackboard
```
Unknown `type` ⇒ `flow`. An edge whose `source`/`target` is not in the same file set is **dropped** at
derive time — React Flow crashes on dangling edges, and a canvas that crashes on load is worse than a
canvas that loses one edge.

## 4.4 `memory/**.md`

```yaml
---
path: memory/agents/node-001.md
updated_at: "2026-09-01T16:34:09.948Z"
last_accessed: "2026-09-01T16:34:09.948Z"
confidence: 0.66
source: agent
---

# Memory of Understand the problem

- latest inputs: —
- decisions taken: continue
```
`confidence` is clipped to `0..1`; `source` not in `system|agent|user` ⇒ `system`; the H1 (if `title` is
missing) becomes the title. Conflict resolution is in `MemoryManager.write` (§3.4).

## 4.5 `outputs/<node>/index.yaml`

```yaml
node_id: node-001
outputs:
  - file: problem.md
    type: doc
    description: problem statement
```
Each entry also exists as a real file next to the index (`.md`/`.json`, content verbatim from the model or
the simulator). The index deliberately omits content: the index is the manifest an agent lists, the file
is what it reads.

## 4.6 `chats/chat-<node>.md`

```
---
node_id: node-001
message_count: 2
updated_at: "2026-09-01T16:31:42.627Z"
---

## User — 10:00:00

What is the metric?

---

## Agent (Understand the problem) — 10:00:05

Engagement in week three.
```
Append-only from the app's side. It is a document first, a transcript second — that is why it is Markdown
and not JSON.

## 4.7 `logs/<node>/<date>.log` — plain lines, newest last, capped at 120 entries in state

The file is date-sharded (`logs/node-001/2026-09-01.log`) so a run across midnight does not rewrite yesterday's log.
`logs/<node-id>/` is inside every agent's `allowed_write_paths`, and it is what the console's log tab shows. Example line:
`[16:34:09] tool write_output → validation passed (3/3 fields)`. Per-step *cross-node* history is not here — that is the
run ledger, §4.13.

## 4.8 `strokes/<id>.json` — one file per freehand stroke

```json
{ "id": "stroke-…", "canvas_id": "nexus-edu-001", "tool": "pen", "color": "#fff",
  "width": 3, "points": [{ "x": 1, "y": 2 }], "author": "mahla", "created_at": "…" }
```
Coordinates are in **canvas space**, not screen space, so a stroke stays where the user put it after a
zoom/pan. The drawing layer is a document, which is what makes "convert strokes to a graph" (§3.4 strokes)
a real operation rather than a demo.

## 4.9 `library/templates/<id>/template.json` (+ optional `nodes/` payload)

```json
{ "template_id": "my-flow", "name": "My flow", "description": "saved from the canvas …",
  "version": "1.0", "nodes": [ … ], "edges": [ … ] }
```
The built-in template is mirrored as `library/templates/quick-pipeline/template.yaml` on first boot.
Discovery path: `storage.listDirectory("canvases/<id>/library/templates")` → directory names with a
trailing `/` → stripped → `template.json`/`template.yaml` read from each. **This is the exact chain the
Law-4 bug broke.**

## 4.10 `manifest.json` and the export bundle

```json
{ "version": "1.0", "app_version": "0.1.0", "canvas_id": "nexus-edu-001", "structure_version": "1.3" }
```

```json
{ "kind": "living-canvas-export", "version": 1, "app_version": "0.1.0", "structure_version": "1.3",
  "canvas_id": "nexus-edu-001", "exported_at": "2026-09-01T16:34:09.949Z",
  "files": { "canvases/nexus-edu-001/nodes/node-001.md": "<full file text>", "…": "…" },
  "stats": { "files": 4, "bytes": 1782 } }
```
`files` is a map of **logical path → exact file text** — no re-encoding, no sidecars, no excluded runtime
data. `graph.json` and `state.json` travel inside it as ordinary files, which is why an import restores the
canvas byte-for-byte (asserted in `roundtrip.test.ts`). Import also accepts a bare path→content map (a
folder zipped by hand, someone's `cat *.json`), reported as `source: "raw-files"`.
Guards, each with a user-visible reason in `skipped[]`: `..`/absolute/backslash paths; a path under
`canvases/` that is not *this* canvas; non-string content; `kind` mismatch; `version > BUNDLE_VERSION`;
total size > 32 MB. A missing `manifest.json` ⇒ a `warning`, not an error.

## 4.11 The two caches, and history

- `graph.json` — `{ nodes: RFNode[], edges: RFEdge[] }`. **Fast path only.** Node Markdown overrides
  `title`, `content`, `agent.system_prompt` on top of it (§5.2).
- `state.json` — the rest of `AppState` (`canvas`, `memory`, `settings`, `execution`, `templates`,
  `snapshots` metadata). Restoring it never restores locks; `execution.status` mid-run becomes `idle`.
- `history/index.json` + `history/snapshot-<nowStamp()>.json` — snapshot metadata lives in the index, the
  full graph in the snapshot file. Restore replaces the graph only (artifacts are not deleted — a
  checkpoint is a view of the canvas, not a backup of the folder).

## 4.13 `runs/<run-id>.md` — the run ledger (one file per run)

A run is a moment of execution (Law 3), but **what it did** is data. The executor writes `runs/<run-id>.md`
through the adapter (`startLedger` → `ledgerRow` → `endLedger`): one row per tool call, so a reload, a crash, or
an outside `git diff` answers "who ran what, in which order, and what refused it". Verbatim output of a real
two-node run (the same `MemoryStorageAdapter` the tests use):

```markdown
---
run_id: run-mtixxmkn-0lbyv
canvas_id: nexus-edu-001
started_at: "2026-09-01T17:28:05.255Z"
queued: 2
app: 0.1.0
---

# Run run-mtixxmkn-0lbyv

Full pipeline run from “a”.

| # | node | tool / step | status | detail |
| --- | --- | --- | --- | --- |
| 1 | a | get_canvas_overview | ok | canvas-overview.md |
| 2 | a | get_agent_brief | ok | role risk-analyst |
| 3 | a | read_memory | ok | 2 documents |
| 4 | a | write_output | ok | 4/4 fields → outputs/a/ |
| 5 | a | write_memory | ok | memory/agents/a.md at confidence 0.8 |
| 6 | b | edge_condition | ok | {{ risk_score < 7 }} |
| 7 | b | get_canvas_overview | ok | canvas-overview.md |
| 8 | b | get_agent_brief | ok | role solution-designer |
| 9 | b | read_memory | ok | 3 documents |
| 10 | b | write_output | ok | 3/3 fields → outputs/b/ |
| 11 | b | write_memory | ok | memory/agents/b.md at confidence 0.8 |

**run completed** — 2 of 2 queued nodes done, 2026-09-01T17-28-05
```

Rules a reader needs:
- `status` is `ok`, `denied` (the contract or `tools` refused it), `blocked` (a conditional edge stopped the
  hop), `rejected` (validation refused the output) or `failed`. A refusal *must* appear as a row: nothing is
  quietly skipped.
- rows are appended by read-modify-write, capped at 300 rows: a writer after a reload extends the file instead
  of overwriting it.
- `runs/` is part of the tree (exported, cloned, shown in the file tree) but `hydrate()` ignores it — a canvas
  rebuilds with `runs/` deleted. It is an append-only audit, never an input.

## 4.12 What is *not* in a file (and why that is fine)

`events` (250 last lines of the console), `toasts`, `ui.*`, `typing`, `bootLines`, the `saveState` chip.
They are session-local by definition. If you ever need to persist one of them, it becomes a file and the
tests for `deriveCanvasFromFiles` must be updated — that is the intended friction.

---

# 5. Sap flow — control flows, step by step

## 5.1 Boot (`main.tsx` → `App` → `actions.init` → `engine.initWorkspace`)

1. `main.tsx` renders inside an error boundary and installs `window.error` / `unhandledrejection`
   handlers that print a recovery panel (with a "clear IndexedDB and rebuild" button) — but only if
   nothing rendered yet (`[data-lc-mounted]` absent). A blank screen is treated as a bug in the app, never
   as the user's problem.
2. `App` mounts → `actions.init()` → `initWorkspace(api)`:
   1. `maybeSwitchStorage()` — if `settings.backendUrl` is set, probe `GET {base}/api/canvases/{id}` and
      swap in `HttpStorageAdapter`; on failure stay on IndexedDB with a `validation.failed` event.
   2. `maybeResumeWorkspace(api)` — read the persisted folder handle (IDB db `living-canvas-root`),
      re-request permission; if granted, `setStorage(new FsAccessStorageAdapter(handle, ROOT))`.
      **This runs before hydrate**, so boot reads the disk, not the browser cache.
   3. `hydrate(api)` (§5.2). `false` ⇒ `seedWorkspace(api)` (§5.3).
3. `booted: true` flips the boot overlay off; the TopBar chip shows `storageMode()`.

## 5.2 `hydrate(api)` — the load path, both branches

```
exists(`${ROOT}/manifest.json`)?  no  → return false (nothing was ever seeded here; do not wipe anything)
                                    yes ↓
graph = readJson(`${ROOT}/graph.json`) (catch → null)
files = graph?.nodes?.length
        ? collectCanvasFiles({ filter: p => ^canvases/<id>/nodes/[^/]+\.md$  or  canvas.yaml })   // cheap overlay
        : collectCanvasFiles()                                                                     // full §2 tree
derived = deriveCanvasFromFiles(files)      // nodes, edges, memory, canvasTitle, unreadable[]
state   = readJson(`${ROOT}/state.json`)    (optional)

if graph exists:
    nodes/edges = graph   // positions, ids, style from the cache
    for each node: title, content, agent.system_prompt ← derived (the FILE wins)
else:
    nodes/edges = derived // files are the only truth
execution = state?.execution with status normalised (running/paused → idle, locks dropped)
memory    = derived.memory ∪ state?.memory
templates = loadTemplates()   // listDirectory → per-folder spec (needs Law 4)
strokes   = loadStrokes()     // strokes/*.json
unreadable.length → emit validation.failed with the first four names
return true
```
The override direction is deliberate and is the answer to "why did my Obsidian edit disappear": the file
always wins for the three fields an editor touches (`title`, body/`content`, `system_prompt`); the cache
wins for geometry and ids, because a hand-edited `position` is rarer than a hand-edited title, and a
misplaced node is recoverable while a lost prompt is not.

## 5.3 `seedWorkspace(api)` — first boot / empty folder

`boot(path, text)` writes each file and appends a `bootLines` entry (the boot overlay is a real log).
Order: `manifest.json` → `canvas.yaml` → `canvas-overview.md` → nodes → edges → memory (4 shared + one per
agent) → `library/shapes/*.json` → `library/templates/quick-pipeline/template.yaml` → `graph.json` +
`state.json`. Then a toast: `A new canvas is ready with the file-first layout.`

## 5.4 Editing a node

```
textarea in the inspector → actions.updateNodeData(id, patch)
  → engine.patchNode(api, id, data)         // refused with a warn toast if locked (Law 3)
  → api.set(nodes: map over nodes)          // React Flow re-renders
  → touch(api)                              // debounced 700 ms:
      saveNow → writeNodeArtifact(id)       // nodes/<id>.md via nodeToMarkdown
              → writeCanvasOverview()       // counts + current step
              → saveNow(graph.json, state.json)
      saveState: "saving" → "saved"         // the TopBar chip, and the trigger for the live tree refresh
```
Every keystroke costs one IndexedDB write 700 ms later — no batching layer, no queue to reason about. In
folder mode writes are **synchronous and un-debounced** (a user watching `git status` expects the file to
change now).

## 5.5 Export

```
actions.exportJson → engine.exportBundleText(api)
  1. await flushPending()            // the debounce window would drop the last edit
  2. files = collectCanvasFiles()    // the whole §2 tree, both caches included
  3. bundle = buildBundle(files)     // envelope of §4.10
  4. bytes > 32MB ? → error toast "use folder mode"
  5. downloadJson(suggestFileName(canvasId, ".livingcanvas.json"), JSON.stringify(bundle, null, 2))
```
`actions.exportFolder` does steps 1-2 and then `writeFilesToDirectory(dir, files)` — the §2 tree written
verbatim, with a per-file failure list instead of an all-or-nothing exception.

## 5.6 Folder attach (live folder mode)

```
actions.attachFolder → pickCanvasFolder → pickCanvasDirectory()   // readwrite permission
  → engine.attachWorkspaceFolder(api, handle)
      ensurePermission(handle,"readwrite")            // refused ⇒ error, no state change
      ensureStructure(handle)                          // write probe + creates §2 skeleton if missing
      setStorage(new FsAccessStorageAdapter(handle, ROOT))
      settings.workspaceRoot = handle.name
      persistRootHandle(handle)                        // IDB db "living-canvas-root"
      hydrate(api) ? … : seedWorkspace(api)             // folder with a canvas → load it; empty → build it
```
From then on **every existing writer writes to disk**, because they all go through `storage`
(Law 4 + ESM live bindings). `detachWorkspaceFolder` restores `createDefaultStorage()` and forgets the
handle; the files on disk are left exactly as they are. `actions.reloadFromDisk` is the "pull external
edits" button and refuses to run while a save is in flight (so a half-written edit is never clobbered).

## 5.7 Import (preview → confirm, never a blind overwrite)

```
<input type=file> → readFileAsText → previewImportText(api, text)
   parseBundleText → { ok, files, canvasId, title, skipped[] } → deriveCanvasFromFiles(files)
   ImportPreview { name, canvasId, title, bytes, fileCount, nodes, edges, skipped[], warning? }
   UI shows: file, canvas id (amber if it differs from the current one), node/edge counts,
             skipped list with reasons, "Replace the whole current canvas" checkbox
user confirms → commitImport → engine.applyImport(api, files, { replace })
   replace ? storage.clear() (canvas-scoped) : merge
   ensure manifest.json exists (create it if the folder did not have one)
   installFiles(files) → hydrate(api)
```
Note the last two lines: **import is "write the files, then run the normal load path"**, not "assign the
state object". That is what makes importing a hand-made Obsidian folder and importing our own bundle the
same code path.

## 5.8 Running the pipeline

```
actions.runAll → runPipeline(api)
  findStart(graph) → computeOrder = Kahn over every runnable node (§3.4 execution)
      · diamond joins run after both inputs · a node the start cannot reach is still queued
      · flow cycles: queued last + a validation.failed event naming them        // nothing is dropped silently
  execution.run_id = uid("run"); status = "running"; queue = order
  startLedger → runs/<run-id>.md with frontmatter + the table header (§4.13)
  for each node in queue:
     if run_id changed → stop (someone pressed Stop/Reject)         // guard()
     edge into this node has trigger.type=="condition"?
        evalCondition(cond, execution.context) → {ok,reason}
        not ok → node marked completed-without-running, reason in the log + ledger row `blocked`
                 (fail-closed: an unparsable condition or an unknown variable blocks the edge, §3.4)
     lock the node (locked_by = run_id); emit lock.acquired
     tools (each step checks hasTool first; a refusal is a `denied` ledger row, never silence):
        get_canvas_overview → read canvas-overview.md          // harness, always on
        get_agent_brief     → role + max_steps                 // harness, always on
        read_memory         → allowed_read_paths, resolved against the real files (§4.4/§4.5)
        (no read_memory in tools → skipped with a log line; no write_memory → memory untouched)
     upstream: predecessor outputs/**filtered by THIS node's allowed_read_paths** — an ungranted path is
               not read at all and emits validation.failed
     askModel (or sim) → required_fields → validateOutput (missing *or* empty field ⇒ rejected)
     write_output not in tools → the node fails here, because an agent that cannot write cannot deliver
     writeOutputs → outputs/<id>/index.yaml + files ; appendLog + ledger row per step
     memory write (own agent doc, confidence 0.8) → MemoryManager.write
     execution.context gains: nodeId → summary, plus every *numeric* output field (numericScope)
     require_approval? → status "waiting_approval", pause, return
     snapshot("end of …") ; unlock ; emit node.completed
  endLedger("completed") ; collect output-boxes (shared outputs) → run.completed
```
`steps > max_steps` throws (§12.3). Any error marks the node `failed`, emits `node.failed`, appends the
error to the log **and to the ledger**, stops the run and toasts — **it never auto-retries**, so a run's history
stays readable. `stopRun`/`rejectRun` close the ledger with `**run stopped/rejected**` before they clear
`run_id`, so an interrupted run leaves a file that says it was interrupted.

## 5.9 Undo-ish: snapshots

`takeSnapshot(label)` writes `history/snapshot-<stamp>.json` (graph) + an entry in `history/index.json`
and pushes `SnapshotMeta` into state. `restoreSnapshot(id)` replaces the graph (and emits
`snapshot.restored`). Manual checkpoints come from the TopBar camera button; automatic ones after each
executed node (`quiet=true`, no toast).

---

# 6. Skin — UI anatomy (what is on screen, and where the data comes from)

Direction: **LTR**, English only. Fonts: Inter (body), Space Grotesk (display), IBM Plex Mono (paths, ids,
numbers). Palette is defined once as Tailwind v4 `@theme` tokens in `src/index.css` — 12 ink shades
(`ink-50` lightest → `ink-950` background) plus 7 accents:

| token | hex | used for |
|---|---|---|
| `amber-lc` / `amber-deep` | `#e8b04b` / `#c98f2b` | primary action, agent nodes, the living-canvas dot |
| `ember` | `#e06a4e` | danger, errors, delete affordances |
| `sage` | `#8fbf7f` | success, output boxes, live-folder chip |
| `sky-lc` | `#6fb3c7` | info, notes, backend/http mode |
| `plum` | `#b98bc2` | built-in badges, pipeline steps, "convert" |
| `sand` | `#d9c9a3` | folders |

Layout (`App.tsx`, LTR order):

```
┌──────────────────────────────────────────────────────────────┐
│ TopBar: brand+doc chip · save chip · storage chip            │
│         Files · camera · history · settings │ Stop/Approve/Run│
├──────────┬──────────────────────────────────────┬────────────┤
│ LeftPanel│  CanvasArea (React Flow)             │ RightPanel │
│ 268px    │   · node cards / shapes / edges      │ 292px      │
│ tabs:    │   · minimap, controls, dotted grid    │ inspector: │
│ Library  │   · status chips (agents·nodes·edges) │  node      │
│ Files    │   · approval banner (top centre)      │  edge      │
│          │   · draw toolbar (bottom centre)      │  canvas    │
│          │   · ActivityConsole (collapsible)      │            │
└──────────┴──────────────────────────────────────┴────────────┘
 floating: ChatPanel (right, above the inspector) · FileViewer · HistoryModal
           SettingsModal · PortModal · Toasts (bottom centre) · BootOverlay
```

Selector discipline (this is a real constraint, not style): zustand + `useSyncExternalStore` means a
selector returning a fresh array/object re-renders forever. Every empty fallback uses `EMPTY_ARR`
(`useStore((s) => s.outputs[id] ?? EMPTY_ARR)`), never `?? []`.

| region | reads | writes via |
|---|---|---|
| `TopBar` | `saveState`, `canvas.title`, `storageMode()`, `execution.status`, lock of the selected node | `runAll` / `stop` / `resume` / `snapshot` / `setHistoryOpen` / `setSettingsOpen` / `setPortOpen` |
| `Palette` (Library tab) | `PALETTE`, `templates`, `BUILTIN_TEMPLATE` | `addNode(type,pos)` (drag or click), `loadTemplate(id)` |
| `FileTree` | state-derived file list (idb) **or** `storage.listDirectory` (fs mode, refreshed whenever `saveState` returns to `saved`) | `openFile(path)` → FileViewer shows the real text; copy button |
| `NodeInspector` | the selected `RFNode.data` | `updateNodeData`, `updateAgentField`, `saveRole`, `selfTest`, `runOne`, `removeNode`, `setChatNode` |
| `CanvasArea` | `nodes`, `edges`, `execution`, `strokes`, `drawMode` | `onNodesChange/onEdgesChange/onConnect`, `addStroke`, `convertStrokes`, `resume/reject` |
| `PortModal` | counts, `storageMode`, `settings.workspaceRoot`, `isFsAccessSupported()` | `exportJson`, `exportFolder`, `attachFolder`, `detachFolder`, `reloadFromDisk`, `previewImport` → `commitImport`, `importFolder`, `importJsonFile` |
| `ActivityConsole` | `events` (cap 250) | `toggleConsole` |

Accessibility/keyboard: only two handlers exist (Enter in the chat composer, Enter in "save template").
There are no canvas shortcuts, no focus rings on nodes, no `aria-live` on toasts — see §9.9.

---

# 7. Immune system — tests

`npx vitest run` → **6 files, 92 tests**, no jsdom, no config file (vitest reads `vite.config.js`).
Every test runs the **production** functions — no re-implementations. `src/lib/test-helpers.ts` exists so a
test cannot accidentally grow its own serialiser (that is how a fixture hides a bug).

| file | n | what it locks |
|---|---|---|
| `storage.test.ts` | 16 | `listChildren` contract (files bare, dirs with `/`, sorted, deduped, no leakage across prefixes); `safeRelPath` rejections; `readJson` rejecting a missing file (so hydrate cannot fall back to the seed); `escapeHtml`/`mdInline` (no tag survives, only `strong/em/code`, payloads inside `**bold**`) |
| `portable.test.ts` | 22 | bundle round-trip identity; escaping paths rejected; non-string content rejected; newer `version` rejected; foreign canvas skipped with a reason; missing manifest = warning; long/multiline `system_prompt` survives; files-only rebuild (nodes/edges/memory, canvas title, no truncation); a manual Obsidian edit wins; dangling edge dropped; locks not restored; `running→idle`, `done` kept; invalid colour/edge-type/clipped confidence; `parseYaml∘toYaml` identity; **YAML interop** (no bare flow mapping, no type drift for `"1.0"`) |
| `fs-access.test.ts` | 13 | a Map-backed fake of the File System Access API: `toRelativePath` mapping and rejection; adapter CRUD + `listDirectory` + `allPaths` (files only, no dotfiles) + `..` throws + `clear` scoped; `ensureStructure` creation & idempotence; `writeFilesToDirectory` (valid files land, invalid ones are reported, prefix-escape rejected); `readCanvasFromDirectory` |
| `roundtrip.test.ts` | 4 | seed → collect → bundle → parse → **compare file maps byte for byte**; hydration from real Markdown; the template-folder regression at workspace level; export *without* `graph.json`/`state.json` still rebuilds |
| `execution.test.ts` | 29 | the run rules: `evalCondition` fail-closed (unsatisfied / unknown variable / unparsable / non-numeric data / string compare), `numericScope`, `isPathAllowed` (dir, exact, one-segment glob, no neighbour leakage), `computeOrder` (diamond, disconnected, cycle, parallel edges, determinism, mid-graph start), `hasTool`/`unknownTools`; plus `runPipeline` end to end on a two-agent graph — an ungranted upstream path is not read, `write_output` missing makes the node fail with no output files, a conditional edge skips the node and logs the reason, the run ledger is written row by row and closed, and `MemoryManager.read` returns a granted `outputs/` file |
| `hydrate.test.ts` | 8 | the real `hydrate()` against `MemoryStorageAdapter`: no manifest → `false` and nothing deleted; custom template found after reload; several templates + neighbouring files; files-only mode builds the canvas; locked node not restored; `graph.json` supplies geometry while the file overrides title/content/prompt; broken `state.json` tolerated; the adapter in play is the adapter read (no stale cache between tests) |

Rules for adding a test:
1. Build fixtures with `nodeToMarkdown` / `edgeToYaml` / `memoryToMd` / `toYaml` from `test-helpers`, never by
   writing YAML text — unless the test is *about* malformed text.
2. Do not deep-compare two `deriveCanvasFromFiles` results: it stamps `updated_at: nowIso()`, so compare a
   projection (see `roundtrip.test.ts`) or differences of a millisecond will make it flaky.
3. A test that would also pass when the bug is reintroduced is worse than no test. Before finishing,
   **revert the fix locally and confirm the test fails** — that is exactly how the Law-4 guard was verified
   (7 tests fail on the old filter, 2 on the old `yv`).
4. `setStorage(new MemoryStorageAdapter())` in `beforeEach` + restore afterwards: the adapter is a module
   singleton and tests must not leak it into each other.

---

# 8. Pruning — deliberate non-goals

Written down so nobody "helpfully" adds them back:

- **No zip/JSZip.** A `.livingcanvas.json` bundle is plain JSON of the tree; Git already compresses text,
  and a zip would break "open the folder and look".
- **No proprietary sidecar** (`.livingcanvas/`, `excludeRuntime`, per-file metadata dumps). `graph.json` and
  `state.json` are ordinary files inside the tree, and are treated as caches.
- **No server in phase 1.** `HttpStorageAdapter` exists, the backend does not. Do not "temporarily" add an
  Express server to make a test easier.
- **No second source of truth for node text.** If the inspector needs a field, the node file gains a field.
- **No auto-retry in the executor**, no background queue, no optimistic LLM calls.
- **No CSS framework other than Tailwind v4 tokens**; no component kit (they bring their own opinions about
  direction, density and focus, and this UI is deliberately dense).
- **No i18n layer, and no RTL text anywhere in the repository.** English is the source language; there is no translation table and that is a decision,
  not an oversight. Adding one means deciding what gets localised (dates/numbers via `Intl` — the code
  currently avoids `Intl` for exactly that reason). `scripts/check-english.mjs` fails CI on any RTL-script or bidi-control
  character in a tracked file, so this stays a rule rather than a habit.
- **Not a multiplayer doc.** No CRDT, no awareness, no per-file locking. `lock` is an execution mutex, not a
  collaboration primitive. Do not let it grow into one.

---

# 9. Known wounds (debt, precise)

Ordered by how much they will cost to fix later. **Retired in the post-review pass** (each has a test in
`execution.test.ts`, so they stay retired): `executeNode` used to collect upstream output around the read contract;
`MemoryManager.read` resolved only the five memory documents; `agent.tools` was decorative; `evalCondition` failed
open; `risk_score` was hardcoded `5` for one role; `computeOrder` was a BFS that dropped disconnected nodes; the
contract of `makeAgentConfig(...)` was replaced instead of merged; `validateOutput` could not fail; eleven unused
npm dependencies and a 40 MB tracked snapshot; nothing that ran automatically (the CI definition now exists at
`ci/github-actions.yml` but is not wired up yet — §11.3).

1. **`askModel` still hardcodes the endpoint and the sampling budget** (`https://api.deepseek.com/chat/completions`,
   `max_tokens: 900` while `AgentConfig`/UI carry 4000). More structurally: the model does not *choose* tools — the
   executor walks the six steps and `agent.tools` only decides which of them are permitted. Function calling means
   handing `TOOL_NAMES` to the provider as JSON-schema tools and looping on the calls it returns; the gate it needs
   is already in place (`hasTool`), so this is now an additive change rather than a rewrite.
2. **The `validator` pointer still dangles.** Roles write `validator: "schemas/<role>.schema.json"`
   (`engine.ts:1486`, `:1707`) and nothing reads it; no `schemas/` directory exists. What changed: `validateOutput`
   can now fail — `buildEntries` no longer fabricates an empty file for a field the model did not return, so a
   missing **or blank** required field is rejected. What is missing: types, bounds, enum membership. That is Q1,
   and it also has to decide *where* the schemas live (`library/schemas/<role>.schema.json`, inside the canvas, or a
   repo-level `schemas/` shared by canvases — today the string points outside `library/`, which no folder-mode tree
   contains).
3. **Snapshots store the full graph per step, unbounded**, and `restoreSnapshot` restores the graph only. A long run
   = many near-duplicate JSON files. Next: `{node_id: patch}` deltas + keep-last-N with pinned manual checkpoints.
   This pairs with Q3/Q6: if positions live only in node files, the graph delta gets small enough not to care.
4. **`apiKey` is in `localStorage` and the browser calls the provider directly** (the key leaks to anyone who gets
   script in — which is why Law 2 is not optional). The honest phase-2 shape is a thin proxy that holds the key.
   Do **not** reuse `HttpStorageAdapter` for it: that adapter is file I/O against a storage backend, not an LLM
   gateway — a proxy needs a new contract of its own (`POST /api/llm`, provider+key server-side, no canvas
   semantics). Until then the settings panel must keep naming where the key lives.
5. `defaultSettings()` in `state.ts` reads `localStorage["lc-settings"]` — the one place a data module does I/O
   (Law 5 breach, harmless today, ugly tomorrow). Move it to `store.ts` next to `saveSettingsLocal`.
6. `makeNodeData` stamps a placeholder id `"pending"` on its default agent, which callers must overwrite
   (`createNode` and `loadTemplate` do). Any new call site that forgets produces a node whose contract points at
   `nodes/pending.md`. Fix: pass the id in, no default agent at all.
7. **`logs/<node>/<date>.log` vs `run.log` in prose.** The code shards logs by date; some legacy wording (and older
   notes) still says `run.log`. Cosmetic today, a wrong filename in someone else's reader tomorrow — pick one.
8. **Two edges from the enforcement pass that need a decision, not a patch.** (a) Pre-existing node files were
   written before `makeAgentConfig` started granting `outputs/*/summary.md`, so an *older* agent node now reads no
   upstream input until its `allowed_read_paths` gains that line — the run logs it (`blocked read — not in
   allowed_read_paths`), which is honest, but it will look like a regression to anyone with a canvas from last week.
   Options: a one-time contract bump on hydrate (writes into user files: ugly), or a "grant predecessors' summaries"
   button in the inspector (explicit: it edits the file, which is the point). (b) `runs/` has no pruning policy —
   one small file per run, forever. Snapshots have the same problem (§9.3); solve them together, with keep-last-N.
9. no eslint/prettier config and no LICENSE file; a11y: no focus ring on canvas nodes, no keyboard traversal of the
   graph, toasts are not announced, draw mode has no escape-to-cancel (only the ✕ button), modals do not trap focus.

---

# 10. Next ring — open questions for the design partner

These are the decisions that change the shape of the thing, so they should be made out loud, in this
document, before the code moves. My recommendation is attached to each; the ones marked ⚑ are the ones I
would not start phase 2 without.

⚑ **Q1 — Where does the file contract become load-bearing?** `validateOutput` now rejects a missing or blank
required field, but the schema pointer in every role still points at a file that does not exist. Two coherent futures: (a) *canvas as editor* — keep
validation soft, delete the schema promise, ship phase 2 as "tools that propose diffs"; (b) *canvas as
orchestrator* — schemas become the contract between agents, validation is hard, and an output that fails
schema stops the run (and the node shows the error inline). (b) is what the docs imply and what the
folder-first design earns; it also forces Q2. Pick one — and with it, **where the schemas live**: roles currently
emit `schemas/<role>.schema.json`, a path *outside* `canvases/<id>/library/`, so in folder mode it points at nothing
that any adapter can read. Either `library/schemas/<role>.schema.json` (per canvas, travels with the export) or a
repo-level `schemas/` (shared, but then a hand-made vault cannot ship its own roles). My vote: `library/schemas/`,
because Law 1 says the canvas folder holds everything the canvas needs.

⚑ **Q2 — One canvas per folder, or many?** `FsAccessStorageAdapter` maps `canvases/<id>/` → the picked
folder root, i.e. the picked folder **is** one canvas. That is right for a Git repo per project, wrong for an
Obsidian vault. If vaults matter, the adapter should keep the `canvases/<id>/` prefix and the picker should
accept the *vault root* (a `pickMany` mode). This is a 30-line change now and a migration later — decide
before anyone has a vault with three canvases.

⚑ **Q3 — `graph.json`/`state.json`: cache or crutch?** They make boot fast and imports exact, and they are
the only way for the two readers to disagree. Proposal: keep `state.json`, **delete `graph.json`**, and let
positions live in the node files (they already do). One fewer cache to invalidate, and the files-only path
becomes the *only* path. Cost: a boot that lists `nodes/*.md` — fine up to a few hundred nodes; if it ever
isn't, the answer is a derived index, not a second truth.

**Q4 — How far should `core.ts` stay one file?** 851 lines holding types, YAML, HTML safety and four
adapters. It is honest today (one place where file shapes are decided) and it will hurt at ~1.5k. Natural
split when it does: `types.ts` (no imports), `yaml.ts`, `html.ts`, `storage/*.ts`. Law 5 keeps the edges
acyclic either way. Do it when adding the fifth adapter, not before.

**Q5 — Does the run need its own ledger file?** *Answered and built*: `runs/<run-id>.md`, one row per step
(§4.13), because `logs/<node>/<date>.log` is per-node and cannot answer "what did this run do, in order, and what
refused it". It is append-only text written through the adapter, so it survives a crash mid-run and shows up in
`git diff`. Not yet in it: model name, token counts, latency — the row schema has a `detail` column free for them
when function calling lands (§9.1). If you want a different table shape, change `LEDGER_HEADER`, nothing else.

**Q6 — Is `hydrate`'s "file overrides cache" rule right for geometry too?** Today: files win for
title/content/prompt, cache wins for position. If Q3 removes `graph.json`, positions come from files only,
and this question disappears — which is another argument for Q3.

Done since this document was written: ~~(1) gate every tool by the contract~~ and ~~(2) `runs/<run-id>.md`~~.
Still in order, once Q1-Q3 are answered: (a) function calling — the executor hands `TOOL_NAMES` to the provider and
loops on the model's tool calls, now that `hasTool` makes refusal cheap; (b) a "diff" view in FileViewer (what the
last run changed in this file), because a canvas whose files can be edited outside the app is a canvas that needs
`git diff` in the UI; (c) delta snapshots + keep-last-N (§9.3); (d) providers beyond DeepSeek, reusing
`settings.provider`/`MODELS` (`deepseek-chat`, `glm-4-flash`, `ollama:qwen2.5`) rather than inventing a second key
setting. A full `Tool` interface (`{name, description, execute}`) is deliberately *not* in yet: until the model
picks the tool, the only caller is the executor and a dispatch table would be decoration — it arrives with (a).

---

# 11. Legacy anchors and vocabulary

## 11.1 `§` references in code comments

`src/` carries `§` markers that point at the original Persian specification (doc v1.3, kept in the
`Living_Canvas-main/` snapshot — **local material only, no longer tracked in git**). They are kept because they are
already in the tests' names and in the section banners; this is the translation table into this document, and after
this pass it is the only complete one:

| anchor | meaning | here |
|---|---|---|
| §2 | the file tree | §4.1 |
| §3.1–§3.9 | file formats | §4.2–§4.11 |
| §4 | graph JSON schema | §4.11 |
| §5.1 / §5.2 | StorageAdapter / its four implementations | §3.1.4 |
| §6 | memory architecture (5 docs, conflicts) | §3.4 memory, §4.4 |
| §8 | the three agent tools | §3.4 execution, §10 ideas |
| §9 | context contract | §3.1.1, §3.4 self-checks + contract matching, §5.8 |
| §10 | snapshots | §5.9, §9.3 |
| §12.3 / §12.5 / §12.6 | max_steps / locks / LLM fallback | §3.4 execution, Law 3, §3.4 LLM |
| §13 | templates | §4.9 |
| §15 | provider settings | §3.1.1 Settings, §9.1 |

## 11.2 Vocabulary

| word | in this codebase it means |
|---|---|
| **canvas** | one folder `canvases/<id>/` + its graph. There is exactly one per tab in this build (`CANVAS_ID`). |
| **node / edge** | `RFNode<LCNodeData>` / `RFEdge<LCEdgeData>` — React Flow items whose *data* is also a file. |
| **artifact** | a file the app writes for a node: node md, edge yaml, memory md, output file, log, chat, stroke. |
| **machine cache** | `graph.json` + `state.json`. Never authoritative. |
| **contract** | `ContextContract` — the read/write path allow-list plus the output shape. Enforced on writes, self-testable. |
| **run** | one execution of the queue, identified by `run_id`; owners of node locks are `run_id`s. |
| **hydrate** | rebuild `AppState` from files (possibly only files). Idempotent; safe to call again. |
| **bundle** | the `.livingcanvas.json` export envelope (§4.10). |
| **live folder mode** | the storage adapter writes into a user-picked directory, and the File Tree shows that directory. |
| **overlay** (in hydrate) | the rule that file content wins over the cache for three fields. |

## 11.3 Commands

```
npm run dev         vite, 0.0.0.0:3000 (allowedHosts: true)
npm test            vitest run            → 6 files / 90 tests
npm run test:watch
npm run typecheck   tsc --noEmit  (noUnusedLocals is ON — dead code fails)
npm run build       tsc --noEmit && vite build → ~524 kB js / 161 kB gzip (chunk ceiling 600)
node scripts/check-english.mjs   English-only gate: scans `git ls-files`, exits 1 on any RTL/bidi character
```

Those four checks are what CI runs, on `push`/`pull_request` for `main` and `arena/**`. The definition is committed as
**`ci/github-actions.yml`** rather than under `.github/`, because the agent connection maintaining this branch may not
create files in `.github/workflows/` (a GitHub App permission, not a code problem). Activating it is one human commit:
`cp ci/github-actions.yml .github/workflows/ci.yml`. Until that lands there is no automation guarding `main`, so whoever
merges runs the four commands by hand.

No lint step and no formatter config (§9.9) — adding
one is a decision, not a cleanup, because it would reformat 8.7k lines in one commit. If you add one, match the four
conventions already in use: double quotes, semicolons, 2-space indent, ~120 column soft limit, `/* */` section
banners inside long files.
