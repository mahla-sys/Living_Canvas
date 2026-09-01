/* ============================================================
   Living Canvas — portability (Export/Import)
   هر دو مسیر «فایل‌محور» هستند: باندل JSON دقیقاً همان فایل‌های §2 را
   حمل می‌کند، نه یک state داخلی. Import هم اگر graph.json/state.json را
   نداشته باشد، بوم را از nodes/*.md + edges/*.yaml + memory/*.md می‌سازد.
   ============================================================ */
import { storage, uid, nowIso, safeRelPath, extractFrontmatter, parseYaml, type StorageAdapter, type MemDoc } from "./core";
import { ROOT, CANVAS_ID, APP_VERSION, makeNodeData, makeEdgeData } from "../state";
import type { LCNodeData, LCEdgeData, NodeType, ShapeKind, ViewMode } from "./core";

export const BUNDLE_KIND = "living-canvas-export";
export const BUNDLE_VERSION = 1;
/** سقف ایمن برای حجم باندل — از قفل‌شدن تب با فایل چندصد‌مگابایتی جلوگیری می‌کند. */
export const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;

export interface CanvasBundle {
  kind: string;
  version: number;
  app_version: string;
  structure_version: string;
  canvas_id: string;
  exported_at: string;
  /** کلید = مسیر منطقی کامل (`canvases/<id>/nodes/node-001.md`) */
  files: Record<string, string>;
  stats: { files: number; bytes: number };
}

export type CanvasFiles = Record<string, string>;

/* ---------------- collect ---------------- */

/** همه‌ی فایل‌های بوم را از StorageAdapter فعلی برمی‌دارد (§2). */
export async function collectCanvasFiles(
  opts?: { excludeRuntime?: boolean; adapter?: StorageAdapter; filter?: (path: string) => boolean }
): Promise<CanvasFiles> {
  const store = opts?.adapter ?? storage;
  const out: CanvasFiles = {};
  const paths = await store.allPaths();
  for (const p of paths) {
    if (!p.startsWith(ROOT + "/")) continue;
    if (opts?.filter && !opts.filter(p)) continue;   // بودجه‌ی خواندن در boot
    const isRuntimeCache = p === `${ROOT}/graph.json` || p === `${ROOT}/state.json`;
    if (opts?.excludeRuntime && isRuntimeCache) continue;
    try {
      const text = await store.readFile(p);
      out[p] = text;
    } catch {
      /* فایل خوانده نشد — همان‌طور که hydrate رد می‌کند */
    }
  }
  return out;
}

/* ---------------- build / parse (pure — testable) ---------------- */

export function buildBundle(files: CanvasFiles, canvasId = CANVAS_ID): CanvasBundle {
  const clean: CanvasFiles = {};
  for (const [p, c] of Object.entries(files)) {
    const rel = safeRelPath(p);
    if (!rel) continue;
    clean[rel] = typeof c === "string" ? c : String(c);
  }
  const bytes = Object.values(clean).reduce((n, c) => n + c.length, 0);
  return {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    app_version: APP_VERSION,
    structure_version: "1.3",
    canvas_id: canvasId,
    exported_at: nowIso(),
    files: clean,
    stats: { files: Object.keys(clean).length, bytes },
  };
}

export interface ParseResult {
  ok: boolean;
  files: CanvasFiles;
  canvasId: string | null;
  title: string | null;
  /** مسیرهای رد شده (ناامن یا بیرون از ریشه) */
  skipped: { path: string; reason: string }[];
  error?: string;
  source: "bundle" | "raw-files";
}

/** ریشه‌ی مورد انتظار فایل‌ها؛ اگر باندل بدون پیشوند ساخته شده، خودمان وصل می‌کنیم. */
function normalizePath(p: string): { path: string | null; reason?: string } {
  const rel = safeRelPath(p);
  if (!rel) return { path: null, reason: "مسیر نامعتبر یا خطرناک (.. / مطلق / کاراکتر ممنوع)" };
  if (rel === ROOT || rel.startsWith(ROOT + "/")) return { path: rel };
  if (rel.startsWith("canvases/")) return { path: null, reason: "مربوط به بوم دیگری است" };
  return { path: `${ROOT}/${rel}` };
}

export function parseBundleText(text: string): ParseResult {
  const empty: ParseResult = { ok: false, files: {}, canvasId: null, title: null, skipped: [], source: "bundle" };
  const trimmed = text.trim();
  if (!trimmed) return { ...empty, error: "فایل خالی است" };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ...empty, error: "این JSON معتبر نیست — فایل .livingcanvas.json را انتخاب کنید" };
  }

  // حالت ۲: کاربر مستقیماً خروجی `cat files.json` یا باندلِ بدون header داده
  const maybeBundle = raw as Partial<CanvasBundle> & { files?: unknown };
  const filesObj =
    maybeBundle && typeof maybeBundle === "object" && maybeBundle.files && typeof maybeBundle.files === "object"
      ? (maybeBundle.files as Record<string, unknown>)
      : raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
  if (!filesObj) return { ...empty, error: "ساختار فایل‌ها پیدا نشد" };

  const isLabeled = typeof maybeBundle?.kind === "string";
  if (isLabeled && maybeBundle!.kind !== BUNDLE_KIND) {
    return { ...empty, error: `این فایل خروجی Living Canvas نیست (kind=${String(maybeBundle!.kind)})` };
  }
  if (isLabeled && typeof maybeBundle!.version === "number" && maybeBundle!.version > BUNDLE_VERSION) {
    return { ...empty, error: `نسخه‌ی باندل جدیدتر است (${maybeBundle!.version} > ${BUNDLE_VERSION}) — اول برنامه را به‌روز کنید` };
  }

  const files: CanvasFiles = {};
  const skipped: ParseResult["skipped"] = [];
  for (const [p, c] of Object.entries(filesObj)) {
    const n = normalizePath(p);
    if (!n.path) {
      skipped.push({ path: p, reason: n.reason ?? "رد شد" });
      continue;
    }
    if (typeof c !== "string") {
      skipped.push({ path: p, reason: "محتوا رشته نیست (فایل باینری پشتیبانی نمی‌شود)" });
      continue;
    }
    files[n.path] = c;
  }

  if (!Object.keys(files).length) return { ...empty, files, skipped, error: "هیچ فایل معتبری در باندل نبود" };
  if (!files[`${ROOT}/manifest.json`]) {
    skipped.push({ path: "manifest.json", reason: "غایب — بوم‌های Living Canvas این فایل را دارند (§3.1)" });
  }

  let canvasId: string | null = typeof maybeBundle?.canvas_id === "string" ? maybeBundle.canvas_id : null;
  let title: string | null = null;
  const manifest = files[`${ROOT}/manifest.json`];
  if (manifest) {
    try {
      const m = JSON.parse(manifest) as { canvas_id?: unknown };
      if (typeof m.canvas_id === "string") canvasId = m.canvas_id;
    } catch {
      skipped.push({ path: "manifest.json", reason: "JSON نامعتبر" });
    }
  }
  const canvasYaml = files[`${ROOT}/canvas.yaml`];
  if (canvasYaml) {
    const y = parseYaml(canvasYaml);
    if (y && typeof y.title === "string") title = y.title;
  }

  return { ok: true, files, canvasId, title, skipped, source: isLabeled ? "bundle" : "raw-files" };
}

/* ---------------- file-first re-hydration (بدون graph.json/state.json) ---------------- */

const str = (v: unknown, max = 4000): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

const NODE_TYPES: NodeType[] = ["note", "agent", "folder", "output-box", "pipeline-step", "file", "shape", "drawing"];
const SHAPES: ShapeKind[] = ["rectangle", "circle", "diamond", "hexagon", "card", "empty"];
const VIEW_MODES: ViewMode[] = ["dot", "name", "card", "markdown"];

export interface DerivedNodeDoc {
  id: string;
  data: LCNodeData;
  position: { x: number; y: number };
}

/** `nodes/<id>.md` → دادهٔ نود (§3.4). فایل‌های خراب را با null رد می‌کنیم. */
export function parseNodeDoc(path: string, md: string): DerivedNodeDoc | null {
  const id = safeRelPath(path)?.match(/nodes\/([^/]+)\.md$/)?.[1];
  if (!id) return null;
  const fmBlock = extractFrontmatter(md);
  const body = fmBlock ? fmBlock.body.trim() : md.trim();
  if (!fmBlock && !body) return null; // فایل خالی = قابل‌خواندن نیست، نه یک نود خالی
  const y = fmBlock ? parseYaml(fmBlock.yaml) : null;
  const owner = "import";
  const title = (y && str(y.title)) || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || id;
  const typeRaw = y && str(y.type);
  const nodeType: NodeType = typeRaw && NODE_TYPES.includes(typeRaw as NodeType) ? (typeRaw as NodeType) : "note";

  const data = makeNodeData(nodeType, title, owner, { content: body });
  if (y) {
    const shape = str(y.shape);
    if (shape && SHAPES.includes(shape as ShapeKind)) data.shape = shape as ShapeKind;
    const vm = str(y.viewMode);
    if (vm && VIEW_MODES.includes(vm as ViewMode)) data.viewMode = vm as ViewMode;
    const color = str(y.color);
    if (color && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(color)) data.color = color;
    const anim = y.animation as Record<string, unknown> | undefined;
    if (anim && typeof anim === "object") {
      const t = str(anim.type);
      const sp = Number(anim.speed);
      data.animation = { type: t === "pulse" || t === "breathe" ? t : "none", speed: Number.isFinite(sp) ? Math.min(4, Math.max(0.2, sp)) : 1 };
    }
    const style = y.style as Record<string, unknown> | undefined;
    if (style && typeof style === "object") {
      const sc = str(style.strokeColor);
      const sw = Number(style.strokeWidth);
      const fs = str(style.fillStyle);
      const op = Number(style.opacity);
      data.style = {
        strokeColor: sc && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(sc) ? sc : data.style.strokeColor,
        strokeWidth: Number.isFinite(sw) ? Math.min(12, Math.max(0, sw)) : data.style.strokeWidth,
        fillStyle: fs === "hachure" || fs === "empty" || fs === "solid" ? (fs as LCNodeData["style"]["fillStyle"]) : data.style.fillStyle,
        opacity: Number.isFinite(op) ? Math.min(100, Math.max(5, op)) : data.style.opacity,
      };
    }
    const pos = y.position as Record<string, unknown> | undefined;
    const px = Number(pos?.x), py = Number(pos?.y);
    const position = { x: Number.isFinite(px) ? px : 120, y: Number.isFinite(py) ? py : 120 };

    const agent = y.agent as Record<string, unknown> | undefined;
    if (nodeType === "agent") {
      const contract = (agent?.context_contract ?? null) as Record<string, unknown> | null;
      const outC = (contract?.output_contract ?? null) as Record<string, unknown> | null;
      const tools = Array.isArray(agent?.tools) ? (agent!.tools as unknown[]).filter((t): t is string => typeof t === "string") : undefined;
      const read = Array.isArray(contract?.allowed_read_paths) ? (contract!.allowed_read_paths as unknown[]).map(String) : undefined;
      const write = Array.isArray(contract?.allowed_write_paths) ? (contract!.allowed_write_paths as unknown[]).map(String) : undefined;
      const reqFields = Array.isArray(outC?.required_fields) ? (outC!.required_fields as unknown[]).map(String) : undefined;
      data.agent = makeNodeData("agent", title, owner, {}).agent!;
      const a = data.agent!;
      const rid = str(agent?.role_id);
      if (rid) a.role_id = rid;
      const sp = str(agent?.system_prompt, 40000);
      if (sp && sp.length > 1) a.system_prompt = sp;
      const m = str(agent?.model);
      if (m) a.model = m;
      if (tools?.length) a.tools = tools;
      const st = str(agent?.status);
      // وضعیت اجرا از فایل بازگردانی نمی‌شود مگر «done» باشد (بقیه یعنی اجرا نیمه‌کاره متوقف شده)
      a.status = st === "done" ? "done" : "idle";
      if (typeof agent?.max_steps === "number") a.max_steps = Math.min(64, Math.max(1, agent.max_steps as number));
      if (typeof agent?.max_tokens === "number") a.max_tokens = Math.min(200000, Math.max(128, agent.max_tokens as number));
      if (typeof agent?.require_approval === "boolean") a.require_approval = agent.require_approval;
      if (read?.length) a.context_contract.allowed_read_paths = read;
      if (write?.length) a.context_contract.allowed_write_paths = write;
      if (reqFields?.length) a.context_contract.output_contract.required_fields = reqFields;
      const saveTo = str(outC?.save_to);
      if (saveTo) a.context_contract.output_contract.save_to = saveTo;
      return { id, data, position };
    }
    return { id, data, position };
  }
  return { id, data, position: { x: 120, y: 120 } };
}

/** `edges/<id>.yaml` → دادهٔ یال (§3.5). */
export function parseEdgeDoc(path: string, text: string): { id: string; source: string; target: string; data: LCEdgeData } | null {
  const id = safeRelPath(path)?.match(/edges\/([^/]+)\.yaml$/)?.[1];
  if (!id) return null;
  const y = parseYaml(text);
  if (!y) return null;
  const source = str(y.source);
  const target = str(y.target);
  if (!source || !target) return null;
  const data = makeEdgeData();
  const et = str(y.type);
  if (et && ["flow", "relation", "event-flow", "blackboard", "direct-message"].includes(et)) data.edgeType = et as LCEdgeData["edgeType"];
  const lb = str(y.label);
  if (lb !== null) data.label = lb;
  const ls = str(y.line_style);
  if (ls === "dashed" || ls === "dotted" || ls === "solid") data.line_style = ls;
  const an = str(y.animation);
  if (an === "flow" || an === "pulse" || an === "none") data.animation = an;
  const tr = y.trigger as Record<string, unknown> | undefined;
  if (tr && typeof tr === "object") {
    const t = str(tr.type);
    if (t === "manual" || t === "condition" || t === "on_completed") data.trigger.type = t;
    const c = str(tr.condition);
    if (c !== null) data.trigger.condition = c;
  }
  const cfg = y.config as Record<string, unknown> | undefined;
  if (cfg && typeof cfg === "object") {
    const c = str(cfg.communication);
    if (c === "direct" || c === "none" || c === "blackboard") data.config.communication = c;
  }
  return { id, source, target, data };
}

const GLOBAL_MEM: Record<string, keyof import("../state").AppState["memory"]> = {
  "memory/global.md": "global",
  "memory/decisions.md": "decisions",
  "memory/progress.md": "progress",
  "memory/user.md": "user",
};

/** `memory/**\/.md` → اسناد حافظه (§3.7). فایل خراب = حذفش کن، seed جایگزین می‌شود. */
export function parseMemoryDoc(path: string, md: string): MemDoc | null {
  const fm = extractFrontmatter(md);
  const y = fm ? parseYaml(fm.yaml) : null;
  const body = fm ? fm.body.trim() : md.trim();
  if (!body) return null;
  const rel = safeRelPath(path)?.replace(/^canvases\/[^/]+\//, "") ?? path;
  const conf = Number(y?.confidence);
  const src = str(y?.source);
  return {
    path: rel,
    title: (y && str(y.title)) || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || "حافظه",
    body,
    updated_at: (y && str(y.updated_at)) ?? nowIso(),
    last_accessed: (y && str(y.last_accessed)) ?? nowIso(),
    confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.7,
    source: src === "agent" || src === "user" || src === "system" ? src : "system",
  };
}

export interface DerivedCanvas {
  nodes: { id: string; type: "lc"; position: { x: number; y: number }; data: LCNodeData }[];
  edges: { id: string; source: string; target: string; type: "lc"; data: LCEdgeData }[];
  memory: {
    global: MemDoc | null; decisions: MemDoc | null; progress: MemDoc | null; user: MemDoc | null;
    agents: Record<string, MemDoc>;
  };
  canvasTitle: string | null;
  unreadable: string[];
}

/**
 * بازسازی بوم *فقط از فایل‌ها* — همان چیزی که نبودش باعث شده بود
 * Exportِ پوشه‌ای بعد از رفرش داده را به seed برگرداند.
 */
export function deriveCanvasFromFiles(files: CanvasFiles): DerivedCanvas {
  const d: DerivedCanvas = {
    nodes: [], edges: [],
    memory: { global: null, decisions: null, progress: null, user: null, agents: {} },
    canvasTitle: null, unreadable: [],
  };
  for (const [path, text] of Object.entries(files)) {
    if (!path.startsWith(ROOT + "/")) continue;
    const rel = path.slice(ROOT.length + 1);
    if (/^nodes\/[^/]+\.md$/.test(rel)) {
      const n = parseNodeDoc(path, text);
      if (n) d.nodes.push({ id: n.id, type: "lc", position: n.position, data: n.data });
      else d.unreadable.push(rel);
      continue;
    }
    if (/^edges\/[^/]+\.yaml$/.test(rel)) {
      const e = parseEdgeDoc(path, text);
      if (e) d.edges.push({ ...e, type: "lc" });
      else d.unreadable.push(rel);
      continue;
    }
    if (rel === "canvas.yaml") {
      const y = parseYaml(text);
      const t = y && str(y.title);
      if (t) d.canvasTitle = t;
      continue;
    }
    const agentMem = rel.match(/^memory\/agents\/([^/]+)\.md$/);
    if (agentMem) {
      const m = parseMemoryDoc(path, text);
      if (m) d.memory.agents[agentMem[1]] = m;
      else d.unreadable.push(rel);
      continue;
    }
    if (GLOBAL_MEM[rel]) {
      const m = parseMemoryDoc(path, text);
      if (m) d.memory[GLOBAL_MEM[rel]] = m as never;
      else d.unreadable.push(rel);
    }
  }
  // یال‌های مرجع‌به‌نودناموجود را نگه نمی‌داریم (React Flow با آن‌ها crash می‌کند)
  const ids = new Set(d.nodes.map((n) => n.id));
  d.edges = d.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return d;
}

/* ---------------- browser IO (download / file picker) ---------------- */

/** دانلود با نام امن؛ اگر فایل موجود باشد با `-2` و … اداده می‌شود (توسط caller قابل‌فعال‌سازی). */
export function suggestFileName(canvasId: string, ext: string, taken?: Set<string>): string {
  const base = safeRelPath(canvasId)?.replace(/\//g, "-") ?? "canvas";
  if (!taken || !taken.has(`${base}.${ext}`)) return `${base}.${ext}`;
  for (let i = 2; i < 100; i++) {
    const name = `${base}-${i}.${ext}`;
    if (!taken.has(name)) return name;
  }
  return `${base}-${uid("f")}.${ext}`;
}

export async function downloadJson(filename: string, text: string): Promise<void> {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(fr.error ?? new Error("خواندن فایل ناموفق بود"));
    fr.readAsText(file, "utf-8");
  });
}

/* ---------------- storage IO ---------------- */

/** نوشتن فایل‌ها روی StorageAdapter فعال؛ با replace=true اول پاک می‌کند. */
export async function installFiles(files: CanvasFiles, opts?: { replace?: boolean; adapter?: StorageAdapter }): Promise<{ written: number }> {
  const target: StorageAdapter = opts?.adapter ?? storage;
  const replace = opts?.replace !== false;
  if (replace) await target.clear();
  const entries = Object.entries(files);
  for (const [p, c] of entries) await target.writeFile(p, c);
  // حذف فایل‌های بی‌ربط که در جایگزینی کامل باقی مانده‌اند
  if (!opts?.adapter) {
    const keep = new Set(entries.map(([p]) => p));
    for (const p of await storage.allPaths()) {
      if (p.startsWith(ROOT + "/") && !keep.has(p)) await storage.deleteFile(p);
    }
  }
  return { written: entries.length };
}

/** حجم تقریبی باندل برای نمایش در UI. */
export function bundleBytes(files: CanvasFiles): number {
  let n = 0;
  for (const c of Object.values(files)) n += c.length;
  return n;
}
