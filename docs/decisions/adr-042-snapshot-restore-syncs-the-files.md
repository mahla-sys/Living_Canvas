---
title: A snapshot restore syncs the node and edge files on disk
status: accepted
updated: 2026-09-24
sources: [src/lib/engine.ts#syncGraphFiles, src/lib/__tests__/snapshot-restore.test.ts]
---

## Context
`hydrate` rebuilds the canvas from the files — the files are the truth. `restoreSnapshot` changed
state and touched the core files, but never rewrote `nodes/*.md` or `edges/*.yaml`. A rollback that
did not reach the files was a rollback that evaporated: the next reload resurrected the
pre-rollback graph. Zero tests covered restore.

## Decision
After restoring the state, `syncGraphFiles` rewrites every node and edge file from the restored
graph and deletes the node/edge files the restored graph no longer owns. Only `nodes/` and
`edges/` are touched: memory, outputs, chats, logs, runs and history survive a rollback, because
they are the record of what happened, not the shape of now. A restore also aborts the in-flight
node (ADR-045), because its output would belong to a timeline that no longer exists.

## Why
The whole point of the file-first design is that a reader can open the folder after a reload and
see the canvas they left. A state-only rollback breaks that contract silently, on the very next
visit. Destructive sync is scoped to the two directories that *are* the graph; the record is
sacred and stays.

## Consequences
A restored canvas is durable across reload — `snapshot-restore.test.ts` asserts the added node's
file is gone, the edited body is undone, and the memory/output/chat/log files survive. The
unbounded full-graph snapshots themselves remain open debt (ARCHITECTURE.md §9), now that restore
is at least honest about what it does.
