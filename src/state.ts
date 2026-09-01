/* ============================================================
   Living Canvas — AppState, factories, roles, seed data
   ============================================================ */
import type { Node, Edge } from "@xyflow/react";
import type {
  LCNodeData, LCEdgeData, NodeType, ShapeKind, ViewMode,
  AgentConfig, MemDoc, Settings, ExecutionState, BusEvent, Toast,
  OutputEntry, ChatMsg, SnapshotMeta, EdgeType, Stroke,
} from "./lib/core";

export const APP_VERSION = "0.1.0"; // انتشار v0.1 — پایان رسمی فاز ۱ سند معماری 1.3
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
  name: "خط لوله‌ی سریع",
  description: "چهار مرحله: فهم مسئله ← تحلیل ریسک ← طراحی راه‌حل ← جمع‌بندی",
  version: "1.0",
  nodes: [
    { id: "tpl-001", nodeType: "agent", title: "فهم مسئله", position: { x: 80, y: 220 }, role: "understander", content: "مسئله را از ابهام بیرون بکش." },
    { id: "tpl-002", nodeType: "agent", title: "تحلیل ریسک", position: { x: 440, y: 60 }, role: "risk-analyst", content: "ریسک‌ها را امتیازدهی کن." },
    { id: "tpl-003", nodeType: "agent", title: "طراحی راه‌حل", position: { x: 800, y: 220 }, role: "solution-designer", content: "راه‌حل اجرایی در سه گام." },
    { id: "tpl-004", nodeType: "agent", title: "جمع‌بندی", position: { x: 1160, y: 60 }, role: "decision-maker", content: "تصمیم نهایی با تأیید انسانی." },
    { id: "tpl-005", nodeType: "output-box", title: "خروجی نهایی", position: { x: 1500, y: 220 }, content: "سند تحویل این‌جا جمع می‌شود." },
  ],
  edges: [
    { id: "tpl-e1", source: "tpl-001", target: "tpl-002", label: "بیان مسئله" },
    { id: "tpl-e2", source: "tpl-002", target: "tpl-003", label: "گزارش ریسک" },
    { id: "tpl-e3", source: "tpl-003", target: "tpl-004", label: "پیشنهاد راه‌حل" },
    { id: "tpl-e4", source: "tpl-004", target: "tpl-005", label: "تصمیم نهایی" },
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
    /** پنجره‌ی Export/Import باز است؟ */
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
  agent: "ایجنت",
  note: "یادداشت",
  "output-box": "جعبه خروجی",
  folder: "پوشه",
  "pipeline-step": "گام خط لوله",
  file: "فایل",
  shape: "شکل",
  drawing: "نقاشی",
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
    name: "فهم مسئله",
    description: "گفتگو با کاربر برای شفاف‌سازی مسئله و استخراج بیان دقیق آن",
    system_prompt:
      "تو ایجنت «فهم مسئله» هستی. مأموریت تو این است که با خواندن خلاصه‌ی بوم و حافظه‌ی خودت، مسئله‌ی اصلی را شفاف کنی. همیشه اول سؤال‌های مبهم را فهرست کن، سپس بیان مسئله را در یک پاراگراف دقیق بنویس. خروجی تو باید شامل summary، problem_statement و questions_asked باشد.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "chat_with_user", "write_output"],
    required_fields: ["summary", "problem_statement", "questions_asked"],
  },
  {
    id: "risk-analyst",
    name: "تحلیل ریسک",
    description: "شناسایی ریسک‌های راه‌حل پیشنهادی و امتیازدهی به آن‌ها",
    system_prompt:
      "تو ایجنت «تحلیل ریسک» هستی. ورودی تو بیان مسئله از نود قبلی است. ریسک‌های اصلی را فهرست کن، به هرکدام امتیاز ۱ تا ۱۰ بده و یک تصمیم کلی (رد / اصلاح / تأیید) پیشنهاد کن. خروجی شامل summary، risks و decision است.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "risks", "decision"],
  },
  {
    id: "solution-designer",
    name: "طراحی راه‌حل",
    description: "طراحی راه‌حل اجرایی با گام‌های مشخص و قابل اندازه‌گیری",
    system_prompt:
      "تو ایجنت «طراحی راه‌حل» هستی. با توجه به مسئله و گزارش ریسک، یک راه‌حل اجرایی در سه گام طراحی کن. هر گام باید خروجی مشخص و معیار موفقیت داشته باشد. خروجی شامل summary، solution و next_actions است.",
    model: "deepseek-chat",
    tools: ["read_memory", "write_memory", "write_output"],
    required_fields: ["summary", "solution", "next_actions"],
  },
  {
    id: "decision-maker",
    name: "جمع‌بندی و تصمیم",
    description: "جمع‌بندی همه‌ی خروجی‌ها و پیشنهاد تصمیم نهایی با تأیید انسانی",
    system_prompt:
      "تو ایجنت «جمع‌بندی و تصمیم» هستی. همه‌ی خروجی‌های مجاز را بخوان، تعارض‌ها را مشخص کن و یک تصمیم نهایی با دلایل آن بنویس. تصمیم نهایی فقط بعد از تأیید انسانی اجرا می‌شود. خروجی شامل summary، decision و approval_request است.",
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
  { nodeType: "agent", label: "ایجنت", desc: "نود هوشمند با نقش، قرارداد زمینه و حافظه", shape: "card", viewMode: "card" },
  { nodeType: "note", label: "یادداشت", desc: "متن آزاد مارک‌داون روی بوم", shape: "rectangle", viewMode: "markdown" },
  { nodeType: "output-box", label: "جعبه خروجی", desc: "جمع‌آوری خروجی مشترک چند نود", shape: "hexagon", viewMode: "card" },
  { nodeType: "pipeline-step", label: "گام خط لوله", desc: "مرحله‌ی اجرایی بدون عامل", shape: "rectangle", viewMode: "name" },
  { nodeType: "folder", label: "پوشه", desc: "گروه‌بندی بصری نودها", shape: "rectangle", viewMode: "name" },
  { nodeType: "shape", label: "شکل آزاد", desc: "لوزی، دایره، شش‌ضلعی…", shape: "diamond", viewMode: "name" },
];

/* ---------------- seed content ---------------- */

export function buildSeed(owner: string) {
  const t = iso();

  const mkNode = (id: string, type: string, x: number, y: number, data: RFNode["data"]): RFNode =>
    ({ id, type, position: { x, y }, data } as RFNode);

  const note = makeNodeData("note", "هدف بوم", owner, {
    color: "#6fb3c7",
    shape: "rectangle",
    content:
      "## هدف\n\nطراحی یک **مدرسه‌ی آنلاین هوشمند** برای دانش‌آموزان ۱۲ تا ۱۵ سال.\n\n### چارچوب\n- مسئله از نگاه دانش‌آموز تعریف شود\n- ریسک‌های آموزشی و فنی قبل از طراحی سنجیده شود\n- تصمیم نهایی فقط با تأیید انسانی اجرا می‌شود",
  });

  const a1 = makeNodeData("agent", "فهم مسئله", owner, {
    agent: makeAgentConfig("node-001", "understander"),
    content: "نخستین ایجنت خط لوله؛ مسئله را از ابهام بیرون می‌کشد.",
  });
  const a2 = makeNodeData("agent", "تحلیل ریسک", owner, {
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
  const a3 = makeNodeData("agent", "طراحی راه‌حل", owner, {
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
  const a4 = makeNodeData("agent", "جمع‌بندی و تصمیم", owner, {
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
  const box = makeNodeData("output-box", "خروجی نهایی", owner, {
    content: "تصمیم نهایی و سند تحویل در این جعبه جمع می‌شود.",
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
    mkEdge("edge-001", "note-001", "node-001", makeEdgeData({ edgeType: "relation", label: "ارجاع هدف", line_style: "dotted", animation: "none" })),
    mkEdge("edge-002", "node-001", "node-002", makeEdgeData({ label: "بیان مسئله" })),
    mkEdge("edge-003", "node-002", "node-003", makeEdgeData({ label: "گزارش ریسک", trigger: { type: "condition", condition: "{{ risk_score < 7 }}" } })),
    mkEdge("edge-004", "node-003", "node-004", makeEdgeData({ label: "پیشنهاد راه‌حل" })),
    mkEdge("edge-005", "node-004", "box-001", makeEdgeData({ label: "تصمیم نهایی", animation: "pulse" })),
  ];

  const agents: Record<string, MemDoc> = {};
  for (const [nid, rid] of [["node-001", "understander"], ["node-002", "risk-analyst"], ["node-003", "solution-designer"], ["node-004", "decision-maker"]] as const) {
    agents[nid] = makeMemDoc(
      `memory/agents/${nid}.md`,
      `حافظه‌ی ایجنت ${roleById(rid).name}`,
      `- آخرین ورودی‌ها: هنوز اجرا نشده\n- تصمیم‌های گرفته‌شده: —\n- نکات مهم برای اجرای بعدی: قرارداد زمینه را قبل از خواندن هر فایل بررسی کن.`,
      0.7,
      "agent"
    );
  }

  const memory = {
    global: makeMemDoc("memory/global.md", "وضعیت کلی پروژه",
      "- هدف: طراحی مدرسه‌ی آنلاین هوشمند برای نوجوانان ۱۲ تا ۱۵ سال\n- پیشرفت: ساختار بوم آماده، خط لوله‌ی ۴ مرحله‌ای تعریف شده\n- نکات مهم: تصمیم نهایی بدون تأیید انسانی اجرا نمی‌شود", 0.9, "system"),
    decisions: makeMemDoc("memory/decisions.md", "تصمیم‌های مهم",
      `- [${t.slice(0, 10)}] معماری: فایل‌محور با StorageAdapter روی IndexedDB\n- [${t.slice(0, 10)}] موتور اجرا: State Machine سبک در فاز ۱، LangGraph در فاز ۲\n- [${t.slice(0, 10)}] حافظه: دو سطحی (سراسری + اختصاصی ایجنت)`, 0.8, "system"),
    progress: makeMemDoc("memory/progress.md", "پیشرفت کار",
      "# کارهای انجام‌شده\n- ساخت بوم و تعریف ایجنت‌ها\n\n# در حال انجام\n- آماده‌سازی برای اولین اجرا\n\n# بعدی\n- اجرای خط لوله و جمع‌بندی", 0.8, "system"),
    user: makeMemDoc("memory/user.md", "نمایه‌ی کاربر",
      `- نام: ${owner}\n- سبک کاری: بصری، علاقه‌مند به جزئیات معماری\n- ترجیح: خروجی‌های کوتاه و ساختاریافته`, 0.85, "user"),
    agents,
  };

  const canvas: CanvasMeta = {
    title: "مدرسه‌ی هوشمند نِکسوس",
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
