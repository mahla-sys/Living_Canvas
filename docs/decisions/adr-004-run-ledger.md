---
title: Every run writes an append-only ledger
status: accepted
updated: 2026-09-01
sources: [src/lib/engine.ts#startLedger, src/lib/engine.ts#ledgerRow, src/lib/engine.ts#endLedger, src/lib/engine.ts#loadRunIds, docs/ARCHITECTURE.md#4.13, src/lib/__tests__/execution.test.ts]
---

# ADR-004 — a run is a moment; what it did is data

## Context

`logs/<node>/<date>.log` answers "what happened to this node". It cannot answer "in what order did this run
touch tools, and which of them refused" — the question a pipeline asks the morning something went wrong, and the
only question an outside reader (`git diff`, a crash mid-run, a design partner with no code access) can check
without running the app.

## Decision

One file per run — `runs/<run-id>.md` — written through the storage adapter as the run goes: frontmatter, a
table header, one row per step, a closing status line. Refusals are rows too: `denied` (the contract or `tools`
said no), `blocked` (a condition stopped the hop), `rejected` (validation refused the output), `failed`. Nothing
is quietly skipped, which is the entire difference between a log and an audit.

## Why a file, and not state or a database

Per-node logs are capped and sharded by node; `state.json` is a cache and gets overwritten; and the ledger's
value is that it outlives the session that produced it. Write-through-the-adapter means folder mode puts a real
file on disk, and read-modify-write append means a reload extends the same file instead of replacing it — which
is what makes it safe to write *during* execution rather than at the end.

## Consequences

- `runs/` is exported and cloned, and `hydrate` ignores it: a canvas rebuilds with `runs/` deleted (tested).
- The file tree lists it (`src/lib/engine.ts#loadRunIds` → `state.runs`), because an audit nobody can open is
  just a second log.
- Rows cap at 300 and there is no pruning policy — the same open problem as snapshots
  (`docs/ARCHITECTURE.md#9`, wound 3). Solve them together.
- The row format is `docs/ARCHITECTURE.md#4.13`. If the table shape is ever disputed, `LEDGER_HEADER` is the
  only thing to change; that is deliberate, and it is why this file does not restate the columns.
