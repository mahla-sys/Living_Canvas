---
title: Approval pauses should carry a sentence, not a click
status: proposed
updated: 2026-09-01
sources: [src/lib/engine.ts#resumeRun, src/lib/engine.ts#rejectRun, src/lib/engine.ts#sendChat, src/lib/core.ts#memoryToMd, docs/ARCHITECTURE.md#5.8]
---

# Human-in-the-loop: from a button to a note

## What exists

An agent node may set `require_approval`; the run stops with `execution.status = "waiting_approval"`, the canvas
paints a banner, and the user either `resumeRun` or `rejectRun`. The node keeps its lock while waiting, and a
reload that finds a half-finished run normalises it to `idle` instead of resuming it (Law 3). That is a
correct, minimal gate and it is tested.

## The gap

A binary answer throws away the only human judgement in the pipeline. The user *sees* why they are approving —
and the run's next node never learns it. Meanwhile the memory layer is already shaped for exactly this:
`memory/agents/<id>.md` is a Markdown document with `confidence` and a source
(`src/lib/core.ts#memoryToMd`), and the next agent reads it as part of its granted paths.

## Proposal

At the pause, offer a one-line note with two buttons: "continue" and "continue with this correction". The note is
written into the approving node's agent memory as a line with `source: user` at high confidence, and recorded in
the run ledger (`resume` / `resume_with_note` / `reject`, with the note in the `detail` column). No new file
type, no new state, no new storage shape: a user line into a document the app already writes, and one row.

Why high confidence: `MemoryManager.write` keeps the older entry unless the incoming one is strictly more
confident, and a human correction outranks an agent's own note by definition.

## Deliberately not here

- **Multi-stage approval queues.** Chained `require_approval` nodes already work; a queue UI implies a
  scheduler, which implies a run that survives a reload — and the run does not, by Law 3.
- **Undo after a wrong approval.** `history/snapshot-*.json` + `restoreSnapshot` already answer this. Say
  "restore the checkpoint", do not invent a second mechanism whose semantics are the same.
- **Editing the output before continuing.** Tempting, wrong order: an edited output must pass the contract like
  anything else, and the run's ledger must not contain a row that lies about who produced it.
