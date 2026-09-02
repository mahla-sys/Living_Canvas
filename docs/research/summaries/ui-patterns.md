---
title: UI patterns borrowed from other tools
status: frozen
updated: 2026-09-01
sources: [docs/ARCHITECTURE.md#6, docs/notes/ideas.md]
---

# UI patterns, borrowed with attribution and scepticism

**Provenance, and it matters:** these ten patterns are a design partner's reading of other products (no code
access, no external check performed on 2026-09-01). Each row is a *claim about intent*, not a fact about those
apps — verify before quoting one in a review, and never cite this file as a requirement.

| # | pattern | seen in | the transferable idea | ours today |
|---|---|---|---|---|
| 1 | Inspect pane | RimWorld, Factorio, Dwarf Fortress | one click on a thing shows *everything about that thing*, in place | mostly built; missing pointers, see `docs/patterns/node-inspector.md` |
| 2 | Colonist bar | RimWorld, Dwarf Fortress | the state of all agents, glanceable, before you select any | absent; the highest-value UI idea if identity → life recorder |
| 3 | Overlay modes | Oxygen Not Included, Factorio | one key changes *what question the screen answers* | parked (`docs/roadmap/phase-4.md`) |
| 4 | Tooltip-as-narrative | Crusader Kings 3 | every number can say why it is that number | the node card does this for failures only — the best-matched pattern in the list |
| 5 | Situation log | Stellaris | grouped, pinnable, low-noise events | the console is a flat 250-line list; the ledger is the durable half |
| 6 | Pie menu | The Sims | actions near the object, not in a panel | idea |
| 7 | Blueprint | Factorio | copy a structure, not a screenshot of one | roles + templates exist; the seed that faked it was removed |
| 8 | Colour-coded status | Dwarf Fortress | state must be readable at a glance, without text | done (`#3.4`/`STATUS_LABEL`) |
| 9 | Zoom-dependent detail | RimWorld, Stellaris | less detail when far is not optional at scale | done as discrete view modes; continuous LOD parked |
| 10 | Alerts | RimWorld, ONI | something changed *while you were elsewhere* | toasts; no persisted alert list |

## The one pattern this project should refuse

Everything above is a *view* pattern except overlay modes, and views are cheap to propose and cheap to keep
rotting. The two rows worth spending on are 2 and 4 — one because it makes the agents legible without opening
anything, one because a refusal nobody can read is a refusal nobody believes. Both are also the two cheapest:
a strip that reads existing state, and a line of text we already produce.
