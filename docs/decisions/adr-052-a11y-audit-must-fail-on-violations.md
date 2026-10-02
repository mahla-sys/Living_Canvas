---
title: Accessibility audit fails on violations
status: proposed
updated: 2026-10-02
sources: [tests/a11y.spec.ts, docs/roadmap/work-order-2026-09.md]
---

# Accessibility audit fails on violations

## Context

The axe test ran a WCAG 2.1 A/AA scan, wrote the result to a file named "baseline", and asserted only that the violations field existed. Any number of violations therefore passed.

## Decision

Wait for the app's store to finish booting, then treat the page as a zero-violation gate. Fail on every axe violation and include a concise summary. Do not rewrite a baseline during the test.

## Why

A self-updating report is not an acceptance criterion. Until a reviewed baseline policy exists, a new or existing violation should be visible and block the audit rather than create false confidence.

## Consequences

The axe test requires Chromium and must run separately from jsdom unit tests. A failure names the violated rule, impact, help text, and affected-element count for remediation.
