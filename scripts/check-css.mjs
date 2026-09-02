#!/usr/bin/env node
/* ============================================================
   check-css — the built stylesheet must actually contain the rules the app's layout depends on.

   Why this exists. `src/index.css` declared:

       html,
       body,
       #root { height: 100%; … }

   and the bundler emitted `,body,#root{…height:100%…}` — the `html` selector dropped, the comma left behind.
   A selector list starting with a comma is invalid, CSS error recovery discards the entire rule, so `body`
   and `#root` silently lost their height too. Nothing in the app then had a bounded height, and no
   `overflow-y: auto` container could scroll — which is why adding `min-h-0` to the scrollers changed nothing.

   Two checks: a source rule (cheap, runs without a build) and a build-output rule (runs when `dist/` exists).
   The second is the one with real teeth, because the bug was invisible in the source.
   ============================================================ */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const problems = [];
const cssPath = "src/index.css";
const css = readFileSync(cssPath, "utf8");

/* ---- 1. source: `html` must stand alone in any rule that sets a height ---- */
// strip comments so a rule mentioned in prose is not mistaken for a declaration
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = ruleRe.exec(stripped))) {
  const selectors = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  const body = m[2];
  if (selectors.includes("html") && selectors.length > 1) {
    problems.push(
      `${cssPath}: \`html\` shares a rule with ${selectors.filter((s) => s !== "html").join(", ")}. ` +
        `The bundler drops it from the emitted list and leaves an invalid selector behind, which discards the ` +
        `whole rule. Give \`html\` its own rule.`,
    );
  }
  if (selectors.includes("html") && !/height\s*:/.test(body)) {
    problems.push(`${cssPath}: the \`html\` rule sets no height — \`body { height: 100% }\` needs it.`);
  }
}
if (!/(^|\})\s*html\s*\{[^}]*height\s*:\s*100%/m.test(stripped.replace(/\s+/g, " "))) {
  problems.push(`${cssPath}: no standalone \`html { height: 100% }\` rule.`);
}

/* ---- 2. build output: the emitted stylesheet must carry it ---- */
const distDir = "dist/assets";
if (existsSync(distDir)) {
  const cssFiles = readdirSync(distDir).filter((f) => f.endsWith(".css"));
  const built = cssFiles.map((f) => readFileSync(join(distDir, f), "utf8")).join("\n");
  if (!cssFiles.length) problems.push(`${distDir}: no stylesheet was emitted.`);
  else {
    if (!/html\{[^}]*height:100%/.test(built)) {
      problems.push(
        `dist: no \`html{…height:100%…}\` in the built CSS (${cssFiles.join(", ")}). ` +
          `Without it body and #root resolve \`height: 100%\` against \`auto\` and nothing in the app can scroll.`,
      );
    }
    // the exact failure this gate was written for: a selector list that begins with a comma
    const leadingComma = built.match(/(^|[}\s])(,\s*[\w.#[:])/);
    if (leadingComma) {
      problems.push(`dist: the built CSS contains a selector list starting with a comma — that rule is discarded.`);
    }
  }
} else {
  console.log("(dist/ not present — skipped the built-stylesheet check; run `npm run build` first for full coverage)");
}

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(`\n${problems.length} problem(s) — css check failed`);
  process.exit(1);
}
console.log("css check: source rules and built stylesheet both carry the layout height");
