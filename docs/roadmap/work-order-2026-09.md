---
title: Work order — round of 2026-09-02
status: active
updated: 2026-09-02
sources: [scripts/check-css.mjs, src/components/CanvasArea.tsx, src/lib/__tests__/drawing.test.tsx, src/lib/__tests__/interactive.test.tsx, docs/decisions/adr-014-layout-height-is-a-build-contract.md]
---

# Work order — round of 2026-09-02

Written **before** any code this round. The order is the reader's. Status is set only after an item is
verified against its own acceptance criteria. Undecided items live in [`../inbox.md`](../inbox.md).

## 1. Defects

| | Defect | Root cause | Status |
|---|---|---|---|
| 1a | left/right panels do not scroll | the bundler dropped `html` from `html, body, #root { height: 100% }`, leaving `,body,#root{…}` — an invalid list the browser discards whole, so nothing in the app had a bounded height | ✅ fixed, `adr-014` |
| 1b | drawing produces nothing | `StrokesLayer` painted flow coordinates outside `.react-flow__viewport`, i.e. in screen space; `fitView()` 80 ms after boot means the viewport is never identity | ✅ fixed |
| 1c | panel resize must not break layout | no defect found; close/dock deferred | ✅ verified |
| 1d | page overflows laptop screen & internal scroll doesn't engage | middle container lacked overflow-hidden & min-w-0, root lacked viewport fixed pinning, expanding layout past screen height | ✅ fixed, `adr-020` |
| 1e | mounted root height chain broken at data-lc-mounted | `<div data-lc-mounted>` lacked height/flex classes, turning App's height:100% into auto; status bar pushed off-screen | ✅ fixed, `adr-021` |

**1a** is the one worth naming. The classes on every scroller were already correct, which is why adding
`min-h-0` changed nothing — the missing height was three levels up and the *source* looked right. Verified
against the built stylesheet, where the count of `html{…height:100%…}` was **0**. Guarded now by
`scripts/check-css.mjs`, which reads `dist/` and not only the source; mutation-tested both ways.

**1b** was found by reading `@xyflow/react`'s own output: it renders user `children` as *siblings* of
`GraphView`, outside the transform. The layer now applies `translate(x, y) scale(z)` from the React Flow
store. Coordinates stay in flow space, because flow coordinates are what `strokes/<id>.json` holds.

**Honest limit, both items.** jsdom does no layout, so `scrollHeight > clientHeight` cannot be measured here,
and no browser is installable in this sandbox (`playwright install` fails at the download). The CSS contract
is verified and mutation-tested; the rendered geometry is not.

## 2. Features, in the reader's order

| # | Feature | ADR | Status |
|---|---|---|---|
| 2.1 | Run Scope — Selected / From / Until | `adr-012` | ✅ 12 tests |
| 2.2 | Inspector tabs — Status / Diary / Logs | `adr-015` | ✅ 12 tests |
| 2.3 | Run controls — Run / Pause / Step / Stop | `adr-013` | ✅ 11 tests |
| 2.4 | Left-panel search + status icons | `adr-016` | ✅ 13 tests |
| 2.5 | Status bar in words, not enums | `adr-017` | ✅ 7 tests |
| 2.6 | Function Calling & Canvas Tools | `adr-022` | active |

2.2's **Status** tab shows real execution data only. CPU/memory stays deferred — browsers expose no CPU
figure, and `performance.memory` is Chrome-only and approximate. Registered as inbox item 1. It carries four
tabs, not three: the editing surface that already existed stays as **Config**, because deleting it to honour
a literal "three tabs" would have removed the only way to configure a node.

2.4's status glyphs derive from `execution` and `agent.status` that already exist; nothing is invented and no
field was added to `NodeData`. A node that never ran shows **no** glyph — not a failure one. A mutation that
gave every note a failure glyph was caught only after a test for the no-agent case was added, which is the
second time this round that mutation-testing found a hole in a test rather than in the code.

2.2 and 2.4 both shipped a bug of my own that the tests caught first: `useStore((s) => s.outputs[id] ?? [])`
hands zustand a fresh array on every call and its equality is `Object.is`, so the component re-rendered
forever; and an absence assertion written with `getByText` throws instead of returning null, so it failed for
the wrong reason.

2.5 also fixed a visible defect found while reading the bar: the TopBar subtitle printed the application name
a second time, directly under the application name. A test now counts it and requires exactly one.

An existing test in `layout-render.test.ts` asserted the old machine-facing `run: idle`. It was updated
rather than deleted, because the assertion it made — that the right half names the run — is still the point;
only the expected wording changed.

## 3. Test policy

Every item ships with a test named for the behaviour it protects, and every fix is **mutation-tested**: the
bug goes back in and the test must fail. Both fixes this round were. A test that cannot fail is not a test.

## 4. Theme architecture

Unchanged and re-verified: one `:root[data-theme="…"]` block plus one `THEMES` entry, measured by the palette
gate. Role tokens are the seam a future user-editable accent plugs into (inbox item 3).
