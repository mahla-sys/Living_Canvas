// @vitest-environment jsdom
/* ============================================================
   ADR-046 — destructive canvas tools wait for a human.

   The `manager` role can delete nodes and edges, and it reads the canvas's own text into its
   prompt — a shared canvas could otherwise talk a model into deleting the graph. delete_node and
   delete_edge now pause the run on `waiting_approval`; Approve deletes, Reject denies the one
   tool (the run continues), Stop cancels the run. Each path is tested below.
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setStorage, storage, MemoryStorageAdapter } from "../core";
import { runPipeline, runSingle, resumeRun, rejectRun, stopRun, type EngineApi } from "../engine";
import {
  CANVAS_ID, emptyExecution, makeAgentConfig, makeNodeData, makeMemDoc, ROLE_SCHEMAS, schemaPathFor,
  type AppState, type RFNode,
} from "../../state";

const R = `canvases/${CANVAS_ID}`;

function until(cond: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - start > ms) return reject(new Error("timed out waiting for the run to pause"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

function makeApi(): EngineApi {
  const manager: RFNode = {
    id: "n1", type: "lc", position: { x: 10, y: 10 },
    data: makeNodeData("agent", "Manager", "mahla", { agent: makeAgentConfig("n1", "manager") }),
  } as RFNode;
  const victim: RFNode = {
    id: "victim", type: "lc", position: { x: 80, y: 10 },
    data: makeNodeData("note", "Victim note", "mahla", { content: "delete me (if approved)" }),
  } as RFNode;
  let s: AppState = {
    booted: true, bootLines: [], canvasId: CANVAS_ID,
    canvas: {
      title: "approval", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
      layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true },
    },
    nodes: [manager, victim], edges: [],
    memory: {
      global: makeMemDoc("memory/global.md", "G", "", 0, "system"),
      decisions: makeMemDoc("memory/decisions.md", "D", "", 0, "system"),
      progress: makeMemDoc("memory/progress.md", "P", "", 0, "system"),
      user: makeMemDoc("memory/user.md", "U", "", 0, "user"),
      agents: {},
    },
    outputs: {}, chats: {}, logs: {}, runs: [], snapshots: [], templates: [], strokes: [],
    execution: emptyExecution(), events: [], toasts: [],
    settings: { provider: "deepseek", apiKey: "test-key", model: "deepseek-chat", owner: "mahla", simDelay: 1, backendUrl: "", workspaceRoot: null, theme: "botanical", snapToGrid: false },
    saveState: "saved", typing: {},
    ui: { leftTab: "palette", inspectorTab: "config", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false, focusMode: false, chordDepth: 0 },
  };
  return {
    get: () => s,
    set: (p: Partial<AppState> | ((st: AppState) => Partial<AppState>)) => { s = { ...s, ...(typeof p === "function" ? p(s) : p) }; },
  };
}

/** First request: the model asks to delete the victim. Second: a plain, valid summary. */
function stubDeleteThenAnswer() {
  let calls = 0;
  globalThis.fetch = vi.fn(async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call_del", type: "function",
              function: { name: "delete_node", arguments: JSON.stringify({ id: "victim" }) },
            }],
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: "The manager attempted to delete the node and finished its pass over the canvas." } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return () => calls;
}

describe("destructive tools wait for a human (ADR-046)", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    const files: Record<string, string> = {};
    for (const [role, schema] of Object.entries(ROLE_SCHEMAS)) files[`${R}/${schemaPathFor(role)}`] = JSON.stringify(schema);
    setStorage(new MemoryStorageAdapter(files));
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("pauses on waiting_approval before the deletion", async () => {
    const api = makeApi();
    stubDeleteThenAnswer();
    const p = runSingle(api, "n1");
    await until(() => api.get().execution.status === "waiting_approval");
    expect(api.get().nodes.some((n) => n.id === "victim")).toBe(true); // nothing deleted yet
    expect(api.get().events.some((e) => e.type === "run.paused" && /delete_node/.test(e.message))).toBe(true);
    await resumeRun(api); // approve
    await p;
    expect(api.get().nodes.some((n) => n.id === "victim")).toBe(false); // approved → gone
    expect(api.get().execution.status).toBe("completed");
    expect(await storage.allPaths()).not.toContain(`${R}/nodes/victim.md`);
  });

  it("a rejection denies the tool and the run continues", async () => {
    const api = makeApi();
    stubDeleteThenAnswer();
    const p = runSingle(api, "n1");
    await until(() => api.get().execution.status === "waiting_approval");
    rejectRun(api);
    await p;
    expect(api.get().nodes.some((n) => n.id === "victim")).toBe(true); // the denial held
    expect(api.get().execution.status).toBe("completed"); // the run went on
    const log = (api.get().logs["n1"] ?? []).join("\n");
    expect(log).toContain("rejected by the human");
  });

  it("a stop while waiting cancels the run and leaves the canvas alone", async () => {
    const api = makeApi();
    stubDeleteThenAnswer();
    const p = runSingle(api, "n1");
    await until(() => api.get().execution.status === "waiting_approval");
    stopRun(api);
    await p;
    expect(api.get().execution.status).toBe("stopped");
    expect(api.get().nodes.some((n) => n.id === "victim")).toBe(true);
  });

  it("a full pipeline run pauses at the deletion the same way (runPipeline path)", async () => {
    const api = makeApi();
    const fetchCalls = stubDeleteThenAnswer();
    const p = runPipeline(api);
    await until(() => api.get().execution.status === "waiting_approval");
    await resumeRun(api);
    await p;
    expect(fetchCalls()).toBe(2);
    expect(api.get().execution.status).toBe("completed");
    expect(api.get().nodes.some((n) => n.id === "victim")).toBe(false);
  });
});
