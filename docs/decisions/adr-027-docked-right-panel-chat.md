---
title: Docked right-panel chat and top-level inspector navigation
status: accepted
updated: 2026-09-04
sources: [src/components/SidePanels.tsx#RightPanel, src/components/SidePanels.tsx#NodeInspector, src/components/Overlays.tsx, src/lib/__tests__/interactive.test.tsx]
---

# ADR-027 — Docked Right-Panel Chat and Inspector Navigation

## Context

Floating chat dialogs obstructed the canvas graph, collided with the bottom console, and required complex coordinate tracking against resizing panels. Users needed a unified, stable docked panel experience where chat, node inspection, and canvas settings coexist seamlessly without floating window clutter.

## Decision

1. **No Floating Chat Windows**: Remove floating chat overlays from the canvas viewport. All conversational interfaces are docked within the right panel.
2. **Right-Panel Top Navigation**: Provide top-level tab options at the head of `RightPanel`:
   - `Inspector`: Details, config, status, diary, and logs for the active node or edge.
   - `Chat`: Full-height chat interface for the selected agent or Canvas Manager, with agent switching.
   - `Canvas`: Canvas metadata, execution metrics, and workspace settings.
3. **Automatic Panel Opening**: Triggering chat from any button (TopBar Copilot, Palette Manager card, or Node actions) automatically opens the right panel and switches the tab to `Chat`.

## Consequences

- The canvas surface remains completely unobstructed and uncluttered by floating modals.
- Chat history, markdown thoughts, and agent dialogues have a dedicated, vertically resizable sidebar space.
- Users can switch between inspecting node internals and chatting with the agent in one click.
