---
title: Activity rail, overlay drawers, and canvas chrome ratio
status: accepted
updated: 2026-09-21
sources: [src/components/SidePanels.tsx, src/components/Overlays.tsx, src/components/CanvasArea.tsx]
---

## Context
A static 260px left sidebar and 280px right panel reduce the active canvas viewport area to below 60% on standard laptops. Redundant stats pills and boxed card borders create unnecessary visual noise.

## Decision
1. Replace the static left panel with a 48px slim Activity Rail with collapsible drawers toggled via `⌘1` and `⌘B`.
2. Convert the right inspector into a collapsible drawer toggled via `⌘2` and `⌘⌥B`.
3. Eliminate boxed card outlines in the node library in favor of clean 40px list rows with subtle hover transitions.
4. Bind all primary actions to semantic tokens (`bg-lc-accent` for Run/Copilot, ghost styling for destructive actions).
5. Target a canvas viewport ratio ≥ 80% with a warm neutral background (`#0A0A0C`) and subtle 24px dot grid.

## Why
Living Canvas is a precision canvas tool. Minimizing permanent chrome while providing rapid keyboard shortcuts and overlay panels maximizes workspace focus.

## Consequences
Canvas space expands to ≥ 80% on 1366x768 viewports while all editing tools, files, templates, and agent logs remain accessible via one-click rails or key chords.
