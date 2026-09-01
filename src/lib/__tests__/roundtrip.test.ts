import { describe, it, expect } from "vitest";
import {
  MemoryStorageAdapter, nodeToMarkdown, edgeToYaml, memoryToMd, toYaml, frontmatter, parseYaml,
  type LCNodeData, type LCEdgeData,
} from "../core";
import { buildBundle, parseBundleText, deriveCanvasFromFiles } from "../portable";

/* ============================================================
   End-to-end در سطح ذخیره‌سازی: نوشتن → Export → Import → خواندن
   (بدون React و بدون IndexedDB؛ دقیقاً همان توابعی که در production صدا زده می‌شوند)
   ============================================================ */

const ROOT = "canvases/nexus-edu-001";
const CANVAS_ID = "nexus-edu-001";

const nodeData = {
  nodeType: "agent",
  title: "فهم مسئله",
  shape: "card",
  color: "#e8b04b",
  animation: { type: "breathe", speed: 1 },
  viewMode: "card",
  style: { strokeColor: "#0b1312", strokeWidth: 2, fillStyle: "solid", opacity: 100 },
  lock: { status: "free", locked_by: null, locked_at: null },
  content: "## نقش\n\nمسئله را از ابهام بیرون بکش.",
  created_by: "mahla",
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
  agent: {
    role_id: "understander",
    system_prompt:
      "تو ایجنت «فهم مسئله» هستی. مأموریت تو این است که با خواندن خلاصه‌ی بوم و حافظه‌ی خودت، مسئله‌ی اصلی را شفاف کنی. همیشه اول سؤال‌های مبهم را فهرست کن، سپس بیان مسئله را در یک پاراگراف دقیق بنویس. خروجی تو باید شامل summary، problem_statement و questions_asked باشد.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "chat_with_user", "write_output"],
    status: "done",
    max_steps: 6,
    max_tokens: 4000,
    require_approval: false,
    context_contract: {
      allowed_read_paths: ["canvas-overview.md", "nodes/node-001.md", "memory/agents/node-001.md"],
      allowed_write_paths: ["outputs/node-001/", "memory/agents/node-001.md", "logs/node-001/"],
      output_contract: { format: "markdown", required_fields: ["summary", "problem_statement", "questions_asked"], save_to: "outputs/node-001/" },
    },
  },
} as unknown as LCNodeData;

const edgeData = {
  edgeType: "flow",
  label: "بیان مسئله",
  line_style: "dashed",
  animation: "flow",
  trigger: { type: "condition", condition: "{{ risk_score < 7 }}" },
  config: { communication: "blackboard" },
} as unknown as LCEdgeData;

async function seedWorkspace() {
  const store = new MemoryStorageAdapter();
  await store.writeJson(`${ROOT}/manifest.json`, { version: "1.0", app_version: "0.1.0", canvas_id: CANVAS_ID, structure_version: "1.3" });
  await store.writeFile(`${ROOT}/canvas.yaml`, toYaml({ id: CANVAS_ID, title: "مدرسه‌ی هوشمند نِکسوس", owner: "mahla", canvas_type: "agent-pipeline", tags: ["nexus", "school"] }));
  await store.writeFile(`${ROOT}/canvas-overview.md`, frontmatter({ canvas_id: CANVAS_ID, node_count: 2, current_step: "فهم مسئله" }, "# خلاصه"));
  await store.writeFile(`${ROOT}/nodes/node-001.md`, nodeToMarkdown("node-001", nodeData, { x: 340, y: 250 }));
  await store.writeFile(`${ROOT}/nodes/node-002.md`, nodeToMarkdown("node-002", { ...nodeData, nodeType: "output-box", title: "جعبه خروجی", agent: null } as never, { x: 900, y: 250 }));
  await store.writeFile(`${ROOT}/edges/edge-001.yaml`, edgeToYaml("edge-001", "node-001", "node-002", edgeData));
  await store.writeFile(`${ROOT}/memory/global.md`, memoryToMd({ path: "memory/global.md", title: "وضعیت کلی", body: "- هدف: مدرسه", updated_at: "2026-09-01T10:00:00.000Z", last_accessed: "2026-09-01T10:00:00.000Z", confidence: 0.9, source: "system" }));
  await store.writeFile(`${ROOT}/memory/agents/node-001.md`, memoryToMd({ path: "memory/agents/node-001.md", title: "حافظه‌ی ایجنت", body: "- تصمیم: ادامه بده", updated_at: "2026-09-01T10:00:00.000Z", last_accessed: "2026-09-01T10:00:00.000Z", confidence: 0.66, source: "agent" }));
  await store.writeJson(`${ROOT}/strokes/stroke-1.json`, { id: "stroke-1", canvas_id: CANVAS_ID, tool: "pen", color: "#fff", width: 3, points: [{ x: 1, y: 2 }], author: "mahla", created_at: "2026-09-01T10:00:00.000Z" });
  // قالب سفارشی کاربر — همان چیزی که باگ listDirectory گمش می‌کرد
  await store.writeJson(`${ROOT}/library/templates/my-flow/template.json`, { template_id: "my-flow", name: "جریان من", description: "d", version: "1.0", nodes: [], edges: [] });
  return store;
}

describe("workspace file tree", () => {
  it("hydration از فایل‌ها: هر نود/یال/حافظه‌ای که نوشته شد دوباره خوانده می‌شود", async () => {
    const store = await seedWorkspace();
    const files: Record<string, string> = {};
    for (const p of await store.allPaths()) files[p] = await store.readFile(p);

    const d = deriveCanvasFromFiles(files);
    expect(d.nodes.map((n) => n.id)).toEqual(["node-001", "node-002"]);
    expect(d.nodes[0].data.title).toBe("فهم مسئله");
    expect(d.nodes[0].position).toEqual({ x: 340, y: 250 });
    expect(d.nodes[0].data.agent?.system_prompt).toBe(nodeData.agent!.system_prompt); // بدون برش ۱۲۰تایی
    expect(d.nodes[0].data.agent?.context_contract.allowed_read_paths).toEqual(nodeData.agent!.context_contract.allowed_read_paths);
    expect(d.nodes[0].data.agent?.context_contract.output_contract.required_fields).toEqual(["summary", "problem_statement", "questions_asked"]);
    expect(d.edges[0].data.trigger).toEqual({ type: "condition", condition: "{{ risk_score < 7 }}" });
    expect(d.edges[0].data.label).toBe("بیان مسئله");
    expect(d.canvasTitle).toBe("مدرسه‌ی هوشمند نِکسوس");
    expect(d.memory.global?.body).toContain("هدف: مدرسه");
    expect(d.memory.agents["node-001"]?.confidence).toBe(0.66);
    expect(d.unreadable).toEqual([]);
  });

  it("باگ بازیابی قالب: listDirectory پوشه‌ی قالب را برمی‌گرداند و spec خوانده می‌شود", async () => {
    const store = await seedWorkspace();
    const dirs = await store.listDirectory(`${ROOT}/library/templates`);
    expect(dirs).toEqual(["my-flow/"]);
    const spec = await store.readJson<{ template_id: string }>(`${ROOT}/library/templates/my-flow/template.json`);
    expect(spec.template_id).toBe("my-flow");
  });
});

describe("export → import roundtrip", () => {
  it("باندل JSON، فایل‌ها را بایت‌به‌بایت برمی‌گرداند", async () => {
    const store = await seedWorkspace();
    const collected: Record<string, string> = {};
    for (const p of await store.allPaths()) collected[p] = await store.readFile(p);

    const text = JSON.stringify(buildBundle(collected, CANVAS_ID));
    expect(new Blob([text]).size).toBeLessThan(32 * 1024 * 1024);

    const parsed = parseBundleText(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.skipped).toEqual([]);

    const target = new MemoryStorageAdapter();
    for (const [p, c] of Object.entries(parsed.files)) await target.writeFile(p, c);

    expect((await target.allPaths()).sort()).toEqual((await store.allPaths()).sort());
    for (const p of await store.allPaths()) {
      expect(await target.readFile(p)).toBe(await store.readFile(p));
    }
    /* مقایسه در سطح مدل داده — فیلدهای زمان‌دار (updated_at) عمداً کنار گذاشته
       می‌شوند چون makeNodeData در هر derive زمان «الان» را می‌نویسد. */
    const shape = (d: ReturnType<typeof deriveCanvasFromFiles>) => ({
      nodes: d.nodes.map((n) => ({ id: n.id, title: n.data.title, type: n.data.nodeType, pos: n.position, prompt: n.data.agent?.system_prompt, read: n.data.agent?.context_contract.allowed_read_paths })),
      edges: d.edges.map((e) => ({ id: e.id, s: e.source, t: e.target, label: e.data.label, trigger: e.data.trigger })),
      memory: Object.fromEntries(Object.entries(d.memory.agents).map(([k, v]) => [k, v?.body])),
    });
    const a = shape(deriveCanvasFromFiles(collected));
    const b = shape(deriveCanvasFromFiles(parsed.files));
    expect(b).toEqual(a);
    expect(a.nodes[0].prompt).toBe(nodeData.agent!.system_prompt);
  });

  it("Exportِ بدون graph.json/state.json هم بوم را می‌سازد (مسیر Obsidian/Git)", async () => {
    const store = await seedWorkspace();
    const collected: Record<string, string> = {};
    for (const p of await store.allPaths()) collected[p] = await store.readFile(p);
    const d = deriveCanvasFromFiles(collected);
    expect(d.nodes.length).toBeGreaterThan(0);
    expect(parseYaml("a: 1")?.a).toBe(1);
  });
});
