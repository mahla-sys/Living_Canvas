---
title: No credentials in the repository
status: accepted
updated: 2026-09-24
sources: [src/state.ts#SETTINGS_BASE, docs/decisions/adr-028-remove-left-panel-canvas-manager-and-configure-api-key.md, docs/decisions/adr-029-mistral-api-integration.md]
---

## Context
Two live API keys were committed: a Mistral key as the default in `SETTINGS_BASE` (ADR-029) and a
DeepSeek key quoted in ADR-028. Both are in git history and in a public repository, so they must
be treated as compromised. The default was also a product decision by accident: every visitor's
first run silently spent the owner's quota, or fell back to the simulator on a CORS error.

## Decision
`SETTINGS_BASE` ships no key and defaults to the internal simulator; a real provider is a reader
choice, made in Settings (reader-scoped, never a canvas file) or through the build-time
`VITE_GEMINI_API_KEY`. The keys are redacted from both ADRs and removed from source. **The owner
must rotate both keys now** — redaction does not un-leak history. ADR-028/029 keep their provider
integration decisions; only the embedded-credential clause is void.

## Why
A repository is a public artifact; a credential inside it is a credential that has been given
away. Defaulting to the simulator also makes the first experience honest: the app says what it is
running on, and "simulator" is a state the reader can see, not a fallback that happens to them.

## Consequences
`git log` will still show the old keys until the history is rewritten — rotation is the only real
fix, and it is the owner's action, not the repository's. Fresh installs now start on the
simulator; entering a key in Settings is the step that turns a run real.
