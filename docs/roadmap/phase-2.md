---
title: Phase 2 — the model chooses, the UI explains
status: active
updated: 2026-09-02
sources: [docs/ARCHITECTURE.md#9, docs/patterns/human-in-the-loop.md, docs/patterns/conditional-edges.md, scripts/check-palette.mjs, src/lib/__tests__/store-write.test.ts]
---

# Phase 2 — candidates, ordered by what they unblock

Nothing here is `accepted`; `docs/decisions/` is where a candidate becomes a commitment. Rows are ordered by
"what does this make possible", not by size.

- [x] **Function calling.** Hand `TOOL_NAMES` to the provider as JSON-schema tools and loop on the calls the
  model returns, instead of walking a fixed six-step script. Additive rather than a rewrite because the gate
  (`src/lib/engine.ts#hasTool`) and the refusal paths already exist — the model gets to choose *which* permitted
  step runs, never whether the checks apply. Guard: `docs/decisions/adr-022-function-calling-loop-and-canvas-tools.md`. Source: `docs/ARCHITECTURE.md#9` (wound 1).
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
  is the argument, and doing undo separately from it would be two mechanisms for one problem. Any undo here must
  carry tldraw's one good idea (`docs/inbox.md`): only `source: "user"` mutations enter the stack, or Ctrl+Z starts
  erasing what the executor wrote.

## Shipped while this phase was open

These were not candidates here — they were found by reading two behaviour matrices (Excalidraw, tldraw) against
this code, and each was small enough that holding it for a phase would have meant shipping a known hole. `- [x]`
means guarded, so every row names its test.

- [x] `Delete` on a node deletes `nodes/<id>.md` and cascades its edges, instead of resurrecting itself on reload
  (`store-write.test.ts`)
- [x] a drag end writes `position` into the node file; a drag in progress writes nothing (`store-write.test.ts`)
- [x] a save is flushed when the tab hides, so the 700 ms window cannot swallow the last edit
  (`docs/ARCHITECTURE.md#11.3` and the listener in `src/App.tsx`)
- [x] appearance is themeable at all: `data-theme` before first paint, colour literals confined to the token
  blocks, contrast measured per theme (`scripts/check-palette.mjs`, `theme.test.ts`)
- [x] dark-plum theme shipped as a token re-mapping, on the owner's ruling (`docs/decisions/adr-006-theme-is-device-scoped.md`)
- [x] grid snapping as an opt-in setting, tied to the dot pitch (`src/lib/core.ts#GRID_GAP`)
- [x] node text edited on the canvas, with `mdInline` still the only render door (`LcNode` in `src/components/CanvasArea.tsx`)

## Not in this phase, on purpose

Overlay modes, LOD, canvas/WebGL rendering, needs/stress/personality, visual logic gates. Each is either waiting
on a measurement we do not have or on the identity question
(`docs/notes/ideas.md`, `docs/roadmap/phase-3.md`) — and "in a later phase" is not the same as "planned".
