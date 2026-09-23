---
title: Design system tokens, Obsidian warm-neutral palette, and theme extensibility
status: accepted
updated: 2026-09-21
sources: [src/styles/tokens.css, src/index.css, src/lib/core.ts]
---

## Context
Living Canvas requires a unified, high-contrast, professional design system to replace fragmented developer-tool chrome with an intentional "Obsidian Laboratory" aesthetic. Themes and color palettes must be easily extensible in the future.

## Decision
1. Create `src/styles/tokens.css` establishing a 4-layer surface hierarchy (`--lc-void`, `--lc-surface-base`, `--lc-surface-raised`, `--lc-surface-overlay`), translucent borders, text ramp, semantic roles, and warm amber (`#D4A853`) as primary brand accent with violet (`#A78BFA`) for AI/agent states.
2. Maintain existing themes (`neutral`, `botanical`, `plum`) while sharing uniform typography, spacing, radius, and motion tokens. Future themes are created by adding a single `[data-theme="id"]` block.
3. Unify typography on `Inter` (body/UI), `Plus Jakarta Sans` (display), and `JetBrains Mono` (code/data), deprecating serif `Newsreader`.
4. Mandate global `:focus-visible` accessibility rings and `prefers-reduced-motion: reduce` duration clamping.

## Why
Warm amber on warm-neutral dark delivers high contrast (WCAG AA > 4.5:1) without chromatic fatigue. The token seam guarantees future themes and custom colors can be plugged in without refactoring component code.

## Consequences
Components reference semantic tokens and roles rather than raw values, guarded by Layer 1 contrast tests and repository gates.
