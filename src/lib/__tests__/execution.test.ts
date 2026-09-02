/* ============================================================
   Execution rules: the contract is the gate, and it fails closed.
   Unit coverage for evalCondition / numericScope / isPathAllowed / computeOrder /
   hasTool, plus one end-to-end run that proves the same rules hold when the executor
   actually writes files (runs/, logs/, outputs/).
   ============================================================ */
import { describe, it, expect, beforeEach } from "vitest";
import { setStorage, storage, MemoryStorageAdapter } from "../core";
import {
  evalCondition, numericScope, isPathAllowed, computeOrder, hasTool, unknownTools, MemoryManager, runPipeline, sendChat,
} from "../engine";
import {
  CANVAS_ID, emptyExecution, makeAgentConfig, makeEdgeData, makeNodeData, ROLE_SCHEMAS, schemaPathFor,
  type AgentConfigOverrides, type AppState, type RFEdge, type RFNode,
} from "../../state";
import { nodeToMarkdown, toYaml } from "../test-helpers";

const ROOT = `canvases/${CANVAS_ID}`;

/* ---------------- pure helpers ---------------- */

describe("evalCondition — fail-closed (§7.1)", () => {
  it("passes a satisfied numeric condition", () => {
    expect(evalCondition("{{ risk_score < 7 }}", { risk_score: 5 })).toEqual({ ok: true });
    expect(evalCondition("{{n>=3}}", { n: 3 }).ok).toBe(true);
    expect(evalCondition("{{ n <= 2.5 }}", { n: 2.5 }).ok).toBe(true);
  });

  it("blocks an unsatisfied condition and says why", () => {
    const r = evalCondition("{{ risk_score < 7 }}", { risk_score: 9 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("does not satisfy");
  });

  it("blocks when the variable was never produced — the old code returned true here", () => {
    const r = evalCondition("{{ risk_score < 7 }}", {});
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("never produced");
  });

  it("blocks an unparsable condition instead of treating it as satisfied", () => {
    for (const raw of ["", "{{ }}", "{{ nonsense }}", "{{ risk_score < }}", "{{ 5 < 7 or 3 > 1 }}"]) {
      const r = evalCondition(raw, { risk_score: 5 });
      expect(r.ok, raw).toBe(false);
      expect(r.reason, raw).toContain("unparsable");
    }
  });

  it("accepts a bare condition but still needs data on the right-hand side", () => {
    expect(evalCondition("risk_score < 7", { risk_score: 5 }).ok).toBe(true);
    expect(evalCondition("{{ a < b < c }}", { a: 1 }).ok).toBe(false);
  });

  it("blocks a numeric comparison over non-numeric data", () => {
    const r = evalCondition("{{ risk_score < 7 }}", { risk_score: "medium" });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("not a number");
  });

  it("compares strings with == and !=", () => {
    expect(evalCondition('{{ decision == "revise" }}', { decision: "revise" }).ok).toBe(true);
    expect(evalCondition('{{ decision == "revise" }}', { decision: "reject" }).ok).toBe(false);
    expect(evalCondition('{{ decision != "reject" }}', { decision: "revise" }).ok).toBe(true);
    expect(evalCondition('{{ decision < "revise" }}', { decision: "revise" }).ok).toBe(false);
  });
});

describe("numericScope — the blackboard carries data, not prose", () => {
  it("lifts only fields whose whole value is a number", () => {
    expect(numericScope({ risk_score: "5", ratio: " 0.5 ", n: "-2" })).toEqual({ risk_score: 5, ratio: 0.5, n: -2 });
    expect(numericScope({ risks: "risk 1: severity 6", summary: "Total: 5 out of 10", empty: "" })).toEqual({});
    expect(numericScope({})).toEqual({});
    expect(numericScope(undefined as unknown as Record<string, string>)).toEqual({});
  });
});

describe("isPathAllowed — one matcher for reads and writes (§9)", () => {
  it("grants a directory prefix, an exact path and a one-segment glob", () => {
    expect(isPathAllowed(["outputs/node-001/"], "outputs/node-001/summary.md")).toBe(true);
    expect(isPathAllowed(["memory/decisions.md"], "memory/decisions.md")).toBe(true);
    expect(isPathAllowed(["outputs/*/summary.md"], "outputs/node-007/summary.md")).toBe(true);
  });

  it("does not let a grant leak across segments or neighbours", () => {
    expect(isPathAllowed(["outputs/*/summary.md"], "outputs/node-001/deep/summary.md")).toBe(false);
    expect(isPathAllowed(["outputs/*/summary.md"], "memory/summary.md")).toBe(false);
    expect(isPathAllowed(["outputs/node-1/"], "outputs/node-10/summary.md")).toBe(false);
    // a file entry must match exactly — the old startsWith let "…a.md.bak" through
    expect(isPathAllowed(["memory/agents/a.md"], "memory/agents/a.md.secret")).toBe(false);
    expect(isPathAllowed([""], "anything")).toBe(false);
  });
});

describe("hasTool / unknownTools (§9)", () => {
  const agent = (tools: string[]) => ({ ...makeAgentConfig("n1", "understander"), tools }) as never;

  it("treats the read-only harness as always-on and everything else as granted", () => {
    expect(hasTool(agent([]), "get_canvas_overview")).toBe(true);
    expect(hasTool(agent([]), "get_agent_brief")).toBe(true);
    expect(hasTool(agent([]), "write_output")).toBe(false);
    expect(hasTool(agent(["write_output"]), "write_output")).toBe(true);
    expect(hasTool(null, "read_memory")).toBe(false);
  });

  it("names the tools this app cannot run rather than ignoring them", () => {
    expect(unknownTools(agent(["read_memory", "browse_web"]))).toEqual(["browse_web"]);
    expect(unknownTools(agent(["read_memory"]))).toEqual([]);
  });
});

describe("computeOrder — Kahn over the whole canvas (§7.1)", () => {
  const node = (id: string, nodeType: "agent" | "output-box" | "note" = "agent"): RFNode =>
    ({ id, position: { x: 0, y: 0 }, data: makeNodeData(nodeType, id, "mahla") }) as RFNode;
  const edge = (id: string, source: string, target: string, edgeType: "flow" | "relation" = "flow"): RFEdge =>
    ({ id, source, target, type: "smoothstep", data: { ...makeEdgeData(), edgeType } }) as RFEdge;
  const state = (nodes: RFNode[], edges: RFEdge[]): AppState =>
    ({ nodes, edges } as unknown as AppState);

  it("runs both sides of a diamond before the join", () => {
    const s = state(
      [node("a"), node("b"), node("c"), node("d")],
      [edge("e1", "a", "b"), edge("e2", "a", "c"), edge("e3", "b", "d"), edge("e4", "c", "d")]
    );
    const { order, cyclic } = computeOrder(s, "a");
    expect(order).toHaveLength(4);
    expect(order.indexOf("d")).toBe(3);
    expect(cyclic).toEqual([]);
  });

  it("keeps a predecessor ahead of the node that starts the run", () => {
    const s = state([node("a"), node("b"), node("c")], [edge("e1", "a", "b"), edge("e2", "b", "c")]);
    // a source start keeps "run from here" meaning; a mid-graph start must not jump the queue
    expect(computeOrder(s, "a").order).toEqual(["a", "b", "c"]);
    expect(computeOrder(s, "b").order).toEqual(["a", "b", "c"]);
  });

  it("queues nodes the start cannot reach instead of dropping them silently", () => {
    const s = state([node("a"), node("lonely"), node("box", "output-box")], [edge("e1", "a", "box")]);
    const { order, cyclic } = computeOrder(s, "a");
    expect(order).toContain("lonely");
    expect(order).toHaveLength(3);
    expect(cyclic).toEqual([]);
  });

  it("reports flow cycles, and still queues those nodes with a reason", () => {
    const s = state([node("a"), node("b")], [edge("e1", "a", "b"), edge("e2", "b", "a")]);
    const { order, cyclic } = computeOrder(s, "a");
    expect(cyclic.sort()).toEqual(["a", "b"]);
    expect(order.sort()).toEqual(["a", "b"]);
  });

  it("ignores parallel edges and non-flow edges", () => {
    const s = state([node("a"), node("b")], [edge("e1", "a", "b"), edge("e1b", "a", "b"), edge("r1", "a", "b", "relation")]);
    expect(computeOrder(s, "a").order).toEqual(["a", "b"]);
  });

  it("is deterministic for the same graph (the files are the record)", () => {
    const s = state([node("a"), node("b1"), node("b2"), node("c")], [
      edge("e1", "a", "b1"), edge("e2", "a", "b2"), edge("e3", "b1", "c"), edge("e4", "b2", "c"),
    ]);
    const first = computeOrder(s, "a").order;
    for (let i = 0; i < 5; i++) expect(computeOrder(s, "a").order).toEqual(first);
  });
});

/* ---------------- the executor, with real files ---------------- */

function makeApi(initial?: Partial<AppState>) {
  let s: AppState = {
    booted: true,
    bootLines: [],
    canvasId: CANVAS_ID,
    canvas: {
      title: "contract test", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
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

const agentNode = (id: string, roleId: string, tune?: AgentConfigOverrides) =>
  ({ id, position: { x: 10, y: 10 }, data: makeNodeData("agent", id, "mahla", { agent: makeAgentConfig(id, roleId, tune) }) }) as RFNode;
const flowEdge = (id: string, source: string, target: string, condition?: string): RFEdge =>
  ({
    id, source, target, type: "smoothstep",
    data: { ...makeEdgeData(), ...(condition ? { trigger: { type: "condition" as const, condition } } : {}) },
  }) as RFEdge;

/** The schemas the two roles' contracts declare — hard validation means the run needs them on disk (§4.9). */
const roleSchemaFiles = (roles: string[]) =>
  Object.fromEntries(roles.map((r) => [`${ROOT}/${schemaPathFor(r)}`, JSON.stringify(ROLE_SCHEMAS[r], null, 2)]));

async function twoAgentGraph(opts: {
  a?: AgentConfigOverrides;
  b?: AgentConfigOverrides;
  condition?: string;
  schemas?: Record<string, unknown> | null;
} = {}) {
  const custom = opts.schemas;
  const seeded =
    custom === null
      ? {} // the schema files deliberately do not exist
      : custom === undefined
        ? roleSchemaFiles(["risk-analyst", "solution-designer"])
        : Object.fromEntries(Object.entries(custom).map(([k, v]) => [`${ROOT}/library/schemas/${k}.schema.json`, JSON.stringify(v)]));
  const store = new MemoryStorageAdapter({
    [`${ROOT}/canvas-overview.md`]: toYaml({ title: "contract test", owner: "mahla", canvas_type: "agent-pipeline" }),
    [`${ROOT}/nodes/a.md`]: nodeToMarkdown("a", { title: "A", nodeType: "agent" }),
    [`${ROOT}/nodes/b.md`]: nodeToMarkdown("b", { title: "B", nodeType: "agent" }),
    ...seeded,
  });
  setStorage(store);
  const api = makeApi({
    nodes: [agentNode("a", "risk-analyst", opts.a), agentNode("b", "solution-designer", opts.b)],
    edges: [flowEdge("e1", "a", "b", opts.condition)],
  });
  return { api, store };
}

const logOf = (api: ReturnType<typeof makeApi>, id: string) => (api.peek().logs[id] ?? []).join("\n");
const read = (p: string) => storage.readFile(`${ROOT}/${p}`);

describe("runPipeline — the contract gates what a node reads, writes and may do", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("hands the predecessor's summary to a node whose contract grants it", async () => {
    const { api } = await twoAgentGraph();
    await runPipeline(api);
    expect(api.peek().execution.status).toBe("completed");
    expect(await read("outputs/a/summary.md")).toContain("Three main risks were identified");
    expect(logOf(api, "b")).not.toContain("blocked read");
    expect(api.peek().events.some((e) => e.type === "node.completed")).toBe(true);
  });

  it("refuses upstream data that the read contract does not grant", async () => {
    const { api } = await twoAgentGraph({ b: { context_contract: { allowed_read_paths: ["canvas-overview.md"] } } });
    await runPipeline(api);
    expect(logOf(api, "b")).toContain("blocked read — not in allowed_read_paths: outputs/a/summary.md");
    expect(api.peek().events.some((e) => e.type === "validation.failed" && e.message.includes("outputs/a/summary.md"))).toBe(true);
    // B still ran: a denied read is a missing input, not a permission to skip the step
    expect(await read("outputs/b/summary.md")).toBeTruthy();
  });

  it("will not deliver output when write_output is not in the tools (§9)", async () => {
    const { api } = await twoAgentGraph({ b: { tools: [] } });
    await runPipeline(api);
    expect(logOf(api, "b")).toContain("write_output is not in tools → the output contract cannot be delivered");
    expect(logOf(api, "b")).toContain("read_memory is not in tools → skipped");
    expect(api.peek().outputs["b"]).toBeUndefined();
    expect(api.peek().execution.status).toBe("failed");
  });

  it("evaluates a conditional edge on the score the role actually produced", async () => {
    const pass = await twoAgentGraph({ condition: "{{ risk_score < 7 }}" });
    await runPipeline(pass.api);
    expect(logOf(pass.api, "b")).not.toContain("skipped:");
    expect(await read("outputs/b/summary.md")).toBeTruthy();
    // the score is data written by the run, not a value the engine hardcodes for one role
    expect(await read("outputs/a/risk_score.md")).toContain("\n\n5");
  });

  it("blocks the edge when the score says so — and says why", async () => {
    const { api } = await twoAgentGraph({ condition: "{{ risk_score > 7 }}" });
    await runPipeline(api);
    expect(logOf(api, "b")).toContain("skipped: risk_score = 5 does not satisfy > 7");
    await expect(read("outputs/b/summary.md")).rejects.toThrow(/ENOENT/);
    expect(api.peek().outputs["b"]).toBeUndefined();
  });

  it("blocks the edge when the condition cannot be evaluated at all", async () => {
    const { api } = await twoAgentGraph({ condition: "{{ budget < 7 }}" });
    await runPipeline(api);
    expect(logOf(api, "b")).toContain("“budget” was never produced by a completed step");
    expect(api.peek().outputs["b"]).toBeUndefined();
  });

  it("records the run in runs/<run-id>.md, from open to close", async () => {
    const { api } = await twoAgentGraph();
    await runPipeline(api);
    const runId = api.peek().execution.run_id;
    expect(runId).toBeTruthy();
    const ledger = await read(`runs/${runId}.md`);
    expect(ledger).toContain(`run_id: ${runId}`);
    expect(ledger).toContain("| # | node | tool / step | status | detail |");
    expect(ledger).toContain("| 1 | a | get_canvas_overview | ok |");
    expect(ledger).toContain("write_output | ok | 4/4 fields → outputs/a/");
    expect(ledger).toContain("**run completed**");
    // the ledger is a file, so it survives a reload: nothing in state is required to see it
    expect(api.peek().nodes.every((n) => n.data.agent?.status !== "running")).toBe(true);
  });
});

describe("chat_with_user — the gate refuses the reply, not the record", () => {
  it("still saves the user's message and explains the refusal", async () => {
    const { api } = await twoAgentGraph({ b: { tools: ["read_memory", "write_memory", "write_output"] } });
    await sendChat(api, "b", "what does the risk report mean?");
    const chat = await read("chats/chat-b.md");
    expect(chat).toContain("what does the risk report mean?");
    expect(chat).toContain("chat_with_user is not in the tools");
    expect(api.peek().typing["b"]).toBeFalsy();
    expect(api.peek().events.some((e) => e.type === "validation.failed" && e.message.includes("chat refused"))).toBe(true);
  });

  it("answers normally when the role has the tool", async () => {
    const { api } = await twoAgentGraph({ a: { tools: ["read_memory", "write_memory", "write_output", "chat_with_user"] } });
    await sendChat(api, "a", "hello?");
    const chat = await read("chats/chat-a.md");
    expect(chat).not.toContain("chat refused");
    expect(chat.split("## ").length).toBeGreaterThanOrEqual(3); // user + agent
  });
});

describe("MemoryManager.read — allowed paths resolve against real files (§9)", () => {
  it("returns a granted output file, not only the five memory documents", async () => {
    const { api } = await twoAgentGraph();
    await runPipeline(api);
    const docs = await MemoryManager.read(api, "b");
    const joined = docs.join("\n\n");
    expect(joined).toContain("### outputs/a/summary.md");
    expect(joined).toContain("Three main risks were identified");
    expect(joined).toContain("memory/agents/b.md");
  });

  it("shows nothing that the contract does not name", async () => {
    const { api } = await twoAgentGraph({ b: { context_contract: { allowed_read_paths: ["memory/agents/b.md"] } } });
    await runPipeline(api);
    const docs = await MemoryManager.read(api, "b");
    expect(docs.join("\n")).toContain("Memory of b");
    expect(docs.join("\n")).not.toContain("outputs/a/");
  });
});

/** the ledger of the newest run written so far (the file name carries a timestamp) */
async function latestRun(store: MemoryStorageAdapter): Promise<string> {
  const ids = (await store.listDirectory(`${ROOT}/runs`)).filter((n) => n.endsWith(".md")).sort();
  return `${ROOT}/runs/${ids[ids.length - 1]}`;
}

/* ---------------- the contract is enforced, not decorated (decision Q1) ---------------- */

/** A contract that names a schema and lists the fields the run produces — the pieces that must agree. */
function hardContract(fields: string[], validator: string | null) {
  return { context_contract: { output_contract: { required_fields: fields, validator } } };
}

describe("hard schema validation (§4.9)", () => {
  it("lets a conforming output through and writes the files", async () => {
    const { api, store } = await twoAgentGraph({ a: hardContract(["summary", "risks", "decision", "risk_score"], schemaPathFor("risk-analyst")) });
    await runPipeline(api);
    expect(api.get().execution.errors["a"] ?? "").toBe("");
    expect(await store.readFile(`${ROOT}/outputs/a/summary.md`)).toContain("Three main risks were identified");
    expect(await store.readFile(`${ROOT}/outputs/a/risk_score.md`)).toContain("\n\n5");
  });

  it("refuses an output that breaks a declared range — and says so in three places", async () => {
    const { api, store } = await twoAgentGraph({
      // the shipped schema allows 1..10; this canvas tightened it to 1..3, and the simulated run scores 5
      schemas: { "risk-analyst": { required: ["risk_score"], properties: { risk_score: { type: "integer", minimum: 1, maximum: 3 } } } },
    });
    await runPipeline(api);
    const why = api.get().execution.errors["a"] ?? "";
    // 1. the node carries the reason, because the canvas is the orchestrator of a non-deterministic tool
    expect(why).toContain("output rejected");
    expect(why).toContain("“risk_score” = 5 is above the maximum 3");
    // 2. nothing was delivered
    await expect(store.readFile(`${ROOT}/outputs/a/summary.md`)).rejects.toThrow(/ENOENT/);
    // 3. the log and the ledger both record the refusal
    expect(logOf(api, "a")).toContain("validation rejected the output");
    const ledger = await store.readFile(await latestRun(store));
    expect(ledger).toContain("| rejected |");
  });

  it("refuses a declared schema that is not in the canvas", async () => {
    // the contract still names library/schemas/risk-analyst.schema.json; the folder is empty
    const { api, store } = await twoAgentGraph({ schemas: null });
    await runPipeline(api);
    expect(api.get().execution.errors["a"]).toContain(
      "library/schemas/risk-analyst.schema.json: the contract names this schema, but the file is not in the canvas"
    );
    await expect(store.readFile(`${ROOT}/outputs/a/summary.md`)).rejects.toThrow(/ENOENT/);
  });

  it("refuses a validator that points outside library/schemas/", async () => {
    const { api } = await twoAgentGraph({ a: hardContract(["summary"], "memory/global.md") });
    await runPipeline(api);
    expect(api.get().execution.errors["a"]).toContain("must live under library/schemas/");
  });

  it("refuses a file that is not one JSON object", async () => {
    const { api, store } = await twoAgentGraph();
    await store.writeFile(`${ROOT}/library/schemas/risk-analyst.schema.json`, "[1, 2, 3]");
    await runPipeline(api);
    expect(api.get().execution.errors["a"]).toContain("the schema file must contain one JSON object");
  });

  it("refuses a schema whose keywords it does not implement rather than ignoring them", async () => {
    const { api } = await twoAgentGraph({
      schemas: { "risk-analyst": { required: ["summary"], properties: { summary: { type: "string", format: "email" } } } },
    });
    await runPipeline(api);
    expect(api.get().execution.errors["a"]).toContain("unsupported keyword");
  });

  it("an opted-out node is still gated by required_fields", async () => {
    const { api, store } = await twoAgentGraph({ a: hardContract(["summary", "nope"], null) });
    await runPipeline(api);
    // the field the run never produced fails it on presence alone — no schema needed
    expect(api.get().execution.errors["a"]).toContain("“nope” is required and came back empty");
    await expect(store.readFile(`${ROOT}/outputs/a/nope.md`)).rejects.toThrow(/ENOENT/);
  });

  it("opting out means opting out: the schema on disk is not consulted", async () => {
    // the same canvas, the same impossible score — one node names the schema, the other wrote `validator: null`
    const schemas = { "risk-analyst": { properties: { risk_score: { type: "integer", minimum: 1, maximum: 3 } } } };
    const strict = await twoAgentGraph({ a: hardContract(["summary", "risks", "decision", "risk_score"], schemaPathFor("risk-analyst")), schemas });
    await runPipeline(strict.api);
    expect(strict.api.get().execution.errors["a"]).toContain("above the maximum 3");

    const opted = await twoAgentGraph({ a: hardContract(["summary", "risks", "decision", "risk_score"], null), schemas });
    await runPipeline(opted.api);
    expect(opted.api.get().execution.errors["a"] ?? "").toBe("");
    expect(await opted.store.readFile(`${ROOT}/outputs/a/summary.md`)).toContain("Three main risks were identified");
  });
});
