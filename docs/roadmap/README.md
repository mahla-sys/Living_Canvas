# Roadmap — the only place "when" lives

This directory owns scheduling. No other document in `docs/` may carry a `phase` field
(`scripts/check-docs.mjs` enforces it), because a schedule that is stored in twenty files is twenty schedules,
and moving one commitment between phases turns into a sweep that nobody finishes.

## Row format

- `- [ ]` — a candidate. It must name **where it comes from**: a decision, a pattern, or `no decision yet`.
- `- [x]` — shipped **and guarded**. The line must cite the test file that pins it (`schema.test.ts`), or a doc
  that describes the behaviour, or the gate script that enforces it. An untested `[x]` fails the doc gate: "done"
  without a guard is a claim about a mood.
- A row that can cite neither a decision, a pattern nor a `no decision yet` is an idea → `docs/notes/ideas.md`.

## Files

| file | state | meaning |
|---|---|---|
| `phase-1.md` | shipped | file substrate, contract, executor, ledger — closed, with a guard named per row |
| `phase-2.md` | active | the model chooses its tools; the UI explains refusals. Candidates, no commitments |
| `phase-3.md` | parked | depth for agents — blocked on the identity question, deliberately empty of promises |
| `phase-4.md` | parked | scale and collaboration; placeholders so "later" has a definition |

## Phase 1 is closed, and that is a claim with receipts

`phase-1.md` exists so that "shipped" has a definition attached to it in this repository. When adding a row
anywhere: if you cannot name the file in `src/lib/__tests__/` that fails when it regresses, it belongs in a later
phase, or in `docs/notes/ideas.md`, or nowhere.

## Order of work, one line

Decide `adr-005` (cheap now, migration later) → function calling (unblocks the ledger gaining model-side
columns) → the small doc/inspector gates. Depth (memory layering, diary, overlays) waits for the identity
answer, because every one of those rows is a consequence of it rather than a task.
