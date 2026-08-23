/* ============================================================
   Living Canvas — Zustand store (§11 event-driven UI state)
   ============================================================ */
import { create } from "zustand";
import type { NodeChange, EdgeChange, Connection } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import {
  storage, nodeToMarkdown, edgeToYaml, memoryToMd, outputsIndexYaml, chatToMd, toYaml, logText, frontmatter,
  nowIso,
} from "./lib/core";
import type { Settings, LCNodeData, LCEdgeData } from "./lib/core";
import {
  ROOT, CANVAS_ID, defaultSettings, emptyExecution, makeNodeData, makeEdgeData, roleById, MODELS,
  builtinTemplateInfo,
  type AppState, type RFNode, type RFEdge, type FileViewerState,
} from "./state";
import {
  emit, toast, touch, writeNodeArtifact, writeEdgeArtifact, patchNode,
  createNode as engCreateNode, deleteNode as engDeleteNode,
  createEdge as engCreateEdge, deleteEdge as engDeleteEdge,
  runPipeline, runSingle, resumeRun, rejectRun, stopRun, resetExecution,
  sendChat, takeSnapshot, restoreSnapshot, initWorkspace, resetWorkspace,
  saveTemplate, loadTemplate, saveRoleFromNode, contractSelfTest, testFallback,
  appendLog, type EngineApi,
} from "./lib/engine";

let api: EngineApi;

export const useStore = create<AppState & { actions: Actions }>()((set, get) => {
  api = { get: () => get() as AppState, set: (p) => set(p as never) };
  const actions = buildActions(api);
  return { ...initialState(), actions };
});

interface Actions {
  init: () => Promise<void>;
  reset: () => Promise<void>;
  onNodesChange: (c: NodeChange<RFNode>[]) => void;
  onEdgesChange: (c: EdgeChange<RFEdge>[]) => void;
  onConnect: (c: Connection) => void;
  addNode: (t: RFNode["data"]["nodeType"], pos: { x: number; y: number }) => Promise<string>;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, patch: Partial<LCNodeData>) => void;
  updateAgentField: (id: string, patch: Partial<NonNullable<LCNodeData["agent"]>>) => void;
  removeEdge: (id: string) => void;
  updateEdgeData: (id: string, patch: Partial<LCEdgeData>) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setLeftTab: (t: AppState["ui"]["leftTab"]) => void;
  openFile: (f: FileViewerState | null) => void;
  setHistoryOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setChatNode: (id: string | null) => void;
  toggleConsole: () => void;
  updateSettings: (p: Partial<Settings>) => void;
  updateCanvas: (p: Partial<AppState["canvas"]>) => void;
  runAll: () => void;
  runOne: (id: string) => void;
  resume: () => void;
  reject: () => void;
  stop: () => void;
  resetRun: () => void;
  chat: (id: string, text: string) => void;
  snapshot: () => void;
  restore: (id: string) => void;
  dismissToast: (id: string) => void;
  saveSettingsLocal: () => void;
  saveTemplate: (name: string) => void;
  loadTemplate: (id: string) => void;
  saveRole: (nodeId: string) => void;
  selfTest: (nodeId?: string) => void;
  testFallback: () => void;
}

function initialState(): AppState {
  const seedless = {
    booted: false,
    bootLines: [] as AppState["bootLines"],
    canvasId: CANVAS_ID,
    canvas: {
      title: "…", owner: "mahla", canvas_type: "agent-pipeline", tags: ["nexus"],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: nowIso(), updated_at: nowIso(),
    },
    nodes: [] as RFNode[],
    edges: [] as RFEdge[],
    memory: {
      global: { path: "memory/global.md", title: "", body: "", updated_at: nowIso(), last_accessed: nowIso(), confidence: 0, source: "system" as const },
      decisions: { path: "memory/decisions.md", title: "", body: "", updated_at: nowIso(), last_accessed: nowIso(), confidence: 0, source: "system" as const },
      progress: { path: "memory/progress.md", title: "", body: "", updated_at: nowIso(), last_accessed: nowIso(), confidence: 0, source: "system" as const },
      user: { path: "memory/user.md", title: "", body: "", updated_at: nowIso(), last_accessed: nowIso(), confidence: 0, source: "user" as const },
      agents: {} as Record<string, AppState["memory"]["agents"][string]>,
    },
    outputs: {} as AppState["outputs"],
    chats: {} as AppState["chats"],
    logs: {} as AppState["logs"],
    snapshots: [] as AppState["snapshots"],
    templates: [builtinTemplateInfo()],
    execution: emptyExecution(),
    events: [] as AppState["events"],
    toasts: [] as AppState["toasts"],
    settings: defaultSettings(),
    saveState: "saved" as const,
    typing: {} as AppState["typing"],
    ui: {
      leftTab: "palette" as const,
      fileViewer: null,
      historyOpen: false,
      settingsOpen: false,
      chatNodeId: null,
      consoleOpen: true,
    },
  };
  return seedless;
}

function buildActions(a: EngineApi): Actions {
  return {
    init: () => initWorkspace(a),
    reset: () => resetWorkspace(a),

    onNodesChange: (changes) => {
      const moved = changes.some((c) => c.type === "position" && "dragging" in c && c.dragging === false);
      useStore.setState((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }));
      if (moved) touch(a);
    },

    onEdgesChange: (changes) => {
      const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
      useStore.setState((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
      for (const id of removed) {
        void storage.deleteFile(`${ROOT}/edges/${id}.yaml`);
        emit(a, "edge.deleted", `یال ${id} حذف شد`);
      }
      if (removed.length) touch(a);
    },

    onConnect: (c) => {
      if (c.source && c.target) void engCreateEdge(a, c.source, c.target);
    },

    addNode: async (t, pos) => {
      const id = await engCreateNode(a, t, pos);
      useStore.setState((s) => ({ ui: { ...s.ui, leftTab: s.ui.leftTab } }));
      return id;
    },

    removeNode: (id) => void engDeleteNode(a, id),

    updateNodeData: (id, patch) => {
      patchNode(a, id, patch);
      void writeNodeArtifact(a, id, true);
      emit(a, "node.updated", `نود ${id} ویرایش شد`);
      touch(a);
    },

    updateAgentField: (id, patch) => {
      const n = a.get().nodes.find((x) => x.id === id);
      if (!n?.data.agent) return;
      patchNode(a, id, { agent: { ...n.data.agent, ...patch } });
      void writeNodeArtifact(a, id, true);
      emit(a, "node.updated", `پیکربندی ایجنت ${id} تغییر کرد`);
      touch(a);
    },

    removeEdge: (id) => void engDeleteEdge(a, id),

    updateEdgeData: (id, patch) => {
      useStore.setState((s) => ({
        edges: s.edges.map((e) => (e.id === id && e.data ? { ...e, data: { ...e.data, ...patch } } : e)),
      }));
      void writeEdgeArtifact(a, id, true);
      emit(a, "edge.updated", `یال ${id} ویرایش شد`);
      touch(a);
    },

    selectNode: () => undefined,
    selectEdge: () => undefined,
    setLeftTab: (t) => useStore.setState((s) => ({ ui: { ...s.ui, leftTab: t } })),
    openFile: (f) => useStore.setState((s) => ({ ui: { ...s.ui, fileViewer: f } })),
    setHistoryOpen: (v) => useStore.setState((s) => ({ ui: { ...s.ui, historyOpen: v } })),
    setSettingsOpen: (v) => useStore.setState((s) => ({ ui: { ...s.ui, settingsOpen: v } })),
    setChatNode: (id) => useStore.setState((s) => ({ ui: { ...s.ui, chatNodeId: id } })),
    toggleConsole: () => useStore.setState((s) => ({ ui: { ...s.ui, consoleOpen: !s.ui.consoleOpen } })),

    updateSettings: (p) => {
      useStore.setState((s) => ({ settings: { ...s.settings, ...p } }));
      try {
        localStorage.setItem("lc-settings", JSON.stringify(useStore.getState().settings));
      } catch { /* ignore */ }
      touch(a);
    },

    saveSettingsLocal: () => {
      try {
        localStorage.setItem("lc-settings", JSON.stringify(a.get().settings));
        toast(a, "success", "تنظیمات ذخیره شد.");
      } catch {
        toast(a, "error", "ذخیره‌ی تنظیمات ناموفق بود.");
      }
    },

    updateCanvas: (p) => {
      useStore.setState((s) => ({ canvas: { ...s.canvas, ...p, updated_at: nowIso() } }));
      touch(a);
    },

    runAll: () => void runPipeline(a),
    runOne: (id) => void runSingle(a, id),
    resume: () => void resumeRun(a),
    reject: () => rejectRun(a),
    stop: () => stopRun(a),
    resetRun: () => resetExecution(a),
    chat: (id, text) => void sendChat(a, id, text),
    snapshot: () => void takeSnapshot(a, "چک‌پوینت دستی"),
    restore: (id) => {
      void restoreSnapshot(a, id);
      useStore.setState((s) => ({ ui: { ...s.ui, historyOpen: false } }));
    },
    dismissToast: (id) => useStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    saveTemplate: (name) => void saveTemplate(a, name),
    loadTemplate: (id) => void loadTemplate(a, id),
    saveRole: (nodeId) => void saveRoleFromNode(a, nodeId),
    selfTest: (nodeId) => void contractSelfTest(a, nodeId),
    testFallback: () => void testFallback(a),
  };
}

export const getApi = () => api;

/* ---------- file viewer content builders (used by UI) ---------- */

export function buildFileContent(path: string): FileViewerState | null {
  const s = useStore.getState();
  const lang: FileViewerState["lang"] = path.endsWith(".json") ? "json" : path.endsWith(".yaml") ? "yaml" : path.endsWith(".log") ? "log" : "md";
  let content: string | null = null;

  const nodeMatch = path.match(/^nodes\/(.+)\.md$/);
  const edgeMatch = path.match(/^edges\/(.+)\.yaml$/);
  const agentMemMatch = path.match(/^memory\/agents\/(.+)\.md$/);
  const outputMatch = path.match(/^outputs\/(?:shared\/)?([^/]+)\/(.+)$/);
  const logMatch = path.match(/^logs\/([^/]+)\/(.+)\.log$/);
  const chatMatch = path.match(/^chats\/chat-(.+)\.md$/);
  const snapMatch = path.match(/^history\/(snapshot-.+)\.json$/);

  if (path === "manifest.json")
    content = JSON.stringify({ version: "1.0", canvas_id: s.canvasId, structure_version: "1.3", last_validated: nowIso().slice(0, 10) }, null, 2);
  else if (path === "canvas.yaml")
    content = toYaml({ ...s.canvas, id: s.canvasId });
  else if (path === "canvas-overview.md") {
    const done = s.execution.completed.length;
    const last = done ? s.nodes.find((n) => n.id === s.execution.completed[done - 1]) : null;
    content = frontmatter(
      { canvas_id: s.canvasId, title: s.canvas.title, last_updated: nowIso(), summary: `بوم «${s.canvas.title}» — وضعیت اجرا: ${s.execution.status}`, current_step: last?.data.title ?? "—", node_count: s.nodes.length, edge_count: s.edges.length },
      `# خلاصه‌ی بوم\n\nایجنت‌ها به‌جای خواندن کل بوم، اول این فایل را می‌خوانند.\n\n- اجرا: **${s.execution.status}**\n- نودها: ${s.nodes.length} — یال‌ها: ${s.edges.length}`
    );
  } else if (path === "graph.json")
    content = JSON.stringify({
      canvas_id: s.canvasId, version: "1.0", structure_version: "1.3",
      nodes: s.nodes.map((n) => ({ id: n.id, type: n.type, label: n.data.title, position: n.position, config_ref: `nodes/${n.id}.md` })),
      edges: s.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.data?.edgeType, label: e.data?.label, config_ref: `edges/${e.id}.yaml` })),
    }, null, 2);
  else if (path === "history/index.yaml")
    content = toYaml({ canvas_id: s.canvasId, snapshot_count: s.snapshots.length, snapshots: s.snapshots.map((m) => ({ id: m.id, at: m.at, label: m.label })) });
  else if (nodeMatch) {
    const n = s.nodes.find((x) => x.id === nodeMatch[1]);
    if (n) content = nodeToMarkdown(n.id, n.data);
  } else if (edgeMatch) {
    const e = s.edges.find((x) => x.id === edgeMatch[1]);
    if (e?.data) content = edgeToYaml(e.id, e.source, e.target, e.data);
  } else if (path === "memory/global.md") content = memoryToMd(s.memory.global);
  else if (path === "memory/decisions.md") content = memoryToMd(s.memory.decisions);
  else if (path === "memory/progress.md") content = memoryToMd(s.memory.progress);
  else if (path === "memory/user.md") content = memoryToMd(s.memory.user);
  else if (agentMemMatch && s.memory.agents[agentMemMatch[1]]) content = memoryToMd(s.memory.agents[agentMemMatch[1]]);
  else if (outputMatch) {
    const [, nodeId, file] = outputMatch;
    const entries = s.outputs[nodeId] ?? [];
    if (file === "index.yaml") content = outputsIndexYaml(nodeId, entries);
    else content = entries.find((e) => e.file === file)?.content ?? null;
  } else if (logMatch && s.logs[logMatch[1]]) content = logText(s.logs[logMatch[1]]);
  else if (chatMatch) {
    const msgs = s.chats[chatMatch[1]];
    const n = s.nodes.find((x) => x.id === chatMatch[1]);
    if (msgs && n) content = chatToMd(chatMatch[1], n.data.title, msgs);
  } else if (snapMatch) {
    const meta = s.snapshots.find((m) => m.id === snapMatch[1]);
    content = meta ? JSON.stringify({ note: "محتوای کامل چک‌پوینت در IndexedDB ذخیره است", id: meta.id, at: meta.at, label: meta.label, status: meta.status, node_count: meta.node_count }, null, 2) : null;
  } else if (path.startsWith("library/roles/")) {
    const rid = path.replace("library/roles/", "").replace(".json", "");
    const r = roleById(rid);
    content = JSON.stringify({ id: r.id, name: r.name, description: r.description, model: r.model, tools: r.tools, version: "1.0", default_output_contract: { format: "markdown", required_fields: r.required_fields, save_to: "outputs/{node_id}/" } }, null, 2);
  } else {
    const tplMatch = path.match(/^library\/templates\/([^/]+)\/template\.yaml$/);
    if (tplMatch) {
      const t = s.templates.find((x) => x.id === tplMatch[1]);
      if (t) content = toYaml({ template_id: t.id, name: t.name, version: "1.0", description: t.description, nodes: t.nodes, edges: t.edges, builtin: t.builtin, saved_at: t.saved_at });
    }
  }

  if (content === null) return null;
  return { path, content, lang };
}

export { MODELS, makeNodeData, makeEdgeData };
