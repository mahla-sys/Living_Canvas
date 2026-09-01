import { describe, it, expect, beforeEach } from "vitest";
import { listChildren, safeRelPath, MemoryStorageAdapter, escapeHtml, mdInline } from "../core";

/* ==========================================================================
   رگرسیونِ باگ: فیلتر listDirectory آیتم‌های داخل زیرپوشه را دور می‌ریخت
   و قالب‌های سفارشی کاربر بعد از رفرش ناپدید می‌شدند.
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

  it("فایل‌های یک پوشه را برمی‌گرداند", () => {
    expect(listChildren(paths, "canvases/c1")).toEqual(
      expect.arrayContaining(["manifest.json", "canvas.yaml", "graph.json", "library/", "memory/", "nodes/", "strokes/"])
    );
  });

  it("زیرپوشه‌ها را با اسلش انتهایی می‌دهد (قرارداد hydrate)", () => {
    const kids = listChildren(paths, "canvases/c1");
    expect(kids.filter((k) => k.endsWith("/"))).toEqual(["library/", "memory/", "nodes/", "strokes/"]);
  });

  it("باگ اصلی — پوشه‌های قالب گم نمی‌شوند", () => {
    expect(listChildren(paths, "canvases/c1/library/templates")).toEqual(["my-flow/", "other/"]);
  });

  it("فایل‌های داخل قالب دیده می‌شوند", () => {
    expect(listChildren(paths, "canvases/c1/library/templates/my-flow")).toEqual(["template.json", "template.yaml"]);
  });

  it("پوشهٔ خالی [] می‌دهد، نه خطا", () => {
    expect(listChildren(paths, "canvases/c1/outputs")).toEqual([]);
  });

  it("هیچ‌چیز از بیرون prefix نشت نمی‌کند", () => {
    expect(listChildren(paths, "canvases/c2")).toEqual([]);
    expect(listChildren([], "")).toEqual([]);
  });

  it("مرتب و بدون تکرار است", () => {
    const once = listChildren(["a/x.md", "a/y.md", "a/x.md"], "a");
    expect(once).toEqual(["x.md", "y.md"]);
  });
});

describe("safeRelPath", () => {
  it("مسیرهای نسبی سالم را می‌پذیرد", () => {
    expect(safeRelPath("nodes/node-1.md")).toBe("nodes/node-1.md");
    expect(safeRelPath("./nodes/node-1.md")).toBe("nodes/node-1.md");
    expect(safeRelPath("nodes\\node-1.md")).toBe("nodes/node-1.md");
  });

  it("هر نوع فرار از ریشه یا مسیر مطلق را رد می‌کند", () => {
    expect(safeRelPath("/etc/passwd")).toBeNull();
    expect(safeRelPath("C:\\Users\\mahla\\x.md")).toBeNull();
    expect(safeRelPath("../secret")).toBeNull();
    expect(safeRelPath("nodes/../../secret")).toBeNull();
    expect(safeRelPath("a/./b")).toBeNull();
    expect(safeRelPath("")).toBeNull();
    expect(safeRelPath("con图")).toMatch(/^con图$/); // یونیکد مجاز است
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

  it("readJson برای فایل ناموجود reject می‌کند تا hydrate به seed نیفتد", async () => {
    await expect(store.readJson("missing.json")).rejects.toThrow();
  });
});

/* ==========================================================================
   امنیت مارک‌داون — خروجی AI هرگز نباید به HTML تبدیل شود
   ========================================================================== */

describe("escapeHtml / mdInline", () => {
  it("همه‌ی کاراکترهای خطرناک را خنثی می‌کند", () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)>`)).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(escapeHtml(`a & b "c" 'd'`)).toBe("a &amp; b &quot;c&quot; &#39;d&#39;");
    expect(escapeHtml("<script>alert(1)</script>")).not.toMatch(/<[a-z]/i);
  });

  it("mdInline هیچ تگی از ورودی کاربر قبول نمی‌کند", () => {
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

  it("قالب‌بندی مجاز (bold/em/code) سالم می‌ماند", () => {
    expect(mdInline("**سند** و `code`")).toContain("<strong");
    expect(mdInline("**سند**")).toContain("سند");
    expect(mdInline("`x`")).toContain("<code");
    expect(mdInline("_تاکید_")).toContain("<em>تاکید</em>");
  });

  it("برچسب‌های تزریق‌شده داخل bold هم خنثی‌اند", () => {
    const html = mdInline("**<img src=x onerror=alert(1)>**");
    expect(html).not.toMatch(/<img/);
    expect(html).toContain("&lt;img");
  });

  it("output هیچ‌وقت tag جدید تولید نمی‌کند جز strong/em/code", () => {
    const html = mdInline(`<b>x</b> <i>y</i> **z** _w_ \`c\``);
    const tags = [...html.matchAll(/<\/?([a-z]+)/g)].map((m) => m[1]);
    expect(tags.every((t) => ["strong", "em", "code"].includes(t))).toBe(true);
  });
});
