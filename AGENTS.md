# Living Canvas — AI Developer & Agent Instructions

This document defines the strict, non-negotiable rules for any AI agent or developer contributing to Living Canvas.

---

## 🏛️ Law 0: The "Docs-First" Principle (Documentation Before Coding)

> **No code may be written without prior documentation.**
> Any change without an ADR, test contract, or roadmap work-order entry will be rejected.

1. **Document Before Code**:
   - For any architectural change or structural bug fix, write or update an **Architecture Decision Record (ADR)** under `docs/decisions/adr-XXX-*.md` *before* editing source files.
   - The ADR body must be capped at 40 lines (enforced by `scripts/check-docs.mjs`).
   - Register the ADR in `docs/decisions/README.md`.
2. **Inbox for Unresolved Items**:
   - Any unanswered question, design uncertainty, or deferred feature must be recorded in `docs/inbox.md` with its cost and context attached. Never drop a question silently.
3. **Work Order & Scope**:
   - Every active task must have clear acceptance criteria in `docs/roadmap/work-order-2026-09.md`.

---

## 📁 Law 1: File-First & Single Source of Truth

1. **The Canvas is Plain Files**:
   - The repository files (`nodes/*.md`, `edges.yaml`, `strokes/*.json`, `memory/agents/*.md`, `logs/`) are the single source of truth.
   - IndexedDB and in-memory state are purely transient caches.
   - Never introduce secondary data schemas or synthetic shadow databases.
2. **Never Invent Phantom Metadata**:
   - Do not store derived data (such as transient filter strings or execution glyphs) in serialized node frontmatter.

---

## 🧪 Law 2: Test-First & Mutation Resilience

1. **Every Fix Must Have a Test with Teeth**:
   - Write tests in `src/lib/__tests__/` covering the exact failure condition.
   - Verify mutation resistance: if you revert the fix, the test MUST fail.
2. **Never Rely on Blind Assertions**:
   - Remember that `jsdom` does not calculate layout geometry (`scrollHeight`, `clientWidth`, CSS clipping). When testing layout/CSS rules, test DOM hierarchy, class contracts, or gate the built artifacts directly.

---

## 🎨 Law 3: Palette & Style Integrity

1. **Use Roles, Never Raw Hex Codes in Components**:
   - Components must consume design tokens (`--lc-accent`, `--lc-warn`, `--color-ink-*`, etc.).
   - Hex color literals in source code are only permitted for canvas user-data.
   - Every theme must satisfy color contrast ratios verified by `scripts/check-palette.mjs`.
2. **HTML & Layout Height Contract**:
   - `html` must have its own standalone rule setting `height: 100%` in `src/index.css`. Never combine with `body, #root`.

---

## 🌐 Law 4: Language & Bidi Hygiene

1. **English in Code**:
   - All code, identifiers, comments, tests, and commit messages must be strictly in English.
2. **Persian in Docs**:
   - Persian text is permitted only inside `docs/`.
   - Zero-width control characters (U+200B, U+200D–200F, U+202A–202E, U+2066–2069) are strictly prohibited everywhere (enforced by `scripts/check-english.mjs`).

---

## 🚀 Law 5: Repository Gates Must Pass

Before finishing any turn or committing, execute all gates:
```bash
node scripts/check-docs.mjs
node scripts/check-css.mjs
node scripts/check-palette.mjs
node scripts/check-english.mjs
node scripts/check-facts.mjs --check
npm test
npm run build
```
