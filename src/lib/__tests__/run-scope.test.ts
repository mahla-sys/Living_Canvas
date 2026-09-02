/* ============================================================
   Run scope (ADR-012): running part of a pipeline.

   The interesting rule is not the topological sort — it is what happens at the edge of the subset. An edge is
   counted only when *both* ends are inside the scope, so a scoped node whose predecessor was left out gets
   indegree 0 and runs first. Count the outside edge instead and the subset waits forever on a node nobody
   queued, which is the failure mode that would have shipped quietly.

   The other half is what scope does *not* do: it grants nothing. A node cut off from its upstream still cannot
   read that upstream's output, because `allowed_read_paths` is a property of the node's file and a run-time
   choice is not allowed to widen a contract.
   ============================================================ */
import { describe, it, expect, beforeEach } from "vitest";
import { setStorage, storage, MemoryStorageAdapter, toYaml } from "../core";
import { computeOrder, flowClosure, runPipeline } from "../engine";
import { nodeToMarkdown as fullNodeToMarkdown } from "../test-helpers";
import {
  CANVAS_ID, emptyExecution, makeAgentConfig, makeEdgeData, makeNodeData, ROLE_SCHEMAS, schemaPathFor,
  type AgentConfigOverrides, type AppState, type RFEdge, type RFNode,
} from "../../state";

const ROOT = `canvases/${CANVAS_ID}`;

function makeApi(initial?: Partial<AppState>) {
  let s: AppState = {
    booted: false,
    bootLines: [],
    canvasId: CANVAS_ID,
    canvas: {
      title: "run scope", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
      layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true },
    },
    nodes: [], edges: [],
    memory: {
      global: { path: "memory/global.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
      decisions: { path: "memory/decisions.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
      progress: { path: "memory/progress.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
      user: { path: "memory/user.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "user" },
      agents: {},
    },
    outputs: {}, chats: {}, logs: {}, runs: [], snapshots: [], templates: [], strokes: [],
    execution: emptyExecution(), events: [], toasts: [],
    settings: { provider: "sim", apiKey: "", model: "deepseek-chat", owner: "mahla", simDelay: 1, backendUrl: "", workspaceRoot: null, theme: "botanical", snapToGrid: false },
    saveState: "saved", typing: {},
    ui: { leftTab: "palette", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false, focusMode: false, chordDepth: 0 },
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

const agentNode = (id: string, roleId = "risk-analyst", tune?: AgentConfigOverrides) =>
  ({ id, position: { x: 10, y: 10 }, data: makeNodeData("agent", id, "mahla", { agent: makeAgentConfig(id, roleId, tune) }) }) as RFNode;
const flowEdge = (id: string, source: string, target: string, edgeType = "flow"): RFEdge =>
  ({ id, source, target, type: "smoothstep", data: { ...makeEdgeData(), edgeType } }) as RFEdge;

/** a → b → c, with a side branch a → d */
function chain() {
  const store = new MemoryStorageAdapter({
    [`${ROOT}/canvas-overview.md`]: toYaml({ title: "run scope", owner: "mahla", canvas_type: "agent-pipeline" }),
    ...Object.fromEntries(["a", "b", "c", "d"].map((id) => [`${ROOT}/nodes/${id}.md`, fullNodeToMarkdown(id, { title: id.toUpperCase(), nodeType: "agent" })])),
    ...Object.fromEntries(["risk-analyst", "solution-designer"].map((r) => [`${ROOT}/${schemaPathFor(r)}`, JSON.stringify(ROLE_SCHEMAS[r], null, 2)])),
  });
  setStorage(store);
  return makeApi({
    nodes: [agentNode("a", "risk-analyst"), agentNode("b", "risk-analyst"), agentNode("c", "risk-analyst"), agentNode("d", "risk-analyst")],
    edges: [flowEdge("e1", "a", "b"), flowEdge("e2", "b", "c"), flowEdge("e3", "a", "d")],
  });
}

const read = (p: string) => storage.readFile(`${ROOT}/${p}`);
const logOf = (api: ReturnType<typeof makeApi>, id: string) => (api.peek().logs[id] ?? []).join("\n");

describe("flowClosure — one definition of an edge that carries the run", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("walks downstream and upstream transitively, and includes the node itself", () => {
    const s = chain().peek();
    expect(flowClosure(s, "b", "downstream").sort()).toEqual(["b", "c"]);
    expect(flowClosure(s, "b", "upstream").sort()).toEqual(["a", "b"]);
    expect(flowClosure(s, "a", "downstream").sort()).toEqual(["a", "b", "c", "d"]);
    expect(flowClosure(s, "c", "downstream")).toEqual(["c"]); // a leaf has nothing below it
  });

  it("follows every flow type, not only `flow` — otherwise the scope and the order would disagree", () => {
    const api = chain();
    api.set({ edges: [...api.peek().edges, flowEdge("e4", "c", "d", "event-flow")] });
    expect(flowClosure(api.peek(), "c", "downstream").sort()).toEqual(["c", "d"]);
  });

  it("does not follow an edge type that does not carry the run", () => {
    const api = chain();
    api.set({ edges: [...api.peek().edges, flowEdge("e5", "c", "d", "relation")] });
    expect(flowClosure(api.peek(), "c", "downstream")).toEqual(["c"]);
  });
});

describe("computeOrder with a scope — dependencies are counted only inside it", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("without a scope the behaviour is exactly what it was", () => {
    const s = chain().peek();
    expect(computeOrder(s, "a").order).toEqual(["a", "b", "d", "c"]);
    // the same call, spelled with an explicit undefined, must not change the answer
    expect(computeOrder(s, "a", undefined).order).toEqual(computeOrder(s, "a").order);
  });

  it("a node whose predecessor is outside the scope runs first instead of waiting forever", () => {
    const s = chain().peek();
    // `b` and `c` only: `a` is out, so the a→b edge is not counted and `b` has indegree 0
    expect(computeOrder(s, "b", ["b", "c"]).order).toEqual(["b", "c"]);
  });

  it("the scope is a filter, not a reorder: the relative order inside it is preserved", () => {
    const s = chain().peek();
    expect(computeOrder(s, "a", ["a", "d"]).order).toEqual(["a", "d"]);
    expect(computeOrder(s, "a", ["b", "c"]).order).toEqual(["b", "c"]);
  });

  it("an id in the scope that is not on the canvas is ignored rather than queued", () => {
    const s = chain().peek();
    expect(computeOrder(s, "b", ["b", "ghost"]).order).toEqual(["b"]);
  });
});

describe("runPipeline with a scope — end to end through the store", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("runs only the scoped nodes and writes only their outputs", async () => {
    const api = chain();
    await runPipeline(api, { scope: ["b", "c"], label: "Run selected (2)" });

    expect(api.peek().execution.status).toBe("completed");
    expect(await read("outputs/b/summary.md")).toBeTruthy();
    expect(await read("outputs/c/summary.md")).toBeTruthy();
    // `a` was never queued, so it has no output directory at all
    await expect(read("outputs/a/summary.md")).rejects.toThrow(/ENOENT/);
    await expect(read("outputs/d/summary.md")).rejects.toThrow(/ENOENT/);
    expect(Object.keys(api.peek().outputs).sort()).toEqual(["b", "c"]);
  });

  it("records the scope in the ledger, so 'why only these' is answerable from the files", async () => {
    const api = chain();
    await runPipeline(api, { scope: ["b", "c"], label: "Run from this node downstream" });
    const ledger = await read(`runs/${api.peek().execution.run_id}.md`);
    expect(ledger).toContain("Run from this node downstream");
    expect(ledger).toContain("Scope: b, c");
    // an unscoped run keeps the wording it always had
    const full = chain();
    await runPipeline(full);
    expect(await read(`runs/${full.peek().execution.run_id}.md`)).toContain("Full pipeline run from");
  });

  it("the only file that records the choice is the run ledger — the canvas never hears about it (ADR-012)", async () => {
    const api = chain();
    await runPipeline(api, { scope: ["b", "c"], label: "Run selected (2)" });

    /* Asserted across every path in storage rather than against `canvas.yaml`, which a run does not write at
       all — `writeCore` is debounced, so reading it here would have tested the debounce and not the claim. */
    const mentions: string[] = [];
    for (const p of await storage.allPaths()) {
      if (/Scope: b, c|Run selected \(2\)/.test(await storage.readFile(p))) mentions.push(p.replace(`${ROOT}/`, ""));
    }
    expect(mentions).toEqual([`runs/${api.peek().execution.run_id}.md`]);
    /* and the state carries no scope either — it was an argument, never a field. Checked as a *key* and not
       as the word, because the canvas in this test is literally titled "run scope". */
    const keys = new Set(Object.keys(api.peek().canvas));
    expect([...keys].some((k) => /scope/i.test(k))).toBe(false);
    expect("scope" in api.peek().execution).toBe(false);
  });

  it("scope grants no read permission: a cut-off node still cannot read the output it was cut off from", async () => {
    const api = chain();
    await runPipeline(api, { scope: ["b"], label: "Run selected (1)" });
    // `b`'s contract allows `outputs/*/summary.md`, but `a` never ran, so there is nothing to read —
    // and the run still completes rather than failing for a missing optional input
    expect(api.peek().execution.status).toBe("completed");
    expect(logOf(api, "b")).not.toContain("blocked read");
    expect(api.peek().outputs["b"]).toBeTruthy();
  });

  it("refuses a scope with nothing runnable in it, and says so instead of running everything", async () => {
    const api = chain();
    await runPipeline(api, { scope: [], label: "Run selected (0)" });
    expect(api.peek().execution.status).toBe("idle");
    expect(api.peek().toasts.some((t) => t.kind === "error")).toBe(true);
  });
});
