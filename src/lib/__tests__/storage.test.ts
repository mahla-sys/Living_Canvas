import { describe, it, expect, beforeEach } from "vitest";
import { listChildren, safeRelPath, MemoryStorageAdapter, escapeHtml, mdInline } from "../core";

/* ==========================================================================
   Regression for the listDirectory filter bug: entries inside a subfolder were dropped,
   so the user's custom templates disappeared after a refresh.
   ========================================================================== */

describe("listChildren", () => {
  const paths = [
    "canvases/c1/manifest.json",
    "canvases/c1/canvas.yaml",
    "canvases/c1/graph.json",
    "canvases/c1/nodes/node-001.md",
    "canvases/c1/strokes/stroke-1.json",
    "canvases/c1/library/templates/my-flow/template.json",
    "canvases/c1/library/templates/my-flow/template.yaml",
    "canvases/c1/library/templates/other/template.json",
    "canvases/c1/memory/agents/node-001.md",
  ];

  it("returns the files of a folder", () => {
    expect(listChildren(paths, "canvases/c1")).toEqual(
      expect.arrayContaining(["manifest.json", "canvas.yaml", "graph.json", "library/", "memory/", "nodes/", "strokes/"])
    );
  });

  it("gives subfolders a trailing slash (the hydrate contract)", () => {
    const kids = listChildren(paths, "canvases/c1");
    expect(kids.filter((k) => k.endsWith("/"))).toEqual(["library/", "memory/", "nodes/", "strokes/"]);
  });

  it("the main bug — template folders are not lost", () => {
    expect(listChildren(paths, "canvases/c1/library/templates")).toEqual(["my-flow/", "other/"]);
  });

  it("shows files inside a template folder", () => {
    expect(listChildren(paths, "canvases/c1/library/templates/my-flow")).toEqual(["template.json", "template.yaml"]);
  });

  it("returns [] for an empty folder, not an error", () => {
    expect(listChildren(paths, "canvases/c1/outputs")).toEqual([]);
  });

  it("leaks nothing from outside the prefix", () => {
    expect(listChildren(paths, "canvases/c2")).toEqual([]);
    expect(listChildren([], "")).toEqual([]);
  });

  it("is sorted and deduplicated", () => {
    const once = listChildren(["a/x.md", "a/y.md", "a/x.md"], "a");
    expect(once).toEqual(["x.md", "y.md"]);
  });
});

describe("safeRelPath", () => {
  it("accepts healthy relative paths", () => {
    expect(safeRelPath("nodes/node-1.md")).toBe("nodes/node-1.md");
    expect(safeRelPath("./nodes/node-1.md")).toBe("nodes/node-1.md");
    expect(safeRelPath("nodes\\node-1.md")).toBe("nodes/node-1.md");
  });

  it("rejects every kind of root escape and absolute path", () => {
    expect(safeRelPath("/etc/passwd")).toBeNull();
    expect(safeRelPath("C:\\Users\\mahla\\x.md")).toBeNull();
    expect(safeRelPath("../secret")).toBeNull();
    expect(safeRelPath("nodes/../../secret")).toBeNull();
    expect(safeRelPath("a/./b")).toBeNull();
    expect(safeRelPath("")).toBeNull();
    expect(safeRelPath("con naïve-ünïcode")).toMatch(/^con naïve-ünïcode$/); // unicode names are fine
  });
});

describe("MemoryStorageAdapter", () => {
  let store: MemoryStorageAdapter;
  beforeEach(() => {
    store = new MemoryStorageAdapter();
  });

  it("write → read → list → delete", async () => {
    await store.writeFile("canvases/c1/library/templates/tpl/template.json", "{}");
    expect(await store.readFile("canvases/c1/library/templates/tpl/template.json")).toBe("{}");
    expect(await store.listDirectory("canvases/c1/library/templates")).toEqual(["tpl/"]);
    await store.deleteFile("canvases/c1/library/templates/tpl/template.json");
    expect(await store.listDirectory("canvases/c1/library/templates")).toEqual([]);
    await expect(store.readFile("canvases/c1/nope.md")).rejects.toThrow(/ENOENT/);
  });

  it("readJson rejects a missing file so hydrate does not fall back to the seed", async () => {
    await expect(store.readJson("missing.json")).rejects.toThrow();
  });
});

/* ==========================================================================
   Markdown safety — AI output must never become HTML
   ========================================================================== */

describe("escapeHtml / mdInline", () => {
  it("neutralises every dangerous character", () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)>`)).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(escapeHtml(`a & b "c" 'd'`)).toBe("a &amp; b &quot;c&quot; &#39;d&#39;");
    expect(escapeHtml("<script>alert(1)</script>")).not.toMatch(/<[a-z]/i);
  });

  it("mdInline accepts no tag from user input", () => {
    const evil = [
      `<img src=x onerror=alert(1)>`,
      `<script>alert(1)</script>`,
      `<svg onload=alert(1)>`,
      `"><iframe src="javascript:alert(1)">`,
      `<a href="javascript:alert(1)">x</a>`,
    ];
    for (const e of evil) {
      const html = mdInline(e);
      expect(html).not.toMatch(/<(img|script|svg|iframe|a|object|embed|link|style)\b/i);
      expect(html).toContain("&lt;");
    }
  });

  it("keeps the allowed formatting (bold/em/code) intact", () => {
    expect(mdInline("**doc** and `code`")).toContain("<strong");
    expect(mdInline("**doc**")).toContain("doc");
    expect(mdInline("`x`")).toContain("<code");
    expect(mdInline("_emphasis_")).toContain("<em>emphasis</em>");
  });

  it("tags injected inside bold are neutralised too", () => {
    const html = mdInline("**<img src=x onerror=alert(1)>**");
    expect(html).not.toMatch(/<img/);
    expect(html).toContain("&lt;img");
  });

  it("output never produces a new tag other than strong/em/code", () => {
    const html = mdInline(`<b>x</b> <i>y</i> **z** _w_ \`c\``);
    const tags = [...html.matchAll(/<\/?([a-z]+)/g)].map((m) => m[1]);
    expect(tags.every((t) => ["strong", "em", "code"].includes(t))).toBe(true);
  });
});
