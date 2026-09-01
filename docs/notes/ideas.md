---
title: Ideas — not decisions, with their costs attached
status: active
updated: 2026-09-01
sources: [docs/research/summaries/feature-pool.md, docs/research/summaries/game-mechanics.md, docs/research/summaries/ui-patterns.md]
---

# Ideas

Nothing in this file is a decision, and it must not be quoted as one. An idea graduates by getting a *pattern*
doc (if it needs design), a *decision* doc (if the owner commits), and a test (if it ships). Costs are attached
because an idea without a cost is a wish.

Append; do not tidy. A cleaned-up ideas file has usually had its reasons edited out.

## product-identity

**Is Living Canvas a file-first orchestrator for agent pipelines, or a recorder of agent lives?** Pulled out of
`docs/research/summaries/game-mechanics.md` (Dwarf Fortress, The Sims, CK3) and written up as `accepted` in a
draft ADR; moved here because the owner has not ruled and a document cannot launder a decision by asserting one.

- **Orchestrator** (what the code says): the artifact is the graph and its validated outputs; memory is one
  private document per agent, which is enough for a pipeline to work.
- **Life recorder** (what the research pulls toward): the artifact is the agent's history; layering, needs,
  stress, relationships and a diary are the product and the graph is a debugger.
- **What the answer changes:** all of `docs/roadmap/phase-3.md`; whether `confidence` grows into a memory model
  or stays a number; whether `runs/` is an audit or a narrative source; whether a canvas folder is a project or a
  character file.
- **Cost of deciding now:** one ADR and a naming pass. **Cost of not deciding:** every future proposal gets
  argued from both sides at once — which is what a single "accepted" paragraph achieved in one message.

## parked: UI and interaction

- **Pie menu for quick actions** (The Sims, `ui-patterns.md` §6) — cheap and pleasant; competes with the
  inspector for the same clicks, so park until the inspector demonstrably cannot reach something.
- **Overlay modes** — data / error / memory / performance views (Oxygen Not Included, `ui-patterns.md` §3).
  Genuinely good idea, but "performance" implies a measurement we do not have and "memory" implies phase 3.
- **Zoom-dependent detail** already exists as view modes (`dot` vs `card`); a *continuous* LOD does not, and
  should not until a canvas is slow for the wrong reason.
- **Alert/notification centre** (Stellaris situation log, `ui-patterns.md` §5) — toasts plus the console are
  today's answer; a persisted alert list is a new file, so it needs a decision, not a component.
- **Colonist bar** — an agent status strip (RimWorld, `ui-patterns.md` §2). Small, and the first thing worth
  building if identity lands on "life recorder", because it is history made glanceable.

## parked: simulation depth

- **Needs, stress, personality evolution** (`game-mechanics.md` §2-§4) — each one needs a stable agent identity
  across runs. Today an agent is a node: delete the node, delete the history. This is a data-model change, not a
  feature toggle.
- **Memory layering / auto-consolidation** (`game-mechanics.md` §1) — needs a file shape and a rule for what a
  run may read; every layer is a new document in the tree, which is the expensive part, not the algorithm.
- **Relationships beyond data edges** (`game-mechanics.md` §5) — would live on edges or on a new file; either way
  it changes what an edge *means*, and edges are currently "a data-flow hop with an optional guard".
- **Legends / timeline view** (`game-mechanics.md` §8) — the cheapest depth item, because `runs/` already holds
  the rows. Blocked on pruning (wound 3): a timeline over an unbounded pile of capped ledgers is a nice way to
  fill a disk.
- **Seeded procedural start** (`game-mechanics.md` §9) — a seed for the initial canvas: fine, but see "demo
  pipeline" below before any "generate something for the user" idea passes this file.

## parked: rejected once, so the reasoning is on record

- **Ship a demo pipeline / built-in template.** Rejected in structure 1.4: a fresh canvas that is a screenshot of
  a test makes the fabrication the product (`docs/ARCHITECTURE.md#5.3`). An onboarding flow is a template in
  `library/templates/`, saved by a human.
- **Node resize handles.** Claimed "done" in a research table; there is no `NodeResizer` and card widths are
  hard-coded. It is a real gap for dense graphs, but sizes belong in the node file, which is a format change
  (`docs/ARCHITECTURE.md#4.2`), not a CSS patch.
- **"Parallel execution: done".** Kahn gives a topological *order*; the queue runs one node at a time. The
  distinction matters because `parallel branches are supported` (true, as a graph shape) and `parallel execution`
  (false) are different rows in a table nobody re-reads.
- **`excludeRuntime` / proprietary sidecar folder.** Still a non-goal (`docs/ARCHITECTURE.md#8`).
- **A second, prettier markdown path** for the node body. One renderer, escaped, tested
  (`src/lib/core.ts#mdInline`); Law 2 exists because the second one always forgets an escape.
