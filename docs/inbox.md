---
title: Inbox — registered but undecided
status: active
updated: 2026-09-02
sources: [docs/roadmap/infrastructure-horizon.md, docs/decisions/README.md]
---

# Inbox

Decisions and unknowns that are **registered but not yet decided**. Nothing here is built. An item leaves
this file by becoming a decision in a `decisions/adr-*.md` or a row in `roadmap/`.

Kept deliberately short: if an item has grown enough to need a rationale, it has grown enough to need its own
ADR, and staying here would hide it.

---

| # | Open question | Why it is not decided yet | Where it would land |
|---|---|---|---|
| 1 | Should the Inspector **Status** tab ever show CPU/memory? | The reader deferred it, then wrote "the same real data is enough for now" — which reads as *keep the real data, drop the bars*. Browsers expose no CPU figure at all; `performance.memory` is Chrome-only and approximate. Showing a number nobody can trust is worse than showing none. | an ADR saying the tab shows execution state only, or a phase entry to revisit if a backend ever reports it |
| 2 | Docking / closing the side panels | Explicitly moved to a later phase this round. Needs a layout schema change (`layout.leftOpen` exists; `docked` does not) and a decision about what the canvas does with the reclaimed width. | `roadmap/infrastructure-horizon.md` → phase entry → ADR |
| 3 | User-editable accent and background colours in Settings | The reader wants the *architecture* ready, not the feature. The role tokens (`--color-lc-accent`, `--color-lc-warn`) are the seam; what is missing is where the override is stored (`settings.themeOverride`? a `theme.css` file?) and how it interacts with the contrast gate, which measures the three shipped themes and would not see a runtime override at all. | ADR — and it must say what the gate does about runtime overrides |
| 4 | Multi-pipeline canvases as files | Still `proposed` at `adr-005`, phase 4. Run Scope (ADR-012) narrows *one* run; it does not create a second graph. | phase 4 |
| 5 | Does `drawMode` belong in the store? | Today it is component state in `CanvasArea`, and the tool/colour/width live in `DrawToolbar` and reach the canvas through `window.__lcDraw` — a global mutable set in a `useEffect`. It works while one toolbar is mounted, but it is untestable from outside and it is the kind of side-channel that breaks silently. Moving it into `ui` state is a small change with a real payoff. | ADR if it grows; a refactor note otherwise |
| 6 | Should strokes be per-canvas files or one file? | `strokes/<id>.json` is one file per stroke, which matches Law 1 but means a canvas with 200 strokes has 200 tiny files. Nobody has hit that yet. | revisit when it hurts |
| 7 | Backend proxy for production API keys | Direct browser API keys are acceptable for personal/local use, but production deployments require a backend proxy to protect keys from client exposure and rate-limit egress. | ADR / backend service integration |
