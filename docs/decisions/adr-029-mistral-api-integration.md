---
title: Mistral API integration and default credentials configuration
status: accepted
updated: 2026-09-24
sources: [src/lib/core.ts, src/state.ts, src/lib/engine.ts]
---

## Context
The user requested integrating Mistral API (`mistral` provider) and configuring a Mistral API key and default model so that agent pipelines and chat can call Mistral models directly.

## Decision
1. Add `MISTRAL_BASE = "https://api.mistral.ai/v1"` and support `mistral` provider in `resolveModelRoute` and `askModel`.
2. Configure the Mistral provider and default model in `SETTINGS_BASE`. *(Clause 2 as originally written embedded the key itself; that clause is void — see the note below.)*
3. Update settings modal UI in `Overlays.tsx` to include Mistral provider.

## Why
Enables real AI execution using Mistral API with automatic tool-calling and fallback handling.

## Consequences
Agents can query Mistral API endpoints with tool-calling and fallback handling.

## Note (2026-09-24)
The original text of this ADR quoted the live API key in plain text, in `src/state.ts` and here.
The key was committed to a public repository and is treated as compromised: it was removed from the
source, redacted here, and **rotated by the owner**. The provider integration stands; the
embedded-credential clause is superseded by `adr-047-no-credentials-in-the-repository.md`.
