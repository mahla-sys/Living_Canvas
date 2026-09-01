---
title: Templates — most of what the research asked for already exists, elsewhere
status: draft
updated: 2026-09-01
sources: [src/lib/engine.ts#saveRoleFromNode, src/lib/engine.ts#saveTemplate, src/lib/engine.ts#loadTemplates, docs/ARCHITECTURE.md#4.9, docs/ARCHITECTURE.md#5.3]
---

# Templates: which of the four kinds are real

The research asked for four template kinds (`docs/research/summaries/feature-pool.md` §8, after Factorio's
blueprints and Stellaris' empire presets). Checked against the tree, the count of genuinely missing kinds is
one — and one of them already exists under a different name, which is the more dangerous situation.

| asked for | reality | verdict |
|---|---|---|
| subgraph template | `library/templates/<id>/template.json` + `saveTemplate` / `loadTemplate` | exists |
| agent template (role + prompt + tools + contract) | **`library/roles/<id>.json`**, written by `saveRoleFromNode`, and it *additionally* carries the output contract and the schema file | exists, and better — do not build a parallel one |
| visual-style template | nothing; `library/shapes/*.json` holds per-shape defaults only | small, new, low value while one click sets colour and shape |
| layout template (positions only) | nothing | the one worth doing: 20 lines, and positions are already node frontmatter |

## The rule this file exists to hold

A template is a **file in the canvas**, or it is not a template (`docs/ARCHITECTURE.md#4.9`). Anything that
lives only in state — "apply this style to the selection" without writing `library/shapes/…` — reproduces the
`graph.json` mistake inside the library folder, and ADR-002 is the reason that is now a hard no.

Corollary, already decided once: **no built-in template ships.** A fresh canvas is structure plus one
"Start here" note (`docs/ARCHITECTURE.md#5.3`); the template list starts empty because a fabricated first entry
makes every screenshot of the tool a screenshot of a test. If onboarding needs a shape, the user saves it as a
template and the seed stays honest.

## If layout templates are ever built

Same shape as `saveTemplate`, minus everything but `id → position`: `library/templates/<id>/layout.json`.
Loading them must not create nodes, only move them — the moment a layout template can add a node it is a
subgraph template with less clarity.
