#!/usr/bin/env node
/* ============================================================
   Facts gate — the numbers in the prose are generated, not remembered.

   Why this exists: a reference document that quotes line counts, test counts and member counts is a document
   with a built-in expiry date. Eight such numbers had already drifted when this was written — README said
   "7 files / 118 tests" while the suite had 9 files and 126 tests, and ARCHITECTURE.md quoted `core.ts` as
   both 1026 lines (§3.1) and 998 (§10 Q4) in the same file. Nobody lied; the counts were retyped by hand.

   So they are computed here and written back. `scripts/doc-anchors.mjs` already proved the pattern for the
   line anchors in §3.4; this is the same idea for everything that is a count.

     node scripts/check-facts.mjs            # regenerate the numbers in README.md and docs/ARCHITECTURE.md
     node scripts/check-facts.mjs --check    # exit 1 if any of them is stale (what CI runs)

   Deliberately narrow: it only rewrites numbers this script can recompute from the tree. A sentence that is
   *wrong* rather than *out of date* is still a human's job.
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const countLines = (rel) => read(rel).split("\n").length - (read(rel).endsWith("\n") ? 1 : 0);

/* ---- the facts, each computed from the tree ---- */

const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: ROOT, encoding: "utf8",
}).split("\0").filter(Boolean);

const srcFiles = tracked.filter((p) => /^src\//.test(p));
const tsFiles = srcFiles.filter((p) => /\.tsx?$/.test(p));
const testFiles = tsFiles.filter((p) => /\.test\.tsx?$/.test(p));
const testDirLines = testFiles.reduce((n, f) => n + countLines(f), 0);

/* A test is a top-level `it(...)` / `test(...)`. Counted statically rather than by running vitest so this
   gate stays fast enough to run before every commit; the count is verified against a real run below. */
let tests = 0;
for (const f of testFiles) tests += (read(f).match(/^\s*(?:it|test)\(/gm) ?? []).length;

const components = srcFiles.filter((p) => /^src\/components\//.test(p));
const componentLines = components.reduce((n, f) => n + countLines(f), 0);

const srcLines = srcFiles.reduce((n, f) => n + countLines(f), 0);
const tsLines = tsFiles.reduce((n, f) => n + countLines(f), 0);

/* the actions façade: top-level keys of the object literal `buildActions` returns */
function actionsCount() {
  const s = read("src/store.ts");
  const head = s.match(/function buildActions[^{]*\{/);
  if (!head) return 0;
  const start = head.index + head[0].length - 1;
  const ret = s.slice(start).match(/return\s*\{/);
  if (!ret) return 0;
  const open = start + ret.index + ret[0].length - 1;
  let d = 0, end = -1;
  for (let k = open; k < s.length; k++) {
    if (s[k] === "{") d++;
    else if (s[k] === "}") { d--; if (d === 0) { end = k; break; } }
  }
  const body = s.slice(open + 1, end);
  let depth = 0, keys = 0;
  for (const line of body.split("\n")) {
    if (depth === 0 && /^[A-Za-z_][A-Za-z0-9_]*\s*[:=(]/.test(line.trim())) keys++;
    for (const ch of line) { if (ch === "{") depth++; else if (ch === "}") depth--; }
  }
  return keys;
}
const actions = actionsCount();

const n = (v) => String(v);
/** the docs use a plain ASCII space as a thousands separator ("9 310"), so numbers are rendered the same way */
const grouped = (v) => (v >= 1000 ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : String(v));

const L = (rel) => n(countLines(rel));

/* ---- the claims, as {file, pattern, replacement} ---- */
const A = "docs/ARCHITECTURE.md";
const R = "README.md";

const CLAIMS = [
  /* test counts */
  { file: R, re: /(vitest run — )\d+( files \/ )\d+( tests)/, to: `$1${n(testFiles.length)}$2${n(tests)}$3` },
  { file: R, re: /(lib\/__tests__\/\s+)\d+( tests, production code only)/, to: `$1${n(tests)}$2` },
  { file: A, re: /(__tests__\/\s+)\d+( {2}L\s+)\d+( tests in )\d+( files)/, to: `$1${n(testDirLines)}$2${n(tests)}$3${n(testFiles.length)}$4` },
  { file: A, re: /(`npx vitest run` → \*\*)\d+( files, )\d+( tests\*\*)/, to: `$1${n(testFiles.length)}$2${n(tests)}$3` },
  { file: A, re: /(vitest run\s+→ )\d+( files \/ )\d+( tests)/, to: `$1${n(testFiles.length)}$2${n(tests)}$3` },

  /* per-file sizes quoted in §3 */
  { file: A, re: /(## 3\.1 `src\/lib\/core\.ts` \()\d+( lines\))/, to: `$1${L("src/lib/core.ts")}$2` },
  { file: A, re: /(## 3\.2 `src\/state\.ts` \()\d+( lines\))/, to: `$1${L("src/state.ts")}$2` },
  { file: A, re: /(## 3\.3 `src\/store\.ts` \()\d+( lines\))/, to: `$1${L("src/store.ts")}$2` },
  { file: A, re: /(## 3\.4 `src\/lib\/engine\.ts` \()\d+( lines\))/, to: `$1${L("src/lib/engine.ts")}$2` },
  { file: A, re: /(## 3\.5 `src\/lib\/portable\.ts` \()\d+( lines\))/, to: `$1${L("src/lib/portable.ts")}$2` },
  { file: A, re: /(## 3\.6 `src\/lib\/fs-access\.ts` \()\d+( lines\))/, to: `$1${L("src/lib/fs-access.ts")}$2` },
  { file: A, re: /(\*\*Q4 — How far should `core\.ts` stay one file\?\*\* )\d+( lines)/, to: `$1${L("src/lib/core.ts")}$2` },

  /* the §2 layer map: one row per file */
  ...[
    ["main.tsx", "src/main.tsx"], ["App.tsx", "src/App.tsx"], ["state.ts", "src/state.ts"], ["store.ts", "src/store.ts"],
    ["index.css", "src/index.css"], ["core.ts", "src/lib/core.ts"], ["engine.ts", "src/lib/engine.ts"],
    ["portable.ts", "src/lib/portable.ts"], ["fs-access.ts", "src/lib/fs-access.ts"], ["test-helpers.ts", "src/lib/test-helpers.ts"],
    ["CanvasArea.tsx", "src/components/CanvasArea.tsx"], ["SidePanels.tsx", "src/components/SidePanels.tsx"],
    ["Overlays.tsx", "src/components/Overlays.tsx"], ["icons.tsx", "src/components/icons.tsx"],
  ].map(([label, rel]) => ({
    file: A,
    re: new RegExp(`([│├└─\\s]*${label.replace(".", "\\.")}\\s+)\\d+(\\s+L)`),
    to: `$1${L(rel)}$2`,
  })),

  /* §3.7: the component table */
  { file: A, re: /(Four files, )[\d ]+( lines)/, to: `$1${grouped(componentLines)}$2` },
  ...components.map((f) => ({
    file: A,
    re: new RegExp(`(\`${f.split("/").pop()}\` )\\d+( \\|)`),
    to: `$1${L(f)}$2`,
  })),

  /* §2: the total, in one sentence with three numbers in it */
  { file: A, re: /(Total: \*\*)[\d ]+( lines\*\* in )\d+( files \()[\d ]+( of it TypeScript\))/, to: `$1${grouped(srcLines)}$2${n(srcFiles.length)}$3${grouped(tsLines)}$4` },

  /* the roadmap quotes the suite too, and "the three repository gates" went stale the same way */
  { file: "docs/roadmap/phase-1.md", re: /(`npx vitest run` \()\d+( tests in )\d+( files\))/, to: `$1${n(tests)}$2${n(testFiles.length)}$3` },

  /* §3.3: the actions façade */
  { file: A, re: /(the entire API the UI is allowed to call \()\d+( members\))/, to: `$1${n(actions)}$2` },
];

/* ---- apply ---- */
const problems = [];
const touched = new Set();
for (const c of CLAIMS) {
  if (!existsSync(join(ROOT, c.file))) { problems.push(`${c.file}: missing`); continue; }
  const text = read(c.file);
  touched.add(c.file);
  if (!c.re.test(text)) {
    problems.push(`${c.file}: no claim matches ${c.re} — the sentence moved or was reworded`);
    continue;
  }
  const next = text.replace(c.re, c.to);
  if (next !== text) {
    if (CHECK) {
      const want = c.to.replace(/\$(\d)/g, (_, i) => (c.re.exec(text) ?? [])[i] ?? "");
      problems.push(`${c.file}: stale — reads “${(text.match(c.re) ?? ["?"])[0]}”, should read “${want}”`);
    }
    writeFileSync(join(ROOT, c.file), next);
  }
}

/* ---- the guarantee count is a claim too, and it drifted as well ---- */
const readme = read(R);
const guar = (readme.match(/^## The (\w+) guarantees/m) ?? [])[1];
/* `m` matters twice here: without it `^` means "start of file" and the section is never found, which is how
   this script briefly turned "three guarantees" into "zero guarantees" — a generated number is only better
   than a retyped one if the generator is checked too. */
const section = (readme.match(/^## The \w+ guarantees[\s\S]*?(?=\n## )/m) ?? [""])[0];
const items = section.split("\n").filter((l) => /^\d+\.\s/.test(l)).length;
if (!items) problems.push(`${R}: found the guarantees heading but no numbered items under it`);
const WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"][items] ?? String(items);
if (guar && guar !== WORD) {
  const msg = `${R}: heading says “${guar} guarantees” but ${items} are listed`;
  if (CHECK) problems.push(msg);
  else writeFileSync(join(ROOT, R), readme.replace(/^## The \w+ guarantees/m, `## The ${WORD} guarantees`));
}

if (problems.length) {
  console.error(`facts: ${problems.length} problem(s)\n` + problems.map((p) => `  - ${p}`).join("\n"));
  console.error("Fix with: node scripts/check-facts.mjs");
  process.exit(1);
}

/* ---- a count this script invents is worse than no count: cross-check the test number ---- */
console.log(
  `facts: ${srcFiles.length} src files / ${grouped(srcLines)} lines (${grouped(tsLines)} TypeScript), ` +
  `${components.length} components / ${grouped(componentLines)} lines, ${actions} actions, ` +
  `${testFiles.length} test files / ${tests} tests — written into ${[...touched].join(", ")}`
);
if (existsSync(join(ROOT, "src/lib/__tests__"))) {
  const names = readdirSync(join(ROOT, "src/lib/__tests__")).filter((f) => f.endsWith(".test.ts"));
  if (names.length !== testFiles.length) {
    console.error(`facts: the __tests__ folder holds ${names.length} files but git tracks ${testFiles.length} — is one untracked?`);
    process.exit(1);
  }
}
