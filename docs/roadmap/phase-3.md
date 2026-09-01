---
title: Phase 3 — depth, blocked on an unanswered question
status: parked
updated: 2026-09-01
sources: [docs/notes/ideas.md#product-identity, docs/research/summaries/game-mechanics.md]
---

# Phase 3 — nothing scheduled, and that is the honest state

Every candidate in this directory is a consequence of a question nobody has answered: is Living Canvas a
file-first **orchestrator** for agent pipelines, or a **recorder of agent lives**? The two imply different phase
3s, and writing one now would pick a side through a filename. So this file holds the *shape* of each option and
no commitments — a roadmap row that predates its decision is how a project ends up building a feature for a
document instead of a user.

## If the answer is "orchestrator"

Phase 3 is about trust and throughput, not depth per agent: parallel execution of independent branches, a real
retry/continue-after-refusal policy, multi-canvas workspaces, and provider breadth beyond DeepSeek. Memory stays
one document per agent, because for a pipeline that is sufficient — and sufficient beats rich when the rich
version has no reader.

## If the answer is "life recorder"

Then history is the artifact and the graph is a debugger, and the following become the product rather than
features:

- memory layering beyond `memory/agents/<id>.md` — short-term / long-term / core needs a file shape, a
  consolidation trigger, and a rule for what a run may read. None of the three is free, and all three are format
  changes (`docs/ARCHITECTURE.md#4.4`).
- a diary view over artifacts the app already writes — cheap, and it is the argument for the whole direction,
  because it is the one thing a user would *use daily*.
- relationships and personality evolution — needs a stable agent identity across runs. Today an agent *is* a
  node: delete the node, delete the history (`src/lib/engine.ts#deleteNode`). That is the deepest change in this
  document, and it is why "agent life" cannot be a phase-3 bolt-on.
- `runs/` stops being an audit and becomes a narrative source, which forces the pruning question in
  `docs/ARCHITECTURE.md#9` (wound 3) to be answered *now* rather than eventually.

## What unblocks this file

One paragraph from the owner of the product, in `docs/decisions/` as ADR-001. Until it exists, the correct move
is to keep phase 1's promises true and phase 2's cheap items done — both of which pay out under either answer,
which is the only kind of work worth doing while a question is open.
