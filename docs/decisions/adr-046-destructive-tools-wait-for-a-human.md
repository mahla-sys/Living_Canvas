---
title: Destructive canvas tools wait for a human
status: accepted
updated: 2026-09-24
sources: [src/lib/engine.ts#awaitToolApproval, src/lib/engine.ts#settleToolApproval, src/lib/__tests__/tool-approval.test.ts]
---

## Context
The `manager` role can read the whole canvas into its prompt and holds `delete_node`/`delete_edge`
with full write grants. `require_approval` is node-level, so a destructive tool call inside an
autonomous run had no human gate at all. A shared canvas — a live folder, an imported bundle, a
note someone else wrote — could talk a model into deleting the graph.

## Decision
`delete_node` and `delete_edge`, when executed as part of an autonomous run, pause it on
`waiting_approval` and resolve through `settleToolApproval`: Approve deletes and continues,
Reject denies that one tool (the run continues — the model sees the denial and adapts), Stop
cancels the run. The gate keys on the tool context's presence: a direct call is already
human-driven and proceeds. One question at a time — a run is single-threaded.

## Why
The permission model already exists; what was missing was a human between the most destructive
tools and a run that started itself. Reusing the existing approval UI and the run's
pause/resume/stop wiring means the concept of "this needs you" has one face, not two.

## Consequences
`tool-approval.test.ts` covers all three answers on both the single-node and the pipeline path.
The pause is recorded in the ledger (`status: approval`). A prompt-injected canvas can now at most
*ask*; it cannot *do* a deletion.
