---
title: Simulation mechanics that would deepen the agents
status: frozen
updated: 2026-09-01
sources: [docs/notes/ideas.md#product-identity, docs/roadmap/phase-3.md, docs/ARCHITECTURE.md#4.4]
---

# Game mechanics, as costed questions rather than features

**Provenance:** a design partner's reading of simulation games, no external verification performed
(2026-09-01). This is *not* a feature list; nothing here is scheduled. It is the reasoning behind
`docs/notes/ideas.md#product-identity`, kept because the mechanism it describes is what an answer would have to
be built on.

| # | mechanic | source | what it would mean here | the real cost |
|---|---|---|---|---|
| 1 | three-layer memory (short / long / core) | Dwarf Fortress | `memory/agents/<id>/` gains `diary.md`, `history.md`, `core.yaml` | a file-shape change plus a rule for what a run may read — Law 1 says the reader must exist first |
| 2 | periodic consolidation | Dwarf Fortress | a step that promotes diary lines into history at a threshold | a writer outside a run; today only `engine` writes files, and that single-writer property is worth more than the feature |
| 3 | needs decay | The Sims | an agent has a need that degrades between runs | requires time to be data (a run-independent clock) and a reason for the user to care |
| 4 | stress affecting output quality | DF, The Sims | a low-score run whose refusals cluster on stressed agents | cheap to fake, dishonest to build: the sim would have to *change the prompt*, which makes the contract a performance |
| 5 | personality drift | CK3, DF | role prompt + history produce a per-agent voice | needs a stable agent identity; today an agent *is* a node (`src/lib/engine.ts#deleteNode` deletes its memory) |
| 6 | relationships with weight | CK3 | edges carry affinity as well as data flow | changes what an edge means, which today is "one hop with an optional guard" |
| 7 | active/passive agents | Dwarf Fortress | N agents active per tick, the rest asleep | the right answer for scale, and it belongs to a scheduler we do not have (see function calling) |
| 8 | tick / step / pause | DF, ONI, Factorio | run at your own pace, single-step | the closest to free: the queue already exists, `step` is one queue pop exposed in the UI |
| 9 | legends mode | Dwarf Fortress | a timeline of everything that ever happened | `runs/` is already the row format; blocked on the same pruning question as history/snapshots |
| 10 | seeded generation | DF, Stellaris | reproducible starting canvas | trivial — and it is how a "demo pipeline" sneaks back in; `docs/ARCHITECTURE.md#5.3` |
| 11 | modular presets (ethics + civics + traits) | Stellaris | an agent = combination of role + contract + style | already half-built as role files with `default_output_contract`; the missing half is authoring, not storage |

## What this table actually argues

Two rows are cheap and honest (8 and 11), and one of them we already have sideways. Everything else needs
**a stable agent identity that survives the graph**, which is the single structural prerequisite for the whole
"living canvas" direction: today, deleting a node deletes its memory. So the real phase-3 question is not
"which mechanic do we add" but "does an agent exist independently of its node". That question belongs to the
owner, not to this file — see `docs/notes/ideas.md#product-identity`.
