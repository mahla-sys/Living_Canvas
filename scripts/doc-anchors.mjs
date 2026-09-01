#!/usr/bin/env node
/* ============================================================
   Regenerates the line anchors inside `docs/ARCHITECTURE.md` §3.4
   (the `src/lib/engine.ts` symbol map) from the current source file.

   The doc quotes `name 412` style anchors so a reader with no editor open can jump straight to a
   behaviour. They rot every time engine.ts grows, which is why they are generated instead of typed:
   a wrong line number in a reference doc is worse than no line number, because it is believed.

     node scripts/doc-anchors.mjs          # rewrite the doc in place
     node scripts/doc-anchors.mjs --check  # exit 1 if anything is stale (CI can gate this)

   Only numbers change. A name that cannot be found in engine.ts is reported and left alone — the
   function was renamed or deleted, and that is a doc edit, not a number to patch.
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = join(ROOT, "docs/ARCHITECTURE.md");
const SRC = join(ROOT, "src/lib/engine.ts");
const CHECK = process.argv.includes("--check");

/** every top-level declaration in engine.ts, first occurrence wins */
function symbolLines(text) {
  const map = new Map();
  const decl = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|class|interface|type)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = decl.exec(text))) {
    const name = m[1];
    if (!map.has(name)) map.set(name, text.slice(0, m.index).split("\n").length);
  }
  return map;
}

const lines = readFileSync(SRC, "utf8").split("\n");
const symbols = symbolLines(lines.join("\n"));
const doc = readFileSync(DOC, "utf8");

const start = doc.indexOf("## 3.4 `src/lib/engine.ts`");
const end = doc.indexOf("## 3.5 ", start);
if (start < 0 || end < 0) {
  console.error("doc-anchors: §3.4 not found in docs/ARCHITECTURE.md — refusing to guess.");
  process.exit(1);
}
const block = doc.slice(start, end);

const missing = [];
let updated = 0;
// `name`, or `name(args)`, or `name` (private) — the three shapes the table uses — then the number
const ANCHOR = /`([A-Za-z_$][\w$]*)(?:\([^`]*\))?`\*{0,2}(?: \(private\))?\*{0,2}\s+\*{0,2}(\d+)(?=\s|,|\)|$|\*\*)/g;
const next = block.replace(ANCHOR, (full, name, old) => {
  const line = symbols.get(name);
  if (line === undefined) {
    missing.push(name);
    return full;
  }
  if (String(line) !== old) updated++;
  return full.slice(0, full.length - old.length) + String(line);
});

const changed = next !== block;
if (changed && !CHECK) writeFileSync(DOC, doc.slice(0, start) + next + doc.slice(end));

const report = `${updated} anchor(s) updated${missing.length ? `, unresolved: ${[...new Set(missing)].join(", ")}` : ""}`;
if (CHECK && changed) {
  console.error(`doc-anchors: docs/ARCHITECTURE.md §3.4 is stale (${report}). Run: node scripts/doc-anchors.mjs`);
  process.exit(1);
}
console.log(`doc-anchors: ${changed ? report : "already current"}`);
