---
title: Obsidian Aesthetic Refinement, Palette Harmony, and Chrome Decluttering
status: accepted
updated: 2026-09-24
sources: [src/App.tsx, src/components/CanvasArea.tsx, src/components/SidePanels.tsx, src/index.css]
---

## Context
Visual critique revealed disparate icon colorings in the node library, a faint canvas grid, harsh border lines, uncoordinated topbar action colors, a detached events strip above the status bar, and unlabelled floating tools that crowded the central canvas.

## Decision
1. Soften border lines to Obsidian muted charcoal (`border-border-subtle` / `#242424`), removing stark white dividers and harmonizing Library item icons to a cohesive theme-accent aesthetic.
2. Enrich the canvas background with a legible, subtle dot grid pattern and set the default drawing pen stroke color to the active theme accent.
3. Consolidate canvas controls: provide informative tooltips with keyboard shortcuts for floating tools, dock canvas controls cleanly, and remove the redundant floating events strip in favor of the dedicated Ledger modal.
4. Establish clear action hierarchy in TopBar: Run as the primary accent action, Copilot as secondary, Step as quiet neutral, and replace disparate badge hues with unified theme roles.
5. Elevate the Status Bar height to 26px with balanced metadata hierarchy and crisp typography.

## Why
Obsidian and professional IDEs create mental focus by suppressing competing border lines and arbitrary icon hues. Highlighting essential actions with theme roles and quieting peripheral chrome lets the canvas breathe.

## Consequences
- The canvas feels calm, structured, and expansive with authentic Obsidian atmosphere.
- Elimination of floating clutter and uncoordinated colors gives users immediate clarity and visual tranquility.
