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

/* ---- token resolution: a theme only overrides what it disagrees with ---- */
function token(name, theme) {
  const block = theme === DEFAULT_THEME ? baseBlock : blockBody(css, new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{`)) ?? "";
  const own = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (own) return own[1];
  const base = baseBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  return base ? base[1] : null;
}

const luminance = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const lin = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const contrast = (a, b) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const ROLES = [
  { token: "color-ink-100", label: "body text", min: 7 },
  { token: "color-ink-50", label: "titles", min: 7 },
  { token: "color-ink-300", label: "muted text", min: 4.5 },
  { token: "color-amber-lc", label: "primary action", min: 4.5 },
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
// a new theme must not be the reason text becomes unreadable
for (const role of ROLES) {
  const now = ratios.get(`${DEFAULT_THEME}/${role.token}`);
  for (const theme of THEME_IDS) {
    if (theme === DEFAULT_THEME) continue;
    const proposed = ratios.get(`${theme}/${role.token}`);
    if (now != null && proposed != null && proposed < now - 0.01)
      fail(`${theme}: ${role.label} is dimmer than ${DEFAULT_THEME} (${proposed.toFixed(2)}:1 vs ${now.toFixed(2)}:1) — re-tint the ink ramp, not just the background`);
  }
}

/* ---- one place per colour ---- */
const outside = css
  .replace(/@theme\s*\{[\s\S]*?\n\}/, "")
  .replace(/:root\s*\{[\s\S]*?\n\}/, "")
  .replace(/:root\[data-theme="[a-z0-9-]+"\]\s*\{[\s\S]*?\n\}/, "");
for (const [i, line] of outside.split("\n").entries()) {
  if (/#[0-9a-fA-F]{3,8}\b/.test(line)) fail(`src/index.css: colour literal outside the token blocks — line ~${i + 1}: ${line.trim().slice(0, 60)}`);
}

const dir = join(ROOT, "src/components");
for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
  const text = readFileSync(join(dir, f), "utf8");
  for (const [i, line] of text.split("\n").entries()) {
    if (/\[#([0-9a-fA-F]{3,8})\]/.test(line)) fail(`src/components/${f}:${i + 1} Tailwind colour literal — use a token: ${line.trim().slice(0, 60)}`);
  }
}

if (problems.length) {
  console.error(`palette: ${problems.length} problem(s)\n` + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`palette check: ${THEME_IDS.length} theme(s) [${THEME_IDS.join(", ")}], ${ROLES.length} roles per theme measured, colour literals confined to the token blocks`);
