---
title: Phase 4 — scale and collaboration, nothing decided
status: parked
updated: 2026-09-01
sources: [docs/research/summaries/feature-pool.md, docs/ARCHITECTURE.md#10, docs/decisions/adr-005-single-canvas-per-folder.md]
---

# Phase 4 — placeholders with reasons

No row here is a commitment. The file exists so that earlier phases know what "later" was supposed to protect,
and every row says `no decision yet` because that is the truth.

- [ ] Real-time collaboration (CRDT or OT). `no decision yet`, and the working position is **rejected for now**:
  the file substrate already gives multi-writer semantics through Git, and a CRDT over Markdown would be a second
  source of truth with a network layer attached — ADR-002 in a more expensive costume.
- [ ] Many canvases per folder. Do not park it here: this is `adr-005-single-canvas-per-folder.md`, and its cost
  curve says decide it in phase 2 or accept the vault limitation in writing. Deferring a decision to phase 4 is
  how a decision gets made by inertia.
- [ ] Renderer scale work — viewport culling, dual-layer canvas, LOD, WebGL edges. `no decision yet`, deferred
  deliberately: there is no measurement, and the suspected ceiling is the node card (Markdown, escapes, a live
  ring, per-node DOM) rather than the renderer (`docs/research/summaries/feature-pool.md` §9). Fix the card, then
  re-ask; a quadtree bought before the first slow canvas is a bug with extra steps.
- [ ] Active/passive agents, so a hundred agents do not mean a hundred model calls per tick. Depends on function
  calling existing first, because "who runs now" is meaningless while the executor decides.
- [ ] `HttpStorageAdapter` against a real backend. The client half is built and idle; the server is a deployment
  decision, not a task, and `docs/ARCHITECTURE.md#8` says do not smuggle one in to make a test easier.
- [ ] Provider breadth beyond DeepSeek (reusing `settings.provider` / `MODELS` rather than inventing a second key
  field) — `no decision yet`; the first person who needs it should bring the provider, not a request.

## If phase 3 stays parked

Most of this file is unnecessary, which is the point of writing it as six lines of intent instead of a schedule:
`docs/roadmap/phase-3.md` says what has to be answered first, and a phase that assumes that answer is a phase
that will be rewritten.
