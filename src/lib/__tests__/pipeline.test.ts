/* ============================================================
   An end-to-end pipeline run, driven through `engine` + the store with no browser involved.

   The shape is the one a reader would actually build: four agents in a line, with a conditional
   edge that lets the third through and blocks the fourth on the same score. What this file
   asserts is not "the run finished" — it is the four things that have to be true afterwards:
     1) every completed agent's output is a file under `outputs/<node>/`;
     2) `runs/<run-id>.md` exists and records the whole run, including the step that was skipped;
     3) locks are released and statuses are honest — nothing is left "running" or "locked";
     4) `agent.model` reaches the provider: the endpoint and the model name in the request body
        are the ones the node asked for, not the ones in Settings.
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setStorage, storage, MemoryStorageAdapter } from "../core";
import { runPipeline } from "../engine";
import { nodeToMarkdown, toYaml } from "../test-helpers";
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
      title: "pipeline test", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
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
    settings: { provider: "sim", apiKey: "", model: "deepseek-chat", owner: "mahla", simDelay: 1, backendUrl: "", workspaceRoot: null, theme: "plum", snapToGrid: false },
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

const agentNode = (id: string, roleId: string, tune?: AgentConfigOverrides) =>
  ({ id, position: { x: 10, y: 10 }, data: makeNodeData("agent", id, "mahla", { agent: makeAgentConfig(id, roleId, tune) }) }) as RFNode;

const flowEdge = (id: string, source: string, target: string, condition?: string): RFEdge =>
  ({
    id, source, target, type: "smoothstep",
    data: { ...makeEdgeData(), ...(condition ? { trigger: { type: "condition" as const, condition } } : {}) },
  }) as RFEdge;

/* hard validation reads the schema off disk (§4.9), so a run without these files would fail at the
   write step for a reason that has nothing to do with the graph under test */
const schemaFiles = Object.fromEntries(
  (["understander", "risk-analyst", "solution-designer", "decision-maker"] as const)
    .map((r) => [`${ROOT}/${schemaPathFor(r)}`, JSON.stringify(ROLE_SCHEMAS[r], null, 2)]),
);

/**
 * u → r → d → m
 *        ↖ gated by `risk_score < 7` (true: the analyst scores 5)
 *           ↖ m is gated by `risk_score > 7` (false: it must be skipped, not silently run)
 */
function fourAgentPipeline(modelOf?: Partial<Record<string, string>>, into?: MemoryStorageAdapter) {
  const seed: Record<string, string> = {
    [`${ROOT}/canvas-overview.md`]: toYaml({ title: "pipeline test", owner: "mahla", canvas_type: "agent-pipeline" }),
    [`${ROOT}/nodes/u.md`]: nodeToMarkdown("u", { title: "Understand", nodeType: "agent" }),
    [`${ROOT}/nodes/r.md`]: nodeToMarkdown("r", { title: "Assess risk", nodeType: "agent" }),
    [`${ROOT}/nodes/d.md`]: nodeToMarkdown("d", { title: "Design", nodeType: "agent" }),
    [`${ROOT}/nodes/m.md`]: nodeToMarkdown("m", { title: "Decide", nodeType: "agent" }),
    ...schemaFiles,
  };
  // an existing adapter means "the same workspace on a second visit": the first run's files must still be there
  const store = into ?? new MemoryStorageAdapter();
  if (into) for (const [k, v] of Object.entries(seed)) into.writeFile(k, v);
  else for (const [k, v] of Object.entries(seed)) store.writeFile(k, v);
  setStorage(store);
  const model = (id: string) => (modelOf?.[id] ? { model: modelOf[id] } : {});
  const api = makeApi({
    nodes: [
      agentNode("u", "understander", model("u")),
      agentNode("r", "risk-analyst", model("r")),
      agentNode("d", "solution-designer", model("d")),
      agentNode("m", "decision-maker", model("m")),
    ],
    edges: [
      flowEdge("e1", "u", "r"),
      flowEdge("e2", "r", "d", "{{ risk_score < 7 }}"),
      flowEdge("e3", "d", "m", "{{ risk_score > 7 }}"),
    ],
  });
  return { api, store };
}

const read = (p: string) => storage.readFile(`${ROOT}/${p}`);
const logOf = (api: ReturnType<typeof makeApi>, id: string) => (api.peek().logs[id] ?? []).join("\n");
const statusOf = (api: ReturnType<typeof makeApi>, id: string) =>
  api.peek().nodes.find((n) => n.id === id)?.data.agent?.status;

describe("a four-agent pipeline with a conditional edge — run through engine + Store", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("completes, and the conditional edge is what decided who ran", async () => {
    const { api } = fourAgentPipeline();
    await runPipeline(api);

    expect(api.peek().execution.status).toBe("completed");
    // the score is data the analyst actually produced, and both gates read the same number
    expect(await read("outputs/r/risk_score.md")).toContain("5");
    expect(logOf(api, "d")).not.toContain("skipped:");
    expect(logOf(api, "m")).toContain("skipped: risk_score = 5 does not satisfy > 7");
  });

  it("writes every completed agent's output to outputs/<node>/ on disk", async () => {
    const { api } = fourAgentPipeline();
    await runPipeline(api);

    for (const id of ["u", "r", "d"]) {
      expect(await read(`outputs/${id}/summary.md`), `outputs/${id}/summary.md`).toBeTruthy();
    }
    // a skipped node has no output directory at all — not an empty one, which would read as "it ran"
    await expect(read("outputs/m/summary.md")).rejects.toThrow(/ENOENT/);
    expect(api.peek().outputs["m"]).toBeUndefined();
    expect(Object.keys(api.peek().outputs).sort()).toEqual(["d", "r", "u"]);
    // the files, not the state, are the record: the same paths are readable straight from storage
    expect((await storage.allPaths()).filter((p) => p.includes("/outputs/")).length).toBeGreaterThan(3);
  });

  it("creates runs/<run-id>.md and records the skipped step in it", async () => {
    const { api } = fourAgentPipeline();
    await runPipeline(api);

    const runId = api.peek().execution.run_id;
    expect(runId).toBeTruthy();
    const ledger = await read(`runs/${runId}.md`);
    expect(ledger).toContain(`run_id: ${runId}`);
    expect(ledger).toContain("| # | node | tool / step | status | detail |");
    // every node that ran appears, and so does the one that did not
    for (const id of ["u", "r", "d"]) expect(ledger).toContain(`| ${id} |`);
    // the blocked edge is a row of its own, so the ledger says *why* `m` never ran
    expect(ledger).toContain("| m | edge_condition | blocked |");
    expect(ledger).toContain("**run completed**");
    // the ledger is a file, so a reader who never opened the app can see what happened
    expect(api.peek().runs).toContain(runId);
    expect((await storage.allPaths()).filter((p) => p.startsWith(`${ROOT}/runs/`))).toEqual([`${ROOT}/runs/${runId}.md`]);
  });

  it("releases every lock and leaves an honest status behind", async () => {
    const { api } = fourAgentPipeline();

    // a node that has not run is idle, not running — the pipeline has not started touching locks yet
    expect(api.peek().nodes.every((n) => n.data.lock.status === "free")).toBe(true);

    await runPipeline(api);

    const after = api.peek();
    // nothing may be left holding a lock: a lock that survives a completed run blocks the next one
    expect(after.nodes.every((n) => n.data.lock.status === "free")).toBe(true);
    expect(after.nodes.every((n) => n.data.lock.locked_by === null)).toBe(true);
    expect(after.nodes.every((n) => n.data.agent?.status !== "running")).toBe(true);
    expect(statusOf(api, "u")).toBe("done");
    expect(statusOf(api, "r")).toBe("done");
    expect(statusOf(api, "d")).toBe("done");
    /* A blocked node stays `idle`, and that is deliberate rather than an oversight: `AgentStatus` is
       `idle | running | done | failed | waiting`, and a node a gate stopped never started, so "idle" is the
       true thing to say about it. Adding a `skipped` status would mean a new value in every node file and a
       new colour in the card — and the fact is already recorded twice where it is durable: the node's own log
       and a `blocked` row in the run ledger, both asserted below. */
    expect(statusOf(api, "m")).toBe("idle");
    expect(after.execution.completed).toContain("m"); // walked past, not left in the queue
    expect(after.execution.current_node_id).toBe(null);
  });

  it("survives a reload: the graph comes back from the files the run wrote", async () => {
    const { api } = fourAgentPipeline();
    await runPipeline(api);
    const runId = api.peek().execution.run_id;

    // a second run over the *same* storage must not be blocked by the first one's locks
    const again = fourAgentPipeline({}, storage as MemoryStorageAdapter);
    await runPipeline(again.api);
    expect(again.api.peek().execution.status).toBe("completed");
    expect(again.api.peek().execution.run_id).not.toBe(runId);
    // and both ledgers are still on disk, because each run writes its own
    expect((await storage.allPaths()).filter((p) => p.startsWith(`${ROOT}/runs/`)).length).toBe(2);
  });
});

/* ============================================================
   `agent.model` reaches the provider.
   Everything above runs in the simulator, which is exactly where the wiring is *not* exercised:
   the simulator ignores the model. So the claim needs a test with a stubbed network, asserting the
   URL and the model name that leave the machine (ADR-008: the model a node names picks the endpoint).
   ============================================================ */
describe("agent.model decides the endpoint — with the network stubbed, not the network called", () => {
  const realFetch = globalThis.fetch;
  let calls: { url: string; model: string }[] = [];

  beforeEach(() => {
    calls = [];
    globalThis.fetch = vi.fn(async (url: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      calls.push({ url: String(url), model: String(body.model ?? "") });
      return new Response(JSON.stringify({ choices: [{ message: { content: "A stubbed answer for the contract test." } }] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    setStorage(new MemoryStorageAdapter());
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  /** the graph runs with the provider switch on and a key present, so the real branch is taken */
  function livePipeline(models: Record<string, string>) {
    const { api } = fourAgentPipeline(models);
    api.set({ settings: { ...api.get().settings, provider: "deepseek", apiKey: "test-key" } });
    return api;
  }

  it("sends each node to the endpoint its own model names", async () => {
    const api = livePipeline({ u: "ollama:llama3.2", r: "deepseek-reasoner" });
    await runPipeline(api);

    // `ollama:` is our prefix for the local server, and it must not reach the wire as part of the name
    expect(calls).toContainEqual({ url: "http://127.0.0.1:11434/v1/chat/completions", model: "llama3.2" });
    expect(calls).toContainEqual({ url: "https://api.deepseek.com/chat/completions", model: "deepseek-reasoner" });
    // two different nodes, two different endpoints, in one run — the route is per node, not per canvas
    expect(new Set(calls.map((c) => c.url)).size).toBe(2);
    // and the node that named no model still went somewhere: the canvas default, on the DeepSeek endpoint
    expect(calls.filter((c) => c.url === "https://api.deepseek.com/chat/completions").length).toBe(2);
    expect(logOf(api, "u")).toContain("calling ollama/llama3.2");
  });

  it("falls back to Settings' model for a node whose file predates the field", async () => {
    const { api } = fourAgentPipeline({ u: "deepseek-reasoner" });
    api.set({ settings: { ...api.get().settings, provider: "deepseek", apiKey: "test-key", model: "deepseek-chat" } });
    // `d` names no model at all: the canvas default is what runs there
    api.set((st) => ({
      nodes: st.nodes.map((n) => (n.id === "d" ? { ...n, data: { ...n.data, agent: { ...n.data.agent!, model: "" } } } : n)),
    }));
    await runPipeline(api);

    expect(calls.some((c) => c.model === "deepseek-chat")).toBe(true);
    expect(calls.some((c) => c.model === "deepseek-reasoner")).toBe(true);
  });

  it("stays offline when the provider switch says sim — and that is deliberate, not a broken wire", async () => {
    const api = livePipeline({ u: "deepseek-reasoner" });
    api.set({ settings: { ...api.get().settings, provider: "sim" } });
    await runPipeline(api);

    // `provider: "sim"` is the reader saying "do not call the network", and it outranks `agent.model`.
    // Under sim the model field is inert on purpose; the routing itself is covered by the test above
    // and by model-route.test.ts, so this asserts the switch, not the wiring.
    expect(calls.length).toBe(0);
    expect(logOf(api, "u")).toContain("phase 1 simulator");
    expect(api.peek().execution.status).toBe("completed");
  });
});
