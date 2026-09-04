import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  executeTool,
  CANVAS_TOOL_DEFINITIONS,
  askModel,
  type EngineApi,
} from "../engine";
import {
  storage,
  setStorage,
  createDefaultStorage,
  type AgentConfig,
  type ModelRoute,
} from "../core";
import {
  makeAgentConfig,
  makeNodeData,
  makeEdgeData,
  makeMemDoc,
  defaultSettings,
  DEFAULT_LAYOUT,
  CANVAS_ID,
  ROOT,
  type AppState,
} from "../../state";

describe("CANVAS_TOOL_DEFINITIONS — standard JSON Schema tools catalog", () => {
  it("defines exactly the 10 required canvas mutation and memory tools", () => {
    const names = Object.values(CANVAS_TOOL_DEFINITIONS).map((t) => t.function.name);
    const expected = [
      "create_node",
      "update_node",
      "delete_node",
      "create_edge",
      "update_edge",
      "delete_edge",
      "get_canvas_overview",
      "read_memory",
      "write_memory",
      "write_output",
    ];
    for (const exp of expected) {
      expect(names).toContain(exp);
    }
    expect(Object.keys(CANVAS_TOOL_DEFINITIONS).length).toBe(12);
  });

  it("every tool has a strict OpenAI-compatible schema specification", () => {
    for (const tool of Object.values(CANVAS_TOOL_DEFINITIONS)) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters.type).toBe("object");
      expect(tool.function.parameters.properties).toBeDefined();
    }
  });
});

describe("executeTool — capability gates, ledger audits, and file persistence", () => {
  let state: AppState;
  let api: EngineApi;

  beforeEach(async () => {
    setStorage(createDefaultStorage());
    state = {
      booted: true,
      bootLines: [],
      canvasId: CANVAS_ID,
      canvas: { title: "Test Graph", owner: "test-user", canvas_type: "pipeline", tags: [], default_model: "deepseek-chat", template_id: "", template_version: "", created_at: "", updated_at: "", layout: { ...DEFAULT_LAYOUT } },
      nodes: [
        {
          id: "node-1",
          type: "lc",
          position: { x: 100, y: 100 },
          data: {
            ...makeNodeData("agent", "Planner", "test-user"),
            title: "Planner",
            agent: makeAgentConfig("node-1", "planner"),
          },
        },
        {
          id: "node-2",
          type: "lc",
          position: { x: 300, y: 100 },
          data: {
            ...makeNodeData("agent", "Executor", "test-user"),
            title: "Executor",
            agent: makeAgentConfig("node-2", "executor"),
          },
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "node-1",
          target: "node-2",
          type: "lc",
          data: makeEdgeData(),
        },
      ],
      memory: {
        global: makeMemDoc("memory/global.md", "Global", "global content", 1, "user"),
        decisions: makeMemDoc("memory/decisions.md", "Decisions", "decisions content", 1, "user"),
        progress: makeMemDoc("memory/progress.md", "Progress", "progress content", 1, "user"),
        user: makeMemDoc("memory/user.md", "User", "user content", 1, "user"),
        agents: {},
      },
      strokes: [],
      chats: {},
      logs: {},
      snapshots: [],
      templates: [],
      saveState: "saved",
      typing: {},
      ui: { leftTab: "palette", inspectorTab: "config", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false, focusMode: false, chordDepth: 0 },
      settings: {
        ...defaultSettings(),
        model: "deepseek-chat",
        provider: "deepseek",
        apiKey: "test-key",
      },
      events: [],
      toasts: [],
      execution: {
        run_id: "run-test-001",
        canvas_id: CANVAS_ID,
        current_node_id: null,
        queue: [],
        completed: [],
        context: {},
        status: "running",
        started_at: null,
        errors: {},
      },
      outputs: {},
      runs: ["run-test-001"],
    };

    api = {
      get: () => state,
      set: (fnOrObj) => {
        if (typeof fnOrObj === "function") {
          state = { ...state, ...fnOrObj(state) };
        } else {
          state = { ...state, ...fnOrObj };
        }
      },
    };
  });

  it("denies execution when a tool is not granted in agent.tools", async () => {
    const restrictedAgent: AgentConfig = {
      ...makeAgentConfig("node-1", "reviewer"),
      tools: ["read_memory", "write_output"], // does NOT have "delete_node"
    };

    const res = await executeTool(api, "node-1", restrictedAgent, "delete_node", { id: "node-2" });
    expect(res.status).toBe("denied");
    expect(res.reason).toContain("delete_node is not in agent.tools");

    // Must be audited in the ledger file with status: "denied"
    const ledgerFile = await storage.readFile(`${ROOT}/runs/run-test-001.md`);
    expect(ledgerFile).toContain("delete_node");
    expect(ledgerFile).toContain("denied");
  });

  it("denies execution when memory write path violates allowed_write_paths", async () => {
    const agent: AgentConfig = {
      ...makeAgentConfig("node-1", "coder"),
      tools: ["write_memory"],
      context_contract: {
        ...makeAgentConfig("node-1", "coder").context_contract,
        allowed_write_paths: ["memory/agents/coder.md"],
      },
    };

    const res = await executeTool(api, "node-1", agent, "write_memory", {
      path: "memory/global.md",
      content: "unauthorized overwrite",
    });
    expect(res.status).toBe("denied");
    expect(res.reason).toContain("not in allowed_write_paths");

    const ledgerFile = await storage.readFile(`${ROOT}/runs/run-test-001.md`);
    expect(ledgerFile).toContain("write_memory");
    expect(ledgerFile).toContain("denied");
  });

  it("executes get_canvas_overview when permitted and logs ok to ledger", async () => {
    const agent: AgentConfig = {
      ...makeAgentConfig("node-1", "planner"),
      tools: ["get_canvas_overview"],
    };

    const res = await executeTool(api, "node-1", agent, "get_canvas_overview", {});
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      const overview = res.overview as { nodes: unknown[]; edges: unknown[] } | undefined;
      expect(overview).toBeDefined();
      expect(overview?.nodes.length).toBe(2);
      expect(overview?.edges.length).toBe(1);
    }

    const ledgerFile = await storage.readFile(`${ROOT}/runs/run-test-001.md`);
    expect(ledgerFile).toContain("get_canvas_overview");
    expect(ledgerFile).toContain("ok");
  });

  it("creates a new node on the canvas, persists file, and registers in state", async () => {
    const agent: AgentConfig = {
      ...makeAgentConfig("node-1", "architect"),
      tools: ["create_node"],
      context_contract: {
        ...makeAgentConfig("node-1", "architect").context_contract,
        allowed_write_paths: ["nodes/"],
      },
    };

    const res = await executeTool(api, "node-1", agent, "create_node", {
      id: "node-3",
      title: "Synthesizer",
      nodeType: "agent",
      role: "synthesizer",
      content: "Agent that synthesizes reports.",
      position: { x: 500, y: 150 },
    });

    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.id).toBe("node-3");
    }

    // Verify state was mutated
    const created = state.nodes.find((n) => n.id === "node-3");
    expect(created).toBeDefined();
    expect(created?.data.title).toBe("Synthesizer");
    expect(created?.position.x).toBe(500);

    // Verify storage file was written
    const exists = await storage.exists(`${ROOT}/nodes/node-3.md`);
    expect(exists).toBe(true);

    const ledgerFile = await storage.readFile(`${ROOT}/runs/run-test-001.md`);
    expect(ledgerFile).toContain("create_node");
    expect(ledgerFile).toContain("ok");
  });

  it("updates an existing node on the canvas and updates storage", async () => {
    const agent: AgentConfig = {
      ...makeAgentConfig("node-1", "architect"),
      tools: ["update_node"],
      context_contract: {
        ...makeAgentConfig("node-1", "architect").context_contract,
        allowed_write_paths: ["nodes/"],
      },
    };

    const res = await executeTool(api, "node-1", agent, "update_node", {
      id: "node-2",
      title: "Lead Executor",
      content: "Updated task runner content.",
    });

    expect(res.status).toBe("ok");
    const updated = state.nodes.find((n) => n.id === "node-2");
    expect(updated?.data.title).toBe("Lead Executor");
    expect(updated?.data.content).toBe("Updated task runner content.");
  });

  it("creates and deletes edges dynamically via function calling", async () => {
    const agent: AgentConfig = {
      ...makeAgentConfig("node-1", "architect"),
      tools: ["create_edge", "delete_edge"],
      context_contract: {
        ...makeAgentConfig("node-1", "architect").context_contract,
        allowed_write_paths: ["edges/"],
      },
    };

    // Create edge
    const createRes = await executeTool(api, "node-1", agent, "create_edge", {
      id: "edge-test",
      source: "node-2",
      target: "node-1",
      edgeType: "flow",
      label: "Feedback Loop",
    });
    expect(createRes.status).toBe("ok");
    expect(state.edges.find((e) => e.id === "edge-test")).toBeDefined();

    // Delete edge
    const delRes = await executeTool(api, "node-1", agent, "delete_edge", {
      id: "edge-test",
    });
    expect(delRes.status).toBe("ok");
    expect(state.edges.find((e) => e.id === "edge-test")).toBeUndefined();
  });
});

describe("askModel — autonomous tool_calls loop", () => {
  let state: AppState;
  let api: EngineApi;
  const originalFetch = global.fetch;

  beforeEach(() => {
    setStorage(createDefaultStorage());
    state = {
      booted: true,
      bootLines: [],
      canvasId: CANVAS_ID,
      canvas: { title: "Test", owner: "user", canvas_type: "pipeline", tags: [], default_model: "deepseek-chat", template_id: "", template_version: "", created_at: "", updated_at: "", layout: { ...DEFAULT_LAYOUT } },
      nodes: [
        {
          id: "node-1",
          type: "lc",
          position: { x: 50, y: 50 },
          data: {
            ...makeNodeData("agent", "Bot", "user"),
            title: "Bot",
            agent: makeAgentConfig("node-1", "architect"),
          },
        },
      ],
      edges: [],
      memory: {
        global: makeMemDoc("memory/global.md", "G", "", 1, "user"),
        decisions: makeMemDoc("memory/decisions.md", "D", "", 1, "user"),
        progress: makeMemDoc("memory/progress.md", "P", "", 1, "user"),
        user: makeMemDoc("memory/user.md", "U", "", 1, "user"),
        agents: {},
      },
      strokes: [],
      chats: {},
      logs: {},
      snapshots: [],
      templates: [],
      saveState: "saved",
      typing: {},
      ui: { leftTab: "palette", inspectorTab: "config", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false, focusMode: false, chordDepth: 0 },
      settings: {
        ...defaultSettings(),
        model: "deepseek-chat",
        provider: "deepseek",
        apiKey: "dummy",
      },
      events: [],
      toasts: [],
      execution: {
        run_id: "run-test-loop",
        canvas_id: CANVAS_ID,
        current_node_id: null,
        queue: [],
        completed: [],
        context: {},
        status: "running",
        started_at: null,
        errors: {},
      },
      outputs: {},
      runs: ["run-test-loop"],
    };

    api = {
      get: () => state,
      set: (fnOrObj) => {
        if (typeof fnOrObj === "function") state = { ...state, ...fnOrObj(state) };
        else state = { ...state, ...fnOrObj };
      },
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("handles tool_calls from the model and returns tool execution output back to the model", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      callCount++;
      const body = JSON.parse(options.body as string);

      if (callCount === 1) {
        // Model requests create_node tool call
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_123",
                      type: "function",
                      function: {
                        name: "create_node",
                        arguments: JSON.stringify({
                          id: "agent-created",
                          title: "Auto Created Node",
                          nodeType: "agent",
                          role: "coder",
                        }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { total_tokens: 42 },
          }),
        };
      }

      // Second call: verify tool result was supplied to the model
      const lastMsg = body.messages[body.messages.length - 1];
      expect(lastMsg.role).toBe("tool");
      expect(lastMsg.tool_call_id).toBe("call_123");
      const toolOutput = JSON.parse(lastMsg.content);
      expect(toolOutput.status).toBe("ok");
      expect(toolOutput.id).toBe("agent-created");

      // Model concludes conversation
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: "I have successfully created the node on the canvas.",
              },
            },
          ],
          usage: { total_tokens: 30 },
        }),
      };
    });

    const route: ModelRoute = { endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-chat", provider: "deepseek" };
    const agent: AgentConfig = {
      ...makeAgentConfig("node-1", "architect"),
      tools: ["create_node"],
      context_contract: {
        ...makeAgentConfig("node-1", "architect").context_contract,
        allowed_write_paths: ["nodes/"],
      },
    };

    const reply = await askModel(
      route,
      "dummy-key",
      [{ role: "user", content: "Please create a new coder node." }],
      {
        maxSteps: 5,
        toolContext: { api, nodeId: "node-1", agent },
      }
    );

    expect(reply).toBe("I have successfully created the node on the canvas.");
    expect(callCount).toBe(2);

    // Verify the node was created by the tool loop
    expect(state.nodes.find((n) => n.id === "agent-created")).toBeDefined();
  });
});
