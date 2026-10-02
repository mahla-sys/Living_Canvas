---
title: Work order — rounds of 2026-09
status: active
updated: 2026-10-02
sources: [scripts/check-css.mjs, src/components/CanvasArea.tsx, src/lib/__tests__/drawing.test.tsx, src/lib/__tests__/interactive.test.tsx, docs/decisions/adr-014-layout-height-is-a-build-contract.md, docs/decisions/adr-040-simulator-derives-from-the-contract.md, docs/decisions/adr-047-no-credentials-in-the-repository.md, docs/decisions/adr-048-template-role-overrides.md, docs/decisions/adr-049-human-gates-are-run-stages.md, docs/decisions/adr-050-local-secrets-and-generated-files.md, docs/decisions/adr-051-unit-and-browser-test-separation.md]
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

## Merge-readiness audit — 2026-10-02 (active)

| # | Finding | Acceptance criteria | Status |
|---|---|---|---|
| a | A cleared ignore file tracked a local `.env`, installed dependencies, compiled output, and test results | The final branch tree/history delta from `main` contains no local key or generated dependency/build/test artifacts; `.env.example` contains placeholders only. The owner is told to rotate any key that was committed. | ✅ — clean branch delta; rotate the previously committed key |
| b | `npm test` launched Playwright and failed without Chromium; two unit tests were stale or had unrealistic jsdom pointer events | `npm test` passes without a browser install; `npm run test:e2e` explicitly selects the browser suite; drawing assertions use finite coordinates and distinguish right-click. | ✅ |
| c | A human-gate node was never marked complete on approval, so the queue selected it again; step mode could hide its approval prompt | Regression tests prove approval completes the gate and runs downstream once, rejection stops, ledger records the choice, and step mode waits for approval before pausing. | ✅ |
| d | Template role overrides declared approval and human-gate fields that the loader ignored | A template contract test proves prompt/tool/field/token and approval overrides are applied, and a gate question reaches its node. | ✅ |
| e | The build-time Mistral key setting read only the process environment, not a local `.env` file | A config test verifies local and CI environment keys follow the documented names without adding a credential to source or tests. | ✅ |
| f | The axe audit wrote a "baseline" but passed regardless of its violations | Wait for the app store to boot; then fail on every WCAG 2.1 A/AA violation, report rule/impact/affected count, and run separately with Chromium. | ⚠️ code fixed; browser unavailable |
| g | Fresh-seed role files omitted four built-in roles; built-in template files were not indexed as built-ins in state | Seed all `ROLES`, populate built-in template info after seed/reload, and test complete files plus stable built-in/user flags. | ✅ |
| h | Six Persian pipeline taglines violated the source-language gate; the AI Partner card claimed it was live even when the keyless simulator is active | Keep source/UI copy in English and describe Mistral as optional; `check-english.mjs` must pass. | ✅ |

Round acceptance: all repository gates in `AGENTS.md` pass; `npm test`, `npm run build`, and regenerated docs facts pass. Run `npm run test:e2e` and `npm run test:a11y` when Chromium is available; otherwise report them separately as not run, never fold them into the unit command.

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
