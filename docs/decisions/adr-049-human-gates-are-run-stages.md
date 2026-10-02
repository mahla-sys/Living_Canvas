---
title: Human gates are explicit pipeline stages
status: proposed
updated: 2026-10-02
sources: [src/lib/engine.ts, src/components/CanvasArea.tsx, docs/roadmap/work-order-2026-09.md]
---

## Context
An agent-level approval interrupts after an agent has completed. A `human-gate` node is different: it is itself a queued stage and is incomplete until a person decides.

## Decision
Opening a gate pauses the queue and records its question. Approval records the answer and completes that gate before downstream work resumes. Rejection stops the run. In step mode, approval completes the current step but does not start the next one.

## Why
The queue must neither ask the same question forever nor skip an approval. A gate is not an agent and must never call a model.

## Consequences
Run tests cover approval, rejection, downstream execution, ledger records, and step-mode preservation. The canvas banner shows the gate question instead of claiming an output is ready.
