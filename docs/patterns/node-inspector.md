---
title: Inspector — the gaps, not the layout
status: proposed
updated: 2026-09-01
sources: [src/components/SidePanels.tsx#ContractGroup, src/components/SidePanels.tsx#Section, src/lib/engine.ts#contractSelfTest, docs/ARCHITECTURE.md#6]
---

# Node inspector: four sections exist, three links are missing

## Already built (do not re-propose this)

`src/components/SidePanels.tsx` renders, per node: *Display & shape* (type, shape, colour, view mode, animation,
style), *Content* (the Markdown body, which is the file), *Agent configuration* (role, system prompt, model,
tools, `max_steps`, `max_tokens`, `require_approval`), *Context contract* (read and write path groups, via
`ContractGroup`), plus template listing, memory confidence and the self-test button. The "rich inspector" the
research asked for (RimWorld-style, `docs/research/summaries/ui-patterns.md` §1) is 80 % of the panel as it
stands.

## The actual gaps, in cost order

1. **Run ledger link.** The inspector knows the node; the run knows the steps. A "last run: `run-…`" line that
   opens `runs/<run-id>.md` in the FileViewer is a few lines and one existing action — and it is the difference
   between "the node failed" and "the node failed at `write_output`, and the ledger says why".
2. **Refusal is on the card, not in the panel.** `src/lib/engine.ts#setNodeError` writes the reason the card
   shows. The inspector should show the same string with a "copy" affordance, because the thing a user does with
   a refusal is paste it somewhere.
3. **Validator visibility.** `output_contract.validator` is a path in the node file and the inspector does not
   show it, so the single most consequential field of ADR-003 is invisible: a user cannot see that they are
   opted out, and cannot point at a schema. Show the path, whether the file resolves, and the last validation
   result. (Same shape as `contractSelfTest`, one field instead of three.)
4. **Memory diary.** The agent's own `memory/agents/<id>.md` is a document; the panel shows a confidence number
   and nothing else. A diary view is a *phase-3* question, not a panel change: it is only interesting if history
   is the product (`docs/notes/ideas.md#product-identity`). Until then: a link that opens the memory file.

## Rule for any of this

Nothing here adds a field. Every item is a pointer to a file the app already writes — which is the test for
whether an inspector change is allowed at all (`docs/ARCHITECTURE.md#1`, Law 1).
