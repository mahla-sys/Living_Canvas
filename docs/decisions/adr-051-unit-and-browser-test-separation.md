---
title: Browser tests do not block the unit-test gate
status: proposed
updated: 2026-10-02
sources: [vite.config.js, package.json, src/lib/__tests__/viewport-playwright.test.ts]
---

## Context
The unit command discovered a Playwright suite that launches Chromium, so a missing browser binary failed `npm test` before the browser assertions could run.

## Decision
`npm test` runs deterministic unit and jsdom tests only. Browser tests use a separate `npm run test:e2e` command and an explicit test configuration.

## Why
A contributor without downloaded browser binaries should still be able to run the core regression suite; browser coverage remains available as a named, intentional gate.

## Consequences
CI or a developer who runs the browser gate must install Chromium. The unit gate reports its own failures instead of masking them with missing infrastructure.
