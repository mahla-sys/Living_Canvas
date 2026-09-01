import { describe, it, expect, beforeEach } from "vitest";
import { setStorage, storage, MemoryStorageAdapter, nodeToMarkdown, toYaml, frontmatter } from "../core";
import { hydrate } from "../engine";
import { emptyExecution, makeNodeData, CANVAS_ID, BUILTIN_TEMPLATE } from "../../state";
import type { AppState } from "../../state";

/* ============================================================
   Regression test at the exact spot where the bug lived: `hydrate()`.
   It measures two things at once:
     1) custom user templates must be found after a reload (the listDirectory filter bug)
     2) the canvas must be built from the Markdown/YAML files, without graph.json/state.json
   ============================================================ */

const ROOT = `canvases/${CANVAS_ID}`;

function makeApi(initial?: Partial<AppState>) {
  let s: AppState = {
    booted: false,
    bootLines: [],
    canvasId: CANVAS_ID,
    canvas: {
      title: "default title", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
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
  nodeToMarkdown(id, { ...makeNodeData("agent", title, "mahla"), content: `## ${title}\n\nNode body.`, ...(extra ? {} : {}) }, { x: 100, y: 200 });

describe("hydrate — restoration from files", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("with no manifest it deletes nothing and returns false", async () => {
    const api = makeApi();
    await hydrate(api);
    expect(api.peek().booted).toBe(false);
    expect(api.peek().templates.length).toBe(0);
  });

  it("a custom user template is not lost after reload (listDirectory bug regression)", async () => {
    await freshStore({
      [`${ROOT}/manifest.json`]: JSON.stringify({ version: "1.0", canvas_id: CANVAS_ID, structure_version: "1.3" }),
      [`${ROOT}/nodes/node-001.md`]: nodeFile("node-001", "Understand the problem"),
      [`${ROOT}/library/templates/my-flow/template.json`]: JSON.stringify({
        template_id: "my-flow", name: "My flow", description: "d", version: "1.0", nodes: [{ id: "a" }], edges: [],
      }),
    });
    const api = makeApi();
    const ok = await hydrate(api);
    expect(ok).toBe(true);
    const ids = api.peek().templates.map((t) => t.id);
    expect(ids).toContain("my-flow"); // ← this line used to fail
    expect(ids).toContain(BUILTIN_TEMPLATE.template_id);
    const mine = api.peek().templates.find((t) => t.id === "my-flow")!;
    expect(mine.name).toBe("My flow");
    expect(mine.builtin).toBe(false);
    expect(mine.nodes).toBe(1);
  });

  it("several templates side by side, and other files in the same folder do not interfere", async () => {
    await freshStore({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/nodes/n1.md`]: nodeFile("n1", "One"),
      [`${ROOT}/library/templates/a/template.json`]: JSON.stringify({ template_id: "a", name: "A", description: "", version: "1.0", nodes: [], edges: [] }),
      [`${ROOT}/library/templates/a/template.yaml`]: toYaml({ template_id: "a" }),
      [`${ROOT}/library/templates/b/template.json`]: JSON.stringify({ template_id: "b", name: "B", description: "", version: "1.0", nodes: [], edges: [] }),
    });
    const api = makeApi();
    await hydrate(api);
    expect(api.peek().templates.map((t) => t.id).sort()).toEqual([BUILTIN_TEMPLATE.template_id, "a", "b"].sort());
  });

  it("files-only mode: without graph.json/state.json the canvas is built from Markdown", async () => {
    await freshStore({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/canvas.yaml`]: toYaml({ id: CANVAS_ID, title: "Canvas recovered from files", owner: "mahla" }),
      [`${ROOT}/nodes/node-001.md`]: nodeFile("node-001", "Understand the problem"),
      [`${ROOT}/nodes/node-002.md`]: nodeFile("node-002", "Risk analysis"),
      [`${ROOT}/edges/edge-001.yaml`]: toYaml({ id: "edge-001", source: "node-001", target: "node-002", type: "flow", label: "input" }),
      [`${ROOT}/memory/global.md`]: frontmatter({ confidence: 0.5, source: "system" }, "# status\n\n- recovered goal"),
    });
    const api = makeApi();
    const ok = await hydrate(api);
    expect(ok).toBe(true);
    const s = api.peek();
    expect(s.nodes.map((n) => n.data.title).sort()).toEqual(["Risk analysis", "Understand the problem"]);
    expect(s.edges).toHaveLength(1);
    expect(s.canvas.title).toBe("Canvas recovered from files");
    expect(s.memory.global.body).toContain("recovered goal");
    // edits that only existed in the files were not wiped
    expect(s.nodes.length).toBe(2);
  });

  it("a node locked in a file does not come back locked in the UI (§12.5)", async () => {
    const md = nodeToMarkdown("node-009", {
      ...makeNodeData("note", "Locked", "mahla"),
      lock: { status: "locked", locked_by: "run-abc", locked_at: "2026-09-01T10:00:00.000Z" },
    });
    await freshStore({ [`${ROOT}/manifest.json`]: "{}", [`${ROOT}/nodes/node-009.md`]: md });
    const api = makeApi();
    await hydrate(api);
    expect(api.peek().nodes[0].data.lock.status).toBe("free");
    expect(api.peek().execution.status).toBe("idle");
  });

  it("with graph.json the data comes from it and title/content are overlaid from the file", async () => {
    const md = nodeToMarkdown("node-001", { ...makeNodeData("note", "title edited in Obsidian", "mahla"), content: "fresh text" });
    await freshStore({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/nodes/node-001.md`]: md,
      [`${ROOT}/graph.json`]: JSON.stringify({
        canvas_id: CANVAS_ID,
        nodes: [{ id: "node-001", type: "lc", position: { x: 55, y: 66 }, data: { ...makeNodeData("note", "old title", "mahla"), content: "old" } }],
        edges: [],
      }),
      [`${ROOT}/state.json`]: JSON.stringify({ canvas: makeApi().peek().canvas, memory: makeApi().peek().memory }),
    });
    const api = makeApi();
    await hydrate(api);
    const n = api.peek().nodes[0];
    expect(n.data.title).toBe("title edited in Obsidian");
    expect(n.data.content).toBe("fresh text");
    expect(n.position).toEqual({ x: 55, y: 66 }); // position comes from graph.json
  });

  it("broken/partial state.json → hydrate does not fail; the files are enough", async () => {
    await freshStore({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/state.json`]: "{ this is not json",
      [`${ROOT}/graph.json`]: JSON.stringify({ nodes: [], edges: [] }),
      [`${ROOT}/nodes/only.md`]: nodeFile("only", "Alone"),
    });
    const api = makeApi();
    expect(await hydrate(api)).toBe(true);
    expect(api.peek().nodes.map((n) => n.id)).toEqual(["only"]);
  });

  it("hydrate reads the active storage (no stale cache between tests)", async () => {
    const mem = await freshStore({ [`${ROOT}/manifest.json`]: "{}", [`${ROOT}/nodes/x.md`]: nodeFile("x", "X") });
    expect(storage).toBe(mem);
    const api = makeApi();
    await hydrate(api);
    expect(api.peek().nodes).toHaveLength(1);
  });
});
