---
title: Model requests abort with the run and time out
status: accepted
updated: 2026-09-24
sources: [src/lib/engine.ts#askModel, src/lib/engine.ts#abortActiveRun, src/lib/__tests__/provider-honesty.test.ts]
---

## Context
`askModel` had neither a timeout nor an `AbortController`. A hung provider held the queue
forever — `stopRun` invalidated `run_id`, but the in-flight `fetch` kept running to completion and
its output was still written, because the real-provider path had no cancellation check between
the response and the file write. A "stop" during a model call was a delay, not a stop.

## Decision
Each request runs under a controller with a 120 s ceiling (named in the error: "…timed out after
120 s") and merged with the run's `AbortController`, which `executeNode` registers module-scoped
(`activeController`) so `stopRun`/`resetExecution`/`restoreSnapshot` can abort the request that is
actually running. The loop checks `shouldContinue` before every request and between two tool
calls, and the executor re-checks `aborted()` before a response may reach the files. An aborted
node leaves its state to the canceller.

## Why
A run is a promise that it can be stopped; the only way to keep it for a real provider is to own
the request. The timeout converts an infinite hang into a named failure the ledger can record.
Both are enforced where the wire is, not where the UI is.

## Consequences
`provider-honesty.test.ts` holds all three shapes: a stopped run sends no further request, a hung
provider rejects with the named timeout, and a mid-request abort surfaces as a clean cancellation.
A node whose response arrives after the run stopped no longer writes.
