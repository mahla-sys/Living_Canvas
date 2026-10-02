---
title: Seeded library is complete and visible
status: proposed
updated: 2026-10-02
sources: [src/lib/engine.ts#seedWorkspace, src/lib/__tests__/hydrate.test.ts, src/state.ts#BUILTIN_TEMPLATES]
---

# Seeded library is complete and visible

## Context

The first-boot seed hard-coded only ten of the built-in roles, while `ROLES` contained four more. It wrote all built-in template files but did not publish them to `AppState.templates`; hydration then labeled every file-backed template as user-saved.

## Decision

Seed role files from `ROLES`. After seeding, expose every built-in package in state as built-in; during hydration, identify those same packages by their stable IDs while leaving user templates unmarked.

## Why

The library's files are canonical, but the UI also needs a faithful file-backed index. Missing role files or a stale index makes the on-disk library disagree with the app's built-ins and reset behavior.

## Consequences

The graph remains blank on first boot. Tests cover complete role/template files, the built-in flags after seed and reload, and the separate user-template path.
