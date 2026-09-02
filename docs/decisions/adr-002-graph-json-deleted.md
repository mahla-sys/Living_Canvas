---
title: graph.json is deleted, not deprecated
status: accepted
updated: 2026-09-01
sources: [src/lib/engine.ts#writeCore, src/lib/engine.ts#hydrate, docs/ARCHITECTURE.md#4.11, src/lib/__tests__/hydrate.test.ts]
---

# ADR-002 — one file per fact, including where a node sits

## Context

Structure 1.3 described the graph twice: `graph.json` (nodes, edges, positions, styles) and `nodes/*.md` (the
same data, in frontmatter and body). The app reconciled them with a rule — files win for title, content and
`system_prompt`, the cache wins for geometry. Two truths about one node, patched together by precedence, is how
"a prompt disappeared" and "a node moved" become support questions instead of bug reports: the answer depends on
which reader ran last.

## Decision

Delete the cache. `position` is node frontmatter and nothing else reads or writes geometry. `hydrate` has one
branch. The import path drops a legacy `graph.json` and emits why. `state.json` survives, scoped to what no
file expresses (execution, chats, logs, snapshot metadata), and the file tree labels it `(cache)`.

## Why deletion and not a better precedence rule

Every alternative was a bigger version of the thing that hurt: compare timestamps, add a "files are newer" flag,
write through on save. Each keeps the second truth and adds a rule for reconciling it — and reconciliation rules
are the part nobody tests. Removing the duplicate removed the rule, the failure mode, and the reader's question
in one move. The data was already in the file; only the cache's claim to be authoritative had to go.

## Consequences

- Boot lists `nodes/*.md`. Accepted cost; if it ever matters the answer is a *derived* index that gets rebuilt,
  never a second truth.
- A 1.3 folder still hydrates — the extra file is inert — and an imported bundle loses it loudly
  (`src/lib/__tests__/hydrate.test.ts` pins both halves).
- Snapshots get cheaper: a graph delta is now text the files already carry (`docs/ARCHITECTURE.md#9`, wound 3).
- Mechanism lives in `docs/ARCHITECTURE.md#4.1` (tree), `#5.2` (load path), `#4.11` (the cache's remit).

## Status of the argument

Closed. This was reversible, cheap and now a ratchet: the doc, the test and the file tree all describe one graph.
