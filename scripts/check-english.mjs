/* ============================================================
   Language gate (docs/ARCHITECTURE.md §8).
   Code, comments, UI strings and tests are English: RTL script is rejected in every tracked
   path outside docs/.
   docs/ may be Persian — the owner reads it there, and a doc that gets read beats a doc that
   is uniform. That exemption covers *script* only: bidi control characters and zero-width
   marks (U+200B, U+200D–200F, U+202A–202E, U+2066–2069) are rejected EVERYWHERE, docs/ included,
   because an invisible override is not a language — it corrupts diffs, grep, RTL detection
   and the next reader's line breaks, and no linter will ever explain it out loud.
   The legacy Persian snapshot is git-ignored, so it is not in `git ls-files` and stays untouched.
   ============================================================ */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RTL_SCRIPT = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic supplement
  [0x0870, 0x089f], // Arabic extended-B
  [0x08a0, 0x08ff], // Arabic extended-A
  [0xfb1d, 0xfdff], // Hebrew presentation forms
  [0xfe70, 0xfeff], // Arabic presentation forms
];
// Invisible characters. U+200C (ZWNJ) is deliberately NOT in this list for docs/: Persian
// orthography needs the non-joiner to spell its own verb prefixes correctly, so banning it
// there would ban the language rather than the bug. Outside docs/ even ZWNJ is rejected,
// since no identifier, comment or UI string has a reason to carry one.
const BIDI_CONTROL = [
  [0x200b, 0x200b], // zero-width space
  [0x200d, 0x200f], // ZWJ, LRM, RLM
  [0x202a, 0x202e], // bidi embedding controls
  [0x2066, 0x2069], // bidi isolates
];
const ZWNJ = [[0x200c, 0x200c]];
const DOCS = /^docs\//;

/* `--others --exclude-standard`, same as check-docs.mjs: a gate that only sees committed files cannot be run
   by the person adding the file, which is the one moment anyone would listen to it. Git-ignored material
   stays invisible, which is the point. */
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
}).split("\0").filter(Boolean);
const bad = [];
let rtlExempt = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  const exempt = DOCS.test(f);
  if (exempt) rtlExempt++;
  const ranges = exempt ? BIDI_CONTROL : [...RTL_SCRIPT, ...BIDI_CONTROL, ...ZWNJ];
  text.split("\n").forEach((line, i) => {
    for (const ch of line) {
      const c = ch.codePointAt(0);
      if (ranges.some(([lo, hi]) => c >= lo && c <= hi)) {
        const what = BIDI_CONTROL.some(([lo, hi]) => c >= lo && c <= hi)
          ? `bidi control U+${c.toString(16).toUpperCase().padStart(4, "0")}`
          : "RTL script";
        bad.push(`${f}:${i + 1}: ${what} — ${line.trim().slice(0, 70)}`);
        break;
      }
    }
  });
}
if (bad.length) {
  console.error(`language rule broken in ${bad.length} line(s):\n` + bad.slice(0, 30).join("\n"));
  console.error(`\nfix: bidi controls (and ZWNJ outside docs/) are banned everywhere; RTL text belongs in docs/ only.`);
  process.exit(1);
}
console.log(
  `language check: ${files.length} tracked files (${rtlExempt} under docs/ exempt from the English rule, ` +
    `none exempt from the bidi-control rule)`,
);
