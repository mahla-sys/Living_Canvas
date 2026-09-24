---
title: The simulator derives its content from the role's own contract
status: accepted
updated: 2026-09-24
sources: [src/lib/engine.ts#simFields, src/state.ts#BUILTIN_TEMPLATES, src/lib/__tests__/templates-sim.test.ts]
---

## Context
`simFields` hand-wrote content for the four original roles and gave every other role one shared
`default` branch (`summary`, `decision`, `approval_request`). The pipeline library (ADR-038/039)
added six roles whose schemas declare different fields with `additionalProperties: false`, so the
default branch violated each of them. The flagship freelance pipeline therefore failed its own
schema validation on its first node — in the app's default mode, with no provider key, i.e. for
every first-time user.

## Decision
The simulator reads the same `library/schemas/<role>.schema.json` file the validator applies
(`loadRoleSchema`) and derives one field per declared required field: type/range for numeric
fields, the declared pattern for list fields, the declared minLength as a floor. The four original
roles keep their hand-written boilerplate, because tests and conditional edges pin exact values
(`risk_score: "5"` is what makes `{{ risk_score < 7 }}` true). A gate test, `templates-sim.test.ts`,
runs **every** entry of `BUILTIN_TEMPLATES` — load from the library, run, expect `completed` — so a
template and its simulator can never drift apart again.

## Why
A template that cannot run without a provider key cannot be tried. The sim content is a placeholder,
not an answer; its only job is to let the shape of the canvas be exercised. Deriving it from the
contract means a new role can no longer ship a simulator that fails its own schema, and the failure
mode the pipeline library just shipped becomes a gate, not a surprise.

## Consequences
Every built-in template is guaranteed to run green on the simulator; adding a role or a template
without a passing gate test is now a red build. The sim text is labelled as simulation inside the
content, so a reader never mistakes a placeholder for a model.
