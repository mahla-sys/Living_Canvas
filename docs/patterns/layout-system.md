---
title: Layout system — what is data, what is a moment, what is chrome
status: accepted
updated: 2026-09-02
sources: [src/lib/core.ts#normalizeLayout, src/lib/core.ts#createChord, src/lib/engine.ts#writeCanvasYaml, src/components/SidePanels.tsx#ResizeHandle, src/components/Overlays.tsx#StatusBar, docs/ARCHITECTURE.md#6.1, layout.test.ts, adr-009-layout-is-canvas-content-focus-mode-is-not.md]
---

# Layout system

The gap this closed was not "the panels cannot be resized". It was that the app had no rule for **which
interface state belongs in a file**, so every new piece of chrome would have been decided by whoever added it.
The three-way split below is the deliverable; the resize handle is the example.

## The split (ADR-009)

| state | destination | test that holds it |
|---|---|---|
| panel widths, panel open/closed | `canvas.yaml` under `layout:` | `layout.test.ts` round-trips `writeCanvasYaml` → `hydrate` |
| focus mode | `ui.focusMode`, memory only | `layout.test.ts` asserts nothing in the tree mentions focus |
| the 22px status strip | nowhere — pure chrome | it renders from existing slices and owns no setting |

Rule of thumb, in one line: **shape of reading → file; moment of work → memory; taste of the reader →
`lc-settings`** (ADR-006). A new piece of interface state that cannot name its category is a question for
`docs/inbox.md`, not a pull request.

## What was built

- **Drag to resize.** `ResizeHandle` in `src/components/SidePanels.tsx`, 200–520px per side. The clamp lives in
  `core.clamp` behind `normalizeLayout`, not in the component: the file is the contract, so a hand-edited
  `canvas.yaml` is clamped at the same door as a mouse drag.
- **One writer for `canvas.yaml`.** `writeCanvasYaml` is called by `writeCore` (700ms content save) and by
  `touchLayout` (500ms layout save). Two triggers, one function; both ride `saveChain`, so `flushPending`
  waits for the layout and Export cannot ship widths that are half a second stale.
- **Status strip.** `StatusBar` in `src/components/Overlays.tsx`. Left half is the document (title, counts,
  storage mode); right half is the moment (run status, save state, focus hint). The split is the design.
- **Focus mode.** `Ctrl+K Z` in, Escape twice out. Both sequences are pure state machines
  (`core.createChord`, `core.createDoubleTap`) held as module-level instances in `store.ts`, so a re-render
  cannot forget a half-pressed chord. Only `k`, `z` and `Escape` are ever fed, so typing on the canvas and
  `Ctrl+Z` undo are untouched.

## The two things that would be easy to get wrong later

1. **Do not put focus mode in a file.** It looks like a layout setting and it is not: a saved
   `focusMode: true` makes the next reader open somebody else's moment of concentration. It is `lock` (Law 3)
   wearing a keyboard shortcut.
2. **Do not add a second writer for `canvas.yaml`.** The tempting move — a `writeLayout()` that only rewrites
   the layout block — is a read-modify-write against a file the content save also owns, which is the exact
   shape that produced `graph.json`.

## Not built, deliberately

- **Per-panel tabs in the right panel.** The inspector is one of three views chosen by selection; a tab bar
  would compete with that instead of extending it (`docs/patterns/node-inspector.md` is the better home).
- **Persisting the console height.** It is a moment of work by the same argument as focus mode, and the
  console already collapses.
- **Multi-canvas layout memory.** Blocked on Q2 (`docs/ARCHITECTURE.md#10`): one canvas per attached folder.
