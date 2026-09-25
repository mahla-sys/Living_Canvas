/* ============================================================
   Living Canvas — Zustand store (§11 event-driven UI state)
   ============================================================ */
import { create } from "zustand";
import type { NodeChange, EdgeChange, Connection } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import {
  storage,
  nowIso, storageMode, clamp, createChord, createDoubleTap, writeSettingsLocal,
  PANEL_MIN, PANEL_MAX,
  type Settings, type LCNodeData, type LCEdgeData, type Stroke, type NodeType,
} from "./lib/core";
import type { CanvasFiles } from "./lib/portable";
import {
  ROOT, CANVAS_ID, defaultSettings, emptyExecution, makeNodeData, makeEdgeData, MODELS,
  DEFAULT_LAYOUT,
  type AppState, type RFNode, type RFEdge, type FileViewerState,
} from "./state";
import {
  emit, toast, touch, writeNodeArtifact, writeEdgeArtifact, patchNode,
  createNode as engCreateNode, deleteNode as engDeleteNode,
  createEdge as engCreateEdge, deleteEdge as engDeleteEdge,
  runPipeline, runSingle, resumeRun, rejectRun, stopRun, resetExecution, flowClosure, pauseRun, stepRun,
  sendChat, takeSnapshot, restoreSnapshot, initWorkspace, resetWorkspace,
  saveTemplate, loadTemplate, loadProjectFinderPipeline, saveRoleFromNode, contractSelfTest, testFallback,
  addStroke as engAddStroke, removeStroke as engRemoveStroke, undoStroke as engUndoStroke,
  clearStrokes as engClearStrokes, convertStrokesToGraph as engConvertStrokes,
  pickCanvasFolder, detachWorkspaceFolder, exportToJsonFile, exportToFolder,
  importFromFolder, importFromFile, previewImportText, applyImport, flushPending, reloadFromStorage,
  touchLayout,
  type ImportPreview, type EngineApi,
} from "./lib/engine";

let api: EngineApi;

/** The one place focus mode is entered or left, so all three entry points agree on what happens. */
function setFocus(a: EngineApi, on: boolean) {
  focusChord.reset();
  escapeTap.reset();
  a.set({ ui: { ...a.get().ui, focusMode: on, chordDepth: 0 } });
  emit(a, "system", on ? "focus mode on — two Escapes, or Ctrl+K Z again, to come back" : "focus mode off");
}

/* ---------------- the two multi-key sequences ----------------
   Instances of the pure machines in core.ts, held here rather than in a component: a half-pressed chord is
   not something to re-render for, and holding it in a component would reset it on every unrelated update.
   Ctrl+K Z toggles focus mode; Escape twice leaves it (one Escape still belongs to in-place editing and to
   the modals, so focus mode must not steal it). Both are session-only — ADR-009. */
const focusChord = createChord(["k", "z"]);
const escapeTap = createDoubleTap(400);

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
  setInspectorTab: (t: AppState["ui"]["inspectorTab"]) => void;
  openFile: (f: FileViewerState | null) => void;
  setHistoryOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setChatNode: (id: string | null) => void;
  toggleConsole: () => void;
  updateSettings: (p: Partial<Settings>) => void;
  updateCanvas: (p: Partial<AppState["canvas"]>) => void;
  runAll: () => void;
  runOne: (id: string) => void;
  /** Run scopes (ADR-012). All three are runtime-only: nothing about the choice is written to a file. */
  runSelected: () => void;
  runFromNode: (id: string) => void;
  runUntilNode: (id: string) => void;
  resume: () => void;
  reject: () => void;
  stop: () => void;
  pause: () => void;
  step: () => void;
  resetRun: () => void;
  chat: (id: string, text: string) => void;
  snapshot: () => void;
  restore: (id: string) => void;
  dismissToast: (id: string) => void;
  saveSettingsLocal: () => void;
  saveTemplate: (name: string) => void;
  loadTemplate: (id: string) => void;
  loadFreelancePipeline: () => void;
  saveRole: (nodeId: string) => void;
  /** active storage mode: idb | fs | http | memory */
  storageMode: () => "idb" | "fs" | "http" | "memory";
  flushSave: () => Promise<void>;
  reloadFromDisk: () => Promise<void>;
  attachFolder: () => Promise<void>;
  detachFolder: () => Promise<void>;
  exportJson: () => Promise<void>;
  exportFolder: () => Promise<void>;
  importFolder: (replace?: boolean) => Promise<void>;
  importJsonFile: (file: File, replace?: boolean) => Promise<void>;
  previewImport: (text: string) => Promise<ImportPreview & { files: CanvasFiles }>;
  commitImport: (files: CanvasFiles, replace?: boolean) => Promise<void>;
  setPortOpen: (v: boolean) => void;
  /** opens the real content of a file from the StorageAdapter (live folder mode). */
  openStorageFile: (path: string) => Promise<void>;
  selfTest: (nodeId?: string) => void;
  testFallback: () => void;
  addStroke: (s: Stroke) => void;
  removeStroke: (id: string) => void;
  undoStroke: () => void;
  clearStrokes: () => void;
  convertStrokes: (opts: { nodeType: NodeType; connect: boolean }) => void;
  /** show/hide a side panel. Persisted in `canvas.yaml` (ADR-009). */
  togglePanel: (side: "left" | "right") => void;
  /** live panel resize: state moves immediately, the file follows 500 ms after the drag stops. */
  resizePanel: (side: "left" | "right", width: number) => void;
  toggleFocusMode: () => void;
  /** feed one key to the Ctrl+K Z chord; the caller decides which keys are worth feeding */
  chordKey: (key: string) => void;
  /** feed an Escape; only the *second* one inside 400 ms does anything, and only in focus mode */
  escapeKey: () => void;
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
      layout: { ...DEFAULT_LAYOUT },
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
    runs: [] as string[],
    snapshots: [] as AppState["snapshots"],
    templates: [],
    strokes: [] as AppState["strokes"],
    execution: emptyExecution(),
    events: [] as AppState["events"],
    toasts: [] as AppState["toasts"],
    settings: defaultSettings(),
    saveState: "saved" as const,
    typing: {} as AppState["typing"],
    ui: {
      leftTab: "palette" as const,
      inspectorTab: "config" as const,
      fileViewer: null,
      historyOpen: false,
      settingsOpen: false,
      chatNodeId: null,
      consoleOpen: false,
      portOpen: false,
      focusMode: false,
      chordDepth: 0,
    },
  };
  return seedless;
}

function buildActions(a: EngineApi): Actions {
  return {
    init: () => initWorkspace(a),
    reset: () => resetWorkspace(a),

    onNodesChange: (changes) => {
      // Nodes locked by a run are not movable (§12.5) — their *deletion* is guarded in `deleteNode`, and
      // it has to be: the keyboard path used to land here, drop the node from state and never touch
      // `nodes/<id>.md`. Since the files are the canvas (§1.1), `hydrate` rebuilt the "deleted" node on the
      // next reload. One owner for deletion (the engine: state + edge cascade + files + log), and both
      // entry points — inspector button and Delete key — go through it.
      const locked = new Set(
        a.get().nodes
          .filter((n) => n.data.lock.status === "locked" && (n.data.lock.locked_by ?? "").startsWith("run-"))
          .map((n) => n.id)
      );
      const removals = changes.filter((c) => c.type === "remove" && "id" in c).map((c) => c.id);
      const rest = changes.filter((c) => c.type !== "remove");
      let blocked = false;
      const filtered = rest.filter((c) => {
        if (c.type === "position" && "id" in c && locked.has(c.id)) {
          blocked = true;
          return false;
        }
        return true;
      });
      const dragged = filtered.flatMap((c) =>
        c.type === "position" && "dragging" in c && c.dragging === false ? [c.id] : []
      );
      useStore.setState((s) => ({ nodes: applyNodeChanges(filtered, s.nodes) }));
      /* A drag end is a document edit, not a view change: `position` lives in the node file (§1.1) and
         in nothing else — `state.json` carries no nodes on purpose. Before this line the layout of a
         canvas evaporated on reload, because only `updateNodeData` wrote files and dragging does not. */
      for (const id of dragged) void writeNodeArtifact(a, id, true);
      if (dragged.length) touch(a);
      for (const id of removals) void engDeleteNode(a, id);
      if (blocked) toast(a, "warn", "This node is locked by a running step — moving it is not allowed (§12.5).");
    },

    onEdgesChange: (changes) => {
      const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
      useStore.setState((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
      for (const id of removed) {
        void storage.deleteFile(`${ROOT}/edges/${id}.yaml`);
        emit(a, "edge.deleted", `Edge ${id} deleted`);
      }
      if (removed.length) touch(a);
    },

    onConnect: (c) => {
      if (c.source && c.target) void engCreateEdge(a, c.source, c.target);
    },

    addNode: async (t, pos) => {
      const id = await engCreateNode(a, t, pos);
      useStore.setState((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, selected: n.id === id })),
        ui: { ...s.ui, leftTab: s.ui.leftTab },
      }));
      return id;
    },

    removeNode: (id) => void engDeleteNode(a, id),

    updateNodeData: (id, patch) => {
      patchNode(a, id, patch);
      void writeNodeArtifact(a, id, true);
      emit(a, "node.updated", `Node ${id} edited`);
      touch(a);
    },

    updateAgentField: (id, patch) => {
      const n = a.get().nodes.find((x) => x.id === id);
      if (!n?.data.agent) return;
      patchNode(a, id, { agent: { ...n.data.agent, ...patch } });
      void writeNodeArtifact(a, id, true);
      emit(a, "node.updated", `Agent config of ${id} changed`);
      touch(a);
    },

    removeEdge: (id) => void engDeleteEdge(a, id),

    updateEdgeData: (id, patch) => {
      useStore.setState((s) => ({
        edges: s.edges.map((e) => (e.id === id && e.data ? { ...e, data: { ...e.data, ...patch } } : e)),
      }));
      void writeEdgeArtifact(a, id, true);
      emit(a, "edge.updated", `Edge ${id} edited`);
      touch(a);
    },

    selectNode: (id) =>
      useStore.setState((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, selected: n.id === id })),
      })),
    selectEdge: (id) =>
      useStore.setState((s) => ({
        edges: s.edges.map((e) => ({ ...e, selected: e.id === id })),
      })),
    setLeftTab: (t) => useStore.setState((s) => ({ ui: { ...s.ui, leftTab: t } })),
    setInspectorTab: (t) => useStore.setState((s) => ({ ui: { ...s.ui, inspectorTab: t } })),
    openFile: (f) => useStore.setState((s) => ({ ui: { ...s.ui, fileViewer: f } })),
    setHistoryOpen: (v) => useStore.setState((s) => ({ ui: { ...s.ui, historyOpen: v } })),
    setSettingsOpen: (v) => useStore.setState((s) => ({ ui: { ...s.ui, settingsOpen: v } })),
    setChatNode: (id) => useStore.setState((s) => ({ ui: { ...s.ui, chatNodeId: id } })),
    toggleConsole: () => useStore.setState((s) => ({ ui: { ...s.ui, consoleOpen: !s.ui.consoleOpen } })),

    /* ---- layout (ADR-009): the widths are canvas content, so they land in `canvas.yaml`; focus mode is a
           moment of work, so it lands nowhere ---- */
    togglePanel: (side) => {
      const lay = a.get().canvas.layout;
      const key = side === "left" ? "leftOpen" : "rightOpen";
      const next = !lay[key];
      a.set({ canvas: { ...a.get().canvas, layout: { ...lay, [key]: next } } });
      emit(a, "system", `${side} panel ${next ? "shown" : "hidden"}`);
      touchLayout(a);
    },

    resizePanel: (side, width) => {
      const w = clamp(width, PANEL_MIN, PANEL_MAX);
      const key = side === "left" ? "leftWidth" : "rightWidth";
      const lay = a.get().canvas.layout;
      if (lay[key] === w) return; // no store write and no file write while the handle is not moving
      a.set({ canvas: { ...a.get().canvas, layout: { ...lay, [key]: w } } });
      touchLayout(a); // debounced 500 ms — the drag writes the file once, at the end
    },

    toggleFocusMode: () => setFocus(a, !a.get().ui.focusMode),

    chordKey: (key) => {
      const before = a.get().ui.chordDepth;
      const hit = focusChord.push(key, Date.now());
      const depth = hit ? 0 : focusChord.depth;
      // only write when the hint would actually change: a keydown is not a reason to re-render the app
      if (depth !== before) a.set({ ui: { ...a.get().ui, chordDepth: depth } });
      if (hit) setFocus(a, !a.get().ui.focusMode);
    },

    escapeKey: () => {
      if (!a.get().ui.focusMode) return; // one Escape still belongs to in-place editing and the modals
      if (!escapeTap.push(Date.now())) return;
      setFocus(a, false);
    },

    /* Both go through `writeSettingsLocal` (ADR-007): the seam is only auditable while it has one writer.
       The old `updateSettings` wrote the key with its own `setItem`, which is what made "what lives in local
       settings" a question answered by grep. */
    updateSettings: (p) => {
      useStore.setState((s) => ({ settings: { ...s.settings, ...p } }));
      writeSettingsLocal(useStore.getState().settings as unknown as Record<string, unknown>);
      touch(a);
    },

    saveSettingsLocal: () => {
      const ok = writeSettingsLocal(a.get().settings as unknown as Record<string, unknown>);
      toast(a, ok ? "success" : "error", ok ? "Settings saved." : "Saving settings failed.");
    },

    updateCanvas: (p) => {
      useStore.setState((s) => ({ canvas: { ...s.canvas, ...p, updated_at: nowIso() } }));
      touch(a);
    },

    runAll: () => void runPipeline(a),
    runOne: (id) => void runSingle(a, id),
    runSelected: () => {
      const ids = a.get().nodes.filter((n) => n.selected).map((n) => n.id);
      if (!ids.length) { toast(a, "warn", "Select at least one node to run."); return; }
      void runPipeline(a, { scope: ids, label: `Run selected (${ids.length})` });
    },
    runFromNode: (id) => void runPipeline(a, { scope: flowClosure(a.get(), id, "downstream"), label: "Run from this node downstream" }),
    runUntilNode: (id) => void runPipeline(a, { scope: flowClosure(a.get(), id, "upstream"), label: "Run until this node" }),
    resume: () => void resumeRun(a),
    reject: () => rejectRun(a),
    stop: () => stopRun(a),
    pause: () => pauseRun(a),
    step: () => void stepRun(a),
    resetRun: () => resetExecution(a),
    chat: (id, text) => void sendChat(a, id, text),
    snapshot: () => void takeSnapshot(a, "Manual checkpoint"),
    restore: (id) => {
      void restoreSnapshot(a, id);
      useStore.setState((s) => ({ ui: { ...s.ui, historyOpen: false } }));
    },
    dismissToast: (id) => useStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    saveTemplate: (name) => void saveTemplate(a, name),
    loadTemplate: (id) => void loadTemplate(a, id),
    loadFreelancePipeline: () => void loadProjectFinderPipeline(a),
    saveRole: (nodeId) => void saveRoleFromNode(a, nodeId),
    selfTest: (nodeId) => void contractSelfTest(a, nodeId),
    testFallback: () => void testFallback(a),

    addStroke: (s) => void engAddStroke(a, s),
    removeStroke: (id) => void engRemoveStroke(a, id),
    undoStroke: () => void engUndoStroke(a),
    clearStrokes: () => void engClearStrokes(a),
    convertStrokes: (opts) => void engConvertStrokes(a, opts),

    storageMode: () => storageMode(),
    flushSave: () => flushPending(),
    reloadFromDisk: () => reloadFromStorage(a),
    attachFolder: () => pickCanvasFolder(a),
    detachFolder: () => detachWorkspaceFolder(a),
    exportJson: () => exportToJsonFile(a),
    exportFolder: () => exportToFolder(a),
    importFolder: (replace) => importFromFolder(a, replace ?? true),
    importJsonFile: (file, replace) => importFromFile(a, file, replace ?? true),
    previewImport: (text) => previewImportText(a, text),
    commitImport: (files, replace) => applyImport(a, files, { replace: replace ?? true }),
    setPortOpen: (v) => useStore.setState((s) => ({ ui: { ...s.ui, portOpen: v } })),

    openStorageFile: async (path) => {
      try {
        const content = await storage.readFile(path);
        const lang = path.endsWith(".json") ? "json" : path.endsWith(".yaml") ? "yaml" : path.endsWith(".log") ? "log" : "md";
        useStore.setState((s) => ({ ui: { ...s.ui, fileViewer: { path, content, lang } } }));
      } catch {
        useStore.setState((s) => ({ ui: { ...s.ui, fileViewer: { path, content: "— file could not be read —", lang: "md" } } }));
      }
    },
  };
}

export const getApi = () => api;

export { MODELS, makeNodeData, makeEdgeData };
