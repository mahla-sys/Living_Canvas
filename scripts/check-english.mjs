/* ============================================================
   English-only gate (docs/ARCHITECTURE.md §8, non-goal: no locale layer).
   The repository is English by decision: code, comments, UI strings, tests, docs.
   Any RTL-script or bidi-control character in a *tracked* file fails CI.
   The legacy Persian snapshot is git-ignored, so it is not in `git ls-files` and stays untouched.
   ============================================================ */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RANGES = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic supplement
  [0x0870, 0x089f], // Arabic extended-B
  [0x08a0, 0x08ff], // Arabic extended-A
  [0xfb1d, 0xfdff], // Hebrew presentation forms
  [0xfe70, 0xfeff], // Arabic presentation forms
  [0x200b, 0x200f], // zero-width + LTR/RTL marks
  [0x202a, 0x202e], // bidi embedding controls
  [0x2066, 0x2069], // bidi isolates
];

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const bad = [];
for (const f of files) {
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  text.split("\n").forEach((line, i) => {
    for (const ch of line) {
      const c = ch.codePointAt(0);
      if (RANGES.some(([lo, hi]) => c >= lo && c <= hi)) { bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`); break; }
    }
  });
}
if (bad.length) {
  console.error(`English-only rule broken in ${bad.length} line(s):\n` + bad.slice(0, 30).join("\n"));
  process.exit(1);
}
console.log(`english check: ${files.length} tracked files, no RTL script or bidi control characters`);
