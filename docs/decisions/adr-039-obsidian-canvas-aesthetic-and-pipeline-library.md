---
title: Obsidian canvas dark aesthetic and ready-made pipeline template library
status: accepted
updated: 2026-09-24
sources: [src/styles/tokens.css, src/index.css, src/components/SidePanels.tsx, src/components/CanvasArea.tsx, src/components/Overlays.tsx, src/state.ts, src/lib/engine.ts]
---

# ADR-039 — Obsidian Canvas Dark Aesthetic and Pipeline Library

## Context
Users reported visual friction with high-contrast borders and requested an authentic Obsidian Canvas experience with subtle surfaces, soft dot grids, and a dedicated, organized Pipeline Library for instant deployment of domain workflows (Freelancing, Code Generation, Market Research, Decision Engines).

## Decision
1. Refine canvas borders and dot grid styling to match Obsidian Canvas dark minimalism (subtle translucent borders `0.06-0.08` opacity, muted dot grid).
2. Expand the built-in Pipeline Library with 5 pre-configured domain templates (Freelance Client Acquisition, Problem Solver & Decision Engine, Full-Stack Code Builder, Market Research Scout, Content Strategy Engine).
3. Upgrade the Left Panel Library and TopBar with a rich Pipelines catalog supporting 1-click instantiation and instant template saving.
4. Align micro-animations and elevation with Obsidian's cubic-bezier motion standards.

## Why
Living Canvas is designed as a visual programming environment; adopting Obsidian's calm, low-distraction dark aesthetic and modular pipeline catalog removes visual noise while multiplying user productivity across varied workflows.

## Consequences
- Canvas and panels present seamless, dark Obsidian surfaces without harsh high-contrast lines.
- Users can instantly browse, preview, and deploy multi-agent pipelines across diverse domains.
