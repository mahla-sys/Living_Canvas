#!/usr/bin/env node
/* ============================================================
   Palette gate — appearance is a contract, so it is checked like one (docs/ui-spec.md §3, §9).

   Three rules, none of which a code review reliably catches twice in a row:
     1. a theme is a set of CSS custom properties. Every `THEME_IDS` entry must have a `:root[data-theme]`
        block in `src/index.css`, and no block may exist without an id — otherwise the Settings dropdown
        can offer something that renders as the default, which reads as "the theme is broken".
     2. a theme that cannot be read is not a theme. Text and accent roles are measured against the
        canvas background of *each* theme (WCAG 2.1 relative luminance), and a newly added theme may not
        be dimmer than the one it joins.
     3. one place per colour. A hex outside the token blocks means a component that a theme switch will
        miss; that is how "themable" becomes a claim instead of a property.

     node scripts/check-palette.mjs        # report; exit 1 on any violation
   ============================================================ */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(ROOT, "src/index.css"), "utf8");
const core = readFileSync(join(ROOT, "src/lib/core.ts"), "utf8");

const problems = [];
const fail = (msg) => problems.push(msg);

/* ---- the two sides of the registry, read from the files that define them ---- */
const idsFrom = (src, re) => (src.match(re)?.[1] ?? "").split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);
const THEME_IDS = idsFrom(core, /export const THEME_IDS = \[([^\]]*)\]/);
const DEFAULT_THEME = (core.match(/export const DEFAULT_THEME: ThemeId = "([^"]+)"/) ?? [])[1];
if (!THEME_IDS.length || !DEFAULT_THEME) fail("could not read THEME_IDS / DEFAULT_THEME from src/lib/core.ts");

const blockBody = (source, head) => {
  const at = source.search(head);
  if (at < 0) return null;
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
};

const baseBlock = blockBody(css, /@theme\s*\{/) ?? "";
const declaredBlocks = [...css.matchAll(/:root\[data-theme="([a-z0-9-]+)"\]\s*\{/g)].map((m) => m[1]);
const expected = THEME_IDS.filter((t) => t !== DEFAULT_THEME);
for (const t of expected) if (!declaredBlocks.includes(t)) fail(`theme "${t}" is offered in Settings but src/index.css has no :root[data-theme="${t}"] block`);
for (const t of declaredBlocks) if (!THEME_IDS.includes(t)) fail(`src/index.css defines a theme block for "${t}", which is not in THEME_IDS — nothing can select it`);

/* ---- token resolution: a theme overrides what it disagrees with, and falls back to `@theme` ----
   This used to short-circuit the default theme straight to `@theme`, on the assumption that the default *is*
   the base. That was true while botanical was default; the moment the default became a theme with its own
   block, the gate measured the base and reported two themes with identical numbers — a gate that prints the
   same row twice is not measuring anything. Own block first, base as the fallback, for every theme. */
function token(name, theme) {
  const own = (blockBody(css, new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{`)) ?? "")
    .match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (own) return own[1];
  const base = baseBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  return base ? base[1] : null;
}

const rgb = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const luminance = (hex) => {
  const lin = rgb(hex).map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const contrast = (a, b) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/* The two accent entries measure *roles* (`--color-lc-accent`, `--color-lc-warn`), not palette steps. That is
   what makes the gate follow a theme: a `:root[data-theme=…]` block that re-maps the accent is measured, where
   a component naming a palette step in a class would have sailed straight past it.

   Floors are absolute and deliberately above the WCAG AA line for text. This used to be paired with a second,
   relative rule — "no theme may be dimmer than the default" — which was dropped on purpose: it depended on
   *which* theme happened to be default, so making the brighter theme the default failed the gate for no reason
   a reader would recognise. Muted text moving from 4.5:1 to 6:1 is the replacement, and it is stricter than
   what it replaced for the thing that actually matters. */
const ROLES = [
  { token: "color-ink-100", label: "body text", min: 7 },
  { token: "color-ink-50", label: "titles", min: 7 },
  { token: "color-ink-300", label: "muted text", min: 6 },
  { token: "color-lc-accent", label: "primary action", min: 4.5 },
  { token: "color-lc-warn", label: "warning", min: 4.5 },
  { token: "color-ember", label: "error", min: 4.5 },
  { token: "color-sage", label: "success", min: 4.5 },
];
const ratios = new Map();
for (const theme of THEME_IDS) {
  const bg = token("color-ink-950", theme);
  if (!bg) { fail(`${theme}: no --color-ink-950 to measure against`); continue; }
  for (const role of ROLES) {
    const fg = token(role.token, theme);
    if (!fg) { fail(`${theme}: --${role.token} is not a hex literal in @theme, so it cannot be measured (roles must be palette steps)`); continue; }
    const r = contrast(fg, bg);
    ratios.set(`${theme}/${role.token}`, r);
    if (r < role.min) fail(`${theme}: ${role.label} is ${r.toFixed(2)}:1 on the canvas background, needs ${role.min}:1 (${fg} on ${bg})`);
  }
}
/* ---- an accent must be a different hue from the ink it sits on ----
   This rule exists because of a bug report, not a theory: with `plum` as the default theme, the plum theme's
   accent was also plum — hue 290 on an ink ramp of hue 265, 25 degrees apart. Every contrast floor passed,
   because the accent was plenty bright; the interface was simply one undifferentiated purple, and the reader
   said so in exactly those words. Contrast measures whether you *can* read something. Hue separation measures
   whether you can tell it apart from everything next to it, and no WCAG number covers that.

   60 degrees is the floor: it is well under the 106-117 degrees both shipped themes manage, and well over the
   25 that broke. */
const HUE_MIN = 60;
function hueOf(hexColour) {
  const [r, g, b] = rgb(hexColour).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0; // a grey has no hue, and a grey accent on a coloured ramp is already separated
  let x;
  if (mx === r) x = ((g - b) / d) % 6; else if (mx === g) x = (b - r) / d + 2; else x = (r - g) / d + 4;
  x *= 60;
  return Math.round(x < 0 ? x + 360 : x);
}
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
/* An achromatic ramp has no hue, so "how many degrees apart" is not a question that can be asked of it — and a
   gate that quietly computes `min(|290 - 0|, 70) = 70` for a grey would pass a theme for a reason that is not
   the reason it works. Against a grey ramp the separation is *chroma*: the accent has to actually be a colour.
   The neutral theme is what forced this case into the open. */
const saturation = (hexColour) => {
  const c = rgb(hexColour).map((v) => v / 255);
  const mx = Math.max(...c);
  return mx === 0 ? 0 : (mx - Math.min(...c)) / mx;
};
const CHROMA_MIN = 0.15;
const INK_CHROMA_FLOOR = 0.05; // below this an ink reads as grey, not as a hue
const separationOf = (theme) => {
  const accent = token("color-lc-accent", theme), ink = token("color-ink-950", theme);
  if (!accent || !ink) return null;
  if (saturation(ink) < INK_CHROMA_FLOOR) {
    const chroma = saturation(accent);
    if (chroma < CHROMA_MIN)
      fail(`${theme}: this theme's ink ${ink} is achromatic, so separation has to come from chroma — and the accent ${accent} has only ${chroma.toFixed(2)}, under ${CHROMA_MIN}. A grey accent on a grey ramp is not an accent`);
    return { kind: "chroma", value: chroma };
  }
  const gap = hueGap(hueOf(accent), hueOf(ink));
  if (gap < HUE_MIN)
    fail(`${theme}: the accent ${accent} (hue ${hueOf(accent)}°) is only ${gap}° from this theme's ink ${ink} (hue ${hueOf(ink)}°) — under ${HUE_MIN}°, so the interface reads as one flat colour. Give this theme an accent from a different hue family`);
  return { kind: "hue", value: gap };
};
for (const theme of THEME_IDS) separationOf(theme);

/* every theme is reported, so the numbers are in the log rather than only in a failure message */
const report = THEME_IDS.map((t) => {
  const sep = separationOf(t);
  const gap = !sep ? "" : sep.kind === "hue" ? `accent/ink hue gap ${sep.value}°` : `ink achromatic → accent chroma ${sep.value.toFixed(2)}`;
  const roles = ROLES.map((r) => {
    const ratio = ratios.get(`${t}/${r.token}`);
    return `${r.label} ${ratio == null ? "—" : ratio.toFixed(2) + ":1"}`;
  }).join(", ");
  return `${t} [${gap}]: ${roles}`;
}).join("\n  ");

/* ---- one place per colour ---- */
/* Two fixes here. The theme-block strip was a single non-global replace, so the day a second theme block
   existed, every hex in it was reported as "outside the token blocks" — the gate was right by accident while
   there was exactly one theme. And comments are removed before the scan: a hex inside `/* … *\/` paints
   nothing, and refusing one teaches people to write comments without the value in them. */
const outside = css
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/@theme\s*\{[\s\S]*?\n\}/g, "")
  .replace(/:root\s*\{[\s\S]*?\n\}/g, "")
  .replace(/:root\[data-theme="[a-z0-9-]+"\]\s*\{[\s\S]*?\n\}/g, "");
for (const [i, line] of outside.split("\n").entries()) {
  if (/#[0-9a-fA-F]{3,8}\b/.test(line)) fail(`src/index.css: colour literal outside the token blocks — line ~${i + 1}: ${line.trim().slice(0, 60)}`);
}

/* ---- one place per colour, in the components too ----
   The old rule only caught Tailwind arbitrary values (`bg-[#fff]`). That left every inline style free, which
   is where the actual literals were: a status map, an event-tag map, a toast palette, two `boxShadow` glows —
   ~40 hexes that a theme switch missed entirely, so "themable" was a claim about half the UI.

   The rule now is: no hex anywhere in a component. One exception, and it is a *stated* one: a line ending in
   `// lc-data-colour` is a colour that gets written into a canvas file (a node's colour, a stroke's), where
   it is data the user drew rather than chrome we paint. Re-tinting those would rewrite somebody's graph. */
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const stripComment = (line) => line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
const dir = join(ROOT, "src/components");
let dataColours = 0;
let fallbacks = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
  const text = readFileSync(join(dir, f), "utf8");
  for (const [i, line] of text.split("\n").entries()) {
    if (/\/\/\s*lc-data-colour\b/.test(line)) { if (HEX.test(line)) dataColours++; continue; }
    // comments are stripped before the test: a hex in prose paints nothing, and the CSS scan above does the same
    if (!HEX.test(stripComment(line))) continue;
    fail(`src/components/${f}:${i + 1} colour literal — use a role token (var(--color-…)) or mark the line \"// lc-data-colour\" if it is written into a canvas file: ${line.trim().slice(0, 70)}`);
  }
}

/* `src/main.tsx` was outside this rule, which is how a whole panel escaped it: the error surface that renders
   when the app has already died was hardcoded to the botanical palette, amber button included, and no theme
   reached it. Its literals are legitimate but narrow — this is the one place where a `var()` alone is unsafe,
   because the stylesheet may be the thing that failed to load, and an invisible Recover button on the panel
   whose only job is to offer recovery is worse than a hardcoded colour. So here a hex is allowed in exactly
   one position: as the fallback of a token, `var(--color-…, #…)`. Anything else fails. */
/* `index.html` is scanned under the same rule, and it needs one extra shape: the favicon is a data-URI, where
   `#` is percent-encoded, so a colour there reads `%23b98bc2`. Both spellings are checked. This file was the
   last surface no gate looked at, and it is the one every reader sees first. */
const HTML_HEX = /(?:#|%23)[0-9a-fA-F]{3,8}\b/;
const html = readFileSync(join(ROOT, "index.html"), "utf8");
for (const [i, line] of html.split("\n").entries()) {
  const bare = stripComment(line);
  if (!HTML_HEX.test(bare)) continue;
  const guarded = bare
    .replace(/var\(--[a-z0-9-]+,\s*(?:#|%23)[0-9a-fA-F]{3,8}\)/g, () => { fallbacks++; return ""; })
    .replace(/%23[0-9a-fA-F]{6}/g, () => { dataColours++; return ""; }); // the favicon data-URI
  if (HTML_HEX.test(guarded))
    fail(`index.html:${i + 1} colour literal outside a var() fallback — the pre-React splash follows the theme once the stylesheet loads, and falls back to a literal only when it does not: ${line.trim().slice(0, 70)}`);
}

const boot = readFileSync(join(ROOT, "src/main.tsx"), "utf8");
for (const [i, line] of boot.split("\n").entries()) {
  if (!HEX.test(stripComment(line))) continue;
  const withFallbacksRemoved = line.replace(/var\(--[a-z0-9-]+,\s*#[0-9a-fA-F]{3,8}\)/g, (m) => { fallbacks++; return ""; });
  if (HEX.test(stripComment(withFallbacksRemoved)))
    fail(`src/main.tsx:${i + 1} colour literal outside a var() fallback — the error surface follows the theme when the stylesheet loads, and falls back to a literal only when it does not: ${line.trim().slice(0, 70)}`);
}

/* ---- a retired palette step may not come back as chrome ----
   `amber-lc` is still declared in `@theme` because node colours, swatches and strokes write it into files
   (ADR-010). That is data. What this rule forbids is the other half: a component naming the step in a class
   or a style, which is how 146 chrome usages existed while every contrast floor still passed. The hex rule
   above cannot catch it — `text-amber-lc` contains no hex — so this is the rule that makes "no yellow in the
   interface" checkable rather than a promise. */
const RETIRED_AS_CHROME = ["amber-lc", "amber-deep"];
for (const f of [...readdirSync(dir).filter((n) => n.endsWith(".tsx")).map((n) => join(dir, n)), join(ROOT, "src/main.tsx")]) {
  const text = readFileSync(f, "utf8");
  for (const [i, line] of text.split("\n").entries()) {
    const body = stripComment(line);
    for (const step of RETIRED_AS_CHROME) {
      if (body.includes(step))
        fail(`${f.replace(ROOT + "/", "")}:${i + 1} names the retired palette step \"${step}\" — chrome paints with --color-lc-accent / --color-lc-warn; ${step} is canvas data only (ADR-010)`);
    }
  }
}

/* ---- a retired colour may not come back as rgb() either ----
   Five amber usages survived the removal of amber from every component because they were written as
   `rgba(232, 176, 75, …)`. Two of them were `--lc-selection` and `--lc-ring-running` — the selection highlight
   and the running ring, the most visible chrome in the app — and they sat inside the `:root` token block that
   this script strips before scanning for literals. A hex rule cannot see a triplet, so the triplet gets its
   own check: the retired step's own r,g,b, with any alpha. */
for (const step of RETIRED_AS_CHROME) {
  // the palette step is declared as `--color-<step>`, not `--<step>` — looking for the latter found nothing and
  // the whole loop silently `continue`d, which is how this rule shipped with no teeth
  const value = (baseBlock.match(new RegExp(`--color-${step}:\\s*(#[0-9a-fA-F]{6})`)) ?? [])[1];
  if (!value) continue;
  const [r, g, b] = rgb(value);
  const triplet = new RegExp(`rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*[,)]`, "i");
  const targets = [...readdirSync(dir).filter((n) => n.endsWith(".tsx")).map((n) => join(dir, n)),
                   join(ROOT, "src/main.tsx"), join(ROOT, "index.html"), join(ROOT, "src/index.css")];
  for (const f of targets) {
    const text = readFileSync(f, "utf8");
    for (const [i, line] of text.split("\n").entries()) {
      if (triplet.test(stripComment(line)))
        fail(`${f.replace(ROOT + "/", "")}:${i + 1} paints with the retired step ${step} as an rgb() triplet (${r}, ${g}, ${b}) — derive it from the role token with color-mix() instead (ADR-010)`);
    }
  }
}

if (problems.length) {
  console.error(`palette: ${problems.length} problem(s)\n` + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`palette check: ${THEME_IDS.length} theme(s) [${THEME_IDS.join(", ")}], ${ROLES.length} roles per theme, no colour literals outside the token blocks (${dataColours} canvas-data line(s) marked, ${fallbacks} guarded fallback(s) in main.tsx/index.html)\n  default theme: ${DEFAULT_THEME}\n  ${report}`);
