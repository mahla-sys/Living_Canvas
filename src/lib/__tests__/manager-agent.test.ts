import { describe, expect, it } from "vitest";
import { type EngineApi } from "../engine";
import { buildSeed, type AppState } from "../../state";
import { executeTool } from "../engine";

describe("Manager Agent Self-Building", () => {
  it("can read UI state, capture canvas, and create a new node and edge", async () => {
    const seed = buildSeed("test");
    let state: AppState = { 
      ...seed,
      booted: true,
      events: [],
      toasts: [],
      snapshots: [],
      runs: [],
      logs: {},
      saveState: "saved",
      typing: {},
      ui: { leftTab: "palette", inspectorTab: "config", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: false, portOpen: false, focusMode: false },
      execution: { run_id: null, canvas_id: "test", current_node_id: null, queue: [], completed: [], context: {}, status: "idle" },
    } as any;
    
    const api: EngineApi = {
      get: () => state,
      set: (p) => {
        state = { ...state, ...(typeof p === "function" ? p(state) : p) };
      }
    };

    // 1. Create the manager agent node
    const managerArgs = { title: "Manager", nodeType: "agent", roleId: "manager" };
    const res1 = await executeTool(api, "sys-1", null, "create_node", managerArgs);
    expect(res1.status).toBe("ok");
    
    expect(state.nodes.some(n => n.data.title === "Manager" && n.data.agent?.role_id === "manager")).toBe(true);
    const managerNode = state.nodes.find(n => n.data.title === "Manager")!;

    // 2. The manager creates a builder node
    const managerContext = managerNode.data.agent;
    const builderArgs = { title: "System Builder", nodeType: "agent", roleId: "builder" };
    const res2 = await executeTool(api, managerNode.id, managerContext, "create_node", builderArgs);
    expect(res2.status).toBe("ok");
    
    expect(state.nodes.some(n => n.data.title === "System Builder")).toBe(true);
    const builderNode = state.nodes.find(n => n.data.title === "System Builder")!;

    // 3. The manager connects itself to the builder
    const edgeArgs = { source: managerNode.id, target: builderNode.id, edgeType: "flow" };
    const res3 = await executeTool(api, managerNode.id, managerContext, "create_edge", edgeArgs);
    expect(res3.status).toBe("ok");
    
    expect(state.edges.some(e => e.source === managerNode.id && e.target === builderNode.id)).toBe(true);

    // 4. The manager uses get_ui_state and capture_canvas_snapshot
    const res4 = await executeTool(api, managerNode.id, managerContext, "get_ui_state", {});
    expect(res4.status).toBe("ok");
    // @ts-ignore
    expect(res4.uiState).toBeDefined();

    const res5 = await executeTool(api, managerNode.id, managerContext, "capture_canvas_snapshot", {});
    expect(res5.status).toBe("ok");
    // @ts-ignore
    expect(res5.snapshot.nodes.length).toBeGreaterThan(0);
  });
});
