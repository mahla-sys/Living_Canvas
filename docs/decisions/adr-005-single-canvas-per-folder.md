---
title: One canvas per attached folder — current behaviour, open decision
status: proposed
updated: 2026-09-01
sources: [src/lib/fs-access.ts#toRelativePath, docs/ARCHITECTURE.md#10, src/lib/__tests__/fs-access.test.ts]
---

# ADR-005 (proposed) — the picked folder *is* the canvas

## Context

`FsAccessStorageAdapter` maps the logical prefix `canvases/<id>/` onto the root of whatever directory the user
picks. That is right for "one Git repository, one project" and wrong for "one Obsidian vault, several canvases":
in a vault the canvas is a *sub*folder, and the picker gives no way to say which one.
`docs/ARCHITECTURE.md#10` (Q2) left this open deliberately. This file exists so the status quo cannot be
mistaken for a decision, and to put a cost next to the deferral.

## Current behaviour

One attached folder = one canvas. `src/lib/fs-access.ts#toRelativePath` strips the prefix and rejects anything
that escapes it (`src/lib/__tests__/fs-access.test.ts`), so another canvas's files inside the same directory are
unreadable by construction, not by accident.

## The two doors

- **Keep it.** Document "`canvases/<id>/` is the folder you attach", add a hint when the picked folder has no
  `manifest.json`, and let a vault be several folders. Cheapest, and consistent with a file-first tool whose
  multi-writer story is Git.
- **Add a `pickMany` mode.** Stop mapping the prefix away: accept a root, list the canvases inside it. Roughly
  thirty lines in the adapter plus picker UI, and it makes the vault case real instead of tolerated.

## Cost of waiting

Low today, rising with users: nothing in the wild depends on the mapping yet, but the first person who
attaches a vault root and gets an empty canvas has. Reversal after that point is a migration of muscle memory,
plus whatever `.gitignore` files people wrote around it.

## Ask

A ruling, then either `status: accepted` (keep it) or a successor ADR for vault mode. Until then this is a
description of behaviour — it must not be quoted against a proposal as if it were a constraint.
