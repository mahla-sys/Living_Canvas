---
title: Phase 1 — file substrate, contract, executor, ledger
status: shipped
updated: 2026-09-02
sources: [docs/ARCHITECTURE.md#0.2, docs/decisions/README.md]
---

# Phase 1 — closed

Everything below is shipped and guarded; the citation in parentheses is what fails if it regresses. Verification
is `npx vitest run` (178 tests in 13 files) plus the five repository gates (`scripts/check-english.mjs`,
`scripts/check-docs.mjs`, `scripts/check-palette.mjs`, `scripts/doc-anchors.mjs`, `scripts/check-facts.mjs`),
which is exactly what `.github/workflows/ci.yml` runs.

- [x] files are the substrate, `state.json` is only a cache (`roundtrip.test.ts`, `hydrate.test.ts`)
- [x] `graph.json` deleted — one source of truth for geometry and graph (`hydrate.test.ts`, `adr-002-graph-json-deleted.md`)
- [x] the node file carries its own `position` (`roundtrip.test.ts`)
- [x] escape before render; only `strong`, `em`, `code` survive (`storage.test.ts`, `portable.test.ts`)
- [x] one `StorageAdapter`, four implementations, swappable at runtime (`storage.test.ts`, `fs-access.test.ts`)
- [x] folder attach: writes land on disk, structure created when missing (`fs-access.test.ts`)
- [x] export is the file tree; import is "write files, then hydrate" (`roundtrip.test.ts`, `portable.test.ts`)
- [x] context contract enforced on reads and writes, fail-closed (`execution.test.ts`)
- [x] output contract enforced against real schema files (`schema.test.ts`, `adr-003-hard-output-validation.md`)
- [x] conditional edges fail closed; numeric scope lifted from output fields (`execution.test.ts`)
- [x] `computeOrder`: Kahn, diamonds, disconnected nodes, cycles reported not dropped (`execution.test.ts`)
- [x] per-run ledger, surfaced in the file tree (`execution.test.ts`, `adr-004-run-ledger.md`)
- [x] a refusal is visible on the node card (`src/lib/engine.ts#setNodeError`)
- [x] a fresh canvas is structure, not a demo pipeline (`hydrate.test.ts`, `docs/ARCHITECTURE.md#5.3`)
- [x] memory conflict rule: strictly-higher confidence wins, and says so (`execution.test.ts`)
- [x] chat is gated by `chat_with_user`, and the question is still recorded (`execution.test.ts`)
- [x] the language rule is a gate, not a habit: English in code/UI/tests, RTL confined to `docs/`, bidi controls nowhere (`scripts/check-english.mjs`)
- [x] CI definition complete, activation blocked on a `workflows` permission this branch does not have (`ci/github-actions.yml`)
- [x] line anchors in the architecture doc regenerate and are checked (`scripts/doc-anchors.mjs`)
- [x] dependencies: four runtime libraries, the unused ones pruned (`docs/ARCHITECTURE.md#2`)
- [x] counts quoted in the prose are generated, not retyped (`scripts/check-facts.mjs`)
- [x] `lc-settings` is a seam with three functions and no other reader or writer (`settings-local.test.ts`, `adr-007-settings-live-behind-two-functions.md`)
- [x] `agent.model` and `agent.max_tokens` reach the provider request (`model-route.test.ts`, `adr-008-agent-model-selects-the-model.md`)
- [x] layout system: resizable panels in `canvas.yaml`, 22px status strip, focus mode in memory only (`layout.test.ts`, `layout-render.test.ts`, `docs/patterns/layout-system.md`)
- [x] colour literals confined to the token blocks, including inline styles in components (`scripts/check-palette.mjs`)

## Explicitly not in phase 1

Anything where the model chooses its own tool calls (`docs/roadmap/phase-2.md`), collaboration, a schema editor
(`docs/ARCHITECTURE.md#9`, wound 2), and a second canvas in one folder (`adr-005-single-canvas-per-folder.md`,
still `proposed`).
