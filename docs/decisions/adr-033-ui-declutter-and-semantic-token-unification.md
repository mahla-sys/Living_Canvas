---
title: UI declutter and semantic token unification
status: accepted
updated: 2026-09-21
sources: [src/components/Overlays.tsx, src/components/SidePanels.tsx, src/components/CanvasArea.tsx]
---

## Context
Visual noise from decorative version tags, spec section numbers, duplicate status phrases, and legacy hardcoded palette classes reduces clarity and compromises the Obsidian Laboratory aesthetic.

## Decision
1. Eliminate decorative clutter across chrome: strip section numbers (§11, §13), redundant status subtitles, and placeholder metadata.
2. Unify all primary controls (`Run pipeline`, `Copilot`, `Save`) under the warm amber `--lc-accent` role.
3. Convert secondary and destructive actions (`Stop`, `Pause`, `Delete`, `Clear`) to ghost and muted semantic styles.
4. Replace boxed borders in the Library palette with sleek 40px unbordered list rows.
5. Render a crisp 24px dot grid on the canvas using `--lc-dot` for background structure.

## Why
Visual craft demands semantic hierarchy: actions must have clear optical weight, and canvas space must be unencumbered by redundant instructional noise.

## Consequences
Chrome text density is reduced by over 50%, legacy color leaks are eliminated, and tests enforce strict semantic token compliance across all components.
