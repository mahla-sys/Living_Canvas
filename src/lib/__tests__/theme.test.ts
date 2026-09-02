import { describe, it, expect, afterEach } from "vitest";
import { THEME_IDS, DEFAULT_THEME, isThemeId, THEMES } from "../core";
import { defaultSettings } from "../../state";

/* ============================================================
   The settings half of theming. The colour half — contrast, and "one place per colour" — is measured
   against the CSS itself by `scripts/check-palette.mjs`, because a test that reads `node:fs` would not
   type-check inside `src/` and should not: a test belongs to the app, a repository audit belongs to CI.
   ============================================================ */

const ORIGINAL = (globalThis as { localStorage?: unknown }).localStorage;
function fakeSettings(blob: string | null) {
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: () => blob,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}
afterEach(() => {
  (globalThis as unknown as { localStorage: unknown }).localStorage = ORIGINAL;
});

describe("theme registry", () => {
  it("every id has a label and a hint, and one of them is the default", () => {
    expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS]);
    expect(THEMES.some((t) => t.id === DEFAULT_THEME)).toBe(true);
    for (const t of THEMES) {
      expect(t.label.length).toBeGreaterThan(2);
      expect(t.hint).toMatch(/[a-z ]{6,}/); // a dropdown with nothing to say is a coin flip
    }
  });

  it("only registered ids survive: an old blob or a typo cannot select nothing", () => {
    expect(isThemeId("plum")).toBe(true);
    expect(isThemeId("neon-pink")).toBe(false);
    expect(isThemeId(undefined)).toBe(false);

    fakeSettings(JSON.stringify({ theme: "plum" }));
    expect(defaultSettings().theme).toBe("plum");

    fakeSettings(JSON.stringify({ theme: "hot-magenta" }));
    expect(defaultSettings().theme).toBe(DEFAULT_THEME);

    fakeSettings("{ not json");
    expect(defaultSettings().theme).toBe(DEFAULT_THEME);

    fakeSettings(JSON.stringify({ snapToGrid: "yes please" }));
    expect(defaultSettings().snapToGrid).toBe(false); // a truthy string is not consent to rewrite positions

    fakeSettings(JSON.stringify({ snapToGrid: true }));
    expect(defaultSettings().snapToGrid).toBe(true);
  });

  it("with nothing stored, the app is on the shipped palette and the grid is off", () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = undefined;
    const s = defaultSettings();
    expect(s.theme).toBe(DEFAULT_THEME);
    expect(s.snapToGrid).toBe(false);
  });
});
