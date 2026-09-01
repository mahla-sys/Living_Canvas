---
title: Phase 2 — the model chooses, the UI explains
status: active
updated: 2026-09-01
sources: [docs/ARCHITECTURE.md#9, docs/patterns/human-in-the-loop.md, docs/patterns/conditional-edges.md]
---

# Phase 2 — candidates, ordered by what they unblock

Nothing here is `accepted`; `docs/decisions/` is where a candidate becomes a commitment. Rows are ordered by
"what does this make possible", not by size.

- [ ] **Function calling.** Hand `TOOL_NAMES` to the provider as JSON-schema tools and loop on the calls the
  model returns, instead of walking a fixed six-step script. Additive rather than a rewrite because the gate
  (`src/lib/engine.ts#hasTool`) and the refusal paths already exist — the model gets to choose *which* permitted
  step runs, never whether the checks apply. Source: `docs/ARCHITECTURE.md#9` (wound 1).
- [ ] **Conditional-edge aggregation.** Decide multi-input semantics before anyone asks for `and`/`or`: today the
  first matching edge decides and the second is invisible. Source: `docs/patterns/conditional-edges.md`.
- [ ] **Ledger gains model-side numbers** — model name, tokens, latency in the `detail` column. *Blocked by
  function calling*: until the model drives the steps, those figures describe our script, not its behaviour.
- [ ] **Structured approval notes** — a sentence at the pause, written into the agent's memory and the ledger.
  Source: `docs/patterns/human-in-the-loop.md`. No new storage shape, which is why it is early.
- [ ] **Inspector links, not sections** — run ledger, refusal text, `validator` path and whether it resolves.
  Source: `docs/patterns/node-inspector.md`.
- [ ] **Schema authoring** — an editor affordance for `library/schemas/`, or at minimum "validate this node's
  last output against this file" beside `contractSelfTest`. Enforcement exists; making it *usable* does not
  (`docs/ARCHITECTURE.md#9`, wound 2).
- [ ] **`adr-005` ruling** — one canvas per folder, or a vault with many. Thirty lines now, a migration later;
  this is the only row that gets more expensive by being done well-lated rather than early.
- [ ] **Keep the docs gated** — `scripts/check-docs.mjs` is phase-2 work, not housekeeping: a doc folder is only
  trustworthy for a reader without code access if a machine checks its references. If nobody uses the gate in a
  month, delete the gate rather than let it rot into a warning.
- [ ] **Delta snapshots + keep-last-N** — shared by runs/, history/ and undo; `docs/ARCHITECTURE.md#9` (wound 3)
  is the argument, and doing undo separately from it would be two mechanisms for one problem.

## Not in this phase, on purpose

Overlay modes, LOD, canvas/WebGL rendering, needs/stress/personality, visual logic gates. Each is either waiting
on a measurement we do not have or on the identity question
(`docs/notes/ideas.md`, `docs/roadmap/phase-3.md`) — and "in a later phase" is not the same as "planned".
