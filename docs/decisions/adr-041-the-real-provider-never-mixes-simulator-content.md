---
title: The real provider's answer is never mixed with simulator content
status: accepted
updated: 2026-09-24
sources: [src/lib/engine.ts#extractFieldsFromReply, src/lib/__tests__/provider-honesty.test.ts]
---

## Context
On a real-provider success without a `write_output` tool call, the executor ran
`fields = { summary: text, ...simFields(...) }`. Every `simFields` branch carries a `summary` key,
and the spread came **last**, so the model's actual answer was silently overwritten by canned
simulator text; the other fields were boilerplate too. A provider run had spoken, and nobody had
listened. No test covered this path.

## Decision
The model's words are the output. If the model called `write_output`, those validated fields are
the output (`toolContext.deliveredFields`). If it answered with the requested JSON object, that
object is parsed into the fields. If it answered in prose, the prose is the `summary` — verbatim,
on disk. Whatever the model did not say is filled by the contract-derived simulator (ADR-040),
which labels itself as simulation in the text. The prompt now asks for the JSON shape explicitly.

## Why
Mixing sim and real is a lie in the record: a file under `outputs/` claims a provenance, and the
provenance must be true. Failing the node instead would have turned ordinary prose answers —
normal LLM behaviour — into dead runs; the labelled placeholder keeps the run alive while letting
the reader see exactly which part is the model and which part is the stand-in.

## Consequences
`outputs/<node>/summary.md` after a real run contains the model's own text. The mutation
`{ ...sim, summary: text }` → `{ summary: text, ...sim }` is caught by
`provider-honesty.test.ts`. A model that returns neither tools nor JSON is no longer erased.
