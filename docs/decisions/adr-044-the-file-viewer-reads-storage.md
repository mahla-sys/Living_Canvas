---
title: The file viewer reads storage, not state
status: accepted
updated: 2026-09-24
sources: [src/components/SidePanels.tsx, src/store.ts#openStorageFile]
---

## Context
`buildFileContent` in `store.ts` was a second serializer of file content: it re-derived
`canvas-overview.md`, `manifest.json`, `history/index.yaml` and the node/edge/memory files from
in-memory state, while the engine's real writers (`overviewMd`, the seed) wrote different bytes
for the same paths. The viewer's `manifest.json` was pinned at `structure_version: "1.3"` while
the seed writes `1.4`. The same path could read two different ways — what is on disk and what a
state copy would write. That is the two-truth disease the design exists to prevent.

## Decision
Delete `buildFileContent`. `FileRow` in every mode calls `openStorageFile(ROOT + path)`, i.e. the
viewer reads what the storage adapter has: IndexedDB, the live folder, or the server. There is one
reader of file content, and it is the same reader the engine writes through.

## Why
A viewer that shows a re-serialisation of state cannot notice when state and disk disagree — it
*is* the disagreement. Reading the file makes the viewer honest in all three modes at once, and
deletes an entire class of drift (the 1.3/1.4 pin never had to be fixed, because it no longer
exists).

## Consequences
The viewer shows exactly the bytes on disk in idb, live-folder and http modes. A file the engine
has not written yet reads as missing, which is the truth. The serializer's dead imports left
`store.ts`.
