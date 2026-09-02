/* ============================================================
   Run controls (ADR-013): Pause, Step, Stop — and the difference between them.

   `execution.status` has carried the value `paused` since the first version of this file and there was no way
   to reach it. The interesting assertion here is not "pause sets paused" — it is that pause is *cooperative*:
   the node already running finishes and its output is written, because `run_id` survives. `stopRun` is the
   opposite: it invalidates `run_id` and the in-flight node drops at its next guard. Confusing the two is how a
   canvas ends up with a half-written `outputs/<node>/` and a lock nobody releases.
   ============================================================ */
import { describe, it, expect, beforeEach } from "vitest";
import { setStorage, storage, MemoryStorageAdapter, toYaml } from "../core";
import { runPipeline, pauseRun, stepRun, resumeRun, stopRun } from "../engine";
import { nodeToMarkdown } from "../test-helpers";
import {
  CANVAS_ID, emptyExecution, makeAgentConfig, makeEdgeData, makeNodeData, ROLE_SCHEMAS, schemaPathFor,
  type AppState, type RFEdge, type RFNode,
} from "../../state";

const ROOT = `canvases/${CANVAS_ID}`;

function makeApi(initial?: Partial<AppState>) {
  let s: AppState = {
    booted: false,
    bootLines: [],
    canvasId: CANVAS_ID,
    canvas: {
      title: "run controls", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
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
    // a non-trivial simDelay so a run is actually in flight long enough to be paused mid-flight
    settings: { provider: "sim", apiKey: "", model: "deepseek-chat", owner: "mahla", simDelay: 40, backendUrl: "", workspaceRoot: null, theme: "botanical", snapToGrid: false },
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

const agentNode = (id: string): RFNode =>
  ({ id, position: { x: 10, y: 10 }, data: makeNodeData("agent", id, "mahla", { agent: makeAgentConfig(id, "risk-analyst") }) }) as RFNode;
const flowEdge = (id: string, a: string, b: string): RFEdge =>
  ({ id, source: a, target: b, type: "smoothstep", data: { ...makeEdgeData() } }) as RFEdge;

/** a → b → c, on disk, with the schema files hard validation needs */
function graph() {
  setStorage(new MemoryStorageAdapter({
    [`${ROOT}/canvas-overview.md`]: toYaml({ title: "run controls", owner: "mahla", canvas_type: "agent-pipeline" }),
    ...Object.fromEntries(["a", "b", "c"].map((id) => [`${ROOT}/nodes/${id}.md`, nodeToMarkdown(id, { title: id.toUpperCase(), nodeType: "agent" })])),
    [`${ROOT}/${schemaPathFor("risk-analyst")}`]: JSON.stringify(ROLE_SCHEMAS["risk-analyst"], null, 2),
  }));
  return makeApi({
    nodes: [agentNode("a"), agentNode("b"), agentNode("c")],
    edges: [flowEdge("e1", "a", "b"), flowEdge("e2", "b", "c")],
  });
}

const read = (p: string) => storage.readFile(`${ROOT}/${p}`);
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe("Step — one node at a time, ending paused each time", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("from idle it runs exactly the first node and leaves the rest queued", async () => {
    const api = graph();
    await stepRun(api);

    expect(api.peek().execution.status).toBe("paused");
    expect(api.peek().execution.completed).toEqual(["a"]);
    expect(api.peek().execution.queue).toEqual(["a", "b", "c"]); // the queue survives; a step is not a stop
    expect(await read("outputs/a/summary.md")).toBeTruthy();
    await expect(read("outputs/b/summary.md")).rejects.toThrow(/ENOENT/);
    // and the run is still open: same run_id, same ledger file
    expect(api.peek().execution.run_id).toBeTruthy();
  });

  it("stepping again runs the next node, and repeated presses walk the pipeline", async () => {
    const api = graph();
    await stepRun(api);
    const runId = api.peek().execution.run_id;

    await stepRun(api);
    expect(api.peek().execution.completed).toEqual(["a", "b"]);
    expect(api.peek().execution.status).toBe("paused");
    expect(api.peek().execution.run_id).toBe(runId); // one run, walked — not three runs

    await stepRun(api);
    expect(api.peek().execution.completed).toEqual(["a", "b", "c"]);
    expect(await read("outputs/c/summary.md")).toBeTruthy();
  });

  it("records each step in the ledger", async () => {
    const api = graph();
    await stepRun(api);
    const ledger = await read(`runs/${api.peek().execution.run_id}.md`);
    expect(ledger).toContain("| step | ok | one step — the run is now paused");
  });
});

describe("Resume — one way back out of a stopped queue", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("drains the rest of the queue and completes the same run", async () => {
    const api = graph();
    await stepRun(api);
    const runId = api.peek().execution.run_id;

    await resumeRun(api);

    expect(api.peek().execution.status).toBe("completed");
    expect(api.peek().execution.completed).toEqual(["a", "b", "c"]);
    expect(api.peek().execution.run_id).toBe(runId);
    expect(await read(`runs/${runId}.md`)).toContain("**run completed**");
  });

  it("does nothing at all when there is no stopped queue to resume", async () => {
    const api = graph();
    await resumeRun(api);
    expect(api.peek().execution.status).toBe("idle");
    expect(api.peek().execution.completed).toEqual([]);
  });
});

describe("Pause is cooperative; Stop is not", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("pause lets the in-flight node finish and write its output, then stops the queue", async () => {
    const api = graph();
    const running = runPipeline(api);
    await tick(2); // long enough for the first node to have started, not to have finished
    expect(api.peek().execution.status).toBe("running");

    pauseRun(api);
    await running;

    expect(api.peek().execution.status).toBe("paused");
    // the node that was running kept its output — this is the whole difference from Stop
    expect(await read("outputs/a/summary.md")).toBeTruthy();
    expect(api.peek().execution.completed).toEqual(["a"]);
    // and nothing after it started
    await expect(read("outputs/b/summary.md")).rejects.toThrow(/ENOENT/);
    // no lock is left behind: a lock that survives a pause would block the resume
    expect(api.peek().nodes.every((n) => n.data.lock.status === "free")).toBe(true);
  });

  it("stop invalidates run_id, so a paused run can be told apart from a stopped one", async () => {
    const api = graph();
    const running = runPipeline(api);
    await tick(2);
    stopRun(api);
    await running;

    expect(api.peek().execution.status).toBe("stopped");
    expect(api.peek().execution.run_id).toBeNull();
  });

  it("records the pause in the ledger of the run it paused", async () => {
    const api = graph();
    const running = runPipeline(api);
    await tick(2);
    pauseRun(api);
    await running;
    const ledger = await read(`runs/${api.peek().execution.run_id}.md`);
    expect(ledger).toContain("| pause | ok |");
  });
});

describe("the controls refuse to do something surprising", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("pausing with nothing running warns and changes nothing", () => {
    const api = graph();
    pauseRun(api);
    expect(api.peek().execution.status).toBe("idle");
    expect(api.peek().toasts.some((t) => t.kind === "warn")).toBe(true);
  });

  it("stepping while a run is in progress warns rather than joining it", async () => {
    const api = graph();
    const running = runPipeline(api);
    await tick(2);
    await stepRun(api);
    expect(api.peek().execution.status).toBe("running");
    await running;
    expect(api.peek().execution.status).toBe("completed");
  });

  it("a run started normally is not secretly in step mode", async () => {
    const api = graph();
    await runPipeline(api);
    expect(api.peek().execution.status).toBe("completed");
    expect(api.peek().execution.completed).toEqual(["a", "b", "c"]);
  });
});
