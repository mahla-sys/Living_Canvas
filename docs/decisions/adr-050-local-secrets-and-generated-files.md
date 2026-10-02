---
title: Local secrets and generated files stay out of Git
status: proposed
updated: 2026-10-02
sources: [.gitignore, .env.example, docs/decisions/adr-047-no-credentials-in-the-repository.md]
---

## Context
A cleared ignore file allowed a local API key, installed dependencies, build output, and test artifacts into the branch. Those files are neither source nor canonical canvas data.

## Decision
Ignore `.env` files (except the empty `.env.example`) and generated dependency, build, coverage, and test-result directories. Remove already tracked generated files from the branch index. Before publishing, remove branch-only commits that contain local credentials or generated dependencies; rotate any credential that was committed.

## Why
A branch that merges cleanly must not publish a reader's secret or thousands of reproducible files. Ignoring a file does not untrack it, so the index and history both need review.

## Consequences
`npm install` and `npm run build` remain reproducible from manifests. Only placeholder variable names are documented; real keys are entered locally and never committed.
