---
title: Fix Gemini connection testing, effective key detection, and model routing
status: accepted
updated: 2026-09-24
sources: [src/lib/engine.ts, src/lib/core.ts, src/state.ts, src/components/Overlays.tsx]
---

# ADR-037 — Gemini Connection Probe, Effective Key Detection, and Standard Model Naming

## Context
When users selected Gemini as the AI provider and tested their connection, `testFallback` immediately failed with "no API key configured", because the probe only checked `deepseek` and `mistral`. Furthermore, the default model was hardcoded to `gemini-3.6-flash`, an invalid model name resulting in HTTP 404 from Google GenAI API, causing immediate silent fallback to simulated canned responses.

## Decision
1. Update `testFallback` in `src/lib/engine.ts` to include `gemini` in provider checks and recognize both `settings.apiKey` and environment keys.
2. Standardize Gemini model defaults across `core.ts`, `state.ts`, and `Overlays.tsx` to `gemini-2.5-flash`, matching official Google GenAI endpoints.
3. Enhance `askModel` HTTP headers to support both `Authorization: Bearer` and `x-goog-api-key` for Google GenAI compatibility.
4. Report provider-specific connection status in toast messages rather than hardcoding DeepSeek.

## Why
When an external model provider is chosen, connection probes and agent execution must honor that provider rather than silently rejecting the key or crashing with a 404 model error.

## Consequences
- Gemini API keys are properly validated during fallback probes.
- Legitimate Gemini API keys successfully generate live responses instead of falling back to canned simulator replies.
