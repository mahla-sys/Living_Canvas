---
title: The output contract is enforced before anything is delivered
status: accepted
updated: 2026-09-01
sources: [src/lib/engine.ts#validateAgainstContract, src/lib/core.ts#validateAgainstSchema, src/lib/core.ts#SUPPORTED_SCHEMA_KEYWORDS, src/lib/__tests__/schema.test.ts, docs/ARCHITECTURE.md#4.9.1]
---

# ADR-003 — a contract that is only displayed is worse than no contract

## Context

Every role promised an output shape (`required_fields`, `validator: "schemas/<role>.schema.json"`) and nothing
read the promise. The validator was `validateOutput`, which checked only that a file had been produced per field
— so it could not fail — and the schema pointer named a directory no tree contained. The real question was what
the canvas *is*: an editor (validation warns, user decides) or an orchestrator (validation refuses, because it
runs a non-deterministic tool and routes the result into the next one).

## Decision

Orchestrator. Before a byte lands in `outputs/`, the node's `required_fields` must be non-empty **and** the
schema its contract names must be under `library/schemas/`, present in the canvas, one parseable JSON object, and
satisfied by the fields. Any of that failing means: `validation.failed`, a log line, a `rejected` ledger row,
the reason on the node card, and no output at all. No partial delivery, no "wrote what it could".

## Why the two ugly details are the load-bearing part

- An unsupported schema keyword is **reported, not skipped**. A validator that quietly ignores `oneOf` approves
  output the schema forbids and is then *trusted* for it. The keyword subset is exported
  (`src/lib/core.ts#SUPPORTED_SCHEMA_KEYWORDS`) so a test can pin exactly what "we implement a subset" means.
- A numeric field means "nothing but a number", because output files are text. That is what makes
  `{{ risk_score < 7 }}` a comparison over data instead of over prose.

## Consequences

- `library/schemas/` is part of the tree: seeded, exported, rewritten by `saveRoleFromNode`, hand-editable.
- `validator: null` is the single opt-out and it is a line in the user's own node file; the cost of opting out is
  asserted, not glossed (`src/lib/__tests__/execution.test.ts`).
- Enforcement exists, authoring does not: no schema editor. Kept open as a wound in
  `docs/ARCHITECTURE.md#9` rather than declared solved by this document.

## Mechanism

`docs/ARCHITECTURE.md#4.9.1` (the subset and who owns it) and `#5.8` (where in the run it refuses).
