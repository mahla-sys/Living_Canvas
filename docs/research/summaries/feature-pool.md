---
title: Feature pool — every idea raised, with its guard or its absence
status: living
updated: 2026-09-01
sources: [src/lib/__tests__/execution.test.ts, src/lib/__tests__/schema.test.ts, docs/ARCHITECTURE.md#2]
---

# Feature pool

One table, one row per capability anyone has proposed. The last column is the point of the file: **`pinned by`
names the test file or doc that proves the claim, and a row with no guard is not `done`, it is `idea`.** That
rule exists because an earlier draft of this table marked three things `done` that were not (node resize,
parallel execution, and a `graph.json` behaviour that had just been deleted).

Statuses: `done` (shipped + guarded) · `partial` (a piece exists, the row's claim does not) · `idea` · `no`.

## 1. Node interaction

| capability | source | status | pinned by |
|---|---|---|---|
| drag to move, select | React Flow | done | `src/components/CanvasArea.tsx#LcNode` |
| connect by dragging a handle | React Flow, Excalidraw | done | `docs/ARCHITECTURE.md#5.4` |
| view modes dot / name / card / markdown | own design | done | `docs/ARCHITECTURE.md#6` |
| resize a node | React Flow | idea | — (no `NodeResizer`; widths are hard-coded) |
| multi-select + group move | tldraw, Figma | idea | — |
| snap to grid | Excalidraw, tldraw | idea | — |
| freehand → nodes (strokes) | own design | done | `docs/ARCHITECTURE.md#5` (clusterStrokes), `execution.test.ts` neighbours |
| file preview inside a node | Obsidian Canvas | idea | — |
| agent acts unprompted ("free will") | The Sims | idea | — (needs a scheduler; see `docs/notes/ideas.md`) |

## 2. Edges

| capability | status | pinned by |
|---|---|---|
| conditional edge, fail-closed | done | `execution.test.ts` |
| edge trigger `on_completed` / `manual` / `condition` | done | `src/state.ts#makeEdgeData`, `roundtrip.test.ts` |
| dashed/animated flow styling | done | `docs/ARCHITECTURE.md#4.3` |
| condition label on the edge | partial | the label exists; the condition is not rendered on the edge |
| thickness by data volume | idea | — |
| AND over multiple incoming conditions | idea | open issue: `docs/patterns/conditional-edges.md` |
| visual logic gates (AND/OR/THRESHOLD as nodes) | idea | `docs/notes/ideas.md` |

## 3. Navigation

| capability | status | pinned by |
|---|---|---|
| minimap, controls, dotted grid | done | `docs/ARCHITECTURE.md#6` |
| snapshot checkpoint per node | done | `docs/ARCHITECTURE.md#5.9` |
| manual checkpoint from TopBar | done | same |
| zoom-to-fit / "frame selection" | idea | — |
| real undo/redo (deltas) | idea | blocked on `docs/ARCHITECTURE.md#9` wound 3 |
| overlay modes (data / error / memory) | idea | `docs/notes/ideas.md` |

## 4. Style and theme

| capability | status | pinned by |
|---|---|---|
| tokens as Tailwind v4 `@theme` | done | `docs/ARCHITECTURE.md#6` |
| per-node colour, shape, animation, opacity | done | `src/lib/core.ts#nodeToMarkdown`, `roundtrip.test.ts` |
| status colour on the node | done | `src/components/CanvasArea.tsx#STATUS_LABEL` |
| user theme switching | idea | — |
| reusable style presets | idea | `docs/patterns/template-library.md` |

## 5. Inspector

| capability | status | pinned by |
|---|---|---|
| display, content, agent config, contract groups | done | `src/components/SidePanels.tsx#ContractGroup` |
| contract self-test button | done | `src/lib/engine.ts#contractSelfTest` |
| run ledger link, refusal text, `validator` visibility | idea | `docs/patterns/node-inspector.md` |
| agent diary | idea | `docs/roadmap/phase-3.md` |

## 6. Memory and history

| capability | status | pinned by |
|---|---|---|
| four shared docs + one per agent | done | `docs/ARCHITECTURE.md#4.4` |
| confidence-weighted conflict rule | done | `execution.test.ts` |
| read paths resolved against the real tree | done | `execution.test.ts` |
| run ledger, one file per run | done | `execution.test.ts`, `adr-004-run-ledger.md` |
| layering, consolidation, diary, legends | idea | `docs/research/summaries/game-mechanics.md` |

## 7. Execution

| capability | status | pinned by |
|---|---|---|
| topological order incl. diamonds and orphans | done | `execution.test.ts` |
| **parallel execution of branches** | idea | — the queue is serial; only the graph shape is parallel |
| per-node `max_steps` guard | done | `docs/ARCHITECTURE.md#3.4` (execution) |
| approval pause / resume / reject | done | `docs/ARCHITECTURE.md#5.8` |
| hard output validation | done | `schema.test.ts`, `adr-003-hard-output-validation.md` |
| refusal visible on the node card | done | `src/lib/engine.ts#setNodeError` |
| function calling (model picks the tool) | done | `docs/decisions/adr-022-function-calling-loop-and-canvas-tools.md` |
| task priority per node | idea | — |

## 8. Templates and roles

| capability | status | pinned by |
|---|---|---|
| subgraph template save/load | done | `hydrate.test.ts`, `roundtrip.test.ts` |
| role files incl. contract and schema | done | `docs/ARCHITECTURE.md#4.9`, `src/lib/engine.ts#saveRoleFromNode` |
| built-in demo template | `no` | deliberately removed: `docs/ARCHITECTURE.md#5.3` |
| layout-only template | idea | `docs/patterns/template-library.md` |

## 9. Performance

| capability | status | pinned by |
|---|---|---|
| debounced save, one promise chain, flush before export | done | `docs/ARCHITECTURE.md#5.4`, `#5.5` |
| cheap boot filter (node files only when possible) | done | `src/lib/engine.ts#hydrate` |
| culling / dual-layer / LOD / WebGL | idea | `docs/roadmap/phase-4.md` — no measurement yet |

## 10. Collaboration

| capability | status | pinned by |
|---|---|---|
| Git + Obsidian as the multi-writer story | done | `docs/ARCHITECTURE.md#0.2` |
| external-edit reload button | done | `docs/ARCHITECTURE.md#5.6` |
| file watcher with conflict hint | idea | `docs/notes/ideas.md` |
| CRDT / OT live editing | `no` for now | `docs/roadmap/phase-4.md` |

## Reading this file

It is an index of claims, not a backlog. A row becomes work when it gains a pattern doc or a decision doc, and
becomes finished when it gains a test name. Anything else is a wish with a table.
