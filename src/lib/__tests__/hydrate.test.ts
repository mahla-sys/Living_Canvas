import { describe, it, expect, beforeEach } from "vitest";
import { setStorage, storage, MemoryStorageAdapter, nodeToMarkdown, toYaml, frontmatter } from "../core";
import { hydrate } from "../engine";
import { emptyExecution, makeNodeData, CANVAS_ID, BUILTIN_TEMPLATE } from "../../state";
import type { AppState } from "../../state";

/* ============================================================
   تستِ رگرسیون در همان نقطه‌ای که باگ داشت: `hydrate()`.
   دو چیز را یکجا می‌سنجد:
     ۱) قالب‌های سفارشی کاربر باید بعد از reload پیدا شوند (باگ فیلتر listDirectory)
     ۲) بوم باید از خودِ فایل‌های Markdown/YAML ساخته شود، بدون graph.json/state.json
   ============================================================ */

const ROOT = `canvases/${CANVAS_ID}`;

function makeApi(initial?: Partial<AppState>) {
  let s: AppState = {
    booted: false,
    bootLines: [],
    canvasId: CANVAS_ID,
    canvas: {
      title: "عنوان پیش‌فرض", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
    },
    nodes: [], edges: [],
    memory: {
      global: { path: "memory/global.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
      decisions: { path: "memory/decisions.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
      progress: { path: "memory/progress.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
      user: { path: "memory/user.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "user" },
      agents: {},
    },
    outputs: {}, chats: {}, logs: {}, snapshots: [], templates: [], strokes: [],
    execution: emptyExecution(), events: [], toasts: [],
    settings: { provider: "sim", apiKey: "", model: "deepseek-chat", owner: "mahla", simDelay: 1, backendUrl: "", workspaceRoot: null },
    saveState: "saved", typing: {},
    ui: { leftTab: "palette", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false },
    ...initial,
  };
  return {
    get: () => s,
    set: (p: Partial<AppState> | ((st: AppState) => Partial<AppState>)) => {
      s = { ...s, ...(typeof p === "function" ? p(s) : p) };
    },
    peek: () => s,
  };
}

async function freshStore(files: Record<string, string>) {
  const mem = new MemoryStorageAdapter(files);
  setStorage(mem);
  return mem;
}

const nodeFile = (id: string, title: string, extra = "") =>
  nodeToMarkdown(id, { ...makeNodeData("agent", title, "mahla"), content: `## ${title}\n\nبدنهٔ نود.`, ...(extra ? {} : {}) }, { x: 100, y: 200 });

describe("hydrate — بازیابی از فایل‌ها", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("بدون manifest هیچ چیزی را پاک نمی‌کند و false می‌دهد", async () => {
    const api = makeApi();
    await hydrate(api);
    expect(api.peek().booted).toBe(false);
    expect(api.peek().templates.length).toBe(0);
  });

  it("قالب سفارشی کاربر بعد از reload گم نمی‌شود (رگرسیونِ باگ listDirectory)", async () => {
    await freshStore({
      [`${ROOT}/manifest.json`]: JSON.stringify({ version: "1.0", canvas_id: CANVAS_ID, structure_version: "1.3" }),
      [`${ROOT}/nodes/node-001.md`]: nodeFile("node-001", "فهم مسئله"),
      [`${ROOT}/library/templates/my-flow/template.json`]: JSON.stringify({
        template_id: "my-flow", name: "جریان من", description: "d", version: "1.0", nodes: [{ id: "a" }], edges: [],
      }),
    });
    const api = makeApi();
    const ok = await hydrate(api);
    expect(ok).toBe(true);
    const ids = api.peek().templates.map((t) => t.id);
    expect(ids).toContain("my-flow"); // ← قبلاً این خط fail می‌شد
    expect(ids).toContain(BUILTIN_TEMPLATE.template_id);
    const mine = api.peek().templates.find((t) => t.id === "my-flow")!;
    expect(mine.name).toBe("جریان من");
    expect(mine.builtin).toBe(false);
    expect(mine.nodes).toBe(1);
  });

  it("چند قالب کنار هم، و فایل‌های دیگرِ همان پوشه مزاحم نمی‌شوند", async () => {
    await freshStore({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/nodes/n1.md`]: nodeFile("n1", "یکی"),
      [`${ROOT}/library/templates/a/template.json`]: JSON.stringify({ template_id: "a", name: "A", description: "", version: "1.0", nodes: [], edges: [] }),
      [`${ROOT}/library/templates/a/template.yaml`]: toYaml({ template_id: "a" }),
      [`${ROOT}/library/templates/b/template.json`]: JSON.stringify({ template_id: "b", name: "B", description: "", version: "1.0", nodes: [], edges: [] }),
    });
    const api = makeApi();
    await hydrate(api);
    expect(api.peek().templates.map((t) => t.id).sort()).toEqual([BUILTIN_TEMPLATE.template_id, "a", "b"].sort());
  });

  it("حالت «فقط فایل‌ها»: بدون graph.json/state.json بوم از Markdown ساخته می‌شود", async () => {
    await freshStore({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/canvas.yaml`]: toYaml({ id: CANVAS_ID, title: "بومِ بازیابی‌شده از فایل‌ها", owner: "mahla" }),
      [`${ROOT}/nodes/node-001.md`]: nodeFile("node-001", "فهم مسئله"),
      [`${ROOT}/nodes/node-002.md`]: nodeFile("node-002", "تحلیل ریسک"),
      [`${ROOT}/edges/edge-001.yaml`]: toYaml({ id: "edge-001", source: "node-001", target: "node-002", type: "flow", label: "ورودی" }),
      [`${ROOT}/memory/global.md`]: frontmatter({ confidence: 0.5, source: "system" }, "# وضعیت\n\n- هدفِ بازیابی‌شده"),
    });
    const api = makeApi();
    const ok = await hydrate(api);
    expect(ok).toBe(true);
    const s = api.peek();
    expect(s.nodes.map((n) => n.data.title).sort()).toEqual(["تحلیل ریسک", "فهم مسئله"]);
    expect(s.edges).toHaveLength(1);
    expect(s.canvas.title).toBe("بومِ بازیابی‌شده از فایل‌ها");
    expect(s.memory.global.body).toContain("هدفِ بازیابی‌شده");
    // ویرایش‌های کاربر که فقط در فایل بودند، پاک نشده‌اند
    expect(s.nodes.length).toBe(2);
  });

  it("نودِ قفل‌شده در فایل، در UI قفل بازنمی‌گردد (§12.5)", async () => {
    const md = nodeToMarkdown("node-009", {
      ...makeNodeData("note", "قفل‌شده", "mahla"),
      lock: { status: "locked", locked_by: "run-abc", locked_at: "2026-09-01T10:00:00.000Z" },
    });
    await freshStore({ [`${ROOT}/manifest.json`]: "{}", [`${ROOT}/nodes/node-009.md`]: md });
    const api = makeApi();
    await hydrate(api);
    expect(api.peek().nodes[0].data.lock.status).toBe("free");
    expect(api.peek().execution.status).toBe("idle");
  });

  it("graph.json داشته باشد، data از آن می‌آید و title/content از فایل اورلی می‌شود", async () => {
    const md = nodeToMarkdown("node-001", { ...makeNodeData("note", "عنوانِ ویرایش‌شده در Obsidian", "mahla"), content: "متنِ تازه" });
    await freshStore({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/nodes/node-001.md`]: md,
      [`${ROOT}/graph.json`]: JSON.stringify({
        canvas_id: CANVAS_ID,
        nodes: [{ id: "node-001", type: "lc", position: { x: 55, y: 66 }, data: { ...makeNodeData("note", "عنوان قدیمی", "mahla"), content: "قدیمی" } }],
        edges: [],
      }),
      [`${ROOT}/state.json`]: JSON.stringify({ canvas: makeApi().peek().canvas, memory: makeApi().peek().memory }),
    });
    const api = makeApi();
    await hydrate(api);
    const n = api.peek().nodes[0];
    expect(n.data.title).toBe("عنوانِ ویرایش‌شده در Obsidian");
    expect(n.data.content).toBe("متنِ تازه");
    expect(n.position).toEqual({ x: 55, y: 66 }); // موقعیت از graph.json
  });

  it("state.json خراب/ناقص → hydrate false نمی‌دهد؛ فایل‌ها کافی‌اند", async () => {
    await freshStore({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/state.json`]: "{ this is not json",
      [`${ROOT}/graph.json`]: JSON.stringify({ nodes: [], edges: [] }),
      [`${ROOT}/nodes/only.md`]: nodeFile("only", "تنها"),
    });
    const api = makeApi();
    expect(await hydrate(api)).toBe(true);
    expect(api.peek().nodes.map((n) => n.id)).toEqual(["only"]);
  });

  it("storage فعال همان چیزی است که hydrate می‌خواند (بدون cache‌ی کهنه بین تست‌ها)", async () => {
    const mem = await freshStore({ [`${ROOT}/manifest.json`]: "{}", [`${ROOT}/nodes/x.md`]: nodeFile("x", "ایکس") });
    expect(storage).toBe(mem);
    const api = makeApi();
    await hydrate(api);
    expect(api.peek().nodes).toHaveLength(1);
  });
});
