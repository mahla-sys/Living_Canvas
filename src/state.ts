/* ============================================================
   Living Canvas — AppState, factories, roles, seed data
   ============================================================ */
import type { Node, Edge } from "@xyflow/react";
import {
  DEFAULT_THEME, DEFAULT_MODEL, isThemeId, readSettingsLocal,
  PANEL_DEFAULT_LEFT, PANEL_DEFAULT_RIGHT
} from "./lib/core";
import type {
  LCNodeData, LCEdgeData, NodeType, ShapeKind, ViewMode,
  AgentConfig, MemDoc, Settings, ExecutionState, BusEvent, Toast,
  OutputEntry, ChatMsg, SnapshotMeta, EdgeType, Stroke, CanvasLayout,
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
  /**
   * Panel widths and open/closed state (ADR-009). Canvas *content*, so it lives in `canvas.yaml` and comes
   * back on hydrate — how wide the inspector is on this graph is part of how the graph is read, the same
   * way `position` is. Focus mode is the opposite: a moment of work, kept in `ui`, never in a file.
   */
  layout: CanvasLayout;
}

/** What a canvas with no `layout:` key in its `canvas.yaml` gets — and what a fresh seed writes. */
export const DEFAULT_LAYOUT: CanvasLayout = {
  leftWidth: PANEL_DEFAULT_LEFT,
  rightWidth: PANEL_DEFAULT_RIGHT,
  leftOpen: true,
  rightOpen: true,
};

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
 * The template library ships five built-in pipeline templates (ADR-039); they are seeded into
 * `library/templates/` on first boot, so in the files they are no different from a saved one — the
 * constant here is the seed's source, and it is also what the gate in `templates-sim.test.ts` runs:
 * every built-in template must execute green on the internal simulator, because a template that cannot
 * run without a provider key is a template that cannot be tried.
 */
export const BUILTIN_TEMPLATES: TemplateSpec[] = [
  {
    template_id: "project-finder",
    name: "Freelance Project & Proposal Pipeline",
    description: "4-agent automated pipeline for scouting projects, evaluating feasibility, drafting bespoke proposals, and contract milestones.",
    version: "1.0",
    nodes: [
      { id: "node-scout", nodeType: "agent", title: "1. Project & Client Scout", position: { x: 80, y: 180 }, shape: "card", color: "#e8b04b", viewMode: "card", role: "project-scout", content: "Scouts and aggregates freelance projects (Upwork, Freelancer, Contra, RemoteOK). Extracts client requirements, budget range ($500-$5000+), and timeline." },
      { id: "node-filter", nodeType: "agent", title: "2. Feasibility & Risk Filter", position: { x: 420, y: 180 }, shape: "card", color: "#6fb3c7", viewMode: "card", role: "feasibility-filter", content: "Analyzes client hire rate, payment security, technical requirements, and margin. Generates a risk score (1-10) and BID/PASS decision." },
      { id: "node-proposal", nodeType: "agent", title: "3. Proposal & Pitch Architect", position: { x: 760, y: 180 }, shape: "card", color: "#b98bc2", viewMode: "card", role: "proposal-architect", content: "Crafts a high-converting, tailored proposal with custom problem analysis, technical roadmap, portfolio highlights, and transparent pricing." },
      { id: "node-closer", nodeType: "agent", title: "4. Milestone & Deal Closer", position: { x: 1100, y: 180 }, shape: "card", color: "#e06a4e", viewMode: "card", role: "deal-closer", content: "Designs project milestone roadmap, client kickoff questionnaire, deliverable checklist, and closing call-to-action." },
      { id: "node-output", nodeType: "output-box", title: "Freelance Package Deliverable", position: { x: 1440, y: 180 }, shape: "hexagon", color: "#8fbf7f", viewMode: "card", content: "Final Freelance Package: Scouted briefs, feasibility evaluations, winning proposals, and milestone contract deliverables ready to send." },
    ],
    edges: [
      { id: "edge-001", source: "node-scout", target: "node-filter", edgeType: "flow", label: "scouted briefs", line_style: "solid" },
      { id: "edge-002", source: "node-filter", target: "node-proposal", edgeType: "flow", label: "qualified projects", line_style: "solid" },
      { id: "edge-003", source: "node-proposal", target: "node-closer", edgeType: "flow", label: "custom proposal", line_style: "solid" },
      { id: "edge-004", source: "node-closer", target: "node-output", edgeType: "flow", label: "final package", line_style: "solid" },
    ],
  },
  {
    template_id: "decision-engine",
    name: "Problem Solving & Decision Engine",
    description: "4-agent executive engine for framing problems, evaluating risks, designing measurable solutions, and proposing human-approved decisions.",
    version: "1.0",
    nodes: [
      { id: "node-understand", nodeType: "agent", title: "1. Understand the Problem", position: { x: 80, y: 180 }, shape: "card", color: "#6fb3c7", viewMode: "card", role: "understander", content: "Clarifies ambiguities and formulates a single, precise problem statement." },
      { id: "node-risk", nodeType: "agent", title: "2. Risk & Feasibility Analyst", position: { x: 420, y: 180 }, shape: "card", color: "#e06a4e", viewMode: "card", role: "risk-analyst", content: "Evaluates proposal vulnerabilities and scores risks from 1 to 10." },
      { id: "node-solution", nodeType: "agent", title: "3. Solution Designer", position: { x: 760, y: 180 }, shape: "card", color: "#8fbf7f", viewMode: "card", role: "solution-designer", content: "Creates a 3-step executable solution with concrete success criteria." },
      { id: "node-decision", nodeType: "agent", title: "4. Decision Wrap-Up", position: { x: 1100, y: 180 }, shape: "card", color: "#b98bc2", viewMode: "card", role: "decision-maker", content: "Consolidates all agent outputs and formulates final approval request." },
      { id: "node-output", nodeType: "output-box", title: "Approved Action Plan", position: { x: 1440, y: 180 }, shape: "hexagon", color: "#e8b04b", viewMode: "card", content: "Executive Action Plan: Validated decisions and step-by-step implementation." },
    ],
    edges: [
      { id: "edge-001", source: "node-understand", target: "node-risk", edgeType: "flow", label: "problem statement", line_style: "solid" },
      { id: "edge-002", source: "node-risk", target: "node-solution", edgeType: "flow", label: "risk report", line_style: "solid" },
      { id: "edge-003", source: "node-solution", target: "node-decision", edgeType: "flow", label: "designed solution", line_style: "solid" },
      { id: "edge-004", source: "node-decision", target: "node-output", edgeType: "flow", label: "approved plan", line_style: "solid" },
    ],
  },
  {
    template_id: "code-builder",
    name: "Full-Stack Code Builder Pipeline",
    description: "Automated software development workflow: specification framing, code synthesis, and architectural validation.",
    version: "1.0",
    nodes: [
      { id: "node-architect", nodeType: "agent", title: "1. System Architect", position: { x: 100, y: 180 }, shape: "card", color: "#6fb3c7", viewMode: "card", role: "understander", content: "Analyzes system requirements, data structures, and interface contracts." },
      { id: "node-coder", nodeType: "agent", title: "2. System Builder", position: { x: 460, y: 180 }, shape: "card", color: "#e8b04b", viewMode: "card", role: "builder", content: "Writes production TypeScript code and architectural components." },
      { id: "node-tester", nodeType: "agent", title: "3. QA & Security Reviewer", position: { x: 820, y: 180 }, shape: "card", color: "#e06a4e", viewMode: "card", role: "risk-analyst", content: "Validates test coverage, edge cases, and security boundaries." },
      { id: "node-output", nodeType: "output-box", title: "Production Code Package", position: { x: 1180, y: 180 }, shape: "hexagon", color: "#8fbf7f", viewMode: "card", content: "Engineered release ready for deployment and git integration." },
    ],
    edges: [
      { id: "edge-001", source: "node-architect", target: "node-coder", edgeType: "flow", label: "specifications", line_style: "solid" },
      { id: "edge-002", source: "node-coder", target: "node-tester", edgeType: "flow", label: "source code", line_style: "solid" },
      { id: "edge-003", source: "node-tester", target: "node-output", edgeType: "flow", label: "verified build", line_style: "solid" },
    ],
  },
  {
    template_id: "market-research",
    name: "Market Research & Competitive Scout",
    description: "Market intelligence pipeline: trend scouting, competitor feature matrix, and differentiation strategy.",
    version: "1.0",
    nodes: [
      { id: "node-scout", nodeType: "agent", title: "1. Market Trend Scout", position: { x: 100, y: 180 }, shape: "card", color: "#e8b04b", viewMode: "card", role: "project-scout", content: "Scans industry shifts, user pain points, and emerging opportunities." },
      { id: "node-analysis", nodeType: "agent", title: "2. Competitive Analyst", position: { x: 460, y: 180 }, shape: "card", color: "#6fb3c7", viewMode: "card", role: "feasibility-filter", content: "Maps competitor pricing, feature gaps, and weaknesses." },
      { id: "node-strategy", nodeType: "agent", title: "3. Positioning Strategist", position: { x: 820, y: 180 }, shape: "card", color: "#b98bc2", viewMode: "card", role: "solution-designer", content: "Defines unique value proposition and go-to-market plan." },
      { id: "node-output", nodeType: "output-box", title: "Strategic Market Report", position: { x: 1180, y: 180 }, shape: "hexagon", color: "#8fbf7f", viewMode: "card", content: "Comprehensive market intelligence brief with tactical actions." },
    ],
    edges: [
      { id: "edge-001", source: "node-scout", target: "node-analysis", edgeType: "flow", label: "market data", line_style: "solid" },
      { id: "edge-002", source: "node-analysis", target: "node-strategy", edgeType: "flow", label: "competitor matrix", line_style: "solid" },
      { id: "edge-003", source: "node-strategy", target: "node-output", edgeType: "flow", label: "market report", line_style: "solid" },
    ],
  },
  {
    template_id: "content-engine",
    name: "Content Strategy & Copywriting Engine",
    description: "Multi-agent viral copywriting pipeline: research, compelling copy drafting, and conversion optimization.",
    version: "1.0",
    nodes: [
      { id: "node-research", nodeType: "agent", title: "1. Topic & Hook Researcher", position: { x: 100, y: 180 }, shape: "card", color: "#e8b04b", viewMode: "card", role: "project-scout", content: "Researches trending hooks, client audience angles, and core themes." },
      { id: "node-copy", nodeType: "agent", title: "2. Persuasive Copywriter", position: { x: 460, y: 180 }, shape: "card", color: "#b98bc2", viewMode: "card", role: "proposal-architect", content: "Drafts high-engagement posts, newsletters, and conversion copy." },
      { id: "node-review", nodeType: "agent", title: "3. Quality & SEO Polish", position: { x: 820, y: 180 }, shape: "card", color: "#6fb3c7", viewMode: "card", role: "feasibility-filter", content: "Refines readability, tone, hashtags, and call-to-action impact." },
      { id: "node-output", nodeType: "output-box", title: "Ready-to-Publish Campaign", position: { x: 1180, y: 180 }, shape: "hexagon", color: "#8fbf7f", viewMode: "card", content: "Complete content batch formatted for immediate publishing." },
    ],
    edges: [
      { id: "edge-001", source: "node-research", target: "node-copy", edgeType: "flow", label: "research & hooks", line_style: "solid" },
      { id: "edge-002", source: "node-copy", target: "node-review", edgeType: "flow", label: "draft copy", line_style: "solid" },
      { id: "edge-003", source: "node-review", target: "node-output", edgeType: "flow", label: "final copy batch", line_style: "solid" },
    ],
  },
];

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
    /** "failed" (ADR-043): a write that did not land is a state the reader must see, not a silent retry. */
    saveState: "saved" | "saving" | "failed";
  typing: Record<string, boolean>;
  ui: {
    leftTab: "palette" | "files";
    /**
     * Which inspector tab is showing (ADR-015). Session-only: a tab that survived a reload would reopen
     * somebody else's moment of reading, and it is a view of the node rather than a fact about it.
     * `config` carries the editing surface that existed before tabs did — removing it to honour a literal
     * "three tabs" would have deleted the only way to configure a node.
     */
    inspectorTab: "config" | "status" | "diary" | "logs";
    fileViewer: FileViewerState | null;
    historyOpen: boolean;
    settingsOpen: boolean;
    chatNodeId: string | null;
    consoleOpen: boolean;
  /** is the Export/Import panel open? */
    portOpen: boolean;
    /**
     * Both side panels hidden and the console collapsed. Session-only by construction (ADR-009): a focus
     * state written into a file would make the next reader open somebody else's moment of concentration.
     */
    focusMode: boolean;
    /** how far into the Ctrl+K Z chord the user is — drives the TopBar hint, nothing else */
    chordDepth: number;
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

/* Every entry must have an endpoint behind it (`resolveModelRoute`, ADR-008). `glm-4-flash` was removed
   rather than left to 400 and degrade to the simulator: a dropdown that offers a model the app cannot
   reach is the same lie as a validator nobody runs. Adding it back is one row in that table. */
export const MODELS = [DEFAULT_MODEL, "gemini-2.5-flash", "mistral-small-latest", "mistral-large-latest", "ollama:qwen2.5"];

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
  {
    id: "manager",
    name: "Living Canvas Manager",
    description: "An AI Copilot with full access to modify the canvas structure and UI.",
    system_prompt:
      "You are the Manager agent for Living Canvas. You have full access to UI tools (get_ui_state, capture_canvas_snapshot) and graph manipulation tools (create_node, create_edge, etc.). Your job is to listen to the user and dynamically build, route, or restructure the pipeline they need. You act as an executive orchestrator.",
    model: "deepseek-chat",
    tools: ["get_ui_state", "capture_canvas_snapshot", "create_node", "update_node", "delete_node", "create_edge", "update_edge", "delete_edge", "read_memory", "write_memory", "write_output", "get_canvas_overview", "chat_with_user"],
    required_fields: ["summary"],
  },
  {
    id: "builder",
    name: "System Builder",
    description: "An agent that helps the Manager write code or create specific node contents.",
    system_prompt:
      "You are a System Builder agent. You write code, draft node contents, and provide technical outputs based on the Manager's plan.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "technical_plan"],
  },
  {
    id: "project-scout",
    name: "Project & Client Scout",
    description: "Scans freelance project boards and extracts project requirements, budget, and scope",
    system_prompt:
      "You are the \"Project & Client Scout\" agent. Search, scan, and parse freelance opportunities (Upwork, Contra, Freelancer, RemoteOK). Extract client background, budget, required tech stack, deliverables, timeline, and client expectations. Output contains summary, client_brief, and project_requirements.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "client_brief", "project_requirements"],
  },
  {
    id: "feasibility-filter",
    name: "Feasibility & Risk Filter",
    description: "Evaluates project profitability, client credibility, technical fit, and risk score",
    system_prompt:
      "You are the \"Feasibility & Risk Filter\" agent. Evaluate the scouted freelance project. Assess technical difficulty, client payment history/reputation, budget feasibility, and profit margin. Output contains summary, risk_score (1-10), technical_fit, and decision (BID or PASS).",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "risk_score", "technical_fit", "decision"],
  },
  {
    id: "proposal-architect",
    name: "Proposal & Pitch Architect",
    description: "Crafts persuasive, personalized proposals tailored to the client's problem with high conversion rate",
    system_prompt:
      "You are the \"Proposal & Pitch Architect\" agent. Write a compelling, bespoke freelance proposal. Start with an attention-grabbing hook understanding the client's exact problem, follow with the precise solution and tech stack, attach relevant portfolio proof, and present transparent pricing and delivery milestones. Output contains summary, proposal_letter, and portfolio_highlights.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "proposal_letter", "portfolio_highlights"],
  },
  {
    id: "deal-closer",
    name: "Milestone & Deal Closer",
    description: "Formulates project milestones, delivery roadmap, kick-off questions, and closing terms",
    system_prompt:
      "You are the \"Milestone & Deal Closer\" agent. Create a structured project delivery roadmap with milestones, clear acceptance criteria, onboarding checklist, and closing call-to-action to finalize the contract. Output contains summary, delivery_roadmap, and onboarding_checklist.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "delivery_roadmap", "onboarding_checklist"],
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
  "manager": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "manager output",
    description: "The manager's summary of actions taken.",
    type: "object",
    required: ["summary"],
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 20, description: "one paragraph: what actions were taken" },
    },
  },
  "builder": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "builder output",
    description: "The builder's technical output.",
    type: "object",
    required: ["summary", "technical_plan"],
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 20, description: "one paragraph: summary of what was built" },
      technical_plan: { type: "string", minLength: 20, description: "the technical implementation details or code" },
    },
  },
  "project-scout": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "project-scout output",
    description: "Scouted freelance project information and client brief",
    type: "object",
    required: ["summary", "client_brief", "project_requirements"],
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 30, description: "overview of scouted opportunity" },
      client_brief: { type: "string", minLength: 40, description: "client background, budget and timeline" },
      project_requirements: { type: "string", minLength: 40, description: "core tech stack, features and deliverables" },
    },
  },
  "feasibility-filter": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "feasibility-filter output",
    description: "feasibility score, client reputation check, and BID/PASS decision",
    type: "object",
    required: ["summary", "risk_score", "technical_fit", "decision"],
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 30, description: "feasibility analysis overview" },
      risk_score: { type: "integer", minimum: 1, maximum: 10, description: "risk score from 1 to 10" },
      technical_fit: { type: "string", minLength: 20, description: "compatibility with skill set and capacity" },
      decision: { type: "string", minLength: 3, description: "BID or PASS decision with reasoning" },
    },
  },
  "proposal-architect": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "proposal-architect output",
    description: "tailored winning freelance proposal and pitch letter",
    type: "object",
    required: ["summary", "proposal_letter", "portfolio_highlights"],
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 30, description: "proposal strategy summary" },
      proposal_letter: { type: "string", minLength: 80, description: "full personalized proposal text with hook and solution" },
      portfolio_highlights: { type: "string", minLength: 30, description: "relevant proof, past projects and results" },
    },
  },
  "deal-closer": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "deal-closer output",
    description: "milestone schedule, kickoff checklist, and contract closing terms",
    type: "object",
    required: ["summary", "delivery_roadmap", "onboarding_checklist"],
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 30, description: "closing strategy overview" },
      delivery_roadmap: { type: "string", minLength: 50, description: "phased milestone schedule with deliverables" },
      onboarding_checklist: { type: "string", minLength: 30, description: "kickoff questions, access requirements and CTA" },
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
      allowed_read_paths: roleId === "manager" ? ["nodes/", "edges/", "memory/", "outputs/", "logs/", "canvas-overview.md"] : [
        "canvas-overview.md",
        `nodes/${nodeId}.md`,
        `memory/agents/${nodeId}.md`,
        // a fresh agent node may read its predecessors' summaries — but the grant is explicit in the
        // file (one-segment glob), so tightening it is an edit, not a code change (§9)
        "outputs/*/summary.md",
        ...extraRead,
      ],
      allowed_write_paths: roleId === "manager" ? ["nodes/", "edges/", "memory/", "outputs/", "logs/", "canvas-overview.md"] : [`outputs/${nodeId}/`, `memory/agents/${nodeId}.md`, `logs/${nodeId}/`],
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

const envGemini = typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_API_KEY ? String(import.meta.env.VITE_GEMINI_API_KEY).trim() : "";

/**
 * No credential ever lives in the repository (ADR-047). The default is the internal simulator; a real
 * provider is a reader choice — the key is typed into Settings (reader-scoped, never a canvas file) or
 * arrives through the build-time `VITE_GEMINI_API_KEY`. An earlier build hardcoded a Mistral key here and
 * shipped it in git history; that key was removed and rotated on 2026-09-24.
 */
const SETTINGS_BASE: Settings = envGemini ? {
  provider: "gemini", apiKey: envGemini, model: "gemini-2.5-flash", owner: "mahla", simDelay: 620,
  backendUrl: "", workspaceRoot: null, theme: DEFAULT_THEME, snapToGrid: false,
} : {
  provider: "sim", apiKey: "", model: DEFAULT_MODEL, owner: "mahla", simDelay: 620,
  backendUrl: "", workspaceRoot: null, theme: DEFAULT_THEME, snapToGrid: false,
};

/**
 * Settings are the only state that lives in `localStorage` (Law 4's third seam: they are reader-scoped,
 * never canvas content, so Export must not carry them). A blob written by an older build lacks the newer
 * keys, and an unknown theme id must not reach `data-theme`, so both are normalised here rather than
 * trusted downstream.
 */
export const defaultSettings = (): Settings => {
  const stored: Record<string, unknown> = readSettingsLocal() ?? {};
  const merged: Settings = { ...SETTINGS_BASE, ...stored };
  if (!isThemeId(merged.theme)) merged.theme = DEFAULT_THEME;
  merged.snapToGrid = stored.snapToGrid === true;
  return merged;
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
      "## Living Canvas",
      "",
      "A self-building visual programming workspace powered by AI agents.",
      "Open the **Library** to add nodes, or ask the AI in the Chat tab.",
    ].join("\n"),
  });

  const memory = {
    global: makeMemDoc("memory/global.md", "Overall project status",
      "- goal: (describe what you are building)\n- progress: fresh canvas\n- important: the files in this folder are the record of this canvas", 0.5, "system"),
    decisions: makeMemDoc("memory/decisions.md", "Key decisions",
      "- (empty: decisions recorded by a run or by you land here)", 0.5, "system"),
    progress: makeMemDoc("memory/progress.md", "Work in progress",
      "# Done\n- (nothing yet)\n\n# In progress\n- (nothing yet)\n\n# Next\n- Pick a role from the Library and drop it on the canvas", 0.5, "system"),
    user: makeMemDoc("memory/user.md", "User profile",
      `- name: ${owner}\n- working style: (tell the agents once, and they will remember it here)`, 0.6, "user"),
    agents: {},
  };

  const canvas: CanvasMeta = {
    title: "Untitled Canvas",
    owner,
    canvas_type: "agent-pipeline",
    tags: [],
    default_model: DEFAULT_MODEL,
    template_id: "—",
    template_version: "—",
    created_at: t,
    updated_at: t,
    layout: { ...DEFAULT_LAYOUT },
  };

  const n1 = mkNode("node-001", "lc", 150, 150, start);

  return { nodes: [n1] as RFNode[], edges: [] as RFEdge[], memory, canvas };
}
