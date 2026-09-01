/* ============================================================
   Living Canvas — AppState, factories, roles, seed data
   ============================================================ */
import type { Node, Edge } from "@xyflow/react";
import type {
  LCNodeData, LCEdgeData, NodeType, ShapeKind, ViewMode,
  AgentConfig, MemDoc, Settings, ExecutionState, BusEvent, Toast,
  OutputEntry, ChatMsg, SnapshotMeta, EdgeType, Stroke,
} from "./lib/core";

export const APP_VERSION = "0.1.0"; // release v0.1 — closes phase 1 of architecture doc 1.3
export const CANVAS_ID = "nexus-edu-001";
export const ROOT = `canvases/${CANVAS_ID}`;

export type RFNode = Node<LCNodeData, "lc">;
export type RFEdge = Edge<LCEdgeData>;

export interface CanvasMeta {
  title: string;
  owner: string;
  canvas_type: string;
  tags: string[];
  default_model: string;
  template_id: string;
  template_version: string;
  created_at: string;
  updated_at: string;
}

export interface FileViewerState {
  path: string;
  content: string;
  lang: "md" | "yaml" | "json" | "log";
}

/* ---------------- templates (§13) ---------------- */

export interface TemplateSpecNode {
  id: string;
  nodeType: NodeType;
  title: string;
  position: { x: number; y: number };
  shape?: ShapeKind;
  color?: string;
  viewMode?: ViewMode;
  content?: string | null;
  role?: string | null;
}
export interface TemplateSpecEdge {
  id: string;
  source: string;
  target: string;
  edgeType?: EdgeType;
  label?: string;
  line_style?: LCEdgeData["line_style"];
}
export interface TemplateSpec {
  template_id: string;
  name: string;
  description: string;
  version: string;
  nodes: TemplateSpecNode[];
  edges: TemplateSpecEdge[];
}
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  nodes: number;
  edges: number;
  builtin: boolean;
  saved_at: string;
}

export const BUILTIN_TEMPLATE: TemplateSpec = {
  template_id: "quick-pipeline",
  name: "Fast pipeline",
  description: "Four steps: understand the problem → risk analysis → solution design → wrap-up",
  version: "1.0",
  nodes: [
    { id: "tpl-001", nodeType: "agent", title: "Understand the problem", position: { x: 80, y: 220 }, role: "understander", content: "Pull the problem out of ambiguity." },
    { id: "tpl-002", nodeType: "agent", title: "Risk analysis", position: { x: 440, y: 60 }, role: "risk-analyst", content: "Score the risks." },
    { id: "tpl-003", nodeType: "agent", title: "Design the solution", position: { x: 800, y: 220 }, role: "solution-designer", content: "An executable solution in three steps." },
    { id: "tpl-004", nodeType: "agent", title: "Wrap-up", position: { x: 1160, y: 60 }, role: "decision-maker", content: "Final decision, with human approval." },
    { id: "tpl-005", nodeType: "output-box", title: "Final output", position: { x: 1500, y: 220 }, content: "The deliverable is assembled here." },
  ],
  edges: [
    { id: "tpl-e1", source: "tpl-001", target: "tpl-002", label: "problem statement" },
    { id: "tpl-e2", source: "tpl-002", target: "tpl-003", label: "risk report" },
    { id: "tpl-e3", source: "tpl-003", target: "tpl-004", label: "proposed solution" },
    { id: "tpl-e4", source: "tpl-004", target: "tpl-005", label: "final decision" },
  ],
};

export const builtinTemplateInfo = (): TemplateInfo => ({
  id: BUILTIN_TEMPLATE.template_id,
  name: BUILTIN_TEMPLATE.name,
  description: BUILTIN_TEMPLATE.description,
  nodes: BUILTIN_TEMPLATE.nodes.length,
  edges: BUILTIN_TEMPLATE.edges.length,
  builtin: true,
  saved_at: nowIsoLocal(),
});

function nowIsoLocal() {
  return new Date().toISOString();
}

export interface AppState {
  booted: boolean;
  bootLines: { text: string; ok: boolean }[];
  canvasId: string;
  canvas: CanvasMeta;
  nodes: RFNode[];
  edges: RFEdge[];
  memory: {
    global: MemDoc;
    decisions: MemDoc;
    progress: MemDoc;
    user: MemDoc;
    agents: Record<string, MemDoc>;
  };
  outputs: Record<string, OutputEntry[]>;
  chats: Record<string, ChatMsg[]>;
  logs: Record<string, string[]>;
  snapshots: SnapshotMeta[];
  templates: TemplateInfo[];
  strokes: Stroke[];
  execution: ExecutionState;
  events: BusEvent[];
  toasts: Toast[];
  settings: Settings;
  saveState: "saved" | "saving";
  typing: Record<string, boolean>;
  ui: {
    leftTab: "palette" | "files";
    fileViewer: FileViewerState | null;
    historyOpen: boolean;
    settingsOpen: boolean;
    chatNodeId: string | null;
    consoleOpen: boolean;
  /** is the Export/Import panel open? */
    portOpen: boolean;
  };
}

export const NODE_COLORS: Record<NodeType, string> = {
  agent: "#e8b04b",
  note: "#6fb3c7",
  "output-box": "#8fbf7f",
  folder: "#d9c9a3",
  "pipeline-step": "#b98bc2",
  file: "#8ba39d",
  shape: "#e06a4e",
  drawing: "#e06a4e",
};

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  agent: "Agent",
  note: "Note",
  "output-box": "Output box",
  folder: "Folder",
  "pipeline-step": "Pipeline step",
  file: "File",
  shape: "Shape",
  drawing: "Drawing",
};

export const MODELS = ["deepseek-chat", "glm-4-flash", "ollama:qwen2.5"];

/* ---------------- roles (§3.8) ---------------- */

export interface RoleDef {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  tools: string[];
  required_fields: string[];
}

export const ROLES: RoleDef[] = [
  {
    id: "understander",
    name: "Understand the problem",
    description: "Talks with the user to clarify the problem and extract a precise statement",
    system_prompt:
      "You are the \"Understand the problem\" agent. Read the canvas summary and your own memory, then make the core problem explicit. List the ambiguous questions first, then write the problem statement as one precise paragraph. Your output must contain summary, problem_statement and questions_asked.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "chat_with_user", "write_output"],
    required_fields: ["summary", "problem_statement", "questions_asked"],
  },
  {
    id: "risk-analyst",
    name: "Risk analysis",
    description: "Finds the risks of the proposed solution and scores them",
    system_prompt:
      "You are the \"Risk analysis\" agent. Your input is the problem statement from the previous node. List the main risks, score each from 1 to 10, and recommend one overall decision (reject / revise / approve). Output contains summary, risks and decision.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "risks", "decision"],
  },
  {
    id: "solution-designer",
    name: "Design the solution",
    description: "Designs an executable solution with clear, measurable steps",
    system_prompt:
      "You are the \"Design the solution\" agent. Given the problem statement and the risk report, design an executable solution in three steps. Each step needs an explicit output and a success criterion. Output contains summary, solution and next_actions.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "solution", "next_actions"],
  },
  {
    id: "decision-maker",
    name: "Wrap-up & decision",
    description: "Collects every output and proposes the final decision, pending human approval",
    system_prompt:
      "You are the \"Wrap-up & decision\" agent. Read every allowed output, mark the conflicts, and write one final decision with its reasons. The final decision is executed only after human approval. Output contains summary, decision and approval_request.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "decision", "approval_request"],
  },
];

export const roleById = (id: string) => ROLES.find((r) => r.id === id) ?? ROLES[0];

/* ---------------- factories ---------------- */

const iso = () => new Date().toISOString();

export function makeAgentConfig(nodeId: string, roleId: string, opts?: Partial<AgentConfig>): AgentConfig {
  const role = roleById(roleId);
  const extraRead = opts?.context_contract?.allowed_read_paths ?? [];
  return {
    role_id: role.id,
    system_prompt: role.system_prompt,
    model: role.model,
    tools: [...role.tools],
    status: "idle",
    max_steps: 6,
    max_tokens: 4000,
    require_approval: false,
    context_contract: {
      allowed_read_paths: [
        "canvas-overview.md",
        `nodes/${nodeId}.md`,
        `memory/agents/${nodeId}.md`,
        ...extraRead,
      ],
      allowed_write_paths: [`outputs/${nodeId}/`, `memory/agents/${nodeId}.md`, `logs/${nodeId}/`],
      output_contract: {
        format: "markdown",
        required_fields: [...role.required_fields],
        save_to: `outputs/${nodeId}/`,
      },
    },
    ...opts,
  };
}

export function makeNodeData(
  nodeType: NodeType,
  title: string,
  owner: string,
  opts?: Partial<LCNodeData>
): LCNodeData {
  return {
    nodeType,
    title,
    shape: nodeType === "agent" ? "card" : nodeType === "output-box" ? "hexagon" : "rectangle",
    color: NODE_COLORS[nodeType],
    animation: { type: nodeType === "agent" ? "breathe" : "none", speed: 1 },
    viewMode: nodeType === "note" ? "markdown" : "card",
    style: { strokeColor: "#0b1312", strokeWidth: 2, fillStyle: "solid", opacity: 100 },
    lock: { status: "free", locked_by: null, locked_at: null },
    content: "",
    agent: nodeType === "agent" ? makeAgentConfig("pending", "understander") : null,
    created_by: owner,
    created_at: iso(),
    updated_at: iso(),
    ...opts,
  };
}

export function makeEdgeData(opts?: Partial<LCEdgeData>): LCEdgeData {
  return {
    edgeType: "flow",
    label: "",
    line_style: "solid",
    animation: "flow",
    trigger: { type: "on_completed", condition: "" },
    config: { communication: "blackboard" },
    ...opts,
  };
}

export function makeMemDoc(path: string, title: string, body: string, confidence: number, source: MemDoc["source"]): MemDoc {
  return { path, title, body, updated_at: iso(), last_accessed: iso(), confidence, source };
}

export const emptyExecution = (): ExecutionState => ({
  run_id: null,
  canvas_id: CANVAS_ID,
  current_node_id: null,
  queue: [],
  completed: [],
  context: {},
  status: "idle",
  started_at: null,
});

export const defaultSettings = (): Settings => {
  try {
    const raw = localStorage.getItem("lc-settings");
    if (raw) return { provider: "sim", apiKey: "", model: "deepseek-chat", owner: "mahla", simDelay: 620, backendUrl: "", workspaceRoot: null, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { provider: "sim", apiKey: "", model: "deepseek-chat", owner: "mahla", simDelay: 620, backendUrl: "", workspaceRoot: null };
};

/* ---------------- palette ---------------- */

export const PALETTE: { nodeType: NodeType; label: string; desc: string; shape: ShapeKind; viewMode: ViewMode }[] = [
  { nodeType: "agent", label: "Agent", desc: "Smart node with a role, a context contract and memory", shape: "card", viewMode: "card" },
  { nodeType: "note", label: "Note", desc: "Free markdown text on the canvas", shape: "rectangle", viewMode: "markdown" },
  { nodeType: "output-box", label: "Output box", desc: "Shared output of several nodes", shape: "hexagon", viewMode: "card" },
  { nodeType: "pipeline-step", label: "Pipeline step", desc: "Executed step without an agent", shape: "rectangle", viewMode: "name" },
  { nodeType: "folder", label: "Folder", desc: "Visual grouping of nodes", shape: "rectangle", viewMode: "name" },
  { nodeType: "shape", label: "Free shape", desc: "Diamond, circle, hexagon…", shape: "diamond", viewMode: "name" },
];

/* ---------------- seed content ---------------- */

export function buildSeed(owner: string) {
  const t = iso();

  const mkNode = (id: string, type: string, x: number, y: number, data: RFNode["data"]): RFNode =>
    ({ id, type, position: { x, y }, data } as RFNode);

  const note = makeNodeData("note", "Canvas goal", owner, {
    color: "#6fb3c7",
    shape: "rectangle",
    content:
      "## Goal\n\nDesign a **smart online school** for students aged 12 to 15.\n\n### Frame\n- the problem is defined from the student's point of view\n- educational and technical risks are weighed before designing\n- the final decision runs only after human approval",
  });

  const a1 = makeNodeData("agent", "Understand the problem", owner, {
    agent: makeAgentConfig("node-001", "understander"),
    content: "First agent of the pipeline; pulls the problem out of ambiguity.",
  });
  const a2 = makeNodeData("agent", "Risk analysis", owner, {
    color: "#e06a4e",
    agent: makeAgentConfig("node-002", "risk-analyst", {
      context_contract: {
        allowed_read_paths: [
          "canvas-overview.md", "nodes/node-002.md", "memory/agents/node-002.md",
          "outputs/node-001/", "memory/decisions.md",
        ],
        allowed_write_paths: ["outputs/node-002/", "memory/agents/node-002.md", "logs/node-002/"],
        output_contract: { format: "markdown", required_fields: ["summary", "risks", "decision"], save_to: "outputs/node-002/" },
      },
    }),
  });
  const a3 = makeNodeData("agent", "Design the solution", owner, {
    color: "#8fbf7f",
    agent: makeAgentConfig("node-003", "solution-designer", {
      context_contract: {
        allowed_read_paths: [
          "canvas-overview.md", "nodes/node-003.md", "memory/agents/node-003.md",
          "outputs/node-001/", "outputs/node-002/",
        ],
        allowed_write_paths: ["outputs/node-003/", "memory/agents/node-003.md", "logs/node-003/"],
        output_contract: { format: "markdown", required_fields: ["summary", "solution", "next_actions"], save_to: "outputs/node-003/" },
      },
    }),
  });
  const a4 = makeNodeData("agent", "Wrap-up & decision", owner, {
    color: "#b98bc2",
    agent: makeAgentConfig("node-004", "decision-maker", {
      require_approval: true,
      context_contract: {
        allowed_read_paths: [
          "canvas-overview.md", "nodes/node-004.md", "memory/agents/node-004.md",
          "outputs/node-001/", "outputs/node-002/", "outputs/node-003/", "memory/decisions.md",
        ],
        allowed_write_paths: ["outputs/node-004/", "memory/agents/node-004.md", "logs/node-004/"],
        output_contract: { format: "markdown", required_fields: ["summary", "decision", "approval_request"], save_to: "outputs/node-004/" },
      },
    }),
  });
  const box = makeNodeData("output-box", "Final output", owner, {
    content: "The final decision and the deliverable are assembled in this box.",
  });

  const nodes: RFNode[] = [
    mkNode("note-001", "lc", 40, 300, note),
    mkNode("node-001", "lc", 340, 250, a1),
    mkNode("node-002", "lc", 700, 90, a2),
    mkNode("node-003", "lc", 1060, 250, a3),
    mkNode("node-004", "lc", 1420, 90, a4),
    mkNode("box-001", "lc", 1760, 250, box),
  ];

  const mkEdge = (id: string, source: string, target: string, data: RFEdge["data"]): RFEdge =>
    ({ id, source, target, type: "lc", data } as RFEdge);

  const edges: RFEdge[] = [
    mkEdge("edge-001", "note-001", "node-001", makeEdgeData({ edgeType: "relation", label: "goal reference", line_style: "dotted", animation: "none" })),
    mkEdge("edge-002", "node-001", "node-002", makeEdgeData({ label: "problem statement" })),
    mkEdge("edge-003", "node-002", "node-003", makeEdgeData({ label: "risk report", trigger: { type: "condition", condition: "{{ risk_score < 7 }}" } })),
    mkEdge("edge-004", "node-003", "node-004", makeEdgeData({ label: "proposed solution" })),
    mkEdge("edge-005", "node-004", "box-001", makeEdgeData({ label: "final decision", animation: "pulse" })),
  ];

  const agents: Record<string, MemDoc> = {};
  for (const [nid, rid] of [["node-001", "understander"], ["node-002", "risk-analyst"], ["node-003", "solution-designer"], ["node-004", "decision-maker"]] as const) {
    agents[nid] = makeMemDoc(
      `memory/agents/${nid}.md`,
      `Memory of the \"${roleById(rid).name}\" agent`,
      `- latest inputs: not run yet\n- decisions taken: —\n- notes for the next run: read the context contract before reading any file.`,
      0.7,
      "agent"
    );
  }

  const memory = {
    global: makeMemDoc("memory/global.md", "Overall project status",
      "- goal: design a smart online school for teenagers aged 12 to 15\n- progress: canvas structure is ready, the 4-step pipeline is defined\n- important: the final decision never runs without human approval", 0.9, "system"),
    decisions: makeMemDoc("memory/decisions.md", "Key decisions",
      `- [${t.slice(0, 10)}] architecture: file-first, with StorageAdapter over IndexedDB\n- [${t.slice(0, 10)}] executor: lightweight state machine in phase 1, LangGraph in phase 2\n- [${t.slice(0, 10)}] memory: two levels (global + per-agent)`, 0.8, "system"),
    progress: makeMemDoc("memory/progress.md", "Work in progress",
      "# Done\n- canvas built, agents defined\n\n# In progress\n- preparing the first run\n\n# Next\n- run the pipeline and wrap up", 0.8, "system"),
    user: makeMemDoc("memory/user.md", "User profile",
      `- name: ${owner}\n- working style: visual, cares about architecture details\n- preference: short, structured outputs`, 0.85, "user"),
    agents,
  };

  const canvas: CanvasMeta = {
    title: "Nexus Smart School",
    owner,
    canvas_type: "agent-pipeline",
    tags: ["nexus", "school"],
    default_model: "deepseek-chat",
    template_id: "nexus-4-agents",
    template_version: "1.0",
    created_at: t,
    updated_at: t,
  };

  return { nodes, edges, memory, canvas };
}
