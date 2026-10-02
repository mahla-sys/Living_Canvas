---
title: Templates may override a node's role contract
status: proposed
updated: 2026-10-02
sources: [src/state.ts, src/lib/engine.ts, docs/roadmap/work-order-2026-09.md]
---

## Context
A shared role is a useful default, but one pipeline may need different tools, prompts, token limits, or required fields.
A template already carries a per-node `role_override`; silently ignoring a declared override makes the saved pipeline lie.

## Decision
Treat `role_override` as an explicit overlay on the selected role. Apply every supported field when loading a template.
A gate question belongs to the `human-gate` node content, not to the agent's model prompt.

## Why
Templates are files and the file is the interface. Loading one must reconstruct the behavior it describes, without changing the global role library.

## Consequences
Template loading needs a contract test for overrides, including approval settings and a human-gate question. Existing templates without overrides keep role defaults.
