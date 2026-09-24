---
title: Minimalist Obsidian Frame and Excalidraw Floating Workspace
status: accepted
updated: 2026-09-23
sources: [src/App.tsx, src/components/CanvasArea.tsx, src/components/Overlays.tsx, src/components/SidePanels.tsx]
---

## Context
The canvas interface accumulated redundant panels and persistent floating chrome. The user requested an aesthetic and interaction model mirroring Obsidian's dark minimalist shell and Excalidraw's focused drawing canvas, eliminating visual clutter so the workspace feels as calm and expansive as VS Code.

## Decision
1. Establish a thin 40px left activity ribbon for instant collapsible panel toggling (Files, Palette, History, Settings).
2. Render top tabs in the native Obsidian tab aesthetic with clean title, close, and add actions, moving AI Run controls to a quiet group on the top right.
3. Replace intrusive floating menus with a sleek, centered Excalidraw pill toolbar (tools 1-9) at the top of the canvas and compact bottom-left zoom controls, removing the floating hamburger menu.
4. Align the palette with Obsidian dark tones (`#181818` canvas, `#202020` panels, `#161616` ribbon).

## Why
Obsidian and Excalidraw succeed because chrome steps back and leaves the workspace unhindered. A single click collapses the left sidebar into the thin ribbon, restoring full focus to the graph.

## Consequences
- The workspace defaults to a serene, distraction-free canvas with zero floating hamburger clutter.
- All tools remain readily accessible via the top floating capsule and ribbon without crowding the canvas.
