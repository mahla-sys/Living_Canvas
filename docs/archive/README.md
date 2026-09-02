# archive

A superseded document comes here whole, with one line added at the top: what replaced it, and why. The point is
not storage — an unreferenced file is already deleted in practice — it is that the *reason* a thing was dropped
is the part nobody can reconstruct later. So the format is:

    superseded_by: docs/decisions/adr-00x-….md
    because: <one sentence, the argument, not the date>

Nothing here yet. Two things that were *proposed* for this repository and never written are worth recording,
because their absence is a decision:

- `docs/architecture/` — a paraphrase of `ARCHITECTURE.md` in eight files. Not created: two sources of truth for
  one mechanism is the exact bug ADR-002 deleted a cache for.
- `docs/research/apps/` and `docs/research/games/` — eighteen per-product notes. Not created: they are the raw
  material of `../research/summaries/`, and a per-app file nobody has to keep current is a place where stale
  claims go to look authoritative. If a summary row is ever disputed, that is when an app file gets written —
  with a date and a source.
