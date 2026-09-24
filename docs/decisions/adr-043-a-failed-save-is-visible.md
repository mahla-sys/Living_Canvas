---
title: A failed save is a state the reader sees
status: accepted
updated: 2026-09-24
sources: [src/lib/engine.ts#markSaveFailed, src/lib/__tests__/save-failure.test.ts, src/components/Overlays.tsx]
---

## Context
The debounced save chain ended in `.catch(() => undefined)`. When a write failed — a revoked
folder permission in live-folder mode, a full disk, a server that stopped answering — the status
bar sat on "Saving…" forever and the files on disk went stale without a word. The store had no
`failed` state, so there was nowhere to say it.

## Decision
`saveState` gains `failed`. A failed write on the chain lands on `markSaveFailed`, which sets the
state and toasts once (throttled at 4 s, because a failing store fails every debounce). The status
bar's `SAVE_PHRASE` is a total record — add a value and TypeScript refuses to build without a
phrase — and now carries `failed: "Saving failed — files may be stale"` in the warn/ember role.

## Why
"Saving…" is a promise; keeping it after the write failed is a broken promise the reader would
catch only when the disk and the screen disagreed. The bar's job is to tell the reader whether
the last change reached the files, and "no" is one of the answers it must be able to give.

## Consequences
`save-failure.test.ts` holds the shape: a failing adapter walks the state saving → failed and the
toast fires; a healed adapter walks failed → saved. The optimistic `saving` moment is unchanged;
only the silent failure is gone.
