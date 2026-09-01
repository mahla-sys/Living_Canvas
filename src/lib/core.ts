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
  backendUrl: string;
  /** نام پوشه‌ای که در «حالت پوشه‌ی زنده» باز شده؛ null یعنی IndexedDB محلی. */
  workspaceRoot?: string | null;
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

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** اجرای فوری هر فراخوان معوق — قبل از Export لازم است تا فایل‌ها روی دیسک قطعی باشند. */
  flush(): void;
  pending(): boolean;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let t: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  const run = () => {
    if (t) clearTimeout(t);
    t = null;
    const args = lastArgs;
    lastArgs = null;
    if (args) fn(...args);
  };
  const wrapped = ((...args: A) => {
    lastArgs = args;
    if (t) clearTimeout(t);
    t = setTimeout(run, ms);
  }) as Debounced<A>;
  wrapped.flush = run;
  wrapped.pending = () => t !== null;
  return wrapped;
}

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/* ---------------- path helpers (used by all StorageAdapters) ---------------- */

/**
 * بچه‌های مستقیم یک پوشه از روی فهرست کامل مسیرها.
 * فایل‌ها نامشان برمی‌گردد، پوشه‌ها با «/» انتهایی — همان قراردادی که `hydrate` انتظار دارد.
 * (فیکس باگ §2: نسخهٔ قبلی با فیلتر `!p.includes("/")` آیتم‌های داخل زیرپوشه —
 *  مثل library/templates/<id>/template.json — را دور می‌ریخت و قالب‌های کاربر بعد از رفرش ناپدید می‌شدند.)
 */
export function listChildren(allPaths: Iterable<string>, dir: string): string[] {
  const prefix = dir === "" || dir === "." ? "" : dir.replace(/\/+$/, "") + "/";
  const out = new Set<string>();
  for (const p of allPaths) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    out.add(slash === -1 ? rest : rest.slice(0, slash + 1));
  }
  return [...out].sort();
}

/** یک مسیر نسبی امن برای فایل‌سیستم/باندل؛ `..`، مسیر مطلق و بک‌اسلش را رد می‌کند. */
export function safeRelPath(p: string): string | null {
  const raw = p.trim();
  // مسیر مطلق (posix یا windows) هیچ‌وقت مسیر نسبیِ بوم نیست
  if (raw.startsWith("/") || /^[a-zA-Z]:[\/]/.test(raw)) return null;
  const s = raw.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!s) return null;
  const parts = s.split("/");
  for (const seg of parts) {
    if (seg === "" || seg === "." || seg === ".." || /[<>:"|?*\u0000-\u001f]/.test(seg)) return null;
  }
  return parts.join("/");
}

/* ---------------- text escaping (XSS guard for markdown rendering) ---------------- */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;",
};

/** تمام کاراکترهای معنادار HTML را خنثی می‌کند. هیچ تگی زنده نمی‌ماند. */
export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * رندر inline مارک‌داون — اول escape، بعد قالب‌بندی.
 * چون escape مقدم است، ورودی مخرب (مثل `<img onerror=…>` که AI می‌تواند تولید کند)
 * هرگز به HTML تبدیل نمی‌شود؛ فقط **bold**، _em_ و `code` پشتیبانی می‌شوند.
 */
export function mdInline(raw: string): string {
  const esc = escapeHtml(raw);
  return esc
    .replace(/`([^`\n]+)`/g, "<code class='lc-md-code'>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong class='lc-md-strong'>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,؛:!؟)])/g, "$1<em>$2</em>");
}

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
  // هر رشته‌ای که ممکن است ساختار YAML را بشکند، دابل‌کوت می‌شود و
  // کاراکترهای کنترل به escape تبدیل می‌شوند تا چندخطی‌ماندنی parseYaml نشکند.
  if (/[:#\n"']/.test(s) || s !== s.trim()) {
    const esc = s
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `"${esc}"`;
  }
  return s;
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

/**
 * جدا کردن YAML frontmatter از بدنهٔ Markdown.
 * خروجی null یعنی فایل frontmatter ندارد (فایل ناقص/دست‌نویس).
 */
export function extractFrontmatter(md: string): { yaml: string; body: string } | null {
  const text = String(md);
  const m = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*/.exec(text);
  if (!m) return null;
  // بدنه = باقی‌مانده‌ی فایل (نه گروهِ آخرین newline) — and tolerate the blank line after the fence
  return { yaml: m[1], body: text.slice(m.index + m[0].length).replace(/^\r?\n/, "") };
}

export function nodeToMarkdown(id: string, d: LCNodeData, position?: { x: number; y: number } | null): string {
  const fm: Record<string, unknown> = {
    id,
    type: d.nodeType,
    title: d.title,
    // موقعیت هم در فایل نود نوشته می‌شود تا فایل‌ها مستقل از graph.json قابل بازگردانی باشند (§3.4)
    position: position ? { x: Math.round(position.x), y: Math.round(position.y), z: (position as { z?: number }).z ?? 0 } : "in graph.json",
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
      // پرامپت کامل نوشته می‌شود: فایل نود باید مستقل از graph.json قابل‌بازگردانی باشد (§1.3-۱).
      // نسخهٔ قبلی به ۱۲۰ کاراکتر برش می‌داد و هویت ایجنت در مسیر «فقط فایل‌ها» گم می‌شد.
      system_prompt: d.agent.system_prompt,
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
  /**
   * تمام مسیرهایی که این سشن ساخته‌اند. تضمین می‌کند اگر IndexedDB در میانه‌ی
   * کار از دست برود و به حالت حافظه‌ای بیفتیم، فهرست پوشه‌ها هنوز کامل باشد.
   */
  private seen = new Set<string>();
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
    this.seen.add(path);
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
    return listChildren(await this.allPaths(), dir);
  }

  async deleteFile(path: string): Promise<void> {
    this.cache.del(path);
    this.mem.delete(path);
    this.seen.delete(path);
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
    if (this.useMem) return [...new Set([...this.mem.keys(), ...this.seen])].sort();
    try {
      const st = await this.store();
      const keys = await new Promise<string[]>((resolve, reject) => {
        const r = st.getAllKeys();
        r.onsuccess = () => resolve(r.result.map(String));
        r.onerror = () => reject(r.error);
      });
      // seen را هم add کن تا فایل‌های نوشته‌شده بعد از آخرین flush جا نیفتند
      return [...new Set([...keys, ...this.seen])].sort();
    } catch {
      return [...new Set([...this.mem.keys(), ...this.seen])].sort();
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.mem.clear();
    this.seen.clear();
    if (this.useMem) return;
    const st = await this.store();
    await new Promise<void>((resolve) => {
      const r = st.clear();
      r.onsuccess = () => resolve();
      r.onerror = () => resolve();
    });
  }
}

/* ---------------- server adapter (§5.2 / §7.2 — فاز ۲) ----------------
 * همان رابط StorageAdapter روی HTTP؛ با پر کردن backendUrl در تنظیمات فعال می‌شود.
 * قرارداد endpoints (FastAPI):
 *   GET / PUT / DELETE  {base}/api/canvases/{id}/files/{path}
 *   GET                 {base}/api/canvases/{id}/files?prefix=<dir>/  → JSON string[]
 *   DELETE              {base}/api/canvases/{id}   (بازنشانی کامل بوم)
 */
export class HttpStorageAdapter implements StorageAdapter {
  private cache = new LruCache(120);
  constructor(private base: string, private canvasId: string) {}
  private fileUrl(path: string) {
    return `${this.base.replace(/\/$/, "")}/api/canvases/${this.canvasId}/files/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
  async readFile(path: string): Promise<string> {
    const hit = this.cache.get(path);
    if (hit !== undefined) return hit;
    const res = await fetch(this.fileUrl(path));
    if (!res.ok) throw new Error(`ENOENT: ${path} (${res.status})`);
    const text = await res.text();
    this.cache.set(path, text);
    return text;
  }
  async writeFile(path: string, content: string): Promise<void> {
    this.cache.set(path, content);
    const res = await fetch(this.fileUrl(path), { method: "PUT", body: content });
    if (!res.ok) throw new Error(`write failed: ${path} (${res.status})`);
  }
  /** فهرست خام سرور (مسیرهای کامل) — برای allPaths */
  private async rawList(prefix: string): Promise<string[]> {
    try {
      const res = await fetch(`${this.base.replace(/\/$/, "")}/api/canvases/${this.canvasId}/files?prefix=${encodeURIComponent(prefix)}`);
      if (!res.ok) return [];
      const arr: unknown = await res.json();
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  }
  /** بچه‌های مستقیم یک پوشه؛ سرور ممکن است مسیرهای بازگشتی بدهد پس نرمال می‌کنیم. */
  async listDirectory(dir: string): Promise<string[]> {
    const prefix = dir === "" || dir === "." ? "" : dir.replace(/\/+$/, "") + "/";
    const rel = (await this.rawList(prefix)).map((p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p));
    return listChildren(rel, "");
  }
  async deleteFile(path: string): Promise<void> {
    this.cache.del(path);
    await fetch(this.fileUrl(path), { method: "DELETE" }).catch(() => undefined);
  }
  async exists(path: string): Promise<boolean> {
    if (this.cache.get(path) !== undefined) return true;
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
    return (await this.rawList("")).sort();
  }
  async clear(): Promise<void> {
    this.cache.clear();
    await fetch(`${this.base.replace(/\/$/, "")}/api/canvases/${this.canvasId}`, { method: "DELETE" }).catch(() => undefined);
  }
}

/**
 * آداپتر در حافظه — برای (۱) مرورگرهایی که IndexedDB ندارند یا آن را بلاک کرده،
 * (۲) پیش‌نمایش فایل‌های Import قبل از اعمال، و (۳) تست‌های node.
 * ساختار فایل‌محور را دقیقاً حفظ می‌کند تا listDirectory/hydrate قابل اتکا باشند.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private files = new Map<string, string>();
  constructor(seed?: Record<string, string>) {
    if (seed) for (const [p, c] of Object.entries(seed)) this.files.set(p, c);
  }
  async readFile(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return v;
  }
  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async listDirectory(dir: string): Promise<string[]> {
    return listChildren(this.files.keys(), dir);
  }
  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
  async readJson<T>(path: string): Promise<T> {
    return JSON.parse(await this.readFile(path)) as T;
  }
  async writeJson<T>(path: string, data: T): Promise<void> {
    await this.writeFile(path, JSON.stringify(data, null, 2));
  }
  async allPaths(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }
  async clear(): Promise<void> {
    this.files.clear();
  }
}

/* ---------------- YAML reader ----------------
 * خواننده‌ی block-YAML در همان اندازه‌ای که `toYaml` ما تولید می‌کند:
 * مپ‌های تودرتو، مقادیر اسکالر، و لیست (از جمله لیست آبجکت‌ها).
 * flow-style / anchor / multiline scalar پشتیبانی نمی‌شوند — چون هرگز تولیدشان نمی‌کنیم.
 */
type YamlLine = { indent: number; text: string };

function yamlLines(src: string): YamlLine[] {
  const out: YamlLine[] = [];
  for (const raw of String(src).replace(/\r\n/g, "\n").split("\n")) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    out.push({ indent: raw.match(/^\s*/)![0].length, text: raw.trim() });
  }
  return out;
}

function yamlScalar(v: string): unknown {
  const t = v.trim();
  if (t === "" || t === "null" || t === "~") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const q = t.match(/^(['"])(.*)\1$/);
  if (q) {
    return q[2]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
  }
  return t;
}

/** @returns آبجکت پارس‌شده، یا null اگر ورودی قابل‌خواندن نباشد (فایل دستی/خراب). */
export function parseYaml(src: string): Record<string, unknown> | null {
  try {
    const lines = yamlLines(src);
    if (!lines.length) return {};
    let i = 0;

    const parseMap = (indent: number): Record<string, unknown> => {
      const obj: Record<string, unknown> = {};
      while (i < lines.length && lines[i].indent >= indent) {
        const cur = lines[i];
        if (cur.indent > indent || cur.text.startsWith("- ")) { i++; continue; }
        const m = /^([^:]+):(.*)$/.exec(cur.text);
        if (!m) { i++; continue; }
        const key = m[1].trim().replace(/^['"]|['"]$/g, "");
        const rest = m[2];
        i++;
        if (rest.trim() !== "") { obj[key] = yamlScalar(rest); continue; }
        const nxt = lines[i];
        if (!nxt || nxt.indent <= cur.indent) { obj[key] = null; continue; }
        obj[key] = nxt.text.startsWith("- ") ? parseSeq(nxt.indent) : parseMap(nxt.indent);
      }
      return obj;
    };

    const parseSeq = (indent: number): unknown[] => {
      const arr: unknown[] = [];
      while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith("- ")) {
        const first = lines[i].text.slice(2).trim();
        if (/^[^:]+:(\s|$)/.test(first)) {
          // آیتم آبجکتی: «- key: value» و ادامه‌ی کلیدها با same indent+2
          const obj: Record<string, unknown> = {};
          const colon = first.indexOf(":");
          obj[first.slice(0, colon).trim()] = yamlScalar(first.slice(colon + 1));
          i++;
          const inner = indent + 2;
          while (i < lines.length && lines[i].indent >= inner && !lines[i].text.startsWith("- ")) {
            const m2 = /^([^:]+):(.*)$/.exec(lines[i].text);
            if (m2) obj[m2[1].trim()] = m2[2].trim() === "" ? null : yamlScalar(m2[2]);
            i++;
          }
          arr.push(obj);
        } else {
          arr.push(yamlScalar(first));
          i++;
        }
      }
      return arr;
    };

    return parseMap(lines[0].indent);
  } catch {
    return null;
  }
}

/** استخراج frontmatter یک فایل Markdown (§3.4) و پارس آن. */
export function readFrontmatterYaml(md: string): { yaml: Record<string, unknown> | null; body: string } {
  const fm = extractFrontmatter(md);
  if (!fm) return { yaml: null, body: String(md).trim() };
  return { yaml: parseYaml(fm.yaml), body: fm.body.trim() };
}

/** مرجع پایدار برای سلکتورهای خالی — جلوگیری از حلقه‌ی رندر بی‌نهایت (useSyncExternalStore) */
export const EMPTY_ARR: never[] = [];

/**
 * اگر IndexedDB وجود نداشته باشد (حالت خصوصی Safari / محیط SSR / jsdom بدون polyfill)
 * به آداپتر حافظه‌ای می‌افتیم — وگرنه خطای ساخت در module-load کل بوم را می‌اندازد.
 */
export function createDefaultStorage(dbName = "living-canvas"): StorageAdapter {
  const hasIdb = typeof indexedDB !== "undefined" && indexedDB !== null;
  const hasWin = typeof window !== "undefined" && (window as unknown as { localStorage?: unknown }).localStorage !== undefined;
  try {
    if (hasIdb && hasWin) return new IndexedDBStorageAdapter(dbName);
  } catch { /* fall through */ }
  return new MemoryStorageAdapter();
}

export let storage: StorageAdapter = createDefaultStorage();

/** تعویض زنده‌ی آداپتر — importکننده‌ها به‌لطف live binding نسخه‌ی جدید را می‌بینند */
export function setStorage(s: StorageAdapter) {
  storage = s;
}

/**
 * نام مخزن فعال. در حالت پوشه (`fs`) فایل‌ها روی دیسک‌اند و File Tree
 * باید از خودِ درخت خوانده شود، نه از state.
 */
export function storageMode(): "idb" | "fs" | "http" | "memory" {
  const a = storage;
  if (a instanceof HttpStorageAdapter) return "http";
  const tag = (a as unknown as { adapterKind?: string }).adapterKind;
  if (tag === "fs") return "fs";
  if (a instanceof MemoryStorageAdapter) return "memory";
  return "idb";
}
