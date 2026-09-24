---
title: Remove left panel Canvas Manager box and configure default DeepSeek API key
status: accepted
updated: 2026-09-24
sources: [src/components/SidePanels.tsx, src/state.ts]
---

## Context
The user requested removing the redundant Canvas Manager box from the left panel palette and configuring a DeepSeek API key for live agent interactions.

## Decision
1. Remove the Canvas Manager banner block from the top of the left panel `Palette` component in `src/components/SidePanels.tsx`.
2. Set `provider: "deepseek"` and a DeepSeek API key in `SETTINGS_BASE` within `src/state.ts`. *(Clause 2 as originally written embedded the key in the source; that clause is void — see the note below.)*

## Why
Reduces UI clutter by removing redundant sidebar items, while providing API readiness for building and running agent pipelines.

## Consequences
Agents can execute real API calls once a key is configured.

## Note (2026-09-24)
The original text of this ADR quoted the live DeepSeek API key in plain text, and the key was
committed to `src/state.ts` in a public repository. It is treated as compromised: removed from the
source, redacted here, and **rotated by the owner**. The UI-removal decision stands; the
embedded-credential clause is void per `adr-047-no-credentials-in-the-repository.md`.
