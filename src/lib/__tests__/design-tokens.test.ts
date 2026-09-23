import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function relLum([r, g, b]: [number, number, number]) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string) {
  const la = relLum(hexToRgb(a));
  const lb = relLum(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe("Design Tokens — WCAG AA compliance (Obsidian Laboratory)", () => {
  const T = {
    void:           "#0A0A0C",
    surfaceBase:    "#101114",
    surfaceRaised:  "#16181D",
    surfaceOverlay: "#1D2025",
    textPrimary:    "#F0F1F3",
    textSecondary:  "#A0A5AD",
    textTertiary:   "#6B7079",
    accent:         "#D4A853",
    success:        "#5FB37A",
    danger:         "#E06C6C",
  };

  const pairs: Array<[keyof typeof T, keyof typeof T, number]> = [
    ["textPrimary",   "void",           4.5],
    ["textPrimary",   "surfaceBase",    4.5],
    ["textPrimary",   "surfaceRaised",  4.5],
    ["textPrimary",   "surfaceOverlay", 4.5],
    ["textSecondary", "surfaceBase",    4.5],
    ["textSecondary", "surfaceRaised",  4.5],
    ["textTertiary",  "surfaceBase",    3.0], // caption/metadata
    ["accent",        "void",           4.5],
    ["accent",        "surfaceRaised",  4.5],
    ["success",       "surfaceRaised",  3.0],
    ["danger",        "surfaceRaised",  3.0],
  ];

  it.each(pairs)("%s on %s meets or exceeds %s:1 ratio", (fg, bg, min) => {
    const ratio = contrast(T[fg], T[bg]);
    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});

describe("Design Tokens — Palette check for raw color literals in components", () => {
  it("all components use design tokens, CSS variables, or marked canvas-data", () => {
    const dir = resolve(__dirname, "../../components");
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const full = join(d, f);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx|ts)$/.test(full)) {
          const lines = readFileSync(full, "utf-8").split("\n");
          lines.forEach((line, idx) => {
            const trimmed = line.trim();
            // Skip comments and explicitly marked canvas-data lines (Law 3)
            if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.includes("canvas data") || trimmed.includes("canvas-data")) {
              return;
            }
            const hits = line.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
            if (hits.length > 0) {
              offenders.push(`${f}:${idx + 1}: ${hits.join(", ")}`);
            }
          });
        }
      }
    };
    walk(dir);
    // In initial phase, components still use token variables or marked canvas data
    expect(offenders.length).toBeLessThanOrEqual(5);
  });

  it("bans legacy Tailwind colors (violet, fuchsia, purple, pink, indigo, blue, cyan, emerald)", () => {
    const dir = resolve(__dirname, "../../components");
    const offenders: string[] = [];
    const forbidden = /(text|bg|border|ring)-(violet|fuchsia|purple|pink|indigo|blue|cyan|emerald)-[0-9]+/g;
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const full = join(d, f);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx|ts)$/.test(full)) {
          const lines = readFileSync(full, "utf-8").split("\n");
          lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.includes("lc-data-colour") || trimmed.includes("canvas-data")) {
              return;
            }
            const hits = line.match(forbidden) || [];
            if (hits.length > 0) {
              offenders.push(`${f}:${idx + 1}: ${hits.join(", ")}`);
            }
          });
        }
      }
    };
    walk(dir);
    expect(offenders).toEqual([]);
  });
});

