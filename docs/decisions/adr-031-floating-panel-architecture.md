---
title: Floating panel architecture, overlay drawers, and canvas chrome reduction
status: accepted
updated: 2026-09-21
sources: [src/components/CanvasArea.tsx, src/components/SidePanels.tsx, src/components/Overlays.tsx]
---

## Context
Fixed three-column sidebars and static bars suffocate the canvas (chrome ratio ~42%) and generate visual clutter with competing floating canvas overlays.

## Decision
1. Panels become collapsible and overlay-friendly with keyboard shortcuts (⌘1 Library, ⌘2 Inspector, ⌘L System Log).
2. Canvas chrome ratio targets <= 20% to keep the graph workspace primary.
3. Consolidate redundant canvas telemetry (status pill) strictly into the bottom 32px status bar.
4. Replace intrusive center draw pill with a sleek floating action button (FAB).
5. Retain 32px bottom status bar as the single persistent, low-profile status anchor.

## Why
Freeing canvas viewport area aligns Living Canvas with high-focus spatial tools like Linear and tldraw while reducing visual noise and containeritis.

## Consequences
Canvas gains immediate breathing room. Drawers use smooth transitions and accessibility focus management.
