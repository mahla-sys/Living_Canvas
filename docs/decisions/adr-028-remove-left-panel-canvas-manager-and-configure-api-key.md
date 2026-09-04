---
title: Remove left panel Canvas Manager box and configure default DeepSeek API key
status: accepted
updated: 2026-09-04
sources: [src/components/SidePanels.tsx, src/state.ts]
---

## Context
The user requested removing the redundant Canvas Manager box from the left panel palette and configuring the provided DeepSeek API key for live agent interactions.

## Decision
1. Remove the Canvas Manager banner block from the top of the left panel `Palette` component in `src/components/SidePanels.tsx`.
2. Set `provider: "deepseek"` and `apiKey: "sk-49c9e90618dd44328f6a3a159066e13a"` in `SETTINGS_BASE` within `src/state.ts`.

## Why
Reduces UI clutter by removing redundant sidebar items, while providing immediate API readiness for building and running agent pipelines.

## Consequences
Agents can now execute real API calls using the configured DeepSeek key out of the box.
