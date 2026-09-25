---
title: Work order — rounds of 2026-09
status: active
updated: 2026-09-24
sources: [scripts/check-css.mjs, src/components/CanvasArea.tsx, src/lib/__tests__/drawing.test.tsx, src/lib/__tests__/interactive.test.tsx, docs/decisions/adr-014-layout-height-is-a-build-contract.md, docs/decisions/adr-040-simulator-derives-from-the-contract.md, docs/decisions/adr-047-no-credentials-in-the-repository.md]
---

# Work order — rounds of 2026-09

Written **before** any code each round. The order is the reader's. Status is set only after an item is
verified against its own acceptance criteria. Undecided items live in [`../inbox.md`](../inbox.md).

## Round of 2026-09-24 — the default experience must be true

| # | Defect / item | Root cause | Status |
|---|---|---|---|
| a | flagship freelance pipeline fails on its first node in the default (sim) mode | `simFields` knew only the four original roles; the six new roles got the `default` branch, whose three fields violate their own schemas | ✅ `adr-040`, gate in `templates-sim.test.ts` |
| b | a real provider's answer was silently replaced by simulator text | `fields = { summary: text, ...simFields(...) }` — the spread came last | ✅ `adr-041`, `provider-honesty.test.ts` |
| c | a snapshot restore evaporated on the next reload | `restoreSnapshot` touched state only; the node/edge files on disk kept the old graph | ✅ `adr-042`, `snapshot-restore.test.ts` |
| d | a failed save sat on "Saving…" forever, silent | the save chain's `.catch(() => undefined)` swallowed every error | ✅ `adr-043`, `save-failure.test.ts` |
| e | the file viewer showed state-serialised files that differed from disk (incl. `manifest.json` pinned at 1.3) | `buildFileContent` in `store.ts` was a second writer of file contents | ✅ `adr-044`, viewer now reads the storage adapter |
| f | a stop did not stop an in-flight model call; a hung provider held the queue forever | no `AbortController`, no per-request timeout in `askModel` | ✅ `adr-045`, `provider-honesty.test.ts` |
| g | the manager role could `delete_node`/`delete_edge` autonomously | destructive tools had no human gate (`require_approval` is node-level) | ✅ `adr-046`, `tool-approval.test.ts` |
| h | two live API keys committed in `src/state.ts` and two ADRs | a default-credentials decision (ADR-028/029) shipped a real key in git history | ✅ `adr-047` — keys removed **and must be rotated**; the default provider is now the simulator |

Acceptance for the round as a whole: `npm test` is green, and the new gate `templates-sim.test.ts` proves
every built-in template loads and runs to `completed` on the simulator — the exact path a first-time user
takes with no provider key. All items mutation-tested where the shape allowed (revert the fix, the test
fails); the pipeline gate is the strongest one, because it exercises the whole engine per template.

## Round of 2026-09-02 (closed)

| # | Item | ADR | Status |
|---|---|---|---|
| 1a–1e | panel scrolling, drawing layer, resize, laptop overflow, mounted-root height (see git history for the table) | `adr-014/020/021` | ✅ fixed |
| 2.1–2.11 | run scope, inspector tabs, run controls, search, status bar, function calling, tokens, declutter, Obsidian refinement, pipeline library | `adr-012…039` | ✅ / active as marked |

Round notes: 1a's missing height was three levels above the scroller, verified against the built stylesheet
by `check-css.mjs`; jsdom does no layout, so rendered geometry stayed unverified (no browser in the sandbox).
2.2's Status tab shows execution data only (CPU/memory → inbox 1); 2.4's glyphs are derived, and a node that
never ran shows no glyph. Every fix this round was mutation-tested. Theme architecture unchanged: one
`[data-theme="…"]` block plus one `THEMES` entry, measured by the palette gate.
