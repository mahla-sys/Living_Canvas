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

/**
 * Version of the on-disk tree (§4.1). `1.4` is the pass that removed `graph.json`, added `runs/` and made
 * `library/schemas/` real. A folder written by `1.3` still hydrates: the extra `graph.json` is ignored on
 * import, and everything else is unchanged.
 */
export const STRUCTURE_VERSION = "1.4";
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

/*
 * There is no built-in demo template on purpose. The canvas used to ship a four-agent "Fast pipeline"
 * both as seed data and as `BUILTIN_TEMPLATE`; every graph in a fresh workspace was that test fixture, so a
 * first-time user could not tell shipped behaviour from sample content. Templates are now only what the
 * user saves into `library/templates/` (§4.9), and `loadTemplates()` starts empty.
 */

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
  /**
   * run ids present in `runs/`, newest first. A projection of the folder listing, kept in state only so the
   * file tree can render the ledgers without an async read per row (§5 Law 1: the files decide, state mirrors).
   */
  runs: string[];
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
      "You are the \"Risk analysis\" agent. Your input is the problem statement from the previous node. List the main risks, score each from 1 to 10, and recommend one overall decision (reject / revise / approve). Output contains summary, risks, decision and a single numeric risk_score (1-10) for the whole proposal.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "risks", "decision", "risk_score"],
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

/* ---------------- output schemas (§4.9 → library/schemas/) ---------------- */

/**
 * One JSON-Schema-subset file per built-in role, written to `library/schemas/<role>.schema.json` on first
 * boot and read by the executor on every `write_output` (§9.1). These are the same files the user can edit
 * in a text editor or Obsidian — nothing here is privileged, and a role with no schema file fails loudly
 * rather than passing quietly.
 *
 * Values arrive as strings, so a `type: "integer"` field means "nothing but a number" — that is what turns
 * `{{ risk_score < 7 }}` from decoration into data.
 */
export const ROLE_SCHEMAS: Record<string, unknown> = {
  understander: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "understander output",
    description: "the problem, made explicit, plus what is still ambiguous",
    type: "object",
    required: ["summary", "problem_statement", "questions_asked"],
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 40, description: "one paragraph: what was understood" },
      problem_statement: { type: "string", minLength: 80, description: "the core problem in one precise sentence-per-line paragraph" },
      questions_asked: { type: "string", minLength: 20, pattern: "^\\s*1[\\.).]", description: "numbered list of open questions" },
    },
  },
  "risk-analyst": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "risk-analyst output",
    description: "risks with severities, a decision, and one number later edges can read",
    type: "object",
    required: ["summary", "risks", "decision", "risk_score"],
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 40, description: "one paragraph: how the risks were weighed" },
      risks: { type: "string", minLength: 40, pattern: "^-", description: "dash list, one risk per line with its severity" },
      decision: { type: "string", minLength: 10, description: "the recommendation, with the condition attached" },
      risk_score: { type: "integer", minimum: 1, maximum: 10, description: "overall score for the whole proposal" },
    },
  },
  "solution-designer": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "solution-designer output",
    description: "an executable design in steps, each with an output and a criterion",
    type: "object",
    required: ["summary", "solution", "next_actions"],
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 40, description: "one paragraph: what was designed and why" },
      solution: { type: "string", minLength: 60, pattern: "step 1", description: "step 1 / step 2 / step 3, each with output + criterion" },
      next_actions: { type: "string", minLength: 20, pattern: "^-", description: "dash list of actions with an owner" },
    },
  },
  "decision-maker": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "decision-maker output",
    description: "the wrap-up, the decision, and what the human is being asked to approve",
    type: "object",
    required: ["summary", "decision", "approval_request"],
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 40, description: "one paragraph: what the whole run produced" },
      decision: { type: "string", minLength: 20, description: "the decision and its reasons" },
      approval_request: { type: "string", minLength: 20, description: "the exact question put to the human approver" },
    },
  },
};

/** The canvas-relative path a role's schema lives at (§4.9). */
export const schemaPathFor = (roleId: string) => `library/schemas/${roleId}.schema.json`;

/** A schema for a role the user saved: presence and non-emptiness only, which is what its contract says. */
export function makeRoleSchema(roleId: string, name: string, requiredFields: string[]): unknown {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `${roleId} output`,
    description: `output contract of the “${name}” role, generated from its required fields`,
    type: "object",
    required: [...requiredFields],
    additionalProperties: false,
    properties: Object.fromEntries(requiredFields.map((f) => [f, { type: "string", minLength: 20, description: f }])),
  };
}

/* ---------------- factories ---------------- */

const iso = () => new Date().toISOString();

/**
 * Overrides for a node's agent config. `context_contract` is partial on purpose: the UI and the tests
 * edit one list at a time, and `makeAgentConfig` merges it onto the role defaults (see below).
 */
/**
 * What a caller may override on an agent node. The contract objects are one level deeper than `Partial`
 * reaches: `makeAgentConfig` merges `output_contract` field by field (a node that only retargets its
 * `validator` must not have to restate `format` and `save_to`), so the type says the same thing.
 */
export type AgentConfigOverrides = Partial<Omit<AgentConfig, "context_contract">> & {
  context_contract?: Partial<Omit<NonNullable<AgentConfig["context_contract"]>, "output_contract">> & {
    output_contract?: Partial<NonNullable<AgentConfig["context_contract"]>["output_contract"]>;
  };
};

export function makeAgentConfig(nodeId: string, roleId: string, opts?: AgentConfigOverrides): AgentConfig {
  const role = roleById(roleId);
  const extraRead = opts?.context_contract?.allowed_read_paths ?? [];
  const base: AgentConfig = {
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
        // a fresh agent node may read its predecessors' summaries — but the grant is explicit in the
        // file (one-segment glob), so tightening it is an edit, not a code change (§9)
        "outputs/*/summary.md",
        ...extraRead,
      ],
      allowed_write_paths: [`outputs/${nodeId}/`, `memory/agents/${nodeId}.md`, `logs/${nodeId}/`],
      output_contract: {
        format: "markdown",
        required_fields: [...role.required_fields],
        save_to: `outputs/${nodeId}/`,
        validator: ROLE_SCHEMAS[role.id] ? schemaPathFor(role.id) : null,
      },
    },
  };
  // A partial override merges instead of replacing: `...opts` alone meant a caller that narrowed one
  // list silently dropped the other two, and an empty allowed_write_paths denies every write (§9).
  const { context_contract: c, ...rest } = opts ?? {};
  const merged: AgentConfig = { ...base, ...rest };
  if (c)
    merged.context_contract = {
      ...base.context_contract,
      ...c,
      allowed_read_paths: c.allowed_read_paths ?? base.context_contract.allowed_read_paths,
      allowed_write_paths: c.allowed_write_paths ?? base.context_contract.allowed_write_paths,
      output_contract: { ...base.context_contract.output_contract, ...(c.output_contract ?? {}) },
    };
  return merged;
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
  errors: {},
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

/**
 * The seed canvas, deliberately almost nothing.
 *
 * It used to ship a full demo — a smart-online-school pipeline with four agents, five edges, four
 * hand-written memory documents and a fake risk score. That made every fresh workspace look like a
 * screenshot of a test, and mixed sample content with behaviour. What a first boot actually needs is the
 * **structure** (the file tree, the four shared memory documents) plus one note that explains what to do
 * — so `hydrate()` has a node to find and does not consider the folder empty.
 *
 * Roles (`ROLES`) and their schemas (`ROLE_SCHEMAS`) still ship: they are library material a user picks from
 * the palette, not a graph.
 */
export function buildSeed(owner: string) {
  const t = iso();
  const mkNode = (id: string, type: string, x: number, y: number, data: RFNode["data"]): RFNode =>
    ({ id, type, position: { x, y }, data } as RFNode);

  const start = makeNodeData("note", "Start here", owner, {
    color: "#6fb3c7",
    shape: "rectangle",
    content: [
      "## This canvas is empty on purpose",
      "",
      "Drag from the **library** on the left:",
      "",
      "1. a `note` for the goal you are trying to reach;",
      "2. an `agent` node per step — each one carries its own contract (read paths, write paths, required output fields);",
      "3. a `flow` edge from one to the next; put `{{ field <op> value }}` on an edge to gate the hop.",
      "",
      "Then press **Run**. Every step writes plain files under `canvases/<id>/` — `nodes/`, `outputs/`,",
      "`memory/`, `logs/`, and one `runs/<run-id>.md` ledger — and the app reads them back, so Git and",
      "Obsidian see the same thing this canvas does. State is the cache; the folder is the record.",
    ].join("\n"),
  });

  const memory = {
    global: makeMemDoc("memory/global.md", "Overall project status",
      "- goal: not written yet\n- progress: nothing has run\n- important: the files in this folder are the record of this canvas", 0.5, "system"),
    decisions: makeMemDoc("memory/decisions.md", "Key decisions",
      "- (empty: decisions recorded by a run or by you land here)", 0.5, "system"),
    progress: makeMemDoc("memory/progress.md", "Work in progress",
      "# Done\n- (nothing yet)\n\n# In progress\n- (nothing yet)\n\n# Next\n- add the first node", 0.5, "system"),
    user: makeMemDoc("memory/user.md", "User profile",
      `- name: ${owner}\n- working style: (tell the agents once, and they will remember it here)`, 0.6, "user"),
    agents: {},
  };

  const canvas: CanvasMeta = {
    title: "Untitled canvas",
    owner,
    canvas_type: "agent-pipeline",
    tags: [],
    default_model: "deepseek-chat",
    template_id: "—",
    template_version: "—",
    created_at: t,
    updated_at: t,
  };

  return { nodes: [mkNode("note-001", "lc", 80, 80, start)], edges: [] as RFEdge[], memory, canvas };
}
