---
title: Conditional edges — one edge decides a hop, and that is a bug
status: open-issue
updated: 2026-09-01
sources: [src/lib/engine.ts#processQueue, src/lib/engine.ts#evalCondition, src/lib/__tests__/execution.test.ts, docs/ARCHITECTURE.md#5.8]
---

# Conditional edges: what is decided per hop, not per node

## What the code does today

`src/lib/engine.ts#processQueue` evaluates a condition on **the single edge from the node that just ran to the
node about to run** (`edges.find(e => e.source === prev && e.target === next)`). Evaluation is fail-closed and
the reason is logged, both of which are right and tested
(`src/lib/__tests__/execution.test.ts`, "blocks the edge when the condition cannot be evaluated at all").

Two consequences nobody wrote down:

- A node with **two incoming conditional edges** is judged by whichever `find` returns first. The second
  condition is not false, not true, not reported: it is invisible. Fan-in from two evaluated predecessors
  therefore has no aggregation rule at all — no AND, no OR.
- Fan-*out* works per hop (each outgoing edge is consulted on its own hop), so "one node, two guarded
  branches" is already fine. The gap is exclusively on the input side.

## Why this is a pattern doc and not a phase row

The fix is a decision about meaning, and someone has to own it:

1. **Document the single-edge rule** ("a condition guards a hop") and reject a second conditional edge into the
   same node with a validation event. Cheapest, honest, and it makes the silent case loud.
2. **AND over incoming conditions** — evaluate every conditional edge into the node, all must pass. ~15 lines
   plus a test; matches how a join usually means "both inputs are ready *and* acceptable".
3. **OR / boolean grammar** — no. `evalCondition` is small because it is one comparison; a grammar for
   `and/or/not` turns a guard into a language, and a language needs an editor, errors that point at a column,
   and a spec. If OR is ever needed it is a node, not an operator.

## Recommendation

(2), with (1) as the failure message: `multiple conditional edges into <node> — all must hold`. Gate it with a
test that first pins today's behaviour, so the change is visible as a change.

## Not in this doc

Visual gate nodes (AND/OR/THRESHOLD as shapes the user wires), suggested by the research
(`docs/research/summaries/feature-pool.md` §2). That is a second language on the canvas; it stays an idea
(`docs/notes/ideas.md`) until there is a pipeline that needs it and cannot say so with node-level conditions.
