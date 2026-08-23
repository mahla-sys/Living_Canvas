/* ============================================================
   Living Canvas — core: types, utils, event bus, serializers,
   StorageAdapter (IndexedDB + LRU cache) — سند معماری v1.3 §5
   ============================================================ */

export type NodeType =
  | "note" | "agent" | "folder" | "output-box"
  | "pipeline-step" | "file" | "shape" | "drawing";

export type ViewMode = "dot" | "name" | "card" | "markdown";
export type ShapeKind = "rectangle" | "circle" | "diamond" | "hexagon" | "card" | "empty";
export type AgentStatus = "idle" | "running" | "done" | "failed" | "waiting";

export interface ContextContract {
  allowed_read_paths: string[];
  allowed_write_paths: string[];
  output_contract: {
    format: string;
    required_fields: string[];
    save_to: string;
  };
}

export interface AgentConfig {
  role_id: string;
  system_prompt: string;
  model: string;
  tools: string[];
  status: AgentStatus;
  max_steps: number;
  max_tokens: number;
  require_approval: boolean;
  context_contract: ContextContract;
}

export interface LCNodeData {
  [key: string]: unknown;
  nodeType: NodeType;
  title: string;
  shape: ShapeKind;
  color: string;
  animation: { type: "breathe" | "pulse" | "none"; speed: number };
  viewMode: ViewMode;
  style: { strokeColor: string; strokeWidth: number; fillStyle: "solid" | "hachure" | "empty"; opacity: number };
  lock: { status: "free" | "locked"; locked_by: string | null; locked_at: string | null };
  content: string;
  agent: AgentConfig | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type EdgeType = "flow" | "relation" | "event-flow" | "blackboard" | "direct-message";

export interface LCEdgeData {
  [key: string]: unknown;
  edgeType: EdgeType;
  label: string;
  line_style: "solid" | "dashed" | "dotted";
  animation: "none" | "flow" | "pulse";
  trigger: { type: "on_completed" | "manual" | "condition"; condition: string };
  config: { communication: "blackboard" | "direct" | "none" };
}

export interface MemDoc {
  path: string;
  title: string;
  body: string;
  updated_at: string;
  last_accessed: string;
  confidence: number;
  source: "system" | "agent" | "user";
}

export interface OutputEntry {
  file: string;
  type: string;
  description: string;
  content: string;
}

export interface ChatMsg {
  role: "user" | "agent" | "system";
  text: string;
  at: string;
}

export interface SnapshotMeta {
  id: string;
  at: string;
  label: string;
  node_count: number;
  edge_count: number;
  status: string;
}

/* ---------------- freehand drawing layer (§2 strokes/) ---------------- */

export interface StrokePoint { x: number; y: number }
export type StrokeTool = "pen" | "highlight";

export interface Stroke {
  id: string;
  canvas_id: string;
  tool: StrokeTool;
  color: string;
  width: number;
  points: StrokePoint[];
  author: string;
  created_at: string;
}

export type BusEventType =
  | "node.created" | "node.updated" | "node.deleted"
  | "edge.created" | "edge.updated" | "edge.deleted"
  | "node.started" | "node.completed" | "node.failed"
  | "run.started" | "run.paused" | "run.resumed" | "run.completed" | "run.stopped"
  | "graph.saved" | "lock.acquired" | "lock.released"
  | "memory.updated" | "output.written" | "snapshot.saved" | "snapshot.restored"
  | "stroke.created" | "stroke.deleted" | "strokes.converted" | "strokes.cleared"
  | "chat.message" | "file.written" | "validation.failed" | "system";

export interface BusEvent {
  id: string;
  type: BusEventType;
  message: string;
  at: string;
}

export interface Toast {
  id: string;
  kind: "info" | "success" | "warn" | "error";
  text: string;
}

export interface Settings {
  provider: "sim" | "deepseek";
  apiKey: string;
  model: string;
  owner: string;
  simDelay: number;
}

export interface ExecutionState {
  run_id: string | null;
  canvas_id: string;
  current_node_id: string | null;
  queue: string[];
  completed: string[];
  context: Record<string, unknown>;
  status: "idle" | "running" | "paused" | "waiting_approval" | "completed" | "failed" | "stopped";
  started_at: string | null;
}

/* ---------------- utils ---------------- */

let seq = 0;
export const uid = (p = "id") =>
  `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const nowIso = () => new Date().toISOString();

export const nowStamp = () =>
  new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

export const fmtClock = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
};

export const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("fa-IR");
  } catch {
    return iso;
  }
};

export const faNum = (n: number) => n.toLocaleString("fa-IR");

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/* ---------------- event bus (§11) ---------------- */

type BusListener = (e: BusEvent) => void;
const listeners = new Set<BusListener>();

export const bus = {
  on(fn: BusListener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(type: BusEventType, message: string) {
    const ev: BusEvent = { id: uid("ev"), type, message, at: nowIso() };
    listeners.forEach((fn) => fn(ev));
    return ev;
  },
};

/* ---------------- mini YAML / markdown serializers ---------------- */

const yv = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  return /[:#\n"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
};

export function toYaml(obj: Record<string, unknown>, indent = 0): string {
  const pad = "  ".repeat(indent);
  let out = "";
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) { out += `${pad}${k}: []\n`; continue; }
      out += `${pad}${k}:\n`;
      for (const item of v) {
        if (item !== null && typeof item === "object") {
          out += `${pad}  - `;
          const lines = toYaml(item as Record<string, unknown>, 0).trimEnd().split("\n");
          out += lines[0] + "\n";
          for (let i = 1; i < lines.length; i++) out += `${pad}    ${lines[i]}\n`;
        } else {
          out += `${pad}  - ${yv(item)}\n`;
        }
      }
    } else if (v !== null && typeof v === "object") {
      out += `${pad}${k}:\n` + toYaml(v as Record<string, unknown>, indent + 1);
    } else {
      out += `${pad}${k}: ${yv(v)}\n`;
    }
  }
  return out;
}

export const frontmatter = (obj: Record<string, unknown>, body: string) =>
  `---\n${toYaml(obj).trimEnd()}\n---\n\n${body.trim()}\n`;

export function nodeToMarkdown(id: string, d: LCNodeData): string {
  const fm: Record<string, unknown> = {
    id,
    type: d.nodeType,
    title: d.title,
    position_note: "position in graph.json",
    shape: d.shape,
    color: d.color,
    animation: { type: d.animation.type, speed: d.animation.speed },
    viewMode: d.viewMode,
    style: { ...d.style },
    metadata: { created_by: d.created_by, created_at: d.created_at, updated_at: d.updated_at },
    lock: { status: d.lock.status, locked_by: d.lock.locked_by, locked_at: d.lock.locked_at },
  };
  if (d.agent) {
    fm.agent = {
      role_id: d.agent.role_id,
      system_prompt: d.agent.system_prompt.slice(0, 120) + (d.agent.system_prompt.length > 120 ? "…" : ""),
      model: d.agent.model,
      tools: d.agent.tools,
      status: d.agent.status,
      max_steps: d.agent.max_steps,
      max_tokens: d.agent.max_tokens,
      require_approval: d.agent.require_approval,
      context_contract: d.agent.context_contract,
    };
  }
  return frontmatter(fm, d.content || `# ${d.title}\n\nمحتوای نود «${d.title}».`);
}

export function edgeToYaml(id: string, source: string, target: string, d: LCEdgeData): string {
  return toYaml({
    id,
    source,
    target,
    type: d.edgeType,
    label: d.label,
    line_style: d.line_style,
    animation: d.animation,
    trigger: d.trigger,
    config: d.config,
  });
}

export function memoryToMd(doc: MemDoc): string {
  return frontmatter(
    {
      path: doc.path,
      updated_at: doc.updated_at,
      last_accessed: doc.last_accessed,
      confidence: doc.confidence,
      source: doc.source,
    },
    `# ${doc.title}\n\n${doc.body}`
  );
}

export const outputsIndexYaml = (nodeId: string, entries: OutputEntry[]) =>
  toYaml({
    node_id: nodeId,
    outputs: entries.map((e) => ({ file: e.file, type: e.type, description: e.description })),
  });

export const chatToMd = (nodeId: string, title: string, msgs: ChatMsg[]) => {
  const lines = msgs.map((m) => {
    const who = m.role === "user" ? "کاربر" : m.role === "agent" ? `ایجنت (${title})` : "سیستم";
    return `## ${who} — ${fmtClock(m.at)}\n\n${m.text}`;
  });
  return frontmatter({ node_id: nodeId, message_count: msgs.length, updated_at: nowIso() }, lines.join("\n\n---\n\n"));
};

export const logText = (lines: string[]) => lines.join("\n") + "\n";

/* ---------------- StorageAdapter (§5) ---------------- */

export interface StorageAdapter {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listDirectory(path: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readJson<T>(path: string): Promise<T>;
  writeJson<T>(path: string, data: T): Promise<void>;
  allPaths(): Promise<string[]>;
  clear(): Promise<void>;
}

class LruCache {
  private map = new Map<string, string>();
  constructor(private max = 80) {}
  get(k: string) {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: string, v: string) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value;
      if (first) this.map.delete(first);
    }
  }
  del(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

export class IndexedDBStorageAdapter implements StorageAdapter {
  private dbp: Promise<IDBDatabase>;
  private cache = new LruCache(80);
  private mem = new Map<string, string>();
  private useMem = false;

  constructor(dbName = "living-canvas") {
    this.dbp = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains("files"))
            req.result.createObjectStore("files", { keyPath: "path" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
    this.dbp.catch(() => { this.useMem = true; });
  }

  private async store(): Promise<IDBObjectStore> {
    const db = await this.dbp;
    return db.transaction("files", "readwrite").objectStore("files");
  }

  async readFile(path: string): Promise<string> {
    const hit = this.cache.get(path);
    if (hit !== undefined) return hit;
    if (this.useMem) {
      const v = this.mem.get(path);
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      this.cache.set(path, v);
      return v;
    }
    const st = await this.store();
    return new Promise((resolve, reject) => {
      const r = st.get(path);
      r.onsuccess = () => {
        const rec = r.result as { path: string; content: string } | undefined;
        if (!rec) return reject(new Error(`ENOENT: ${path}`));
        this.cache.set(path, rec.content);
        resolve(rec.content);
      };
      r.onerror = () => reject(r.error);
    });
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.cache.set(path, content);
    if (this.useMem) { this.mem.set(path, content); return; }
    try {
      const st = await this.store();
      await new Promise<void>((resolve, reject) => {
        const r = st.put({ path, content, updatedAt: nowIso() });
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      });
    } catch {
      this.useMem = true;
      this.mem.set(path, content);
    }
  }

  async listDirectory(dir: string): Promise<string[]> {
    const all = await this.allPaths();
    const prefix = dir === "" || dir === "." ? "" : dir.replace(/\/$/, "") + "/";
    return all
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length))
      .filter((p) => !p.includes("/") || p.indexOf("/") === p.length - 1)
      .filter((p) => p.length > 0);
  }

  async deleteFile(path: string): Promise<void> {
    this.cache.del(path);
    this.mem.delete(path);
    if (this.useMem) return;
    const st = await this.store();
    await new Promise<void>((resolve) => {
      const r = st.delete(path);
      r.onsuccess = () => resolve();
      r.onerror = () => resolve();
    });
  }

  async exists(path: string): Promise<boolean> {
    if (this.cache.get(path) !== undefined || this.mem.has(path)) return true;
    try {
      await this.readFile(path);
      return true;
    } catch {
      return false;
    }
  }

  async readJson<T>(path: string): Promise<T> {
    return JSON.parse(await this.readFile(path)) as T;
  }

  async writeJson<T>(path: string, data: T): Promise<void> {
    await this.writeFile(path, JSON.stringify(data, null, 2));
  }

  async allPaths(): Promise<string[]> {
    if (this.useMem) return [...this.mem.keys()];
    try {
      const st = await this.store();
      return await new Promise((resolve, reject) => {
        const r = st.getAllKeys();
        r.onsuccess = () => resolve(r.result.map(String));
        r.onerror = () => reject(r.error);
      });
    } catch {
      return [...this.mem.keys()];
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.mem.clear();
    if (this.useMem) return;
    const st = await this.store();
    await new Promise<void>((resolve) => {
      const r = st.clear();
      r.onsuccess = () => resolve();
      r.onerror = () => resolve();
    });
  }
}

export const storage: StorageAdapter = new IndexedDBStorageAdapter();
