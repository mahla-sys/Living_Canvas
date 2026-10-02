import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStorageAdapter, setStorage, storage } from "../core";
import { rejectRun, resumeRun, runPipeline, stepRun, type EngineApi } from "../engine";
import {
  CANVAS_ID,
  emptyExecution,
  makeAgentConfig,
  makeEdgeData,
  makeMemDoc,
  makeNodeData,
  ROLE_SCHEMAS,
  schemaPathFor,
  type AppState,
  type RFEdge,
  type RFNode,
} from "../../state";

const ROOT = `canvases/${CANVAS_ID}`;
const GATE_QUESTION = "Review the plan before downstream work starts?";

function makeApi(options?: { requireStartApproval?: boolean }): EngineApi {
  const start: RFNode = {
    id: "start", type: "lc", position: { x: 0, y: 0 },
    data: makeNodeData("agent", "Start", "mahla", {
      agent: makeAgentConfig("start", "understander", { require_approval: options?.requireStartApproval ?? false }),
    }),
  } as RFNode;
  const gate: RFNode = {
    id: "gate", type: "lc", position: { x: 300, y: 0 },
    data: makeNodeData("human-gate", "Review checkpoint", "mahla", { content: GATE_QUESTION }),
  } as RFNode;
  const after: RFNode = {
    id: "after", type: "lc", position: { x: 600, y: 0 },
    data: makeNodeData("agent", "After approval", "mahla", {
      agent: makeAgentConfig("after", "understander"),
    }),
  } as RFNode;
  const edge = (id: string, source: string, target: string) => ({
    id, source, target, type: "lc", data: makeEdgeData(),
  }) as RFEdge;

  let state: AppState = {
    booted: true,
    bootLines: [],
    canvasId: CANVAS_ID,
    canvas: {
      title: "Human gate test", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: "2026-10-02T00:00:00.000Z", updated_at: "2026-10-02T00:00:00.000Z",
      layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true },
    },
    nodes: [start, gate, after],
    edges: [edge("to-gate", "start", "gate"), edge("to-after", "gate", "after")],
    memory: {
      global: makeMemDoc("memory/global.md", "G", "", 0, "system"),
      decisions: makeMemDoc("memory/decisions.md", "D", "", 0, "system"),
      progress: makeMemDoc("memory/progress.md", "P", "", 0, "system"),
      user: makeMemDoc("memory/user.md", "U", "", 0, "user"),
      agents: {},
    },
    outputs: {}, chats: {}, logs: {}, runs: [], snapshots: [], templates: [], strokes: [],
    execution: emptyExecution(), events: [], toasts: [],
    settings: {
      provider: "sim", apiKey: "", model: "deepseek-chat", owner: "mahla", simDelay: 1,
      backendUrl: "", workspaceRoot: null, theme: "botanical", snapToGrid: false,
    },
    saveState: "saved", typing: {},
    ui: {
      leftTab: "palette", inspectorTab: "config", fileViewer: null, historyOpen: false,
      settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false,
      focusMode: false, chordDepth: 0,
    },
  };

  return {
    get: () => state,
    set: (partial) => {
      state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
    },
  };
}

beforeEach(() => {
  const files: Record<string, string> = {};
  for (const [role, schema] of Object.entries(ROLE_SCHEMAS)) {
    files[`${ROOT}/${schemaPathFor(role)}`] = JSON.stringify(schema);
  }
  setStorage(new MemoryStorageAdapter(files));
});

describe("human-gate run stages (ADR-049)", () => {
  it("approval completes the gate once, records it, and runs downstream work", async () => {
    const api = makeApi();
    await runPipeline(api);

    expect(api.get().execution.status).toBe("waiting_approval");
    expect(api.get().execution.current_node_id).toBe("gate");
    expect(api.get().execution.completed).toContain("start");
    expect(api.get().execution.completed).not.toContain("gate");
    expect(api.get().logs.gate?.filter((line) => line.includes("gate opened"))).toHaveLength(1);

    const runId = api.get().execution.run_id!;
    await resumeRun(api);

    expect(api.get().execution.status).toBe("completed");
    expect(api.get().execution.completed).toContain("gate");
    expect(api.get().execution.completed).toContain("after");
    expect((await storage.allPaths())).toContain(`${ROOT}/outputs/after/summary.md`);
    const ledger = await storage.readFile(`${ROOT}/runs/${runId}.md`);
    expect(ledger).toContain(`| gate | human_gate | approval | ${GATE_QUESTION} |`);
    expect(ledger).toContain("| gate | human_gate | approved | approved by the human |");
    expect(api.get().logs.gate?.filter((line) => line.includes("gate opened"))).toHaveLength(1);
  });

  it("rejection records the decision and stops before downstream work", async () => {
    const api = makeApi();
    await runPipeline(api);
    const runId = api.get().execution.run_id!;

    await rejectRun(api);

    expect(api.get().execution.status).toBe("stopped");
    expect(api.get().execution.completed).not.toContain("after");
    const ledger = await storage.readFile(`${ROOT}/runs/${runId}.md`);
    expect(ledger).toContain("| gate | human_gate | rejected | rejected by the human |");
    expect(ledger).toContain("**run rejected**");
  });

  it("step mode preserves approval and pauses after the approved gate, before the next agent", async () => {
    const api = makeApi();

    await stepRun(api);
    expect(api.get().execution.status).toBe("paused");
    expect(api.get().execution.completed).toContain("start");

    await stepRun(api);
    expect(api.get().execution.status).toBe("waiting_approval");
    expect(api.get().execution.current_node_id).toBe("gate");

    await resumeRun(api);
    expect(api.get().execution.status).toBe("paused");
    expect(api.get().execution.completed).toContain("gate");
    expect(api.get().execution.completed).not.toContain("after");

    await stepRun(api);
    expect(api.get().execution.status).toBe("paused");
    expect(api.get().execution.completed).toContain("after");
    await resumeRun(api);
    expect(api.get().execution.status).toBe("completed");
  });

  it("step mode does not turn an agent's required approval into an implicit approval", async () => {
    const api = makeApi({ requireStartApproval: true });
    await stepRun(api);

    expect(api.get().execution.status).toBe("waiting_approval");
    expect(api.get().execution.current_node_id).toBe("start");
    await resumeRun(api);
    expect(api.get().execution.status).toBe("paused");
    expect(api.get().execution.completed).toContain("start");
    expect(api.get().execution.completed).not.toContain("gate");
  });
});
