import { describe, it, expect } from "vitest";
import {
  buildBundle, parseBundleText, deriveCanvasFromFiles, parseNodeDoc, parseEdgeDoc, parseMemoryDoc,
  BUNDLE_KIND,
} from "../portable";
import { nodeToMarkdown, toYaml, memoryToMd, frontmatter, parseYaml } from "../test-helpers";

/* ==========================================================================
   Export/Import — باندل باید همان فایل‌های §2 باشد و مسیرهای خطرناک را رد کند
   ========================================================================== */

const ROOT = "canvases/nexus-edu-001";

const sampleFiles = (): Record<string, string> => ({
  [`${ROOT}/manifest.json`]: JSON.stringify({ version: "1.0", canvas_id: "nexus-edu-001", structure_version: "1.3" }, null, 2),
  [`${ROOT}/canvas.yaml`]: toYaml({ id: "nexus-edu-001", title: "مدرسه‌ی هوشمند", owner: "mahla", tags: ["nexus", "school"] }),
  [`${ROOT}/nodes/node-001.md`]: nodeToMarkdown("node-001", { title: "فهم مسئله", nodeType: "agent" }),
  [`${ROOT}/edges/edge-001.yaml`]: toYaml({ id: "edge-001", source: "node-001", target: "node-002", type: "flow" }),
});

describe("buildBundle / parseBundleText", () => {
  it("دور‌رفتی سالم: هر فایل با همان مسیر و محتوا برمی‌گردد", () => {
    const files = sampleFiles();
    const bundle = buildBundle(files);
    expect(bundle.kind).toBe(BUNDLE_KIND);
    expect(bundle.canvas_id).toBe("nexus-edu-001");
    expect(Object.keys(bundle.files).sort()).toEqual(Object.keys(files).sort());
    const parsed = parseBundleText(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    expect(parsed.files[`${ROOT}/nodes/node-001.md`]).toBe(files[`${ROOT}/nodes/node-001.md`]);
    expect(parsed.title).toBe("مدرسه‌ی هوشمند");
    expect(parsed.canvasId).toBe("nexus-edu-001");
    expect(parsed.skipped).toHaveLength(0);
  });

  it("فایل با مسیر فرارکننده (../) رد می‌شود و وارد بوم نمی‌شود", () => {
    const bundle = {
      kind: BUNDLE_KIND, version: 1, canvas_id: "nexus-edu-001",
      files: {
        [`${ROOT}/manifest.json`]: "{}",
        "../../etc/passwd": "root:x:0:0",
        [`${ROOT}/../escape.md`]: "bad",
        "/absolute/path.md": "bad",
      },
    };
    const parsed = parseBundleText(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true); // فایل‌های سالم می‌مانند
    const keys = Object.keys(parsed.files);
    expect(keys).toEqual([`${ROOT}/manifest.json`]);
    expect(parsed.skipped).toHaveLength(3);
  });

  it("محتوای غیررشته‌ای (باینری) رد می‌شود", () => {
    const bundle = { kind: BUNDLE_KIND, version: 1, files: { [`${ROOT}/manifest.json`]: "{}", [`${ROOT}/assets/x.png`]: { type: "Buffer" } } };
    const parsed = parseBundleText(JSON.stringify(bundle));
    expect(Object.keys(parsed.files)).toEqual([`${ROOT}/manifest.json`]);
    expect(parsed.skipped[0].reason).toMatch(/غیررشته‌ای|رشته نیست/);
  });

  it("JSON نامعتبر و kind متفرقه با خطای فارسی رد می‌شوند", () => {
    expect(parseBundleText("not json").error).toMatch(/JSON/);
    expect(parseBundleText("").error).toMatch(/خالی/);
    expect(parseBundleText(JSON.stringify({ kind: "obsidian-vault", files: {} })).error).toMatch(/Living Canvas/);
  });

  it("نسخهٔ جدیدتر از برنامه رد می‌شود (جلوگیری از خراب‌شدن داده)", () => {
    const r = parseBundleText(JSON.stringify({ kind: BUNDLE_KIND, version: 99, files: { "manifest.json": "{}" } }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/جدیدتر/);
  });

  it("بدون manifest هشدار می‌دهد ولی فایل‌های دستی را رد نمی‌کند", () => {
    const r = parseBundleText(JSON.stringify({ [`${ROOT}/nodes/a.md`]: "---\ntitle: الف\n---\n\nبدنه" }));
    expect(r.ok).toBe(true);
    expect(r.source).toBe("raw-files");
    expect(r.skipped.some((s) => s.path === "manifest.json")).toBe(true);
  });

  it("فایل متعلق به بوم دیگر وارد بوم فعلی نمی‌شود", () => {
    const r = parseBundleText(JSON.stringify({ files: { "canvases/other-canvas/nodes/x.md": "hello" } }));
    expect(r.skipped[0].reason).toMatch(/بوم دیگری/);
  });
});

/* ==========================================================================
   بازگردانی از خودِ فایل‌های Markdown/YAML (نه state.json)
   ========================================================================== */

describe("deriveCanvasFromFiles", () => {
  it("پرامپت بلند (>۱۲۰ کاراکتر) و چندخطی کامل برمی‌گردد (فیکس برش ۱۲۰تایی)", () => {
    const long = "تو ایجنت تحلیل هستی. " + "این یک خط طولانی است که باید عیناً حفظ بشود. ".repeat(6);
    const md = nodeToMarkdown("n9", { nodeType: "agent", title: "بلند", agent: { system_prompt: long, max_steps: 12 } });
    const n = parseNodeDoc(`${ROOT}/nodes/n9.md`, md)!;
    expect(n.data.agent?.system_prompt).toBe(long);
    expect(n.data.agent?.max_steps).toBe(12);
    const multiline = "خط اول\nخط دوم: با دونقطه\n  - لیست";
    const md2 = nodeToMarkdown("n10", { nodeType: "agent", title: "چندخطی", agent: { system_prompt: multiline } });
    expect(parseNodeDoc(`${ROOT}/nodes/n10.md`, md2)!.data.agent?.system_prompt).toBe(multiline);
  });

  it("نود و یال و حافظه را از فایل‌ها می‌سازد", () => {
    const files: Record<string, string> = {
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/canvas.yaml`]: toYaml({ id: "nexus-edu-001", title: "بوم بازیابی‌شده" }),
      [`${ROOT}/nodes/node-001.md`]: nodeToMarkdown("node-001", { title: "تحلیل", nodeType: "agent", position: { x: 340, y: 90 } }),
      [`${ROOT}/nodes/node-002.md`]: nodeToMarkdown("node-002", { title: "جعبه", nodeType: "output-box", position: { x: 700, y: 250 } }),
      [`${ROOT}/edges/edge-001.yaml`]: toYaml({ id: "edge-001", source: "node-001", target: "node-002", type: "flow", label: "خروجی" }),
      [`${ROOT}/memory/agents/node-001.md`]: memoryToMd({ path: "memory/agents/node-001.md", title: "حافظه", body: "- یادداشت بازیابی‌شده", confidence: 0.66 }),
    };
    const d = deriveCanvasFromFiles(files);
    expect(d.nodes.map((n) => n.id)).toEqual(["node-001", "node-002"]);
    expect(d.nodes[0].position).toEqual({ x: 340, y: 90 });
    expect(d.nodes[0].data.title).toBe("تحلیل");
    expect(d.edges).toHaveLength(1);
    expect(d.canvasTitle).toBe("بوم بازیابی‌شده");
    expect(d.memory.agents["node-001"]?.body).toContain("یادداشت بازیابی‌شده");
    expect(d.unreadable).toEqual([]);
  });

  it("ویرایش دستی در Obsidian (عنوان+بدنه+prampt) بعد از Import باقی می‌ماند", () => {
    const md = [
      "---",
      'id: "node-001"',
      'type: "agent"',
      'title: "عنوان ویرایش‌شده با دست"',
      "position:",
      "  x: 12",
      "  y: 34",
      'color: "#e8b04b"',
      "agent:",
      "  system_prompt: \"پرامپت تازه‌ای که دستی نوشتم\"",
      "  max_steps: 9",
      "---",
      "",
      "## بدنهٔ ویرایش‌شده",
      "",
      "متن جدید.",
    ].join("\n");
    const n = parseNodeDoc(`${ROOT}/nodes/node-001.md`, md)!;
    expect(n.data.title).toBe("عنوان ویرایش‌شده با دست");
    expect(n.data.content).toContain("متن جدید.");
    expect(n.data.agent?.system_prompt).toBe("پرامپت تازه‌ای که دستی نوشتم");
    expect(n.data.agent?.max_steps).toBe(9);
    expect(n.position).toEqual({ x: 12, y: 34 });
    // قفل هرگز از فایل نمی‌آید (§12.5)
    expect(n.data.lock.status).toBe("free");
  });

  it("نودِ بدون یالِ معتبر: یال مرجع‌به‌نودناموجود حذف می‌شود (جلوگیری از crash React Flow)", () => {
    const d = deriveCanvasFromFiles({
      [`${ROOT}/nodes/only.md`]: nodeToMarkdown("only", { title: "تنها", nodeType: "note" }),
      [`${ROOT}/edges/ghost.yaml`]: toYaml({ id: "ghost", source: "only", target: "nope", type: "flow" }),
    });
    expect(d.nodes).toHaveLength(1);
    expect(d.edges).toHaveLength(0);
  });

  it("فایل خراب seed را نمی‌سازد ولی بقیه می‌مانند", () => {
    const d = deriveCanvasFromFiles({
      [`${ROOT}/nodes/good.md`]: nodeToMarkdown("good", { title: "سالم", nodeType: "note" }),
      [`${ROOT}/nodes/bad.md`]: "",
      [`${ROOT}/edges/bad.yaml`]: ": :: :",
    });
    expect(d.nodes.map((n) => n.id)).toEqual(["good"]);
    expect(d.unreadable.length).toBeGreaterThan(0);
  });

  it("محتوای مخرب در Markdown نود به شکل متن می‌ماند و HTML نمی‌شود", () => {
    const evil = frontmatter({ id: "n1", type: "note", title: "<img src=x onerror=alert(1)>" }, "<script>steal()</script>");
    const n = parseNodeDoc(`${ROOT}/nodes/n1.md`, evil)!;
    expect(n.data.title).toBe("<img src=x onerror=alert(1)>");
    expect(n.data.content).toContain("<script>steal()</script>");
    // render pipeline (mdInline) آن‌ها را خنثی می‌کند — تست در storage.test.ts
  });
});

describe("parseNodeDoc / parseEdgeDoc / parseMemoryDoc", () => {
  it("حالت «فقط فایل‌ها» وضعیت اجرای نیمه‌کاره را idle می‌کند", () => {
    const md = nodeToMarkdown("n1", { nodeType: "agent", title: "ت", agent: { status: "running" } });
    const n = parseNodeDoc(`${ROOT}/nodes/n1.md`, md)!;
    expect(n.data.agent?.status).toBe("idle");
  });

  it("done را از فایل می‌پذیرد (چک‌پوینت واقعی)", () => {
    const md = nodeToMarkdown("n1", { nodeType: "agent", title: "ت", agent: { status: "done" } });
    expect(parseNodeDoc(`${ROOT}/nodes/n1.md`, md)!.data.agent?.status).toBe("done");
  });

  it("رنگ نامعتبر رد می‌شود و پیش‌فرض می‌ماند", () => {
    const md = ["---", 'id: "n1"', 'type: "note"', 'color: "red; drop table"', "---", "", "x"].join("\n");
    const n = parseNodeDoc(`${ROOT}/nodes/n1.md`, md)!;
    expect(n.data.color).not.toContain("drop");
  });

  it("یال با نوع نامعتبر به flow برمی‌گردد", () => {
    const e = parseEdgeDoc(`${ROOT}/edges/e1.yaml`, toYaml({ id: "e1", source: "a", target: "b", type: "evil|type" }))!;
    expect(e.data.edgeType).toBe("flow");
  });

  it("حافظه با confidence خارج از بازه کلیپ می‌شود", () => {
    const m = parseMemoryDoc(`${ROOT}/memory/agents/n1.md`, memoryToMd({ path: "p", title: "t", body: "b", confidence: 42 }))!;
    expect(m.confidence).toBe(1);
  });
});

describe("parseYaml (خوانندهٔ هم‌خانوادهٔ toYaml)", () => {
  it("دور‌رفتی: هرچه toYaml نوشت parseYaml می‌خواند", () => {
    const obj = {
      id: "node-001",
      title: "عنوان با : دونقطه",
      tags: ["a", "b"],
      position: { x: 1, y: 2, z: 0 },
      agent: { tools: ["read_memory", "write_output"], require_approval: true, max_steps: 5 },
    };
    expect(parseYaml(toYaml(obj))).toEqual(obj);
  });

  it("رشتهٔ داخل لیستِ آبجکتی حفظ می‌شود", () => {
    const y = "outputs:\n  - file: \"summary.md\"\n    type: \"summary\"\n  - file: \"risks.md\"\n    type: \"detailed\"\n";
    expect(parseYaml(y)).toEqual({ outputs: [{ file: "summary.md", type: "summary" }, { file: "risks.md", type: "detailed" }] });
  });
});
