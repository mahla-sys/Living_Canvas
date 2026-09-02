/* ============================================================
   Living Canvas — core: types, utils, event bus, serializers,
   StorageAdapter (IndexedDB + LRU cache) — architecture doc v1.3 §5
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
    /**
     * Canvas-root-relative path of the schema this output must satisfy, normally
     * `library/schemas/<role>.schema.json`. Declaring one makes validation **hard**: a missing file, an
     * unparsable file, or a field that drifts stops the run (§4.9). `null` means "presence of
     * required_fields only", the escape hatch for hand-made roles.
     */
    validator: string | null;
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
  /** Name of the folder opened in "live folder" mode; null means local IndexedDB. */
  workspaceRoot?: string | null;
  /** Appearance, app-wide. Deliberately not in `canvas.yaml`: how the editor looks is a reader
   *  preference, not canvas content — a shared folder must not carry somebody's theme (docs/ui-spec.md §3). */
  theme: ThemeId;
  /** Snap node positions to `GRID_GAP` on drag end. Off by default: it rewrites `position` in every
   *  node file it touches, so it has to be a choice, not a surprise. */
  snapToGrid: boolean;
}

/* ---------------- appearance tokens ----------------
   A theme is a set of CSS custom properties, never a colour literal in a component: `src/index.css`
   defines the palette under `@theme` and re-maps it under `:root[data-theme="…"]`. Adding a theme is
   one id here + one block there; the test in `theme.test.ts` fails if the two drift apart. */
export const THEME_IDS = ["botanical", "plum"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "botanical";
export const THEMES: { id: ThemeId; label: string; hint: string }[] = [
  { id: "botanical", label: "Botanical", hint: "green-black ink, amber accent — the shipped palette" },
  { id: "plum", label: "Dark plum", hint: "violet background, ink ramp re-tinted so muted text stays readable" },
];
export function isThemeId(v: unknown): v is ThemeId {
  return (THEME_IDS as readonly unknown[]).includes(v);
}

/**
 * Canvas grid pitch in px — one number with two jobs: the visible dot pattern and the snap grid.
 * They must stay equal, because a snap that lands between two dots reads as broken alignment.
 * 26 is what the dots already used; Excalidraw's 20 is only "compatible" with its own grid.
 */
export const GRID_GAP = 26;

/* ---------------- reader-scoped settings — Law 4's third seam (ADR-007) ----------------
   `lc-settings` is the one browser store that is not canvas content: an API key, an owner name, a theme.
   Law 4 only sanctions it because it is *named*, and named means auditable — so there are exactly three
   functions that touch it and every caller goes through them. They live in `core` rather than `store`
   because `state.ts#defaultSettings` sits below `store.ts` (Law 5) and `main.tsx` needs the theme before
   the first paint, i.e. before anything imports the store.

   Before this, the seam was a sentence rather than a contract: `updateSettings` wrote the key too, and
   `main.tsx` read it with its own `getItem`. Two writers meant "what lives in local settings" was answered
   by a grep instead of by a function. */
export const SETTINGS_KEY = "lc-settings";

/** `null` when there is no `localStorage` at all — Safari private mode throws on *access*, not on read. */
function settingsStore(): Storage | null {
  try {
    return typeof localStorage !== "undefined" && localStorage ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * The stored blob, or `null` when nothing is stored, it is not a JSON object, or storage is unavailable.
 * Never throws: a broken settings blob must cost the user a default, not a blank page.
 */
export function readSettingsLocal(): Record<string, unknown> | null {
  const s = settingsStore();
  if (!s) return null;
  try {
    const raw = s.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Merge, never replace (ADR-007): a caller that sets one key must not silently drop the others, which is
 * what a second writer made possible. Returns whether the write landed, so the UI can say so.
 */
export function writeSettingsLocal(patch: Record<string, unknown>): boolean {
  const s = settingsStore();
  if (!s) return false;
  try {
    s.setItem(SETTINGS_KEY, JSON.stringify({ ...(readSettingsLocal() ?? {}), ...patch }));
    return true;
  } catch {
    return false;
  }
}

/** The recovery path's only sanctioned way to forget local settings. */
export function clearSettingsLocal(): void {
  const s = settingsStore();
  if (!s) return;
  try {
    s.removeItem(SETTINGS_KEY);
  } catch { /* nothing to clear */ }
}

/* ---------------- model routing (ADR-008) ----------------
   `agent.model` is an input to execution, not a label on the card. The provider is derived from the model
   *name* rather than from a second setting, because two sources for "where does this request go" is the
   same shape of bug that made `graph.json` a cache competing with the node files.

   A model with no endpoint must not sit in `MODELS`: routing it anywhere would answer with a 400 that
   degrades to the simulator, which reads to the user as "the model ignored me". That is why `glm-4-flash`
   left the list instead of gaining a placeholder URL (docs/ARCHITECTURE.md §9.1). */
export const DEEPSEEK_BASE = "https://api.deepseek.com";
export const OLLAMA_BASE = "http://127.0.0.1:11434";
export const DEFAULT_MODEL = "deepseek-chat";

export interface ModelRoute {
  /** an OpenAI-compatible chat-completions endpoint */
  endpoint: string;
  /** the model name as the provider expects it — an `ollama:` prefix is ours, so it is stripped */
  model: string;
  provider: "deepseek" | "ollama";
}

/** Pure, so the routing table is testable without a network (`model-route.test.ts`). */
export function resolveModelRoute(id: string | null | undefined, fallback?: string | null): ModelRoute {
  const wanted = String(id ?? "").trim();
  const name = wanted || String(fallback ?? "").trim() || DEFAULT_MODEL;
  if (name.startsWith("ollama:")) {
    const local = name.slice("ollama:".length).trim();
    return { endpoint: `${OLLAMA_BASE}/v1/chat/completions`, model: local || "llama3.2", provider: "ollama" };
  }
  return { endpoint: `${DEEPSEEK_BASE}/chat/completions`, model: name, provider: "deepseek" };
}

/* ---------------- panel layout (ADR-009) ----------------
   Panel widths are canvas *content*: they live under `layout:` in `canvas.yaml` and come back on hydrate,
   because "how wide is the inspector on this graph" is part of how the graph is read, exactly like
   `position`. Focus mode is the opposite — a moment of work, like `lock` (Law 3) — and no file carries it.

   Everything a hand-edited `canvas.yaml` could get wrong is clamped here, at the reader, so a stray
   `leftWidth: 9000` cannot push the canvas off screen. */
export interface CanvasLayout {
  leftWidth: number;
  rightWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
}
export const PANEL_MIN = 200;
export const PANEL_MAX = 520;
export const PANEL_DEFAULT_LEFT = 268;
export const PANEL_DEFAULT_RIGHT = 292;
/** the status strip along the bottom: tall enough for one line of 9.5px type, short enough to not cost canvas */
export const STATUS_BAR_HEIGHT = 22;

/** `true` only for a finite number — `Number.isFinite` rejects `NaN`, `Infinity` and the string `"300"`.
 *  Note the argument order: `clamp(value, min, max)` (src/lib/core.ts#clamp), which `tsc` cannot check for
 *  you because all three are `number`. */
const num = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : dflt;

/** Coerce anything read out of a YAML file into a layout the UI can trust. Never throws. */
export function normalizeLayout(v: unknown, dflt?: Partial<CanvasLayout>): CanvasLayout {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const dl = dflt ?? { leftWidth: PANEL_DEFAULT_LEFT, rightWidth: PANEL_DEFAULT_RIGHT };
  return {
    leftWidth: num(o.leftWidth, PANEL_MIN, PANEL_MAX, num(dl.leftWidth, PANEL_MIN, PANEL_MAX, PANEL_DEFAULT_LEFT)),
    rightWidth: num(o.rightWidth, PANEL_MIN, PANEL_MAX, num(dl.rightWidth, PANEL_MIN, PANEL_MAX, PANEL_DEFAULT_RIGHT)),
    // an absent key is *open*: a hand-written canvas.yaml that never heard of layout must not hide a panel
    leftOpen: o.leftOpen === undefined ? true : o.leftOpen !== false,
    rightOpen: o.rightOpen === undefined ? true : o.rightOpen !== false,
  };
}

/* ---------------- keyboard sequences ----------------
   Pure state machines, so the two multi-key shortcuts are testable without a DOM: a chord (Ctrl+K then Z,
   the focus-mode toggle) and a double tap (Escape twice, the way back out — one Escape is taken by
   in-place editing and by the modals, so leaving focus mode must not steal it). */

/** Feed one key per keydown; returns `true` exactly once, on the key that completes the sequence. */
export function createChord(keys: readonly string[], windowMs = 1500) {
  let at = 0;
  let last = Number.NEGATIVE_INFINITY;
  return {
    push(key: string, t: number): boolean {
      if (t - last > windowMs) at = 0; // the previous partial press has expired
      last = t;
      const k = key.toLowerCase();
      if (k === keys[at]) {
        at += 1;
        if (at >= keys.length) {
          at = 0;
          return true;
        }
        return false;
      }
      // a wrong key restarts rather than merely failing, so "k, x, k, z" still fires
      at = k === keys[0] ? 1 : 0;
      return false;
    },
    reset(): void {
      at = 0;
      last = Number.NEGATIVE_INFINITY;
    },
    /** how far into the sequence the next key is expected — the TopBar hint reads this */
    get depth(): number {
      return at;
    },
  };
}

/** Two presses inside `windowMs`. The second press reports `true` and both are then forgotten. */
export function createDoubleTap(windowMs = 400) {
  let last = Number.NEGATIVE_INFINITY;
  return {
    push(t: number): boolean {
      const hit = t - last <= windowMs;
      last = hit ? Number.NEGATIVE_INFINITY : t;
      return hit;
    },
    reset(): void {
      last = Number.NEGATIVE_INFINITY;
    },
  };
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
  /**
   * nodeId → why that node just failed, for the band on the card. Run-scoped and never written into the
   * node file: an error is a moment of execution, not data (Law 3), and the durable record already
   * exists in `logs/<node>/` and `runs/<run-id>.md`.
   */
  errors: Record<string, string>;
}

/* ---------------- utils ---------------- */

let seq = 0;
export const uid = (p = "id") =>
  `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const nowIso = () => new Date().toISOString();

export const nowStamp = () =>
  new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/** HH:MM:SS on the local clock. en-GB + h23: no Persian digits, no AM/PM. */
export const fmtClock = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  } catch {
    return iso;
  }
};

/** ISO calendar date (YYYY-MM-DD) — sortable and locale-free. */
export const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
};

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Run every pending call now — required before an Export so files on disk are final. */
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
 * Direct children of a folder, derived from the full path list.
 * Files come back bare, directories with a trailing "/" — exactly what `hydrate` expects.
 * (Fix for the §2 bug: the previous version filtered with `!p.includes("/")`, dropping entries
 *  inside subfolders — e.g. library/templates/<id>/template.json — so user templates vanished on refresh.)
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

/** A safe relative path for the file system / a bundle; rejects "..", absolute paths and backslashes. */
export function safeRelPath(p: string): string | null {
  const raw = p.trim();
  // an absolute path (posix or windows) is never a canvas-relative path
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

/** Neutralises every HTML-significant character. No tag survives. */
export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Inline markdown rendering — escape first, format second.
 * Because escaping happens first, hostile input (e.g. `<img onerror=…>` from a model)
 * can never become HTML; only **bold**, _em_ and `code` are supported.
 */
export function mdInline(raw: string): string {
  const esc = escapeHtml(raw);
  return esc
    .replace(/`([^`\n]+)`/g, "<code class='lc-md-code'>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong class='lc-md-strong'>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?\)])/g, "$1<em>$2</em>");
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

/**
 * A string is written bare only when reading it back yields the same value.
 * Anything a real YAML parser would re-interpret — a leading indicator, ": ", " #",
 * flow characters, or a number/boolean/null-shaped word — is double-quoted. That is
 * what keeps these files readable by other tools (Obsidian, yamllint, CI YAML checks)
 * and keeps parseYaml(toYaml(x)) an identity for strings such as "1.0" or "{{ a < 7 }}".
 */
const yvNeedsQuotes = (s: string): boolean =>
  s !== s.trim() ||
  /[:#\n"']/.test(s) ||
  /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
  /[{}[\],]/.test(s) ||
  /^(?:null|~|true|false|yes|no|on|off|\.inf|\.nan)$/i.test(s) ||
  /^-?\d+(\.\d+)?$/.test(s);

const yv = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  // control characters are escaped so a multiline value still round-trips through parseYaml.
  if (yvNeedsQuotes(s)) {
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
 * Split YAML frontmatter from the Markdown body.
 * A null result means the file has no frontmatter (partial / hand-written file).
 */
export function extractFrontmatter(md: string): { yaml: string; body: string } | null {
  const text = String(md);
  const m = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*/.exec(text);
  if (!m) return null;
  // body = the rest of the file (not the last-newline capture group) — and tolerate the blank line after the fence
  return { yaml: m[1], body: text.slice(m.index + m[0].length).replace(/^\r?\n/, "") };
}

export function nodeToMarkdown(id: string, d: LCNodeData, position?: { x: number; y: number } | null): string {
  const fm: Record<string, unknown> = {
    id,
    type: d.nodeType,
    title: d.title,
    // position is written into the node file too, so files stay restorable without graph.json (§3.4)
    // position lives here and nowhere else: graph.json was removed as a second source of truth (§4.11)
    position: position ? { x: Math.round(position.x), y: Math.round(position.y), z: (position as { z?: number }).z ?? 0 } : { x: 0, y: 0, z: 0 },
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
      // the full prompt is written: the node file must be restorable on its own, without graph.json (§1.3-1).
      // the previous version truncated to 120 characters and lost the agent identity in the files-only path.
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
  return frontmatter(fm, d.content || `# ${d.title}\n\nNode content for "${d.title}".`);
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
    const who = m.role === "user" ? "User" : m.role === "agent" ? `Agent (${title})` : "System";
    return `## ${who} — ${fmtClock(m.at)}\n\n${m.text}`;
  });
  return frontmatter({ node_id: nodeId, message_count: msgs.length, updated_at: nowIso() }, lines.join("\n\n---\n\n"));
};

export const logText = (lines: string[]) => lines.join("\n") + "\n";

/* ---------------- output schemas (§4.9) ---------------- */

export interface SchemaField {
  type?: "string" | "number" | "integer" | "boolean";
  description?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enum?: unknown[];
}

export interface OutputSchema {
  $schema?: string;
  title?: string;
  description?: string;
  type?: "object";
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, SchemaField>;
}

/**
 * The keywords this app understands. Anything else in a schema is reported, not skipped: a validator that
 * quietly ignored `oneOf` would pass output the schema forbids, which is worse than having no validator at
 * all, because it is trusted. Listing the subset here is what lets a test pin the promise.
 */
export const SUPPORTED_SCHEMA_KEYWORDS = [
  "$schema", "title", "description", "type", "required", "additionalProperties", "properties",
];
export const SUPPORTED_FIELD_KEYWORDS = ["type", "description", "minLength", "maxLength", "minimum", "maximum", "pattern", "enum"];

/**
 * Validates a node's output fields against a schema and returns human-readable failures (empty ⇒ valid).
 *
 * Field values arrive as strings, because output files are Markdown. A schema that declares a numeric type
 * is therefore read as "this field must be nothing but a number" — which is exactly what makes a conditional
 * edge like `{{ risk_score < 7 }}` meaningful instead of decorative.
 */
export function validateAgainstSchema(fields: Record<string, string>, schema: OutputSchema): string[] {
  const errors: string[] = [];
  if (schema.type !== undefined && schema.type !== "object")
    return [`the schema root must be an object (found ${JSON.stringify(schema.type)})`];

  for (const key of Object.keys(schema))
    if (!SUPPORTED_SCHEMA_KEYWORDS.includes(key)) errors.push(`unsupported keyword “${key}” in the schema — refusing to ignore it`);
  for (const [name, rule] of Object.entries(schema.properties ?? {}))
    for (const k of Object.keys(rule))
      if (!SUPPORTED_FIELD_KEYWORDS.includes(k))
        errors.push(`unsupported keyword “${name}.${k}” in the schema — refusing to ignore it`);

  for (const f of schema.required ?? []) {
    const v = fields[f];
    if (v === undefined || String(v).trim() === "") errors.push(`“${f}” is required by the contract and came back empty`);
  }
  const declared = new Set(Object.keys(schema.properties ?? {}));
  if (schema.additionalProperties === false)
    for (const f of Object.keys(fields))
      if (!declared.has(f)) errors.push(`“${f}” is not declared in the schema (additionalProperties: false)`);

  for (const [name, rule] of Object.entries(schema.properties ?? {})) {
    const raw = fields[name];
    if (raw === undefined || String(raw).trim() === "") continue; // presence handled above
    const value = String(raw);
    const type = rule.type ?? "string";

    if (type === "integer" || type === "number") {
      const trimmed = value.trim();
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
        errors.push(`“${name}” must be ${type === "integer" ? "an integer" : "a number"}, got ${JSON.stringify(trimmed.slice(0, 40))}`);
        continue;
      }
      const n = Number(trimmed);
      if (type === "integer" && !Number.isInteger(n)) {
        errors.push(`“${name}” must be an integer, got ${n}`);
        continue;
      }
      if (rule.minimum !== undefined && n < rule.minimum) errors.push(`“${name}” = ${n} is below the minimum ${rule.minimum}`);
      if (rule.maximum !== undefined && n > rule.maximum) errors.push(`“${name}” = ${n} is above the maximum ${rule.maximum}`);
      continue;
    }
    if (type === "boolean" && !["true", "false", "yes", "no"].includes(value.trim().toLowerCase())) {
      errors.push(`“${name}” must be a boolean, got ${JSON.stringify(value.trim().slice(0, 40))}`);
      continue;
    }
    const text = value.trim();
    if (rule.minLength !== undefined && text.length < rule.minLength)
      errors.push(`“${name}” is ${text.length} characters, the schema needs at least ${rule.minLength}`);
    if (rule.maxLength !== undefined && text.length > rule.maxLength)
      errors.push(`“${name}” is ${text.length} characters, the schema allows at most ${rule.maxLength}`);
    if (rule.enum && !rule.enum.map(String).includes(text))
      errors.push(`“${name}” = ${JSON.stringify(text)} is not one of ${rule.enum.map((e) => JSON.stringify(String(e))).join(", ")}`);
    if (rule.pattern) {
      let re: RegExp;
      try {
        re = new RegExp(rule.pattern);
      } catch {
        errors.push(`“${name}” declares an invalid pattern in the schema: ${rule.pattern}`);
        continue;
      }
      if (!re.test(text)) errors.push(`“${name}” does not match the required pattern /${rule.pattern}/`);
    }
  }
  return errors;
}

/** A schema file is only trusted if it is one JSON object; anything else is a loud failure. */
export function parseOutputSchema(text: string): { ok: true; schema: OutputSchema } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `not valid JSON: ${String(err).slice(0, 120)}` };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "the schema file must contain one JSON object" };
  return { ok: true, schema: data as OutputSchema };
}

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
   * Every path this session wrote. Guarantees that if IndexedDB is lost mid-session
   * and we fall back to the memory adapter, the directory listings are still complete.
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
      // add to seen as well, so files written after the last flush are not dropped
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

/* ---------------- server adapter (§5.2 / §7.2 — phase 2) ----------------
 * The same StorageAdapter interface over HTTP; enabled by filling in backendUrl in Settings.
 * Endpoint contract (FastAPI):
 *   GET / PUT / DELETE  {base}/api/canvases/{id}/files/{path}
 *   GET                 {base}/api/canvases/{id}/files?prefix=<dir>/  → JSON string[]
 *   DELETE              {base}/api/canvases/{id}   (full canvas reset)
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
  /** raw server listing (full paths) — backs allPaths */
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
  /** direct children of a folder; a server may return full paths, so we normalise */
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
 * In-memory adapter — for (1) browsers without IndexedDB (or with it blocked),
 * (2) previewing Import files before applying them, and (3) node tests.
 * It preserves the file-first structure exactly, so listDirectory/hydrate stay trustworthy.
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
 * A block-YAML reader scoped to exactly what our `toYaml` produces:
 * nested maps, scalars and lists (including lists of objects).
 * flow style / anchors / multiline scalars are unsupported — we never emit them.
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
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
  }
  return t;
}

/** @returns the parsed object, or null if the input is not readable (hand-written / broken file). */
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
          // object item: "- key: value", with following keys at the same indent+2
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

/** Read and parse the frontmatter of a node Markdown file (§3.4). */
export function readFrontmatterYaml(md: string): { yaml: Record<string, unknown> | null; body: string } {
  const fm = extractFrontmatter(md);
  if (!fm) return { yaml: null, body: String(md).trim() };
  return { yaml: parseYaml(fm.yaml), body: fm.body.trim() };
}

/** Stable reference for empty selectors — avoids an infinite render loop (useSyncExternalStore) */
export const EMPTY_ARR: never[] = [];

/**
 * If IndexedDB is missing (Safari private mode / SSR / jsdom without a polyfill)
 * we fall back to the memory adapter — otherwise a constructor error at module load
 * would take the whole canvas down.
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

/** Live swap of the adapter — importers see the new one thanks to ESM live bindings */
export function setStorage(s: StorageAdapter) {
  storage = s;
}

/**
 * Name of the active store. In folder mode (`fs`) the files live on disk and the File Tree
 * must read the tree itself, not the state.
 */
export function storageMode(): "idb" | "fs" | "http" | "memory" {
  const a = storage;
  if (a instanceof HttpStorageAdapter) return "http";
  const tag = (a as unknown as { adapterKind?: string }).adapterKind;
  if (tag === "fs") return "fs";
  if (a instanceof MemoryStorageAdapter) return "memory";
  return "idb";
}
