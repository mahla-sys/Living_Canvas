# Living Canvas — Architecture

**Version 1.6 (handoff edition) · 2026-09-02 · language: English in code, UI, tests and this file —
`docs/` may be Persian (§8); invisible bidi characters are banned in every path**

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
are **not** allowed anywhere in the app (documents under `docs/` may be Persian — see §8). There are zero `dir="rtl"`, zero `toLocaleString("fa-IR")`,
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
  "reload from disk" button, and on load the files win outright — not because of an override rule, but because
  after structure `1.4` there is no cache that describes the graph to override (§5.2, §4.11).
- A canvas can be rebuilt from files alone, with no `state.json` at all — and there is no `graph.json` left to
  miss (§4.11). Both paths are tested.
- Export is not a state dump; it is a copy of the tree (`§4.10`). Import is not "load state"; it is
  "write these files, then hydrate from them".
- The unit of portability is `canvases/<id>/`, not a database row.

The consequence we paid for, and still pay: **the same data has two readers** — a JSON cache for the slices no
file expresses (`execution`, chat, snapshot metadata) and Markdown/YAML for everything else — so the writers and
the readers must stay in lockstep. The cure is the same one that deleted `graph.json`: one place decides a shape,
and the smaller the second reader's remit, the less there is to disagree about. That is why the serialisers and
parsers live in exactly one file (`src/lib/core.ts`), why `state.json` carries only what files cannot, and why the
tests round-trip through the real serialisers instead of hand-writing fixtures (§7).

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
        │ (IndexedDB / HTTP / memory / folder) · HTML safety · JSON   │
        │ Schema subset (the thing that makes output contracts real) │
        └──────────▲────────────────────────────────────────────┬────┘
                   │                                            │
        ┌──────────┴───────────────┐              ┌─────────────▼──────────┐
        │ state.ts  constants,     │              │ components/icons.tsx    │  (pure SVG, no deps)
        │ factories, roles, seed   │              └─────────────────────────┘
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
The third, since themes arrived, is `localStorage["lc-settings"]`, and since ADR-007 it is a seam in the
strong sense: `readSettingsLocal` / `writeSettingsLocal` / `clearSettingsLocal` in `core.ts` are the only three
functions that mention the key, and `main.tsx`, `state.ts#defaultSettings` and `store.ts` all go through them.
(Before that it was a *sentence* rather than a contract — `updateSettings` had its own `setItem` and `main.tsx`
its own `getItem`, so "what lives in local settings" was answered by grep. `settings-local.test.ts` holds it.)
They live in `core` and not in `store` because `state.ts` sits below `store.ts` (Law 5) and `main.tsx` needs
the theme before the first paint. Settings are sanctioned as browser storage at all because they are **not canvas content** — an API key, an
owner name and a theme belong to the person at the keyboard, so they must not be exported with a bundle, must not
appear in a folder diff, and must not be resurrected by `hydrate` (ADR-006). A seam that is named is auditable;
a fourth one is not, and if a third kind of browser storage appears, it belongs behind the adapter instead.
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
├── main.tsx                    113  L   boot, global error surface, React error boundary
├── App.tsx                      93  L   layout: LeftPanel | canvas+console | RightPanel, then overlays
├── state.ts                    534  L   ★ constants, types re-exports, factories, role schemas, seed
├── store.ts                    459  L   ★ zustand store + Actions façade (the only UI-facing API)
├── index.css                   439  L   design tokens (dark botanical), .lc-md-*, .lc-import-*, chip
├── lib/
│   ├── core.ts                1212  L   ★ types · YAML · frontmatter · StorageAdapter×4 · HTML safety · schemas
│   ├── engine.ts              2148  L   ★ all behaviour: events, files, run, contracts, tools, ledger, strokes
│   ├── portable.ts             444  L   ★ bundle build/parse, rebuild-canvas-from-files, download helpers
│   ├── fs-access.ts            348  L   ★ File System Access adapter, ensureStructure, read/write a folder
│   ├── test-helpers.ts          61  L   test-only wrappers around the REAL serialisers
│   └── __tests__/             2326  L   178 tests in 13 files (§7)
└── components/
    ├── CanvasArea.tsx          808  L   ★ React Flow: node shapes, drawing layer, approval + refusal band
    ├── SidePanels.tsx          908  L   ★ library/files tabs, file tree, live folder tree, inspector
    ├── Overlays.tsx            889  L   ★ TopBar, console, chat, history, settings, PortModal, toasts
    └── icons.tsx               121  L   inline SVG icon set (no icon dependency)
```

★ = the file you must understand before changing that area. Total: **10 903 lines** in 27 files (10 464 of it TypeScript). `package.json` carries **4 runtime dependencies**
(react, react-dom, @xyflow/react, zustand) and 8 dev ones — the eleven unused libraries are gone, and
the two scripts in `scripts/` are not dependencies either: plain node files that CI calls (§11.3).
Everything is client-side; there is no build-time codegen, no runtime dependency on a server, and no
`index.html` script tag other than the module entry.

`docs/` is not in that tree because it is not part of the app: it is a map, an index of decisions, a roadmap and
a research shelf, described in `docs/README.md` and policed by `scripts/check-docs.mjs`. This file stays the only
place a mechanism is written down.

Two files are large on purpose (`engine.ts`, `core.ts`) — they are the places where "one writer, one
reader" can be enforced by eye. They are internally sectioned with `/* ---------------- name ---------------- */`
banners, and the sections are the real module boundaries: splitting them into more files is a *later*
decision that must not change behaviour (§10 Q3).

---

# 3. Branches — one section per module

## 3.1 `src/lib/core.ts` (1212 lines) — types, serialisers, storage, HTML safety, schemas

No imports from inside the project. This is the only file allowed to know how a file looks on disk and how
a folder is listed. Seven sections, in this order:

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
interface Settings { provider: "sim"|"deepseek"; apiKey; model; owner; simDelay; backendUrl;
                     workspaceRoot?: string|null; theme: ThemeId; snapToGrid: boolean }
                     // theme + snapToGrid are reader-scoped, so they live in lc-settings and not in canvas.yaml (ADR-006)
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

### 3.1.7 Output schemas — the validator `core` owns (in the file this block sits between HTML safety and `StorageAdapter`)

```ts
export interface SchemaField   { type? description? minLength? maxLength? minimum? maximum? pattern? enum? }
export interface OutputSchema  { $schema? title? description? type?: "object" required? additionalProperties? properties? }
export const SUPPORTED_SCHEMA_KEYWORDS   // 7 root keywords
export const SUPPORTED_FIELD_KEYWORDS    // 8 field keywords
export function validateAgainstSchema(fields: Record<string,string>, schema: OutputSchema): string[]
export function parseOutputSchema(text: string): { ok: true; schema } | { ok: false; error: string }
```

Three decisions are packed in here, and all three exist because the alternative was a lie:

- **an unknown keyword is an error, not a skip.** `SUPPORTED_*_KEYWORDS` are exported precisely so a test can
  pin the promise; a validator that silently ignored `oneOf` would approve output the schema forbids, and would
  then be *trusted*. Field-level complaints are named by path (`a.items`).
- **presence is checked before shape** (`“summary” is required by the contract and came back empty`), and a field
  that is absent is not type-checked — otherwise one missing field produces four complaints about one problem.
- **numeric types mean "nothing but a number"**, because a value read from Markdown is a string:
  `/^-?\d+(\.\d+)?$/` on the trimmed text. `"Total: 5 out of 10"` fails as an integer, and that is the point —
  it is what lets `{{ risk_score < 7 }}` (§3.7) compare data instead of prose.

`validateAgainstSchema` is pure and synchronous and returns messages, never throws: the caller decides whether a
problem kills a node (`engine.validateAgainstContract`, §5.8 does). A malformed `pattern` in the schema is
reported as the *schema's* failure (`“a” declares an invalid pattern in the schema`), not swallowed. Full format
and ownership in §4.9.1.

## 3.2 `src/state.ts` (534 lines) — constants, factories, role schemas, seed

Pure data + construction; no behaviour, no async, no I/O (one exception: `defaultSettings()` reads
`localStorage["lc-settings"]`, see debt §9.5).

| export | what it is |
|---|---|
| `APP_VERSION="0.1.0"`, `CANVAS_ID="nexus-edu-001"`, `ROOT="canvases/nexus-edu-001"` | the single-canvas build: everything hangs off `ROOT` |
| `interface AppState` | the store shape: `booted, bootLines, canvasId, canvas, nodes, edges, memory, outputs, chats, logs, snapshots, templates, strokes, execution, events, toasts, settings, saveState, typing, ui` |
| `memory` shape | `{ global, decisions, progress, user, agents: Record<nodeId, MemDoc> }` — the five documents of §6 legacy anchor |
| `ui` shape | `{ leftTab:"palette"|"files", fileViewer, historyOpen, settingsOpen, chatNodeId, consoleOpen, portOpen }` |
| `NODE_COLORS`, `NODE_TYPE_LABEL`, `PALETTE`, `MODELS` | presentation constants (palette cards: node/note/agent/output-box/pipeline-step/folder/shape) |
| `ROLES: RoleDef[]`, `roleById(id)` | the 4 built-in roles: understander, risk-analyst, solution-designer, decision-maker — each with `default_output_contract` (format/required_fields/validator/save_to) and `default_context_contract`. `risk-analyst` requires a numeric `risk_score` field, which is what a conditional edge like `{{ risk_score < 7 }}` reads — the value comes from the model's output, not from the engine. **The seed contains no edges at all** (`buildSeed` returns `edges: []`, §5.3); the condition is something the user draws |
| `makeNodeData(type, title, owner, partial?)` | the single place a node's defaults are decided (also stamps `updated_at: nowIso()` — this is why tests project instead of deep-comparing) |
| `makeEdgeData(partial?)`, `makeMemDoc(path,title,body,confidence,source)` | same, for edges/memories |
| `makeAgentConfig(nodeId, roleId, opts?)` + `AgentConfigOverrides` | role defaults → a node's `AgentConfig`. `opts.context_contract` is merged **list by list**, because a caller that narrows `allowed_read_paths` must not silently drop `allowed_write_paths` or the output contract |
| `emptyExecution()`, `defaultSettings()` | initial slices. `emptyExecution()` now carries `errors: Record<nodeId,string>` — the refusal text a run leaves on a node card (§5.8, §6) |
| `STRUCTURE_VERSION = "1.4"` | stamped into `manifest.json` and the export envelope. `1.4` = `graph.json` deleted, `runs/` added, `library/schemas/` made real (§4.1) |
| `ROLE_SCHEMAS: Record<roleId, OutputSchema>` + `makeRoleSchema(roleId, fields?)` + `schemaPathFor(roleId)` | the four output contracts, as data, and the one place the path `library/schemas/<role>.schema.json` is spelled (§4.9.1) |
| `buildSeed(owner)` | what a fresh canvas is: one `note` ("Start here"), no edges, four empty memory docs. **No demo pipeline, no output box, no built-in template** — the reasoning is in §5.3 |

There is deliberately no `BUILTIN_TEMPLATE` and no `builtinTemplateInfo()` in this file any more. They used to
ship a five-node pipeline and register it as a template on first boot, which meant the template list, the first
screenshot, and the "load a template" flow all pointed at fabricated data. `loadTemplates()` returns exactly
what is in `library/templates/`, which for a new canvas is nothing.

## 3.3 `src/store.ts` (459 lines) — zustand store and the `actions` façade

```ts
export const useStore = create<AppState & { actions: Actions }>()((set, get) => ({ ...initialState, actions }))
```
Two halves, and the discipline is the point:

1. **The store slice** — React Flow writes go through `onNodesChange` / `onEdgesChange`, and *those are the
   only two places where a gesture becomes a document edit*: a drag end hands the moved ids to `writeNodeArtifact`,
   a Delete hands the ids to `engine.deleteNode` (state + edge cascade + files, in the engine, once), and
   `touch(api)` afterwards refreshes the cache and the chips. Selection changes are the one class of change that
   touches no file. No other component may mutate a node/edge array — and this is why the two rows above exist:
   `touch` alone writes `state.json`, `canvas-overview.md` and `canvas.yaml`, never a node file.
2. **The `actions` object** — the entire API the UI is allowed to call (60 members). Each is a two-line
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
- Layout actions (§6.1): `togglePanel(side)`, `resizePanel(side, width)`, `toggleFocusMode()`, plus the two
  keyboard feeds `chordKey(key)` and `escapeKey()`. `resizePanel` clamps through `core.clamp` and calls
  `touchLayout` — the store never writes a width to a file itself, and never trusts one.
- `updateSettings` and `saveSettingsLocal` both go through `core.writeSettingsLocal` (ADR-007); neither calls
  `localStorage.setItem` any more, which is what made the seam auditable instead of habitual.
- `openStorageFile(path)` reads the file **through the adapter**, not from state, in folder mode — so the
  File Tree shows bytes on disk, including files the app did not write. `state.json` is previewable through the
  same path (it replaced the old `graph.json` preview, which showed a cache nobody should have to reason about).
- `templates: []` and `runs: []` are the initial slices: nothing in the store is pre-fabricated, and the file
  tree builds `runs/` from `state.runs` (a projection of the folder, refreshed by `hydrate` and by each ledger
  open, §4.13).

## 3.4 `src/lib/engine.ts` (2148 lines) — every behaviour

`export interface EngineApi { get(): AppState; set(partial | (s)=>partial) }` — the shape `store` hands to
engine functions so engine never imports zustand. Sections, in file order:

| section | exports (with line anchors) | contract |
|---|---|---|
| **events** | `emit(api,type,msg)` 34, `toast(api,kind,text)` 39 | `emit` builds a `BusEvent` through `bus` and prepends it to `state.events` (cap 250). `bus.on` currently has **zero subscribers** — it is the seam for SSE/plugins later (§10 ideas) |
| **patching** | `getNode` 50, `patchNode(api,id,data,internal=false)` 57 | user edits are refused when `lock.status==="locked"` (§12.5); `internal=true` is how the executor itself writes |
| **artifacts** | `writeNodeArtifact(api,id,quiet)` 77, `writeEdgeArtifact` 84, `appendLog` 93, `writeCanvasOverview` → `overviewMd` (private) 105 | one node = one file; `quiet` suppresses the event (used in bulk loops). `nodePath`/`edgePath` are the only path builders |
| **saving** | `touch(api)` 183 (debounced 700 ms, flips `saveState`), `flushPending()` 205, `saveNow` (private) | every write sits on one promise chain so `flushPending` can await them all. Export calls it; `App.tsx` calls it
on `visibilitychange:hidden` and `pagehide`, because a tab closed inside the 700 ms window used to swallow the last
edit. `reloadFromDisk` does **not** flush — it refuses while `saveState === "saving"`, so a reload is never racing
a write |
| **memory** | `MemoryManager.read/write/list` 231 | conflict rule: incoming `confidence` must strictly exceed the stored one, else the old entry is kept and a `memory.updated` event explains it; equal weight → replaced + "ask the user later". A write into a locked node is refused. Writes are checked against `allowed_write_paths`; reads resolve **any** allowed path against the real tree |
| **self-checks** | `testFallback` 333, `contractSelfTest` 356 | `contractSelfTest` = one allowed write + two attempted intrusions (global memory, another agent's memory) and reports in the console. This is the executable form of the context contract, and since `1.4` it also parses the role's declared schema file, naming in the event which dimension failed (a missing file, a bad JSON object, an unsupported keyword), so a broken contract is caught before a run instead of during one |
| **outputs** | `FIELD_DESC` 405, `writeOutputs(api,nodeId,entries,shared)` 468 | writes `outputs/<node>/index.yaml` + one file per entry; `shared=true` puts it under `outputs/shared/<node>/` (used by the collection box) |
| **contract enforcement** | `setNodeError` 422, `validateAgainstContract` 441 | the seam between "the model answered" and "the canvas accepted it": `required_fields` must be non-empty, and a named `validator` must be a file under `library/schemas/`, present in the canvas, one parseable JSON object, and satisfied by these fields (§4.9.1, §5.8). Returns messages; the caller decides. `setNodeError` is the only writer of `execution.errors`, so the reason appears on the card exactly as often as it exists |
| **LLM** | `askModel` (private) 485, `simFields` (private) 500, `buildEntries` 532 | `buildEntries` turns validated fields into output files (it filters to what is present; it no longer *decides* validity — that is the row above). provider `sim` returns templated, plausible phase-1 answers; `deepseek` POSTs to the configured endpoint and falls back to `sim` on any error (§12.6). `throw` on an empty response |
| **tools** | `TOOL_NAMES` 565, `hasTool` 569, `unknownTools` 576 | the vocabulary an agent may act through. `get_canvas_overview`/`get_agent_brief` are the harness (always on); every other name must be in `agent.tools`, or the step is skipped (`read_memory`, `write_memory`), the node fails (`write_output`), or the chat is refused (`chat_with_user`). `unknownTools` names what this app cannot run, so the log says so instead of pretending |
| **run ledger** | `startLedger` 592, `ledgerRow` 608, `endLedger` 629 | `runs/<run-id>.md`, one row per step: read-modify-write so a reload extends the same file, capped at 300 rows, closed with `**run completed/stopped/rejected**`. Format: §4.13 |
| **execution** | `findStart` 751, `executeNode` 758, `runPipeline` 1025, `runSingle` 1051, `resumeRun` 1067, `rejectRun` 1076, `stopRun` 1084, `resetExecution` 1100 | `computeOrder` is Kahn over every runnable node — diamond-safe, disconnected nodes still queued, flow cycles reported. a lightweight state machine: `queue` + `completed` in `execution`, per-node lock with `run_id` as owner, `guard()` aborts on stop/reject, `require_approval` pauses with `status:"waiting_approval"`. Edge `trigger.type==="condition"` can skip a node. `max_steps` is enforced (§12.3). A snapshot is taken after each node. `execution.errors` is written only by `setNodeError` — cleared at `node.started`, set by a contract refusal or by the generic catch |
| **contract matching** | `isPathAllowed` 653, `numericScope` 664, `evalCondition` 682 | one matcher for `allowed_read_paths` and `allowed_write_paths`: a directory entry (trailing `/`), an exact path, or a glob over **one** segment (`outputs/*/summary.md`). `evalCondition` is fail-closed and returns `{ ok, reason }` — see §5.8. `numericScope` lifts a node's numeric output fields into `execution.context`, so a condition reads data, not prose |
| **chat** | `sendChat(api,nodeId,text)` 1144 | appends to `chats/chat-<id>.md`; the simulated replies are per-role. A node without `chat_with_user` in `tools` still gets the user's message recorded, followed by an explicit refusal line — the gate stops the *reply*, never the record |
| **snapshots** | `takeSnapshot(api,label,quiet)` 1210, `restoreSnapshot(api,id)` 1231 | full graph JSON in `history/snapshot-<stamp>.json` + a `history/index.json`; the *body* of snapshots lives in IndexedDB, and `history/index.json` carries a pointer note |
| **strokes** | `clusterStrokes(strokes,gap=80)` 1275, `addStroke` 1312, `removeStroke`, `undoStroke`, `clearStrokes`, `convertStrokesToGraph(api,{nodeType,connect})` 1344 | union-find over bounding boxes; each cluster → one node, optionally chained in drawing order. Strokes are stored as one file per stroke (`strokes/<id>.json`) so the drawing layer is a document, not a bitmap |
| **graph CRUD** | `createNode(api,nodeType,pos,opts)` 1371, `deleteNode` 1404, `createEdge` 1424, `deleteEdge` 1436 | creating an agent node also creates its private memory file; deleting a node deletes its files and connected edges |
| **loaders** | `loadStrokes` 1446, `loadTemplates` 1465, `pickMemory` (private) 1495 (the memory reads), `loadRunIds` 1485, **`hydrate(api)`** 1515 | `hydrate` is the heart — see §5.2. It has one branch now: files first, `state.json` for the slices the tree does not carry, and `loadRunIds` to project `runs/` into `state.runs` for the file tree. `loadTemplates` starts from `[]` — there is no built-in template to prepend, in this file or anywhere |
| **workspace** | `seedWorkspace(api)` 1578, `initWorkspace(api)` 1646, `reloadFromStorage` 1662, `resetWorkspace` 1676 | `initWorkspace` order is fixed: switch adapter for `backendUrl` → `maybeResumeWorkspace` → `hydrate`; if hydrate says "nothing here", it seeds. The seed writes the four role files, the two shapes and the four `library/schemas/*.json`, and nothing else: one note, no edges, no template, no `graph.json` (§5.3) |
| **templates/roles** | `saveTemplate(api,name)` 1695, `loadTemplate(api,id)` 1751, `saveRoleFromNode(api,nodeId)` 1810 | the `save_pipeline_template` / `load_pipeline_template` / `save_role` tools of §8 legacy anchor; refused mid-run |
| **portability** | `applyRootHandle` 1897, `attachWorkspaceFolder` 1911, `detachWorkspaceFolder` 1928, `pickCanvasFolder` 1939, `exportBundleText` 1961, `exportToJsonFile` 1976, `exportToFolder` 1992, `ImportPreview` 2013, `previewImportText` 2046, `applyImport` 2053, `importFromText` 2083, `importFromFolder` 2092, `importFromFile` 2122, `maybeResumeWorkspace` 2133 | see §5.5-§5.8. `applyImport` deletes a legacy `graph.json` from the incoming file map before installing anything, emits why, and lets `hydrate` rebuild from the files — the bundle's cache never becomes the canvas |

## 3.5 `src/lib/portable.ts` (444 lines) — the bundle and the file-first rebuild

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

## 3.6 `src/lib/fs-access.ts` (348 lines) — the folder seam

```ts
export function isFsAccessSupported(): boolean            // "showDirectoryPicker" in window
export async function pickCanvasDirectory(): Promise<FsDirHandle>   // readwrite; AbortError on cancel
export async function ensurePermission(h, mode): Promise<boolean>   // query → prompt → grant
export function toRelativePath(logical, rootPrefix): string|null     // the map/reverse-map of Law 4
export const CANVAS_SUBDIRS: readonly string[]            // nodes, edges, memory/agents, outputs, logs, chats,
                                                           //   strokes, library/{templates,roles,schemas,shapes},
                                                           //   history, assets, runs — the tree ensureStructure creates
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

Four files, 2 726 lines. They hold **no business logic**: they read slices with `useStore` selectors and
call `actions.*`.

| file | components | responsibilities |
|---|---|---|
| `CanvasArea.tsx` 808 | `Md`, `LcNode`, `AgentNodeCard`, `NoteNode`, `ShapeNode`, `LcEdge`, `DrawLayer`, `ConvertDialog`, `CanvasArea` (default) | registers React Flow `nodeTypes`/`edgeTypes`; renders node Markdown **only** through `mdInline`; the freehand layer (pointer capture → stroke → `actions.addStroke`); cluster→node conversion dialog; the human-approval banner; status/legend chips |
| `SidePanels.tsx` 908 | `Palette`, `Folder`, `FileRow`, `RealFileRow`, `LiveFolderTree`, `FileTree`, `TemplatesSection`, `LeftPanel`, `Section`, `Field`, `NodeInspector`, `EdgeInspector`, `CanvasInspector`, `RightPanel`, `FileViewer` | left panel = library (`palette`) or files; in folder mode the file tree is read from disk (`storage.listDirectory`), not from state; the inspector edits display/content/agent config/context contract, and runs the contract self-test |
| `Overlays.tsx` 889 | `TopBar`, `ActivityConsole`, `ChatPanel`, `HistoryModal`, `SettingsModal`, `PortModal`, `Toasts`, `BootOverlay`, `ModeRow`, `ActBtn` | `PortModal` is the Export/Import + folder-attach surface (preview → confirm). The save chip shows `idb / fs / http / memory` |
| `icons.tsx` 121 | 30+ inline SVGs | no icon library |

---

# 4. Twigs — the file formats, byte for byte

These samples were produced by the real serialisers (`nodeToMarkdown`, `edgeToYaml`, `memoryToMd`, `toYaml`),
not written by hand. Copy them: if you change a writer, these change, and the tests that compare
export→import byte-for-byte will tell you.

## 4.1 The tree (structure version `1.4`, everything below `canvases/<canvas-id>/`)

```
canvases/nexus-edu-001/
├── manifest.json            identity + versions; hydrate refuses a canvas without it
├── canvas.yaml              canvas metadata (title/owner/type/tags) + `layout:` panel widths (§6.1, ADR-009)
├── canvas-overview.md       the summary agents read first (frontmatter + prose)
├── nodes/<node-id>.md       one file per node            §4.2
├── edges/<edge-id>.yaml     one file per edge            §4.3
├── memory/
│   ├── global.md  decisions.md  progress.md  user.md      the four shared docs
│   └── agents/<node-id>.md  private memory per agent      §4.4
├── outputs/<node-id>/index.yaml + <file>                   §4.5
├── logs/<node-id>/<date>.log                               §4.7
├── runs/<run-id>.md         one append-only ledger per run  §4.13
├── chats/chat-<node-id>.md                                 §4.6
├── strokes/<stroke-id>.json                                §4.8
├── library/
│   ├── templates/<template-id>/template.json|yaml + nodes/…  §4.9
│   ├── roles/<role-id>.json
│   ├── schemas/<role-id>.schema.json    output contracts as files  §4.9
│   └── shapes/<shape-id>.json
├── history/index.json + snapshot-<stamp>.json              §4.11
└── state.json               machine cache (everything except nodes/edges)  §4.11
```

`library/`, `history/` and `state.json` are **not** required: a folder containing only
`manifest.json`, `canvas.yaml`, `nodes/`, `edges/`, `memory/` is a valid canvas and hydrates fully (§5.2,
tested). That is the whole point of the file-first design.

**There is no `graph.json`.** Until structure `1.4` the tree carried a second copy of the graph — a cache of
React Flow nodes and edges that could, and did, disagree with the node files. It was deleted: geometry lives in
each `nodes/<id>.md` frontmatter (`position: {x, y, z}`), so one file says where one node is, and the
`nodes/` folder *is* the graph. `hydrate()` never reads a `graph.json`, and Import drops one that arrives inside
an older bundle, with a `system` event saying why (§5.7). A `1.3`-era folder that still has one hydrates
unchanged — the extra file is simply inert.

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
- `position` absent ⇒ `{x:0,y:0}`, and that is the end of it: frontmatter is where geometry lives, and there is
  no second file for it to lose to (§4.11). A node dragged somewhere new gets the value written back into this
  same file by the next debounced save (§5.4).
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

## 4.9 `library/templates/…` and `library/schemas/…` — what the canvas reuses

```json
{ "template_id": "my-flow", "name": "My flow", "description": "saved from the canvas …",
  "version": "1.0", "nodes": [ … ], "edges": [ … ] }
```
A template is a user's shape, nothing more: **the app ships no built-in template** and mirrors no
`quick-pipeline` on first boot. What a fresh canvas gets is structure — see §5.3.
Discovery path: `storage.listDirectory("canvases/<id>/library/templates")` → directory names with a
trailing `/` → stripped → `template.json`/`template.yaml` read from each. **This is the exact chain the
Law-4 bug broke.**

### 4.9.1 `library/schemas/<role-id>.schema.json` — the contract, enforceable

Every built-in role's `output_contract.validator` names one of these files, and the executor treats it as a
**hard** requirement: the run reads the schema and validates the node's output against it before a single byte
is delivered (§5.8). The file is a JSON Schema *subset*, and the subset is not a matter of taste — an
unsupported keyword is reported rather than skipped, because a validator that quietly ignores `oneOf` passes
output the schema forbids, and is then trusted for it.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "risk-analyst output",
  "type": "object",
  "additionalProperties": false,
  "required": ["summary", "risks", "decision", "risk_score"],
  "properties": {
    "summary":    { "type": "string", "minLength": 40, "maxLength": 400 },
    "risk_score": { "type": "integer", "minimum": 1, "maximum": 10, "description": "1 = safe … 10 = stop" }
  }
}
```

| level | keywords this app implements | anything else |
|---|---|---|
| schema root | `$schema title description type required additionalProperties properties` | rejected: "unsupported keyword “oneOf” in the schema — refusing to ignore it" |
| one field | `type description minLength maxLength minimum maximum pattern enum` | rejected, named by path (`a.items`) |

A field's value arrives as a *string*, because output files are Markdown, so `"type": "integer"` is read as
"nothing but a number" — which is what makes `{{ risk_score < 7 }}` a check instead of a decoration (§3.7).

Ownership, so nothing is guessed: `core.validateAgainstSchema(fields, schema) → string[]` (empty ⇒ valid) and
`core.parseOutputSchema(text)` (one JSON object or a loud error) are the whole engine; `state.ts` holds
`ROLE_SCHEMAS` + `schemaPathFor(roleId)` + `makeRoleSchema` and stamps a node's `validator` from the role;
`seedWorkspace` writes the four files; `saveRoleFromNode` rewrites the schema when a node's contract changes;
`contractSelfTest` parses the declared schema so a broken file is caught before a run, not during one.
`validator: null` in a node file is the only opt-out, and it is a decision the *user* wrote into that file — the
engine then checks presence (`required_fields`) and nothing else. Full rules in §5.8 and in the tests
(`schema.test.ts`, `execution.test.ts`).

## 4.10 `manifest.json` and the export bundle

```json
{ "version": "1.0", "app_version": "0.1.0", "canvas_id": "nexus-edu-001", "structure_version": "1.4" }
```

```json
{ "kind": "living-canvas-export", "version": 1, "app_version": "0.1.0", "structure_version": "1.4",
  "canvas_id": "nexus-edu-001", "exported_at": "2026-09-01T16:34:09.949Z",
  "files": { "canvases/nexus-edu-001/nodes/node-001.md": "<full file text>", "…": "…" },
  "stats": { "files": 4, "bytes": 1782 } }
```
`files` is a map of **logical path → exact file text** — no re-encoding, no sidecars, no excluded runtime
data. `state.json` travels inside it as an ordinary file (it is only a cache — the rebuild reads the node and
edge files), and a `graph.json` that an older folder still carries is dropped on the way in. Everything that is
real data is restored byte-for-byte (asserted in `roundtrip.test.ts`). Import also accepts a bare path→content map (a
folder zipped by hand, someone's `cat *.json`), reported as `source: "raw-files"`.
Guards, each with a user-visible reason in `skipped[]`: `..`/absolute/backslash paths; a path under
`canvases/` that is not *this* canvas; non-string content; `kind` mismatch; `version > BUNDLE_VERSION`;
total size > 32 MB. A missing `manifest.json` ⇒ a `warning`, not an error.

## 4.11 The one cache, and history

- `state.json` — `{ canvas, memory, outputs, chats, logs, snapshots, execution, saved_at }`. A **cache**, never
  an input: `hydrate()` takes from it only the slices the file tree does not carry, and every field a file can
  express (title, content, position, the whole agent config) is taken from the file, always. Restoring it never
  restores locks; `execution.status` mid-run becomes `idle`; `execution.errors` is cleared, because a refusal
  belongs to the run that made it.
- **there is no `graph.json` any more.** The reason is a fact about this project, not a style preference: while
  two files described the same nodes, the app needed a rule for which one won, and it had one ("Markdown
  overrides the cache") instead of a single source. Deleting the cache deleted the rule. `saveCore` writes only
  `state.json`, and the file tree labels the row `state.json (cache)` so nobody mistakes it for the document.
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

`events` (250 last lines of the console), `toasts`, `ui.*`, `typing`, `bootLines`, the `saveState` chip — and,
since the layout system, `ui.focusMode` explicitly (§6.1: a moment of work, not a setting).
They are session-local by definition. `ui.*` is the one with a trap in it: panel widths *look* like the same
kind of thing and are not — they are canvas content in `canvas.yaml` (ADR-009), so `ui` holds the moments and
`canvas.layout` holds the shape. If you ever need to persist one of them, it becomes a file and the
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

## 5.2 `hydrate(api)` — one load path, from the files

```
exists(`${ROOT}/manifest.json`)?  no  → return false (nothing was ever seeded here; do not wipe anything)
                                    yes ↓
files   = collectCanvasFiles({ filter: p => ^canvases/<id>/nodes/[^/]+\.md$
                                                  or  edges/[^/]+\.yaml  or  canvas.yaml })   // the graph itself
derived = deriveCanvasFromFiles(files)      // nodes, edges, memory, canvasTitle, unreadable[]
state   = readJson(`${ROOT}/state.json`)    (optional; may be broken — never fatal)
execution = state?.execution with status normalised (running/paused → idle, locks dropped, errors cleared)
memory    = derived.memory ∪ state?.memory
runs      = loadRunIds()                    // listDirectory(runs/) → ids, newest first — a projection, not an input
templates = loadTemplates()                 // listDirectory → per-folder spec (needs Law 4)
strokes   = loadStrokes()                   // strokes/*.json
unreadable.length → emit validation.failed with the first four names
return true
```

Two rules a reader will ask about: a `manifest.json` that does not parse is still a manifest (`"{}"` is fine —
it is a marker, not a config), and a folder with a manifest but **no node files** returns `false` on purpose, so
`initWorkspace` seeds the skeleton rather than leaving a blank board with no explanation (§5.1.3, tested).

There is no cache branch to compare against: `nodes/` + `edges/` *are* the graph, and `state.json` is read only
for the slices the tree does not carry (`execution`, the shared memory docs when a file is missing, canvas
metadata fallbacks). That single direction is the answer to "why did my Obsidian edit disappear" — a file
cannot lose to a cache any more, because no cache holds a competing copy.

## 5.3 `seedWorkspace(api)` — first boot / empty folder

`boot(path, text)` writes each file and appends a `bootLines` entry (the boot overlay is a real log).
Order: `manifest.json` → `canvas.yaml` → `canvas-overview.md` → nodes → edges (none) → memory (the four shared
docs) → `library/roles/*.json` (4) → `library/shapes/*.json` (2) → `library/schemas/<role>.schema.json` (4) →
`state.json` (cache) — and the last `bootLines` row says so out loud:
`state.json (cache only — graph.json is gone)`.

**What it seeds, and what it deliberately does not.** `buildSeed(owner)` returns one `note` node titled
"Start here" (whose body points at the inspector and at `library/roles/`), no edges, and the four empty memory
docs. No four-agent pipeline, no output box, no pre-fabricated flow, **no built-in template**: a fresh canvas
must look like a blank board, not like a screenshot of somebody else's test. The demo pipeline used to make the
structure easy to *see*, and it cost the app its honesty — `loadTemplates` had a fabricated entry, hydration
had to know which nodes were fake, and every screenshot of the tool was a lie about what the tool produces. The
role definitions and their schemas *are* seeded, because they are what the contract system needs to be real
(§4.9.1); the graph is what the user draws.

## 5.4 Editing a node

```
textarea in the inspector (or on the canvas) → actions.updateNodeData(id, patch)
  → engine.patchNode(api, id, data)         // refused with a warn toast if locked (Law 3)
  → api.set(nodes: map over nodes)          // React Flow re-renders
  → writeNodeArtifact(api, id, quiet=true)  // nodes/<id>.md via nodeToMarkdown (position included)
  → touch(api)                              // debounced 700 ms:
      saveNow → writeCanvasOverview()        // counts + current step
              → writeCore → state.json      // the cache; it carries no nodes, on purpose
      saveState: "saving" → "saved"         // the TopBar chip, and the trigger for the live tree refresh
```
The node file write is **synchronous inside the action**, not deferred to `saveNow`: a debounced cache write that is
the only writer of a field is how a closed tab loses layout. Drag end goes through the same two calls
(`writeNodeArtifact` per moved id, then `touch`), and `check-palette`'s sibling tests in `store-write.test.ts`
keep both honest.
Every keystroke costs one IndexedDB write 700 ms later — no batching layer, no queue to reason about. In
folder mode writes are **synchronous and un-debounced** (a user watching `git status` expects the file to
change now).

## 5.5 Export

```
actions.exportJson → engine.exportBundleText(api)
  1. await flushPending()            // the debounce window would drop the last edit
  2. files = collectCanvasFiles()    // the whole §2 tree, the cache included
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
   a legacy `files["canvases/<id>/graph.json"]` is deleted here, with a system event:
     "graph.json in the bundle was dropped — positions now come from nodes/*.md only (§4.11)"
   ensure manifest.json exists (create it if the folder did not have one)
   installFiles(files) → hydrate(api)      // i.e. rebuild from the files, not from the bundle's cache
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
     write_output not in tools → the node fails here, because an agent that cannot write cannot deliver
     askModel (or sim) → fields → validateAgainstContract(api, agent, required_fields, fields)
        presence: every required field non-empty            ·  then, if the node names a `validator`:
        the file must be under library/schemas/, must exist in the canvas, must parse as one JSON object,
        and must accept the fields (§4.9.1). Any of that failing ⇒ `problems[]`
     problems.length → validation.failed event + log line + ledger row `rejected` + setNodeError(id, reason)
                       → the node fails *before* writeOutputs: nothing lands in outputs/, and the card of the
                         node shows the reason in an ember band (§6)
     no problems     → writeOutputs → outputs/<id>/index.yaml + one file per field ; appendLog + ledger row
     memory write (own agent doc, confidence 0.8) → MemoryManager.write
     execution.context gains: nodeId → summary, plus every *numeric* output field (numericScope)
     require_approval? → status "waiting_approval", pause, return
     snapshot("end of …") ; unlock ; emit node.completed
  endLedger("completed") ; collect output-boxes (shared outputs) → run.completed
```
`steps > max_steps` throws (§12.3). Any error marks the node `failed`, emits `node.failed`, appends the
error to the log **and to the ledger**, stops the run and toasts — **it never auto-retries**, so a run's history
stays readable. `execution.errors[nodeId]` carries the one-line reason for as long as the canvas holds that
run: it is set by the contract refusal above, and by the generic catch when nothing more precise is known, and
cleared at `node.started` of the next run. It is deliberately *not* written into `nodes/<id>.md` — a failure is a
moment of execution (Law 3), the reason is data only for the length of the run. `stopRun`/`rejectRun` close the ledger with `**run stopped/rejected**` before they clear
`run_id`, so an interrupted run leaves a file that says it was interrupted.

## 5.9 Undo-ish: snapshots

`takeSnapshot(label)` writes `history/snapshot-<stamp>.json` (graph) + an entry in `history/index.json`
and pushes `SnapshotMeta` into state. `restoreSnapshot(id)` replaces the graph (and emits
`snapshot.restored`). Manual checkpoints come from the TopBar camera button; automatic ones after each
executed node (`quiet=true`, no toast).

---

# 6. Skin — UI anatomy (what is on screen, and where the data comes from)

This section is the *description of what renders*. What the interface **should** look like — every pixel, state and
stored setting, as a row-by-row spec — is `docs/ui-spec.md`, and the two never trade jobs: a number that changes the
appearance goes there, a mechanism that makes it renderable goes here.

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
├──────────┴──────────────────────────────────────┴────────────┤
│ StatusBar 22px: title · counts · mode  │  run · save · panels│
└──────────────────────────────────────────────────────────────┘
 floating: ChatPanel (right, above the inspector) · FileViewer · HistoryModal
           SettingsModal · PortModal · Toasts (bottom centre) · BootOverlay
```

The panel edges are draggable (`ResizeHandle` in `SidePanels.tsx`) and the two widths come from
`canvas.layout` — see §6.1.

### 6.1 The layout system (ADR-009, `docs/patterns/layout-system.md`)

Three parts, and the interesting question is which of them is *data*.

| thing | where it lives | why |
|---|---|---|
| `leftWidth` / `rightWidth` (`PANEL_MIN` 200 … `PANEL_MAX` 520) | `canvas.yaml` under `layout:` | how wide the inspector is on *this* graph is part of how the graph is read, exactly like `position` |
| `leftOpen` / `rightOpen` | `canvas.yaml` under `layout:` | same; a collapsed panel is a reading choice the next reader should inherit |
| focus mode | `ui.focusMode`, memory only | a moment of work, like `lock` (Law 3). Written to a file it would make the next reader open somebody else's concentration |
| the status strip | nothing — it is pure chrome | 22px (`STATUS_BAR_HEIGHT`), read-only, no setting |

Flows:

```
drag the panel edge → ResizeHandle onPointerMove → actions.resizePanel(side, w)
   → core.clamp(w, PANEL_MIN, PANEL_MAX)         // the file is the contract, so the clamp is at the door
   → state moves immediately (the panel follows the pointer)
   → touchLayout(api)                            // debounce 500 ms → writeCanvasYaml(api)
release → nothing more happens; the write already fired 500 ms after the last move

Ctrl+K Z  → actions.chordKey("k") then ("z")  → core.createChord(["k","z"]) completes → setFocus(!focus)
Escape ×2 → actions.escapeKey()               → core.createDoubleTap(400) reports the 2nd → setFocus(false)
```

Four rules worth naming:

- **One writer for `canvas.yaml`.** `writeCanvasYaml(s)` is called by `writeCore` (the 700 ms content save) and
  by `touchLayout` (the 500 ms layout save). Two triggers, one function — a second writer for the same file is
  how a canvas grows two truths about itself. Both ride `saveChain`, so `flushPending()` waits for the layout
  too, and Export cannot ship a canvas whose widths are 500 ms stale.
- **`hydrate` reads the layout from the file and from nowhere else.** `deriveCanvasFromFiles` returns
  `layout: CanvasLayout | null`; a missing `layout:` key means *defaults*, not hidden panels — so a folder from
  before this feature opens with both panels visible.
- **`normalizeLayout` is the only door.** Widths are clamped, `false` is the only way to be closed, and a
  non-number is absent rather than zero. A hand-edited `canvas.yaml` with `leftWidth: 9000` comes back at 520.
- **The keyboard sequences are pure functions**, so the shortcuts are tested without a DOM (`layout.test.ts`).
  A half-pressed chord lives in a module-level instance in `store.ts`, not in a component — a re-render must
  not forget that Ctrl was already pressed. Only `k`, `z` (while the chord is half-pressed) and `Escape` are
  ever fed, so typing on the canvas and `Ctrl+Z` undo are untouched.

Selector discipline (this is a real constraint, not style): zustand + `useSyncExternalStore` means a
selector returning a fresh array/object re-renders forever. Every empty fallback uses `EMPTY_ARR`
(`useStore((s) => s.outputs[id] ?? EMPTY_ARR)`), never `?? []`.

| region | reads | writes via |
|---|---|---|
| `TopBar` | `saveState`, `canvas.title`, `storageMode()`, `execution.status`, lock of the selected node | `runAll` / `stop` / `resume` / `snapshot` / `setHistoryOpen` / `setSettingsOpen` / `setPortOpen` |
| `Palette` (Library tab) | `PALETTE`, `templates` (whatever is in `library/templates/`, and nothing else) | `addNode(type,pos)` (drag or click), `loadTemplate(id)`, `saveTemplate(name)` |
| `FileTree` | state-derived file list (idb) **or** `storage.listDirectory` (fs mode, refreshed whenever `saveState` returns to `saved`) | `openFile(path)` → FileViewer shows the real text; copy button |
| `NodeInspector` | the selected `RFNode.data` | `updateNodeData`, `updateAgentField`, `saveRole`, `selfTest`, `runOne`, `removeNode`, `setChatNode` |
| `CanvasArea` | `nodes`, `edges`, `execution`, `strokes`, `drawMode` | `onNodesChange/onEdgesChange/onConnect`, `addStroke`, `convertStrokes`, `resume/reject` |
| `PortModal` | counts, `storageMode`, `settings.workspaceRoot`, `isFsAccessSupported()` | `exportJson`, `exportFolder`, `attachFolder`, `detachFolder`, `reloadFromDisk`, `previewImport` → `commitImport`, `importFolder`, `importJsonFile` |
| `ActivityConsole` | `events` (cap 250) | `toggleConsole` |

One row of that table deserves a sentence of its own, because it is the only place the app *explains* itself:
`CanvasArea` reads `execution.errors[id]` and paints an ember band along the bottom of the node card (card and
markdown views; dot and name views get a corner badge plus the `title` tooltip, because there is no room for a
sentence in 24 px). The band is the run's refusal, verbatim — "output rejected —
`library/schemas/risk-analyst.schema.json`: "risk_score" = 11 is above the maximum 10". The alternative was to
make the user open the console and find the node's line among 250 events; a pipeline whose failure is only
visible in a log is a pipeline nobody trusts. The text is never written into `nodes/<id>.md` (§5.8, Law 3).

### Themes, roles, and the colours that stay data

An appearance decision still needs a mechanism, and this one is a single attribute: `main.tsx` sets
`document.documentElement.dataset.theme` from `settings.theme` **before the first paint** (in a component effect the
canvas flashes the default for a frame), `App.tsx` keeps it in sync when the Settings modal changes it, and
`src/index.css` re-maps the tokens under `:root[data-theme="…"]`. There is deliberately no theme object in
TypeScript: a second list of colours in JS is a second truth, and `docs/ui-spec.md` §3 is the document that decides
which of the two owns a value.

- **Components name roles, never colours.** Colour literals live in exactly three kinds of block in `index.css`
  (`@theme`, the `:root` role aliases, and one block per non-default theme). Anything else that needs a colour takes
  a class (`.lc-card-surface`, `.lc-card-empty`, `.lc-fail-band`) or a `var()` inside an inline style — inline styles
  do accept `var()`, which is how the node card's gradient left JSX without changing how it paints.
- **React Flow is themed through the variables its stylesheet reads** (`--xy-background-pattern-color`,
  `--xy-minimap-background-color`, `--xy-minimap-mask-background-color`), not through `color` / `maskColor` /
  `style` props. Those props end up as inline styles, which outrank any theme, so they are not a theming API and
  they are gone from `CanvasArea.tsx`.
- **Contrast is measured, not felt.** `scripts/check-palette.mjs` resolves each theme's tokens and applies WCAG
  relative luminance to six roles (body, titles, muted, action, error, success) against that theme's own
  `ink-950`, and refuses a theme that is *dimmer* than the default for any of them. Alpha utilities follow the
  theme too: Tailwind emits `color-mix(… var(--color-…), transparent)` behind an `@supports` guard, and the
  pre-computed literal is the fallback for a browser without `color-mix`.
- **Node, edge and stroke colours stay literals in the files.** They are what the user drew. A theme that
  re-tinted them would rewrite the canvas, which is Law 1 seen from the other side.

`GRID_GAP` (`src/lib/core.ts`) is one constant with two jobs: the `<Background gap>` dot pitch and `snapGrid`. They
must stay equal — a snap that lands between two visible dots reads as broken alignment, whatever the number is.
Snapping is **off until switched on in Settings**, because it rewrites `position` in every node file it touches: a
document change wearing a view's clothes. `elevateNodesOnSelect` is on, since the selected card is the one being read.

Editing text on the canvas (`LcNode`, markdown view): double-click swaps the rendered block for a `<textarea>`,
and the commit path is `updateNodeData` — the same writer the inspector uses, so the node file is written and
`mdInline` stays the only render door (Law 2). `Escape` cancels, `⌘/Ctrl+Enter` and blur commit; the textarea carries
`nodrag nowheel` so the canvas does not steal the gesture. There is no `contentEditable` anywhere in the app, and
adding one means re-arguing Law 2 first.

Accessibility/keyboard: only two handlers exist (Enter in the chat composer, Enter in "save template"), plus
`Enter`/`Escape` inside in-place node editing. There are no canvas shortcuts, no focus rings on nodes, no
`aria-live` on toasts — see §9.9.

---

# 7. Immune system — tests

`npx vitest run` → **13 files, 178 tests**, no jsdom, no config file (vitest reads `vite.config.js`).
Every test runs the **production** functions — no re-implementations. `src/lib/test-helpers.ts` exists so a
test cannot accidentally grow its own serialiser (that is how a fixture hides a bug).

| file | n | what it locks |
|---|---|---|
| `storage.test.ts` | 16 | `listChildren` contract (files bare, dirs with `/`, sorted, deduped, no leakage across prefixes); `safeRelPath` rejections; `readJson` rejecting a missing file (so hydrate cannot fall back to the seed); `escapeHtml`/`mdInline` (no tag survives, only `strong/em/code`, payloads inside `**bold**`) |
| `portable.test.ts` | 22 | bundle round-trip identity; escaping paths rejected; non-string content rejected; newer `version` rejected; foreign canvas skipped with a reason; missing manifest = warning; long/multiline `system_prompt` survives; files-only rebuild (nodes/edges/memory, canvas title, no truncation); a manual Obsidian edit wins; dangling edge dropped; locks not restored; `running→idle`, `done` kept; invalid colour/edge-type/clipped confidence; `parseYaml∘toYaml` identity; **YAML interop** (no bare flow mapping, no type drift for `"1.0"`) |
| `fs-access.test.ts` | 13 | a Map-backed fake of the File System Access API: `toRelativePath` mapping and rejection; adapter CRUD + `listDirectory` + `allPaths` (files only, no dotfiles) + `..` throws + `clear` scoped; `ensureStructure` creation & idempotence; `writeFilesToDirectory` (valid files land, invalid ones are reported, prefix-escape rejected); `readCanvasFromDirectory` |
| `roundtrip.test.ts` | 4 | seed → collect → bundle → parse → **compare file maps byte for byte**; hydration from real Markdown; the template-folder regression at workspace level; export *without* `graph.json`/`state.json` still rebuilds — that last one is now the *normal* case, and its fixture is a deliberate `structure_version: "1.3"` folder, so the legacy shape stays covered |
| `schema.test.ts` | 15 | the schema subset itself (§4.9.1): presence, `additionalProperties: false` in both directions, "a numeric field means nothing but a number", range/enum/pattern/length/boolean, **an unsupported keyword is reported at both levels and named by path**, a non-object root is refused, a broken `pattern` is the schema's own failure, `parseOutputSchema` accepts one JSON object or errors loudly, every shipped `ROLE_SCHEMAS` entry parses and promises exactly the fields its role declares |
| `execution.test.ts` | 37 | the run rules: `evalCondition` fail-closed (unsatisfied / unknown variable / unparsable / non-numeric data / string compare), `numericScope`, `isPathAllowed` (dir, exact, one-segment glob, no neighbour leakage), `computeOrder` (diamond, disconnected, cycle, parallel edges, determinism, mid-graph start), `hasTool`/`unknownTools`; plus `runPipeline` end to end on a two-agent graph — an ungranted upstream path is not read, `write_output` missing makes the node fail with no output files, a conditional edge skips the node and logs the reason, the run ledger is written row by row and closed, and `MemoryManager.read` returns a granted `outputs/` file. The last group is the contract *enforced*: a score outside the schema's range fails the node with the reason in `execution.errors`, nothing lands in `outputs/`, the log and the ledger both record `rejected`; a schema file that is missing, outside `library/schemas/`, not one JSON object, or built from an unsupported keyword is refused before it can pass anything; and `validator: null` opts out of all of it — on purpose, with the cost asserted in the same test |
| `store-write.test.ts` | 5 | the two paths that used to stop at the store: `Delete` on a node must delete `nodes/<id>.md` (and cascade its edges, exactly as the inspector button does), a run-locked node must survive both the change and the files with a toast that says why, and a drag end must land in the node file — while a drag still in progress must not touch the disk |
| `theme.test.ts` | 3 | the settings half of appearance: every registered theme has a label and a hint, and `defaultSettings()` refuses an unregistered id, a corrupt blob and a truthy-not-boolean `snapToGrid` (a theme that selects nothing, or a document change that was not asked for, are both worse than the default). The colour half is in `scripts/check-palette.mjs`, because a test that reads `node:fs` does not belong inside `src/` |
| `layout.test.ts` | 18 | the layout system (§6.1, ADR-009): `normalizeLayout` clamps a hand-edited `canvas.yaml` (absurd widths, the string `"300"`, a missing key meaning *open*, garbage without throwing); `writeCanvasYaml` → `hydrate` round-trips the widths; a canvas with no `layout:` key hydrates to the defaults; **`hydrate` leaves focus mode off and nothing in the tree mentions focus**; and the two keyboard machines as pure functions — a chord that restarts on a wrong key, expires after 1500 ms and is case-insensitive, a double tap that forgets itself after it fires |
| `layout-render.test.ts` | 6 | the layout chrome *renders*: `renderToStaticMarkup` on the real `StatusBar`, `LeftPanel` and `RightPanel`. It proves the strip mounts at `STATUS_BAR_HEIGHT`, both panels take their width from `canvas.layout` (the old `w-[268px]`/`w-[292px]` utilities are asserted gone), the handle sits on the inner edge as a `role="separator"`, and the focus-mode way out is not offered before focus mode is on. **Its limit is in the file**: zustand v5 gives `renderToStaticMarkup` the store's *initial* state, so state-driven behaviour cannot be asserted here without jsdom, which §7 refuses |
| `model-route.test.ts` | 13 | `resolveModelRoute` (ADR-008): the provider comes from the model name, `ollama:` is stripped before the request, an empty model falls back to the global setting, and the function is pure. Then the half that matters: **`sendChat` is run against a stubbed `fetch`** and the request body is asserted to carry the node's own model and the node's own `max_tokens` — the test that fails if `agent.model` becomes a label again. Last: every entry of `MODELS` routes somewhere real, and the shipped list is pinned so a model with no endpoint does not come back |
| `settings-local.test.ts` | 15 | Law 4's third seam as a contract (ADR-007): `readSettingsLocal` returns `null` for nothing stored, a corrupt blob, a JSON array, no `localStorage` at all, and a storage that throws on *access*; `writeSettingsLocal` **merges rather than replaces** and reports `false` instead of throwing; `clearSettingsLocal` is safe twice; and `defaultSettings` reads through the seam, rejecting an unregistered theme and a truthy-but-not-true `snapToGrid` |
| `hydrate.test.ts` | 11 | the real `hydrate()` against `MemoryStorageAdapter`: no manifest → `false` and nothing deleted; custom template found after reload; several templates + neighbouring files; files-only mode builds the canvas; locked node not restored; **a `graph.json` left in the folder is inert** (positions and text both come from the node file); broken `state.json` tolerated; the adapter in play is the adapter read (no stale cache between tests); `seedWorkspace` writes the four role files + the four schemas, no `graph.json`, one start-here note and no edges; an imported bundle loses its `graph.json` and says so |

Rules for adding a test:
1. Build fixtures with `nodeToMarkdown` / `edgeToYaml` / `memoryToMd` / `toYaml` from `test-helpers`, never by
   writing YAML text — unless the test is *about* malformed text.
2. Do not deep-compare two `deriveCanvasFromFiles` results: it stamps `updated_at: nowIso()`, so compare a
   projection (see `roundtrip.test.ts`) or differences of a millisecond will make it flaky.
3. A test that would also pass when the bug is reintroduced is worse than no test. Before finishing,
   **revert the fix locally and confirm the test fails** — that is how the Law-4 guard was verified (7 tests fail
   on the old filter, 2 on the old `yv`), how `store-write.test.ts` was verified (4 of its 5 fail when the two
   store routes go back to `applyNodeChanges` alone), and how `check-palette.mjs` was verified (a stray `#333333`
   and a `THEME_IDS` entry without a CSS block each fail it, loudly).
4. `setStorage(new MemoryStorageAdapter())` in `beforeEach` + restore afterwards: the adapter is a module
   singleton and tests must not leak it into each other.

---

# 8. Pruning — deliberate non-goals

Written down so nobody "helpfully" adds them back:

- **No zip/JSZip.** A `.livingcanvas.json` bundle is plain JSON of the tree; Git already compresses text,
  and a zip would break "open the folder and look".
- **No proprietary sidecar** (`.livingcanvas/`, `excludeRuntime`, per-file metadata dumps). `state.json` is an
  ordinary file inside the tree and is treated as a cache — and since structure `1.4` it is the *only* one,
  because `graph.json` was deleted rather than documented (§4.11).
- **No server in phase 1.** `HttpStorageAdapter` exists, the backend does not. Do not "temporarily" add an
  Express server to make a test easier.
- **No second source of truth for node text.** If the inspector needs a field, the node file gains a field.
- **No auto-retry in the executor**, no background queue, no optimistic LLM calls.
- **No CSS framework other than Tailwind v4 tokens**; no component kit (they bring their own opinions about
  direction, density and focus, and this UI is deliberately dense).
- **No i18n layer.** English is the source language of the app and there is no translation table; that is a decision,
  not an oversight, and it stays true: `src/` carries zero Persian literals and zero `dir="rtl"`. Adding localisation
  means deciding what gets localised (dates/numbers via `Intl` — the code currently avoids `Intl` for exactly that reason).
- **RTL script is confined to `docs/`.** Documents may be written in Persian, because the person who reads them owns the
  project and a doc that is read is worth more than a corpus that is uniform — an earlier "English everywhere" rule was
  replaced by this one on 2026-09-01 (see `docs/README.md#Language`). What is banned in every tracked file, `docs/`
  included, is the invisible kind: U+200B, U+200D–200F, U+202A–202E, U+2066–2069. Those are not a language, they are a
  corrupted line: they break `grep`, diffs and anyone's re-reading of a sentence, and no tool will explain them later.
  U+200C (ZWNJ) is the one deliberate exception — required to spell Persian, allowed in `docs/`, rejected outside it.
  `scripts/check-english.mjs` enforces all of that, so this stays a rule rather than a habit.
- **Not a multiplayer doc.** No CRDT, no awareness, no per-file locking. `lock` is an execution mutex, not a
  collaboration primitive. Do not let it grow into one.

---

# 9. Known wounds (debt, precise)

Ordered by how much they will cost to fix later. **Retired in the post-review pass** (each has a test in
`execution.test.ts`, so they stay retired): `executeNode` used to collect upstream output around the read contract;
`MemoryManager.read` resolved only the five memory documents; `agent.tools` was decorative; `evalCondition` failed
open; `risk_score` was hardcoded `5` for one role; `computeOrder` was a BFS that dropped disconnected nodes; the
contract of `makeAgentConfig(...)` was replaced instead of merged; `validateOutput` could not fail; the
`output_contract` was decorative while a `graph.json` cache competed with the node files; a shipped four-agent
demo pipeline and a fake built-in template made a fresh canvas look like someone's test; eleven unused
npm dependencies and a 40 MB tracked snapshot; nothing that ran automatically (the CI definition now exists at
`ci/github-actions.yml` but is not wired up yet — §11.3).

1. **The provider table has two rows and only one of them has been exercised end to end.** `resolveModelRoute`
   (ADR-008) derives the endpoint from the model name: `ollama:` → a local OpenAI-compatible Ollama, everything
   else → DeepSeek. `agent.model` and `agent.max_tokens` are now real inputs (`model-route.test.ts` stubs `fetch`
   and asserts both reach the request body), so the inspector's model dropdown is no longer a label. What is
   *not* done: only the DeepSeek path has a key and has actually been called; Ollama is a standard endpoint with
   no service behind it in CI. And a model that has no endpoint must leave `MODELS` rather than 400 into the
   simulator — which is why `glm-4-flash` was removed (`docs/decisions/adr-008-agent-model-selects-the-model.md`).
   More structurally: the model does not *choose* tools — the
   executor walks the six steps and `agent.tools` only decides which of them are permitted. Function calling means
   handing `TOOL_NAMES` to the provider as JSON-schema tools and looping on the calls it returns; the gate it needs
   is already in place (`hasTool`), so this is now an additive change rather than a rewrite.
2. **The schemas are enforced, but nobody can edit one.** A node's `validator` is now read, parsed and applied
   before output is delivered (§4.9.1, §5.8) — the dangling pointer Q1 complained about is gone, and so is
   `validateOutput`, which could not fail. What is still missing is authoring: the four `ROLE_SCHEMAS` in
   `state.ts` are the only schemas in existence, `seedWorkspace` copies them into the canvas, and
   `saveRoleFromNode` re-derives a node's schema from its `required_fields` — so a user who wants bounds on their
   own role edits JSON in `library/schemas/` with an outside editor (which works: the file is the interface, and
   hydrate picks it up). The UI gap is a schema editor in the inspector, or at minimum "validate this node's last
   output against this file" next to `contractSelfTest`. Until then, `validator: null` is a real opt-out and the
   only field of `output_contract` a node can set to *weaken* the contract deliberately.
3. **Snapshots store the full graph per step, unbounded**, and `restoreSnapshot` restores the graph only. A long run
   = many near-duplicate JSON files. Next: `{node_id: patch}` deltas + keep-last-N with pinned manual checkpoints.
   Pairs with Q3/Q6, both now decided: positions live only in node files, so a snapshot's graph is a diff of
   text the node files already contain — the delta idea got cheaper, and is still not done.
4. **`apiKey` is in `localStorage` and the browser calls the provider directly** (the key leaks to anyone who gets
   script in — which is why Law 2 is not optional). The honest phase-2 shape is a thin proxy that holds the key.
   Do **not** reuse `HttpStorageAdapter` for it: that adapter is file I/O against a storage backend, not an LLM
   gateway — a proxy needs a new contract of its own (`POST /api/llm`, provider+key server-side, no canvas
   semantics). Until then the settings panel must keep naming where the key lives.
5. `defaultSettings()` in `state.ts` reads `localStorage["lc-settings"]`. The I/O itself is now a **named** seam of
   Law 4 (reader-scoped settings, ADR-006), which is the fix the earlier draft of this entry asked for — the debt
   that remains is that the same factory also *normalises* what it finds (an unknown theme id, a truthy-but-not-true
   `snapToGrid`). Data-shaping in a state factory is fine while it has one caller; a second caller means the
   normalisation moves into `core` where it can be tested apart from the browser.
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
   Node text can now be edited without reaching the inspector, but it still takes a **mouse** (double-click) — the
   keyboard path is the same missing feature it was, and `Tab` does not reach the canvas.

---

# 10. Next ring — open questions for the design partner

These are the decisions that change the shape of the thing, so they should be made out loud, in this
document, before the code moves. My recommendation is attached to each; the ones marked ⚑ are the ones I
would not start phase 2 without.

⚑ **Q1 — Where does the file contract become load-bearing?** *Answered and built (structure `1.4`)*: the canvas
**is** an orchestrator, because it runs a non-deterministic tool and then routes the result. (a) — soft
validation and a decorative `validator` string — was the state of the code, and it is the option that makes the
contract a lie: an agent whose output shape nobody checks is not an agent with a contract. So: `library/schemas/<role>.schema.json`
inside the canvas (Law 1 — the folder holds everything the canvas needs, and a hand-made vault can ship its own
roles), written by the seed, re-derived by `saveRoleFromNode`, and applied by `validateAgainstContract` *before*
a byte is delivered. An output that fails schema stops the run, names its reason in the log, the ledger and the
node card, and writes nothing into `outputs/`. `validateOutput` is deleted, not kept as a fallback. The remaining
gap is authoring, not enforcement — §9.2.

⚑ **Q2 — One canvas per folder, or many?** `FsAccessStorageAdapter` maps `canvases/<id>/` → the picked
folder root, i.e. the picked folder **is** one canvas. That is right for a Git repo per project, wrong for an
Obsidian vault. If vaults matter, the adapter should keep the `canvases/<id>/` prefix and the picker should
accept the *vault root* (a `pickMany` mode). This is a 30-line change now and a migration later — decide
before anyone has a vault with three canvases.

⚑ **Q3 — `graph.json`/`state.json`: cache or crutch?** *Answered and built*: `graph.json` is **deleted** and
`state.json` stays a cache. `position` was the only field it held that a node file did not already carry, and a
node file carries position now — so the "one source of truth" argument stopped being an argument and became a
deletion: `writeCore` writes one file, `hydrate` has one branch (no override rule left to remember, §5.2),
`applyImport` drops one from an older bundle, and the file tree says `state.json (cache)` instead of offering a
second graph to click. Cost measured: a boot that lists `nodes/*.md`; the seed's 19 files hydrate in single-digit
milliseconds, and if a few hundred nodes ever makes that slow the answer is a derived index that is *rebuilt*,
never a second truth.

**Q4 — How far should `core.ts` stay one file?** 1212 lines holding types, YAML, HTML safety, the output-schema subset and four
adapters. It is honest today (one place where file shapes are decided) and it will hurt at ~1.5k. Natural
split when it does: `types.ts` (no imports), `yaml.ts`, `html.ts`, `storage/*.ts`. Law 5 keeps the edges
acyclic either way. Do it when adding the fifth adapter, not before.

**Q5 — Does the run need its own ledger file?** *Answered and built*: `runs/<run-id>.md`, one row per step
(§4.13), because `logs/<node>/<date>.log` is per-node and cannot answer "what did this run do, in order, and what
refused it". It is append-only text written through the adapter, so it survives a crash mid-run and shows up in
`git diff`. Not yet in it: model name, token counts, latency — the row schema has a `detail` column free for them
when function calling lands (§9.1). If you want a different table shape, change `LEDGER_HEADER`, nothing else.

**Q6 — Is `hydrate`'s "file overrides cache" rule right for geometry too?** *Answered by Q3*: there is nothing to
override any more. Geometry, title, body and prompt all come from `nodes/<id>.md`, and the rule itself was
deleted with the cache — a reader who arrives here looking for the precedence rule should not find one.

Done since this document was written: ~~(1) gate every tool by the contract~~, ~~(2) `runs/<run-id>.md`~~,
~~(3) hard schema validation (Q1)~~, ~~(4) delete `graph.json` (Q3)~~.
Q2 (one canvas per folder, or a vault with many) is the only ⚑ left unanswered, and it is a 30-line change in
`fs-access.ts` + the picker — deliberately not bundled with this pass, because it changes what "attach a folder"
means to a user mid-flight.
Still in order: (a) function calling — the executor hands `TOOL_NAMES` to the provider and
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
| §4 | graph JSON schema | §4.1 + §4.2 (the tree and the node file replaced it — `graph.json` is gone, §4.11) |
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
| **machine cache** | `state.json`. Never authoritative, and there is only one of it since `1.4`. |
| **contract** | `ContextContract` — the read/write path allow-list plus the output shape (`required_fields` + `validator`). Enforced on reads *and* writes, enforced on output, self-testable. A contract with no schema behind it is not a contract. |
| **run** | one execution of the queue, identified by `run_id`; owners of node locks are `run_id`s. |
| **hydrate** | rebuild `AppState` from files (possibly only files). Idempotent; safe to call again. |
| **bundle** | the `.livingcanvas.json` export envelope (§4.10). |
| **live folder mode** | the storage adapter writes into a user-picked directory, and the File Tree shows that directory. |
| **schema file** | `library/schemas/<role>.schema.json` — the JSON Schema subset a node's output is validated against (§4.9.1). A file, so an outside editor can tighten it. |

## 11.3 Commands

```
npm run dev         vite, 0.0.0.0:3000 (allowedHosts: true)
npm test            vitest run            → 13 files / 178 tests
npm run test:watch
npm run typecheck   tsc --noEmit  (noUnusedLocals is ON — dead code fails)
npm run build       tsc --noEmit && vite build → ~540 kB js / 166 kB gzip, 70 kB css / 12 kB gzip (chunk ceiling 600)
node scripts/check-english.mjs   language gate: RTL script only outside docs/; invisible bidi chars anywhere
node scripts/doc-anchors.mjs     rewrites the `name 412` line anchors in §3.4 from src/lib/engine.ts (--check = exit 1)
node scripts/check-docs.mjs      the doc map's gate: frontmatter, legal statuses, every reference resolving
node scripts/check-palette.mjs   the appearance gate: theme registry, WCAG contrast per theme, no colour literals
                                 outside the token blocks in src/index.css or in src/components/*.tsx
node scripts/check-facts.mjs     regenerates every count the prose quotes (--check = exit 1 on a stale number)
```

Those checks are what CI runs, on `push`/`pull_request` for `main` and `arena/**` — including the anchor and
facts gates, because a reference document is only worth having if nothing can quietly make it wrong.

**CI is defined but not active.** The definition is `ci/github-actions.yml`; `.github/workflows/ci.yml` does not
exist in the repository, because the remote refuses to accept it from this connection:

```
! [remote rejected] arena/01a061ef-living-canvas (refusing to allow a GitHub App to create or
   update workflow `.github/workflows/ci.yml` without `workflows` permission)
```

Writing the file locally succeeds — the block is on the push, not on the filesystem, which is how it can look
solved from inside the sandbox and not be. One human commit activates it:
`cp ci/github-actions.yml .github/workflows/ci.yml && git add .github && git commit`. The workflow's last step
then diffs the two copies so they cannot drift apart afterwards.

Until it lands there is no automation guarding `main`, and the cost is not hypothetical: eight counts in this
document and in the README had already gone stale. `scripts/check-facts.mjs` generates them now, so the failure
mode is closed even while the runner is not.

No lint step and no formatter config (§9.9) — adding
one is a decision, not a cleanup, because it would reformat 9.3k lines in one commit. If you add one, match the four
conventions already in use: double quotes, semicolons, 2-space indent, ~120 column soft limit, `/* */` section
banners inside long files.

## 11.4 Who writes what (the `docs/` map)

This document answers *how*; it deliberately does not answer *why* or *when*, and that is not a gap — it is the
split that keeps a reference usable by someone who cannot read the code:

| question | home | rule |
|---|---|---|
| how does it work? | **here** | the only place a mechanism is written |
| why was it decided? | `docs/decisions/adr-0NN-….md` | ≤ 40 lines, `proposed` / `accepted` / `superseded`, no mechanism restated |
| what should we build next, and what is missing today? | `docs/patterns/` | a proposal must name the code or test it touches |
| when? | `docs/roadmap/phase-N.md` | the sole owner of scheduling; `- [x]` requires a test file |
| what did the research say? | `docs/research/summaries/` | dated, sourced, and evidence rather than a spec |
| what is not decided? | `docs/notes/ideas.md` | ideas, costs, and no decision language |
| what must it look like? | `docs/ui-spec.md` | one row per claim: value + storage + status; never the mechanism |
| where does this go? | `docs/inbox.md` | anything with no home, ranked by the cost of not answering |

The map with the full rules is `docs/README.md`; the gate that keeps it honest is `scripts/check-docs.mjs`, which
resolves every path, symbol and section anchor a document cites, refuses a shipped claim with no test behind it,
and bans a `phase` field outside the roadmap. It exists because a folder of prose about code, written by readers
without code access, is exactly the shape of artifact that rots silently — and a stale doc is worse than none,
since it is believed.
