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
| 3 | User-editable accent and background colours in Settings | The token architecture is established in `adr-030` and `src/styles/tokens.css` with extensible `[data-theme="id"]` blocks. Adding user-defined custom theme overrides in Settings UI is planned for a future phase once runtime contrast checks are finalized. | `adr-030` establishes architecture; UI editor in future phase |
| 4 | Multi-pipeline canvases as files | Still `proposed` at `adr-005`, phase 4. Run Scope (ADR-012) narrows *one* run; it does not create a second graph. | phase 4 |
| 5 | Does `drawMode` belong in the store? | Today it is component state in `CanvasArea`, and the tool/colour/width live in `DrawToolbar` and reach the canvas through `window.__lcDraw` — a global mutable set in a `useEffect`. It works while one toolbar is mounted, but it is untestable from outside and it is the kind of side-channel that breaks silently. Moving it into `ui` state is a small change with a real payoff. | ADR if it grows; a refactor note otherwise |
| 6 | Should strokes be per-canvas files or one file? | `strokes/<id>.json` is one file per stroke, which matches Law 1 but means a canvas with 200 strokes has 200 tiny files. Nobody has hit that yet. | revisit when it hurts |
| 7 | Backend proxy for production API keys | Direct browser API keys are acceptable for personal/local use, but production deployments require a backend proxy to protect keys from client exposure and rate-limit egress. | ADR / backend service integration |

## سند بنیادین Living Canvas (The Living Manifesto)

ثبت‌شده در `docs/foundational-manifesto.md`. اصول بنیادین غیرقابل‌مذاکره Living Canvas:
1. **فایل‌ها بستر هستند، نه دیتابیس**: عدم وابستگی به سرورهای ابری یا دیتابیس اختصاصی.
2. **ایجنت‌ها شهروند هستند، نه ابزار**: هویت، حافظه فایل‌محور و حق مخالفت/سکوت.
3. **شفافیت کامل، بدون جعبه سیاه**: ثبت خطاها و یادگیری‌ها در فایل‌های حافظه (`regrets.md`).
4. **انسان فرمانده ناظر است، نه اپراتور**: اعتماد به جای میکرو-کنترل.
5. **سادگی از حذف می‌آید، نه از اضافه**: پالایش و حذف موارد زائد.
6. **حافظه در فایل است، نه در مدل**: حفظ هویت ایجنت‌ها در فایل‌های markdown.
7. **هر تصمیم قابل بازگشت است**: حفظ تاریخچه معماری و تصمیمات.

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

## UI Defects & Visual Polish Backlog (Review 2026-09)
*   **Node Text Contrast & Readability**: Body text inside Note nodes and markdown subtitles under Start Here use dark muted grays on dark surfaces, causing eye fatigue. Needs elevated contrast tokens (`--color-ink-primary`, `--color-ink-muted`).
*   **Information Redundancy & Clutter**:
    *   Canvas title is repeated across 3 separate surfaces (TopBar, Inspector form input, bottom StatusBar).
    *   Node and edge counts (`3 nodes, 0 edges, 0 checkpoints`) are redundantly rendered simultaneously in the floating canvas badge, the inspector Live stats card, and the bottom status bar.
*   **Bottom Bar Collisions**: The `Events and system log` bar sits stacked directly above the bottom status bar, eating up vertical viewport height and causing visual layer conflicts. Needs transformation into an on-demand drawer or tab.
*   **Orphaned Floating Action Button**: The `Draw on the canvas` pill floats isolated in the bottom-middle without integration into a cohesive dock or canvas toolbar.
*   **Lack of Visual Hierarchy & Depth**: Dark-on-dark surfaces across canvas, side panels, and cards lack subtle elevation, border differentiation, or dot-grid texture, giving an internal debugger feel rather than a production-ready application.
*   **Watermark & Attribution Hygiene**: Default React Flow attribution watermark in bottom-right corner reduces editorial polish.
*   **Topbar Action Hierarchy**: Bright neon `Run pipeline` button clashes with subdued dark palette; action controls need unified visual rhythm.

## Premium Design Transformation Proposal (Linear / Raycast / tldraw Paradigm)
*   **Context**: External review evaluated the current UI as an functional "Internal Dev / Admin Tool" rather than a market-ready premium SaaS (such as Linear, Raycast, or tldraw).
*   **Root Causes Identified**:
    *   *Containeritis*: Over-segmentation with rigid borders surrounding every perimeter (top bar, left library, right inspector, footer) trapping the canvas in a visual box.
    *   *Color Salad*: Competing high-saturation hues without clear visual hierarchy (neon green pipeline CTA, golden agent node, violet note node, cyan start node, red danger zone).
    *   *Clunky Form Inputs*: Default grey rectangular inputs in the Inspector that feel like legacy administration forms.
*   **The 4 Strategic Macro-Shifts**:
    1.  **Canvas-First Floating Island Architecture**: Let the canvas span edge-to-edge underneath everything. Detach the top bar, left library panel, and right inspector into floating rounded islands (`rounded-2xl`, `bg-zinc-950/80`, `backdrop-blur-xl`, `border border-white/5`, `shadow-2xl`) spaced ~12px from screen edges.
    2.  **Strict Monochromatic Depth & Single Accent**: Adopt a disciplined dark zinc/graphite foundation (`#090a0f` / `#13161c`) with faint dividers (`border-white/[0.06]`). Collapse disparate CTA colors into a single refined accent (e.g., modern electric violet/indigo `#6366f1` or muted emerald `#10b981`).
    3.  **Refined Glassmorphic Node Cards**: Increase internal node padding (`p-4`), replace raw code-like labels with elegant unified micro-badges (monospaced pill badges), and provide clear header dividers.
    4.  **Spatial Dot-Grid Canvas Background**: Replace flat black canvas with a subtle dot-grid matrix (15% opacity, ~24px gap) that scales with canvas zoom, providing tangible depth and technical precision.
*   **Design Lead Persona & Autonomous AI Designer**:
    *   Proposal to establish a dedicated "Design Lead Agent" / UX Auditor agent specification. This agent holds the mental model of a Principal Product Designer to continuously audit, critique, and propose token-compliant UI refinements without requiring manual pixel-by-pixel inspection by the human developer.
*   **Ready-to-Execute Overhaul Prompt Preserved**:
    > "Refactor the entire UI theme and layout styling of Living Canvas to match the ultra-premium aesthetic of Linear.app, Raycast, and tldraw. Apply these specific visual upgrades:
    > 1. Canvas-First Layout: Make the infinite canvas span edge-to-edge behind everything. Convert the left Library panel, top navigation bar, and right Inspector into sleek floating floating islands (rounded-2xl, bg-zinc-950/80, backdrop-blur-xl, border border-white/5, shadow-2xl) detached from the screen edges by 12px.
    > 2. Subtle Background: Add a subtle, high-end dot-grid pattern to the canvas background (#18181b dots on #09090b background) that responds smoothly to zoom.
    > 3. Color Palette Hygiene: Remove random loud colors. Use a strict monochrome palette based on Zinc/Slate neutrals. Use ONE single refined accent color (a modern electric indigo/violet or muted emerald) for primary CTAs like 'Run pipeline' and active node borders.
    > 4. Refined Node Cards: Redesign custom React Flow nodes (Agent, Note, etc.) with generous padding, clean hierarchy, glassmorphic headers, and elegant micro-badges for tags and tools. Ensure crisp typography hierarchy using a modern sans/mono font stack.
    > 5. Kill Nested Borders: Replace hard borders with subtle contrast shifts (bg-zinc-900/50 inside bg-zinc-950). Make inputs in the Inspector feel integrated, minimal, and modern rather than default form boxes."

## Technical & Architectural Risks Backlog (Review 2026-09)
*   **Playwright Test Coupled in Standard Vitest Suite**: `src/lib/__tests__/viewport-playwright.test.ts` runs directly under `npm test`. In lightweight environments or fresh developer containers lacking Chromium headless binaries, the entire unit test run fails. Needs extraction into a dedicated script (`npm run test:e2e`).
*   **Git Dependency in Validation Scripts**: `scripts/check-english.mjs` executes `git ls-files` without a fallback. When the project is checked out in shallow environments, containers, or distributed as a raw archive without `.git`, the script crashes with `fatal: not a git repository`. Needs a graceful filesystem traversal fallback.
*   **High-Churn Stroke File I/O Scaling (`strokes/*.json`)**: Saving every individual vector stroke as a separate disk file (`strokes/<id>.json`) strictly follows Law 1 but risks hitting File System Access API throttles, sync lag, and inode churn when users sketch heavily. Consider batching strokes per layer/session or auto-sweeping deleted stroke records.
*   **Client-Side API Key Storage Security & CORS**: Storing LLM provider keys purely in browser state works for single-user local usage, but multi-user collaboration or proxying to providers with strict CORS headers requires a hardened server-side proxy route.



