---
title: Mistral API integration and default credentials configuration
status: accepted
updated: 2026-09-04
sources: [src/lib/core.ts, src/state.ts, src/lib/engine.ts]
---

## Context
The user requested integrating Mistral API (`mistral` provider) and configuring the provided Mistral API key (`HsRVetWmpgwTz613v2uIUPTeanfWQGho`) and default model so that agent pipelines and chat can call Mistral models directly out of the box.

## Decision
1. Add `MISTRAL_BASE = "https://api.mistral.ai/v1"` and support `mistral` provider in `resolveModelRoute` and `askModel`.
2. Configure `provider: "mistral"`, `apiKey: "HsRVetWmpgwTz613v2uIUPTeanfWQGho"`, and default model `mistral-small-latest` in `SETTINGS_BASE`.
3. Update settings modal UI in `Overlays.tsx` to include Mistral provider.

## Why
Enables seamless real AI execution using Mistral API with the user's provided API key.

## Consequences
Agents can successfully query Mistral API endpoints with automatic tool-calling and fallback handling.
