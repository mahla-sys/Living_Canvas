import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readSettingsLocal, writeSettingsLocal, clearSettingsLocal, SETTINGS_KEY } from "../core";
import { defaultSettings } from "../../state";

/* ============================================================
   Law 4's third seam, as a contract rather than a sentence (ADR-007).

   The claim under test is not "localStorage works" — it is that `lc-settings` has exactly one way in and one
   way out, and that both are safe to call in a browser that has no storage at all. The bug this file exists
   for is the one the review found: `updateSettings` had its own `setItem` and `main.tsx` its own `getItem`,
   so "what lives in local settings" was answered by grep instead of by a function. A second reader or writer
   reintroduced anywhere would still pass this file — which is why `scripts/check-english.mjs`'s sibling gate
   is not the guard here; the guard is that these three functions are the only ones that mention the key.
   ============================================================ */

type FakeStore = Map<string, string>;

function installStorage(backing: FakeStore = new Map(), opts: { throws?: boolean } = {}) {
  const api = {
    getItem: (k: string) => {
      if (opts.throws) throw new Error("storage disabled");
      return backing.has(k) ? backing.get(k)! : null;
    },
    setItem: (k: string, v: string) => {
      if (opts.throws) throw new Error("quota exceeded");
      backing.set(k, String(v));
    },
    removeItem: (k: string) => {
      if (opts.throws) throw new Error("storage disabled");
      backing.delete(k);
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size;
    },
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = api;
  return backing;
}

const ORIGINAL = (globalThis as { localStorage?: unknown }).localStorage;

describe("readSettingsLocal", () => {
  beforeEach(() => installStorage());
  afterEach(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = ORIGINAL;
  });

  it("returns null when nothing has been stored", () => {
    expect(readSettingsLocal()).toBeNull();
  });

  it("round-trips what writeSettingsLocal stored", () => {
    writeSettingsLocal({ theme: "plum", owner: "mahla" });
    expect(readSettingsLocal()).toMatchObject({ theme: "plum", owner: "mahla" });
  });

  it("a corrupt blob is null, not an exception — a broken settings file costs a default, not a blank page", () => {
    installStorage(new Map([[SETTINGS_KEY, "{not json"]]));
    expect(readSettingsLocal()).toBeNull();
  });

  it("a JSON array or scalar is null: the blob must be an object to be settings", () => {
    installStorage(new Map([[SETTINGS_KEY, "[1,2,3]"]]));
    expect(readSettingsLocal()).toBeNull();
    installStorage(new Map([[SETTINGS_KEY, '"plum"']]));
    expect(readSettingsLocal()).toBeNull();
  });

  it("is null, and does not throw, when the browser has no localStorage at all", () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = undefined;
    expect(readSettingsLocal()).toBeNull();
  });

  it("is null when merely *reading* throws (Safari private mode)", () => {
    installStorage(new Map(), { throws: true });
    expect(readSettingsLocal()).toBeNull();
  });
});

describe("writeSettingsLocal", () => {
  beforeEach(() => installStorage());
  afterEach(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = ORIGINAL;
  });

  it("merges rather than replaces — setting one key must not drop the others (ADR-007)", () => {
    writeSettingsLocal({ theme: "plum" });
    writeSettingsLocal({ owner: "someone else" });
    expect(readSettingsLocal()).toMatchObject({ theme: "plum", owner: "someone else" });
  });

  it("reports false instead of throwing when the write cannot land", () => {
    installStorage(new Map(), { throws: true });
    expect(writeSettingsLocal({ theme: "plum" })).toBe(false);
  });

  it("reports false when there is no storage, so the UI can say so", () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = undefined;
    expect(writeSettingsLocal({ theme: "plum" })).toBe(false);
  });
});

describe("clearSettingsLocal", () => {
  beforeEach(() => installStorage());
  afterEach(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = ORIGINAL;
  });

  it("forgets the blob, and is safe to call when there is nothing to forget", () => {
    writeSettingsLocal({ theme: "plum" });
    clearSettingsLocal();
    expect(readSettingsLocal()).toBeNull();
    expect(() => clearSettingsLocal()).not.toThrow();
  });

  it("is safe when storage throws", () => {
    installStorage(new Map(), { throws: true });
    expect(() => clearSettingsLocal()).not.toThrow();
  });
});

describe("defaultSettings reads through the seam, not around it", () => {
  beforeEach(() => installStorage());
  afterEach(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = ORIGINAL;
  });

  it("picks up a theme that writeSettingsLocal stored", () => {
    writeSettingsLocal({ theme: "plum" });
    expect(defaultSettings().theme).toBe("plum");
  });

  it("an unregistered theme id falls back to the default rather than reaching data-theme", () => {
    writeSettingsLocal({ theme: "hot-pink" });
    expect(defaultSettings().theme).toBe("botanical");
  });

  it("a corrupt blob yields the defaults, not an exception", () => {
    installStorage(new Map([[SETTINGS_KEY, "{{{"]]));
    expect(() => defaultSettings()).not.toThrow();
    expect(defaultSettings().theme).toBe("botanical");
  });

  it("a truthy-but-not-true snapToGrid is normalised to false", () => {
    writeSettingsLocal({ snapToGrid: "yes" });
    expect(defaultSettings().snapToGrid).toBe(false);
    writeSettingsLocal({ snapToGrid: true });
    expect(defaultSettings().snapToGrid).toBe(true);
  });
});
