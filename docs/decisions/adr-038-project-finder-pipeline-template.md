---
title: Built-in Project Finder Pipeline template and instant canvas deployment
status: accepted
updated: 2026-09-24
sources: [src/lib/engine.ts, src/components/CanvasArea.tsx, src/components/SidePanels.tsx, src/state.ts]
---

# ADR-038 — Built-in Project Finder Pipeline and Instant Canvas Deployment

## Context
Users requesting automated project and client scouting require a dedicated 4-agent pipeline (Scout, Feasibility Filter, Proposal Architect, and Deal Closer). When opening a fresh canvas, users need an effortless one-click action to load this workflow directly without manual node configuration or intrusive confirmation modals.

## Decision
1. Ship a built-in `project-finder` template in `library/templates/project-finder/template.json` with 4 chained agents and connecting edges tailored for freelance/software project acquisition.
2. Seed the template files during workspace initialization so it is permanently available in the Templates library.
3. Add a dedicated "Load Project Finder Pipeline" action directly on the initial canvas note and TopBar.
4. Bypass `window.confirm` in `loadTemplate` when replacing a pristine default note canvas.

## Why
Living Canvas is a visual workspace for automated workflows; offering a domain-specific project discovery pipeline makes the platform immediately productive for freelance and client acquisition.

## Consequences
- Users can instantiate an end-to-end project discovery pipeline with a single click.
- Seamless loading preserves workspace integrity while eliminating modal friction on blank canvases.
