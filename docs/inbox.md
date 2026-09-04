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

## UI/UX Facelift & Ergonomics (Proposals)

*   **Header Activity Bar**: Replace bottom corner `library on`/`inspector on` toggles with VS Code-style top-left/top-right icons.
*   **Visual Library Palette**: The left panel should be a categorized visual palette of components (Agents, System Nodes, Tools) with thumbnail previews, rather than a raw text list.
*   **Node Shape Semantics**: 
    *   **Folder / Free Shape**: Currently ambiguous. Needs mapping to standard concepts like sticky notes, decision diamonds, capsules.
    *   **Sticky Notes**: Should look like actual notes. They should *not* have chat options or tool access in their settings.
    *   **Agent Nodes**: Should be structured cards (avatar, status indicators, token counters). Settings must include model selection, persona prompt, file access rules.
    *   **Condition Nodes**: Diamond flowchart shape with labeled outputs (True/False).
*   **Settings UI**: Change the sun icon to a proper gear (⚙️) and add a dedicated Light/Dark toggle. Theme selection should offer visual contrast previews.
*   **Canvas Background Patterns**: Support Excalidraw-like backgrounds (Dots Grid, Grid Lines, Ruled/Lined, Blank).
*   **Loading State**: Ensure the initial loading screen doesn't momentarily flash green but respects the current theme with a neutral skeleton.

## The "Nexus" Concept & Shared Memory (Proposals)

*   **Canvas as AI Operating System**: The primary user of the canvas is not just humans, but AI. AIs should be able to draw, create docs, connect nodes, and architect pipelines.
*   **Shared Core Ledger**: 
    *   A central `memory/global.md` and `memory/decisions.md` serving as the "team notebook".
    *   Agents wake up, read the ledger, perform their task, write their findings back to the ledger, and sleep.
*   **Specialized Agent Loops**: E.g., Clarifier -> Searcher -> Advisor -> Detailer -> Architect -> Executor.
*   **Chat Panel Context**: Instead of scattered chats, clicking an agent opens a right-panel chat specifically colored and titled for that agent to clarify context.

## Self-Building Copilot & Bootstrapping (Manager Agent)

*   **Manager (Copilot) Agent**: A built-in, floating or dedicated-tab agent with full access to the current canvas, capable of modifying the canvas itself.
*   **UI-Awareness Tools**: Copilot needs new tools:
    *   `get_ui_state`: Returns active tab, selected node, etc.
    *   `capture_canvas_snapshot`: Returns a clean JSON representation of the canvas geometry/layout (avoiding heavy HTML DOM dumps).
*   **Canvas Manipulation Tools**: Copilot can use `create_node`, `update_node`, `create_edge`, etc.
*   **Isolated Memory**: Memory and chat for the manager are kept in `memory/agents/manager-<canvas-id>.md` and `chats/manager-<canvas-id>.md`.
*   **The `living-canvas-builder` Canvas**: Bootstrapping an actual canvas containing a `Researcher` and `Planner` agent that use `write_output` to generate `problem.md` and `plan.md`.
*   **Security Limits**: `execute_command` and `npm test` tools are deliberately withheld for now to prevent catastrophic deletions.
*   **Triggers**: The manager should be reactive (waking up on specific chat triggers or an "Analyze Canvas" button).

## AI Citizen Requirements (Path to Self-Building)
*Registered by the AI Assistant after analyzing the workspace as a "citizen".*

To allow an AI agent to actively develop Living Canvas *from within* Living Canvas, the following capabilities are currently missing and must be implemented:
1.  **Canvas Manipulation Tools**: Agents currently lack function-calling tools to modify the graph. We need: `create_node`, `update_node_data`, `create_edge`, `delete_node`.
2.  **Context/UI Awareness**: The agent cannot "see" what the user is looking at. We need a `get_ui_state` tool (returns active tab, selected node ID, viewport coordinates).
3.  **Project-Level Read/Write (Safe Mode)**: Agents write to `outputs/` or `memory/`. To develop the app, the Manager Agent needs scoped write access to `src/` and `docs/`, respecting the StorageAdapter.
4.  **Meta-Execution**: The ability for an agent to trigger a pipeline run or run the test suite safely and read the results (a safe `run_tests` tool that returns stdout/stderr).

## Visual & Aesthetic Inspiration (From Stitch HTML)
*   **Persona**: Mahla, 21, System Designer. Prefers dark purple, stars (professional), deep calm spaces, choices, tree structures. Dislikes yellow and chaotic spinners.
*   **Editorial Typography**: Pair a classic serif (like Newsreader) for headings/markdown outputs with a clean monospace (JetBrains Mono) for code/logs. Gives a high-end journal/academic feel.
*   **Ghost Cursors**: Live indicators on the canvas showing what an agent is doing (e.g., `@synthesizer (active drafting)` with a blinking cursor). Gives life to the canvas.
*   **Ambient Glows**: Large, very blurry radial gradients (140px+ blur) behind active nodes to create depth without cluttering the UI. No harsh borders.
*   **Anti-Slop**: Avoid generic sci-fi dashboards (no unnecessary charts, dials, or "Macro Citadel" complexities). Keep it focused like Obsidian or VS Code.

## UI/UX Facelift & Decluttering
*   **Decluttered Canvas**: Removed the `MiniMap` from the top right corner. The user wants the page to be as clean and unobstructed as possible.
*   **Goal**: Emphasize content (nodes and connections) over navigation overlays.
*   **Removed Controls Component**: Also removed the bottom-left zoom/pan controls as the standard mouse and trackpad gestures are sufficient, creating an even cleaner viewport.
