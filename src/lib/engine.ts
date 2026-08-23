/* ============================================================
   Living Canvas — engine: MemoryManager §6, Executor §7,
   checkpoints §10, persistence, DeepSeek provider
   ============================================================ */
import {
  storage, bus, uid, nowIso, nowStamp, sleep, debounce,
  nodeToMarkdown, edgeToYaml, memoryToMd, outputsIndexYaml, chatToMd, logText, toYaml, frontmatter,
  type BusEventType, type OutputEntry, type MemDoc, type ChatMsg,
} from "./core";
import {
  ROOT, CANVAS_ID, buildSeed, emptyExecution, roleById,
  makeAgentConfig, makeNodeData, makeEdgeData,
  type AppState, type RFNode, type RFEdge,
} from "../state";

export interface EngineApi {
  get: () => AppState;
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
}

/* ---------------- events & toasts ---------------- */

export function emit(api: EngineApi, type: BusEventType, message: string) {
  const ev = bus.emit(type, message);
  api.set((s) => ({ events: [ev, ...s.events].slice(0, 250) }));
}

export function toast(api: EngineApi, kind: "info" | "success" | "warn" | "error", text: string) {
  const id = uid("toast");
  api.set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
  setTimeout(() => api.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
}

/* ---------------- node / edge patching ---------------- */

const nodePath = (id: string) => `${ROOT}/nodes/${id}.md`;
const edgePath = (id: string) => `${ROOT}/edges/${id}.yaml`;

export function getNode(s: AppState, id: string) {
  return s.nodes.find((n) => n.id === id);
}

export function patchNode(api: EngineApi, id: string, data: Partial<RFNode["data"]>) {
  api.set((st) => ({
    nodes: st.nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, ...data, updated_at: nowIso() } } : n
    ),
  }));
}

export async function writeNodeArtifact(api: EngineApi, id: string, quiet = false) {
  const n = getNode(api.get(), id);
  if (!n) return;
  await storage.writeFile(nodePath(id), nodeToMarkdown(id, n.data));
  if (!quiet) emit(api, "file.written", `nodes/${id}.md نوشته شد`);
}

export async function writeEdgeArtifact(api: EngineApi, id: string, quiet = false) {
  const e = api.get().edges.find((x) => x.id === id);
  if (!e || !e.data) return;
  await storage.writeFile(edgePath(id), edgeToYaml(id, e.source, e.target, e.data));
  if (!quiet) emit(api, "file.written", `edges/${id}.yaml نوشته شد`);
}

/* ---------------- logs ---------------- */

export async function appendLog(api: EngineApi, nodeId: string, line: string) {
  const stamp = new Date().toLocaleTimeString("fa-IR");
  api.set((st) => {
    const arr = [...(st.logs[nodeId] ?? []), `[${stamp}] ${line}`].slice(-120);
    return { logs: { ...st.logs, [nodeId]: arr } };
  });
  const date = nowIso().slice(0, 10);
  await storage.writeFile(`${ROOT}/logs/${nodeId}/${date}.log`, logText(api.get().logs[nodeId] ?? []));
}

/* ---------------- core persistence (§4, §5.2 debounced) ---------------- */

function overviewMd(s: AppState): string {
  const done = s.execution.completed.length;
  const last = done ? getNode(s, s.execution.completed[done - 1]) : null;
  const currentStep =
    s.execution.status === "running" || s.execution.status === "waiting_approval"
      ? s.execution.current_node_id ?? "—"
      : last ? last.data.title : "آغاز نشده";
  const summary = `بوم «${s.canvas.title}» یک خط لوله‌ی عامل‌محور با ${s.nodes.filter((n) => n.data.nodeType === "agent").length} ایجنت است. وضعیت اجرا: ${s.execution.status}.`;
  return frontmatter(
    {
      canvas_id: s.canvasId,
      title: s.canvas.title,
      last_updated: nowIso(),
      summary,
      current_step: currentStep,
      node_count: s.nodes.length,
      edge_count: s.edges.length,
    },
    `# خلاصه‌ی بوم\n\n${summary}\n\nایجنت‌ها به‌جای خواندن کل بوم، اول این فایل را می‌خوانند.\n\n## وضعیت\n- اجرا: **${s.execution.status}**\n- گام فعلی: ${currentStep}\n- نودها: ${s.nodes.length} — یال‌ها: ${s.edges.length}`
  );
}

async function writeCore(s: AppState) {
  const graph = {
    canvas_id: s.canvasId,
    version: "1.0",
    structure_version: "1.3",
    updated_at: nowIso(),
    nodes: s.nodes.map((n) => ({
      id: n.id, type: n.type, label: n.data.title,
      position: n.position, data: n.data, config_ref: `nodes/${n.id}.md`,
    })),
    edges: s.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      type: e.data?.edgeType ?? "flow", label: e.data?.label ?? "",
      data: e.data, config_ref: `edges/${e.id}.yaml`,
    })),
  };
  const state = {
    canvas: s.canvas,
    memory: s.memory,
    outputs: s.outputs,
    chats: s.chats,
    logs: s.logs,
    snapshots: s.snapshots,
    execution: s.execution,
    saved_at: nowIso(),
  };
  await Promise.all([
    storage.writeJson(`${ROOT}/graph.json`, graph),
    storage.writeJson(`${ROOT}/state.json`, state),
    storage.writeFile(`${ROOT}/canvas-overview.md`, overviewMd(s)),
    storage.writeFile(`${ROOT}/canvas.yaml`, toYaml({
      id: s.canvasId, title: s.canvas.title, created_at: s.canvas.created_at,
      updated_at: nowIso(), owner: s.canvas.owner, default_model: s.canvas.default_model,
      canvas_type: s.canvas.canvas_type, tags: s.canvas.tags,
      template_id: s.canvas.template_id, template_version: s.canvas.template_version,
    })),
  ]);
}

const debouncedSave = debounce(async (api: EngineApi) => {
  await writeCore(api.get());
  api.set({ saveState: "saved" });
  const s = api.get();
  emit(api, "graph.saved", `graph.json ذخیره شد — ${s.nodes.length} نود، ${s.edges.length} یال`);
}, 700);

export function touch(api: EngineApi) {
  api.set({ saveState: "saving" });
  void debouncedSave(api);
}

/* ---------------- MemoryManager (§6.2) ---------------- */

function memDocAt(s: AppState, path: string, agentId?: string): MemDoc | null {
  switch (path) {
    case "memory/global.md": return s.memory.global;
    case "memory/decisions.md": return s.memory.decisions;
    case "memory/progress.md": return s.memory.progress;
    case "memory/user.md": return s.memory.user;
    default:
      if (agentId && path === `memory/agents/${agentId}.md`) return s.memory.agents[agentId] ?? null;
      return null;
  }
}

export const MemoryManager = {
  /** Read Path §6.2 — only paths inside allowed_read_paths */
  async read(api: EngineApi, agentId: string, query?: string): Promise<string[]> {
    const s = api.get();
    const node = getNode(s, agentId);
    const contract = node?.data.agent?.context_contract;
    if (!contract) return [];
    const results: string[] = [];
    const touched: Partial<AppState["memory"]> = {};
    for (const p of contract.allowed_read_paths) {
      const doc = memDocAt(s, p, agentId);
      if (doc) {
        const fresh = { ...doc, last_accessed: nowIso() };
        results.push(memoryToMd(fresh).trim());
        if (p === "memory/global.md") touched.global = fresh;
        if (p === "memory/decisions.md") touched.decisions = fresh;
        if (p === "memory/progress.md") touched.progress = fresh;
        if (p === "memory/user.md") touched.user = fresh;
        if (p.startsWith("memory/agents/"))
          touched.agents = { ...(touched.agents ?? s.memory.agents), [agentId]: fresh };
      }
    }
    api.set((st) => ({ memory: { ...st.memory, ...touched } }));
    if (query) {
      const q = query.trim();
      const filtered = results.filter((r) => r.includes(q));
      if (filtered.length) return filtered;
    }
    return results;
  },

  /** Write Path §6.2 + conflict resolution §6.3 */
  async write(api: EngineApi, agentId: string, content: string, confidence: number): Promise<boolean> {
    const s = api.get();
    const node = getNode(s, agentId);
    const agent = node?.data.agent;
    if (!agent) return false;
    const path = `memory/agents/${agentId}.md`;
    // 1) access check
    if (!agent.context_contract.allowed_write_paths.some((p) => path.startsWith(p))) {
      emit(api, "validation.failed", `دسترسی نوشتن در ${path} برای ${agentId} رد شد`);
      return false;
    }
    // 2) lock check
    if (node!.data.lock.status === "locked" && node!.data.lock.locked_by && !node!.data.lock.locked_by.startsWith("run-")) {
      emit(api, "system", `نوشتن حافظه رد شد — نود توسط ${node!.data.lock.locked_by} قفل است`);
      return false;
    }
    const prev = s.memory.agents[agentId];
    // 3/4) confidence conflict
    if (prev && prev.confidence > confidence) {
      emit(api, "memory.updated", `تعارض حافظه در ${path} — اطلاعات قبلی (اعتماد ${prev.confidence}) حفظ شد`);
      toast(api, "warn", "تعارض حافظه: اطلاعات قبلی اعتماد بالاتری داشت و حفظ شد.");
      return false;
    }
    if (prev && prev.confidence === confidence && prev.body.trim() !== content.trim()) {
      emit(api, "memory.updated", `تعارض هم‌تراز در ${path} — در نسخه‌ی بعدی از کاربر پرسیده می‌شود؛ فعلاً جایگزین شد`);
    }
    const fresh: MemDoc = {
      path,
      title: prev?.title ?? `حافظه‌ی ایجنت ${node!.data.title}`,
      body: content,
      updated_at: nowIso(),
      last_accessed: nowIso(),
      confidence,
      source: "agent",
    };
    api.set((st) => ({ memory: { ...st.memory, agents: { ...st.memory.agents, [agentId]: fresh } } }));
    await storage.writeFile(`${ROOT}/${path}`, memoryToMd(fresh));
    emit(api, "memory.updated", `${path} به‌روزرسانی شد (اعتماد ${confidence})`);
    return true;
  },
};

/* ---------------- outputs & validation (§3.6, §12.10) ---------------- */

const FIELD_DESC: Record<string, string> = {
  summary: "خلاصه",
  problem_statement: "بیان دقیق مسئله",
  questions_asked: "پرسش‌های مطرح‌شده",
  risks: "فهرست ریسک‌ها",
  decision: "تصمیم پیشنهادی",
  solution: "راه‌حل اجرایی",
  next_actions: "اقدام‌های بعدی",
  approval_request: "درخواست تأیید انسانی",
};

function validateOutput(entries: OutputEntry[], required: string[]): string[] {
  const have = new Set(entries.map((e) => e.file.replace(/\.md$/, "")));
  return required.filter((f) => !have.has(f));
}

export async function writeOutputs(api: EngineApi, nodeId: string, entries: OutputEntry[], shared = false) {
  const dir = shared ? `${ROOT}/outputs/shared/${nodeId}` : `${ROOT}/outputs/${nodeId}`;
  await Promise.all(entries.map((e) => storage.writeFile(`${dir}/${e.file}`, e.content)));
  await storage.writeFile(`${dir}/index.yaml`, outputsIndexYaml(nodeId, entries));
  api.set((st) => ({ outputs: { ...st.outputs, [nodeId]: entries } }));
  emit(api, "output.written", `${entries.length} فایل خروجی در outputs/${shared ? `shared/${nodeId}` : nodeId}/ ذخیره شد`);
}

/* ---------------- LLM provider (§15) ---------------- */

interface LlmMsg { role: "system" | "user" | "assistant"; content: string }

async function askModel(apiKey: string, model: string, messages: LlmMsg[]): Promise<string> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || "deepseek-chat", messages, max_tokens: 900, temperature: 0.7 }),
  });
  if (!res.ok) throw new Error(`DeepSeek API ${res.status}`);
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error("پاسخ خالی از مدل");
  return String(text);
}

/* ---------------- simulated generation ---------------- */

function simFields(roleId: string, title: string, upstream: string, owner: string): Record<string, string> {
  const d = nowIso().slice(0, 10);
  const up = upstream ? upstream.slice(0, 140) : "—";
  switch (roleId) {
    case "understander":
      return {
        summary: `مسئله‌ی «${title}» در یک جلسه‌ی شبیه‌سازی‌شده با کاربر بررسی شد. هسته‌ی مسئله: فاصله‌ی بین تجربه‌ی فعلی دانش‌آموز و انتظار یک یادگیری شخصی‌سازی‌شده. ورودی مرجع: ${up}`,
        problem_statement: `دانش‌آموزان ۱۲ تا ۱۵ ساله در کلاس‌های آنلاین، بازخورد لحظه‌ای دریافت نمی‌کنند و انگیزه‌شان در هفته‌ی سوم افت می‌کند. راه‌حل باید قبل از هر توسعه‌ای، معیار «درگیری فعال» را تعریف کند. (ثبت‌شده در ${d} توسط خط لوله‌ی ${owner})`,
        questions_asked: `۱. معیار موفقیت «یادگیری فعال» دقیقاً چیست؟\n۲. محدودیت زمانی و بودجه‌ی فاز آزمایشی چقدر است؟\n۳. آیا دسترسی به معلم‌ها برای مصاحبه ممکن است؟`,
      };
    case "risk-analyst":
      return {
        summary: `سه ریسک اصلی برای «${title}» شناسایی شد. ورودی تحلیل از نود قبلی: ${up}`,
        risks: `- ریسک ۱: وابستگی به حضور معلم — شدت ۶\n- ریسک ۲: پیچیدگی فنی بازخورد لحظه‌ای — شدت ۵\n- ریسک ۳: افت انگیزه در فاز آزمایشی — شدت ۴\n\nامتیاز کل ریسک: **۵ از ۱۰** (قابل قبول با اصلاح)`,
        decision: `تأیید مشروط: ادامه‌ی مسیر با اصلاح گام دوم پیشنهاد می‌شود. هیچ ریسکی بالاتر از آستانه‌ی ۷ نیست.`,
      };
    case "solution-designer":
      return {
        summary: `راه‌حل «${title}» در سه گام طراحی شد؛ ریسک‌های گزارش‌شده در گام ۲ پوشش داده شده‌اند.`,
        solution: `گام ۱: ساخت پروتوتایپ بازخورد لحظه‌ای (خروجی: دموی clickable — معیار: ۸۰٪ سناریوها پوشش داده شود)\nگام ۲: آزمایش با ۲۰ دانش‌آموز (خروجی: گزارش درگیری — معیار: حفظ ۶۰٪ در هفته‌ی سوم)\nگام ۳: اصلاح و آماده‌سازی استقرار (خروجی: نسخه‌ی ۰.۹ — معیار: بدون خطای بحرانی)`,
        next_actions: `- تعیین معیار «درگیری فعال» با کاربر\n- جذب ۲۰ دانش‌آموز برای آزمایش\n- زمان‌بندی گام ۱ در بوم`,
      };
    default:
      return {
        summary: `همه‌ی خروجی‌های مجاز خوانده شد. تعارض جدی بین گام‌ها دیده نشد؛ یک ناهماهنگی کوچک در معیارهای موفقیت وجود دارد که در تصمیم لحاظ شد.`,
        decision: `تصمیم نهایی: شروع گام ۱ (پروتوتایپ) با بودجه‌ی محدود و بازبینی هفتگی. دلایل: ریسک قابل قبول (۵/۱۰)، راه‌حل سه‌گامه‌ی شفاف، و هم‌راستایی با هدف بوم.`,
        approval_request: `این تصمیم برای اجرا به تأیید انسانی نیاز دارد. گزینه‌ها: تأیید و شروع گام ۱ / اصلاح و بازگشت به نود «طراحی راه‌حل» / رد کامل.`,
      };
  }
}

function buildEntries(nodeId: string, required: string[], fields: Record<string, string>): OutputEntry[] {
  const entries: OutputEntry[] = required.map((f) => ({
    file: `${f}.md`,
    type: f === "summary" ? "summary" : "detailed",
    description: FIELD_DESC[f] ?? f,
    content: frontmatter(
      { node_id: nodeId, field: f, generated_at: nowIso(), source: "executor-phase1" },
      `# ${FIELD_DESC[f] ?? f}\n\n${fields[f] ?? ""}`
    ),
  }));
  entries.push({
    file: "details.json",
    type: "detailed",
    description: "داده‌ی ساختاریافته‌ی خروجی",
    content: JSON.stringify({ node_id: nodeId, generated_at: nowIso(), fields }, null, 2),
  });
  return entries;
}

/* ---------------- execution (§7.1) ---------------- */

const FLOW_TYPES = ["flow", "event-flow", "blackboard"];

function evalCondition(cond: string, ctx: Record<string, unknown>): boolean {
  const m = cond.match(/\{\{\s*([a-zA-Z_]\w*)\s*(<=|>=|==|!=|<|>)\s*([\d.]+)\s*\}\}/);
  if (!m) return true;
  const left = Number(ctx[m[1]]);
  if (Number.isNaN(left)) return true;
  const right = Number(m[3]);
  switch (m[2]) {
    case "<": return left < right;
    case ">": return left > right;
    case "<=": return left <= right;
    case ">=": return left >= right;
    case "==": return left === right;
    case "!=": return left !== right;
    default: return true;
  }
}

function computeOrder(s: AppState, startId: string): string[] {
  const order: string[] = [];
  const visited = new Set<string>([startId]);
  let frontier = [startId];
  order.push(startId);
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of s.edges) {
        if (e.source === id && !visited.has(e.target) && FLOW_TYPES.includes(e.data?.edgeType ?? "flow")) {
          visited.add(e.target);
          order.push(e.target);
          next.push(e.target);
        }
      }
    }
    frontier = next;
  }
  return order;
}

export function findStart(s: AppState): RFNode | null {
  const agents = s.nodes.filter((n) => n.data.nodeType === "agent");
  if (!agents.length) return null;
  const withInput = new Set(s.edges.filter((e) => FLOW_TYPES.includes(e.data?.edgeType ?? "flow")).map((e) => e.target));
  return agents.find((a) => !withInput.has(a.id)) ?? agents[0];
}

async function executeNode(api: EngineApi, nodeId: string) {
  const s0 = api.get();
  const node = getNode(s0, nodeId);
  if (!node) return;
  const agent = node.data.agent;
  const runId = s0.execution.run_id ?? uid("run");
  const delay = s0.settings.simDelay;

  // lock §3.4
  patchNode(api, nodeId, { lock: { status: "locked", locked_by: runId, locked_at: nowIso() }, agent: agent ? { ...agent, status: "running" } : agent });
  emit(api, "lock.acquired", `نود ${nodeId} توسط ${runId} قفل شد`);
  emit(api, "node.started", `اجرای «${node.data.title}» شروع شد`);
  api.set((st) => ({ execution: { ...st.execution, current_node_id: nodeId } }));
  await appendLog(api, nodeId, `== شروع اجرا (${runId}) ==`);

  try {
    let steps = 0;
    const maxSteps = agent?.max_steps ?? 6;

    // step 1 — overview (§9)
    await appendLog(api, nodeId, "ابزار get_canvas_overview → خواندن canvas-overview.md");
    await sleep(delay * 0.7);
    steps++;

    // step 2 — brief
    if (agent) {
      const role = roleById(agent.role_id);
      await appendLog(api, nodeId, `ابزار get_agent_brief → نقش «${role.name}» بارگذاری شد (max_steps=${agent.max_steps})`);
      await sleep(delay * 0.6);
      steps++;
    }

    // step 3 — read_memory via MemoryManager
    let memoryTxt = "";
    if (agent) {
      const parts = await MemoryManager.read(api, nodeId);
      memoryTxt = parts.join("\n\n");
      await appendLog(api, nodeId, `ابزار read_memory → ${agent.context_contract.allowed_read_paths.length} مسیر مجاز خوانده شد`);
      await sleep(delay * 0.6);
      steps++;
    }

    // upstream outputs (blackboard context §1.3-4)
    const upstream = s0.edges
      .filter((e) => e.target === nodeId && FLOW_TYPES.includes(e.data?.edgeType ?? "flow"))
      .map((e) => api.get().outputs[e.source]?.find((o) => o.file === "summary.md")?.content ?? "")
      .filter(Boolean)
      .join("\n");

    // step 4 — generation
    await appendLog(api, nodeId, agent && api.get().settings.provider === "deepseek" && api.get().settings.apiKey
      ? `فراخوانی مدل ${api.get().settings.model}…`
      : "تولید پاسخ در شبیه‌ساز داخلی فاز ۱…");
    let fields: Record<string, string>;
    const required = agent?.context_contract.output_contract.required_fields ?? ["summary"];
    if (agent && api.get().settings.provider === "deepseek" && api.get().settings.apiKey) {
      try {
        const text = await askModel(api.get().settings.apiKey, api.get().settings.model, [
          { role: "system", content: agent.system_prompt },
          { role: "user", content: `خلاصه‌ی بوم و حافظه:\n${memoryTxt.slice(0, 1200)}\n\nخروجی نود قبلی:\n${upstream.slice(0, 800)}\n\nخروجی را با فیلدهای ${required.join("، ")} بنویس.` },
        ]);
        fields = { summary: text, ...simFields(agent.role_id, node.data.title, upstream, s0.canvas.owner) };
      } catch (err) {
        await appendLog(api, nodeId, `خطای API: ${String(err)} — بازگشت به شبیه‌ساز (§12.6 Fallback)`);
        toast(api, "warn", "اتصال به DeepSeek برقرار نشد؛ از شبیه‌ساز داخلی استفاده شد.");
        fields = simFields(agent.role_id, node.data.title, upstream, s0.canvas.owner);
      }
    } else {
      await sleep(delay * 1.4);
      fields = simFields(agent?.role_id ?? "decision-maker", node.data.title, upstream, s0.canvas.owner);
    }
    steps++;
    if (steps > maxSteps) throw new Error("سقف max_steps رد شد (§12.3)");

    // step 5 — write_output + validation §3.6
    const entries = buildEntries(nodeId, required, fields);
    const missing = validateOutput(entries, required);
    if (missing.length) {
      emit(api, "validation.failed", `خروجی ${nodeId} فیلدهای ${missing.join("، ")} را ندارد — رد شد`);
      throw new Error(`خروجی نامعتبر: ${missing.join("، ")}`);
    }
    await writeOutputs(api, nodeId, entries);
    await appendLog(api, nodeId, `ابزار write_output → اعتبارسنجی موفق (${required.length}/${required.length} فیلد)`);
    steps++;

    // step 6 — write_memory §6
    const memLines = [
      `# حافظه‌ی ایجنت ${node.data.title}`,
      "",
      `- آخرین ورودی‌ها: ${upstream ? upstream.slice(0, 90).replace(/\n/g, " ") + "…" : "خروجی نود قبلی در دسترس نبود"}`,
      `- تصمیم‌های گرفته‌شده: ${(fields.decision ?? fields.problem_statement ?? "").slice(0, 120).replace(/\n/g, " ")}`,
      `- نکات مهم برای اجرای بعدی: فیلدهای الزامی ${required.join("، ")} همیشه در خروجی باشند.`,
    ].join("\n");
    await MemoryManager.write(api, nodeId, memLines, 0.8);

    // context update (blackboard)
    api.set((st) => ({
      execution: {
        ...st.execution,
        context: {
          ...st.execution.context,
          [nodeId]: (fields.summary ?? "").slice(0, 200),
          ...(agent?.role_id === "risk-analyst" ? { risk_score: 5 } : {}),
        },
      },
    }));

    // success
    patchNode(api, nodeId, { lock: { status: "free", locked_by: null, locked_at: null }, agent: agent ? { ...agent, status: "done" } : agent });
    emit(api, "lock.released", `قفل ${nodeId} آزاد شد`);
    emit(api, "node.completed", `«${node.data.title}» با موفقیت کامل شد`);
    await appendLog(api, nodeId, "== پایان موفق ==");
    api.set((st) => ({ execution: { ...st.execution, completed: [...st.execution.completed, nodeId] } }));
    toast(api, "success", `نود «${node.data.title}» کامل شد ✓`);

    // checkpoint §10
    await takeSnapshot(api, `پایان «${node.data.title}»`, true);

    // human-in-the-loop
    if (agent?.require_approval) {
      api.set((st) => ({ execution: { ...st.execution, status: "waiting_approval" } }));
      emit(api, "run.paused", `اجرا برای تأیید انسانی متوقف شد — نود «${node.data.title}»`);
      toast(api, "warn", "تصمیم این نود به تأیید شما نیاز دارد.");
    }
  } catch (err) {
    const agentNow = getNode(api.get(), nodeId)?.data.agent;
    patchNode(api, nodeId, { lock: { status: "free", locked_by: null, locked_at: null }, agent: agentNow ? { ...agentNow, status: "failed" } : agentNow });
    emit(api, "node.failed", `اجرای «${node.data.title}» شکست خورد: ${String(err)}`);
    await appendLog(api, nodeId, `خطا: ${String(err)}`);
    api.set((st) => ({ execution: { ...st.execution, status: "failed" } }));
    toast(api, "error", `خطا در «${node.data.title}» — اجرا متوقف شد`);
  }
}

async function collectToBox(api: EngineApi, boxId: string) {
  const s = api.get();
  const box = getNode(s, boxId);
  if (!box) return;
  emit(api, "node.started", `جمع‌آوری خروجی‌ها در «${box.data.title}»`);
  api.set((st) => ({ execution: { ...st.execution, current_node_id: boxId } }));
  const parts = s.execution.completed
    .map((id) => {
      const n = getNode(api.get(), id);
      const summary = api.get().outputs[id]?.find((o) => o.file === "summary.md");
      return n && summary ? `## ${n.data.title}\n\n${summary.content.split("---").pop()?.trim() ?? ""}` : "";
    })
    .filter(Boolean);
  const content = frontmatter(
    { box_id: boxId, generated_at: nowIso(), run_id: s.execution.run_id },
    `# بسته‌ی خروجی نهایی\n\n${parts.join("\n\n---\n\n")}`
  );
  const entries: OutputEntry[] = [{
    file: "final-package.md", type: "summary", description: "بسته‌ی نهایی خروجی‌های خط لوله", content,
  }];
  await writeOutputs(api, boxId, entries, true);
  patchNode(api, boxId, { content: `بسته‌ی نهایی با ${parts.length} بخش در outputs/shared/${boxId}/ ذخیره شد.` });
  emit(api, "node.completed", `«${box.data.title}» ${parts.length} خروجی را جمع‌آوری کرد`);
  api.set((st) => ({ execution: { ...st.execution, completed: [...st.execution.completed, boxId] } }));
  await takeSnapshot(api, "جمع‌آوری خروجی نهایی", true);
}

async function processQueue(api: EngineApi) {
  while (true) {
    const ex = api.get().execution;
    if (ex.status !== "running") return;
    const nextId = ex.queue.find((q) => !ex.completed.includes(q));
    if (!nextId) {
      api.set((st) => ({ execution: { ...st.execution, status: "completed", current_node_id: null } }));
      emit(api, "run.completed", "اجرای خط لوله با موفقیت به پایان رسید");
      toast(api, "success", "خط لوله کامل شد — همه‌ی خروجی‌ها ذخیره شدند ✓");
      await takeSnapshot(api, "پایان اجرای کامل", false);
      touch(api);
      return;
    }
    // edge condition check §7.1
    const prev = ex.current_node_id;
    if (prev && prev !== nextId) {
      const edge = api.get().edges.find((e) => e.source === prev && e.target === nextId);
      const cond = edge?.data?.trigger;
      if (cond?.type === "condition" && cond.condition && !evalCondition(cond.condition, ex.context)) {
        emit(api, "system", `شرط یال «${cond.condition}» برقرار نبود — ${nextId} رد شد`);
        await appendLog(api, nextId, `رد شد: شرط ${cond.condition} برقرار نیست`);
        api.set((st) => ({ execution: { ...st.execution, completed: [...st.execution.completed, nextId] } }));
        continue;
      }
    }
    const node = getNode(api.get(), nextId);
    if (!node) {
      api.set((st) => ({ execution: { ...st.execution, completed: [...st.execution.completed, nextId] } }));
      continue;
    }
    if (node.data.nodeType === "agent") await executeNode(api, nextId);
    else if (node.data.nodeType === "output-box") await collectToBox(api, nextId);
    else api.set((st) => ({ execution: { ...st.execution, completed: [...st.execution.completed, nextId] } }));
    touch(api);
  }
}

export async function runPipeline(api: EngineApi) {
  const s = api.get();
  if (s.execution.status === "running" || s.execution.status === "waiting_approval") {
    toast(api, "warn", "یک اجرا در جریان است؛ اول آن را متوقف یا تأیید کنید.");
    return;
  }
  const start = findStart(s);
  if (!start) {
    toast(api, "error", "هیچ نود ایجنتی برای اجرا پیدا نشد.");
    return;
  }
  const order = computeOrder(s, start.id);
  api.set({
    execution: {
      ...emptyExecution(), run_id: uid("run"), status: "running",
      queue: order, started_at: nowIso(),
    },
  });
  emit(api, "run.started", `اجرای خط لوله از «${start.data.title}» شروع شد — ${order.length} نود در صف`);
  toast(api, "info", `اجرا شروع شد — ${order.length} نود در صف`);
  await processQueue(api);
}

export async function runSingle(api: EngineApi, nodeId: string) {
  const s = api.get();
  if (s.execution.status === "running" || s.execution.status === "waiting_approval") {
    toast(api, "warn", "اجرای دیگری در جریان است.");
    return;
  }
  api.set({ execution: { ...emptyExecution(), run_id: uid("run"), status: "running", queue: [nodeId], started_at: nowIso() } });
  emit(api, "run.started", `اجرای تک‌نود: ${nodeId}`);
  await executeNode(api, nodeId);
  const ex = api.get().execution;
  if (ex.status === "running")
    api.set((st) => ({ execution: { ...st.execution, status: "completed", current_node_id: null } }));
  touch(api);
}

export async function resumeRun(api: EngineApi) {
  const ex = api.get().execution;
  if (ex.status !== "waiting_approval") return;
  api.set((st) => ({ execution: { ...st.execution, status: "running" } }));
  emit(api, "run.resumed", "تأیید انسانی ثبت شد — اجرا ادامه یافت");
  toast(api, "success", "تأیید شد — ادامه‌ی اجرا…");
  await processQueue(api);
}

export function rejectRun(api: EngineApi) {
  api.set((st) => ({ execution: { ...st.execution, status: "stopped", current_node_id: null } }));
  emit(api, "run.stopped", "تصمیم توسط کاربر رد شد — اجرا متوقف شد");
  toast(api, "info", "تصمیم رد شد و اجرا متوقف شد.");
  touch(api);
}

export function stopRun(api: EngineApi) {
  const s = api.get();
  const cur = s.execution.current_node_id;
  if (cur) {
    const n = getNode(s, cur);
    const ag = n?.data.agent;
    patchNode(api, cur, { lock: { status: "free", locked_by: null, locked_at: null }, agent: ag ? { ...ag, status: ag.status === "running" ? "idle" : ag.status } : ag });
  }
  api.set((st) => ({ execution: { ...st.execution, status: "stopped", current_node_id: null } }));
  emit(api, "run.stopped", "اجرا توسط کاربر متوقف شد");
  toast(api, "info", "اجرا متوقف شد.");
  touch(api);
}

export function resetExecution(api: EngineApi) {
  api.set((st) => ({
    execution: emptyExecution(),
    nodes: st.nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        lock: { status: "free" as const, locked_by: null, locked_at: null },
        agent: n.data.agent ? { ...n.data.agent, status: "idle" as const } : null,
      },
    })),
  }));
  emit(api, "system", "وضعیت اجرا بازنشانی شد");
  touch(api);
}

/* ---------------- chat (§1.3 working memory) ---------------- */

function simChatReply(roleId: string, roleTitle: string, userText: string, memDoc?: MemDoc): string {
  const short = userText.length > 80 ? userText.slice(0, 80) + "…" : userText;
  const base: Record<string, string[]> = {
    understander: [
      `پیام شما را خواندم: «${short}». از نگاه من هنوز یک ابهام اصلی وجود دارد — معیار موفقیت دقیقاً چه عددی است؟ اگر آن را مشخص کنید، بیان مسئله را نهایی می‌کنم.`,
      `نکته‌ی خوبی است. من این را به questions_asked اضافه می‌کنم. می‌توانید بگویید این موضوع برای چه گروهی از کاربران اولویت دارد؟`,
    ],
    "risk-analyst": [
      `درخواست شما را با فهرست ریسک‌های فعلی سنجیدم. به نظر می‌رسد به ریسک «وابستگی به حضور معلم» اشاره دارید — شدت آن ۶ است و با یک گام اصلاحی قابل کاهش است.`,
      `تحلیل اولیه: اگر این تغییر اعمال شود، امتیاز ریسک کل از ۵ به ۴ می‌رسد. می‌خواهید گزارش را به‌روزرسانی کنم؟`,
    ],
    "solution-designer": [
      `پیشنهاد شما در گام ۲ راه‌حل جای می‌گیرد. معیار موفقیت گام را این‌طور تنظیم می‌کنم: «حفظ ۶۰٪ کاربران در هفته‌ی سوم». موافقید؟`,
      `این ایده را می‌توان به‌صورت یک آزمایش کوچک قبل از گام ۱ اجرا کرد. خروجی: یک گزارش کوتاه A/B. زمان تخمینی: یک هفته.`,
    ],
    "decision-maker": [
      `جمع‌بندی من از پیام شما: موافق مسیر فعلی هستید اما نگران زمان‌بندی‌اید. در تصمیم نهایی بازبینی هفتگی را اضافه می‌کنم.`,
      `تصمیم نهایی هنوز به تأیید انسانی نیاز دارد. اگر مایل‌اید، خط لوله را اجرا کنید تا بسته‌ی تصمیم آماده شود.`,
    ],
  };
  const opts = base[roleId] ?? base["decision-maker"];
  const pick = opts[(userText.length + roleTitle.length) % opts.length];
  const memNote = memDoc ? `\n\n_آخرین به‌روزرسانی حافظه: ${memDoc.updated_at.slice(0, 10)} — اعتماد ${memDoc.confidence}_` : "";
  return pick + memNote;
}

export async function sendChat(api: EngineApi, nodeId: string, text: string) {
  const s = api.get();
  const node = getNode(s, nodeId);
  if (!node) return;
  const msg: ChatMsg = { role: "user", text, at: nowIso() };
  api.set((st) => ({ chats: { ...st.chats, [nodeId]: [...(st.chats[nodeId] ?? []), msg] } }));
  api.set((st) => ({ typing: { ...st.typing, [nodeId]: true } }));
  emit(api, "chat.message", `پیام کاربر به «${node.data.title}» ارسال شد`);

  let reply: string;
  const settings = api.get().settings;
  if (settings.provider === "deepseek" && settings.apiKey && node.data.agent) {
    try {
      const history = (api.get().chats[nodeId] ?? []).slice(-8).map((m) => ({
        role: m.role === "user" ? "user" as const : "assistant" as const,
        content: m.text,
      }));
      reply = await askModel(settings.apiKey, settings.model, [
        { role: "system", content: node.data.agent.system_prompt },
        ...history,
      ]);
    } catch {
      toast(api, "warn", "مدل در دسترس نبود؛ پاسخ شبیه‌سازی شد.");
      reply = simChatReply(node.data.agent.role_id, node.data.title, text, api.get().memory.agents[nodeId]);
    }
  } else {
    await sleep(700 + Math.random() * 700);
    reply = simChatReply(node.data.agent?.role_id ?? "understander", node.data.title, text, api.get().memory.agents[nodeId]);
  }

  const out: ChatMsg = { role: "agent", text: reply, at: nowIso() };
  api.set((st) => ({
    chats: { ...st.chats, [nodeId]: [...(st.chats[nodeId] ?? []), out] },
    typing: { ...st.typing, [nodeId]: false },
  }));
  await storage.writeFile(`${ROOT}/chats/chat-${nodeId}.md`, chatToMd(nodeId, node.data.title, api.get().chats[nodeId] ?? []));
  emit(api, "chat.message", `پاسخ «${node.data.title}» در chats/chat-${nodeId}.md ذخیره شد`);
}

/* ---------------- snapshots (§10) ---------------- */

export async function takeSnapshot(api: EngineApi, label: string, quiet = false) {
  const s = api.get();
  const id = `snapshot-${nowStamp()}`;
  await sleep(60);
  const payload = {
    id, at: nowIso(), label, canvas_id: s.canvasId, structure_version: "1.3",
    status: s.execution.status,
    graph: { nodes: s.nodes, edges: s.edges },
    context: s.execution.context,
  };
  await storage.writeJson(`${ROOT}/history/${id}.json`, payload);
  const meta = { id, at: payload.at, label, node_count: s.nodes.length, edge_count: s.edges.length, status: s.execution.status };
  api.set((st) => ({ snapshots: [meta, ...st.snapshots].slice(0, 40) }));
  await storage.writeFile(
    `${ROOT}/history/index.yaml`,
    toYaml({ canvas_id: s.canvasId, snapshot_count: api.get().snapshots.length, snapshots: api.get().snapshots.map((m) => ({ id: m.id, at: m.at, label: m.label })) })
  );
  emit(api, "snapshot.saved", `چک‌پوینت «${label}» در history/ ذخیره شد`);
  if (!quiet) toast(api, "success", "چک‌پوینت ذخیره شد.");
}

export async function restoreSnapshot(api: EngineApi, id: string) {
  try {
    const payload = await storage.readJson<{ graph: { nodes: RFNode[]; edges: RFEdge[] } }>(`${ROOT}/history/${id}.json`);
    const unlocked = payload.graph.nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        lock: { status: "free" as const, locked_by: null, locked_at: null },
        agent: n.data.agent ? { ...n.data.agent, status: "idle" as const } : null,
      },
    }));
    api.set({ nodes: unlocked, edges: payload.graph.edges, execution: emptyExecution() });
    emit(api, "snapshot.restored", `بوم به چک‌پوینت ${id} بازگردانده شد`);
    toast(api, "success", "بوم به چک‌پوینت انتخابی بازگشت.");
    touch(api);
  } catch {
    toast(api, "error", "خواندن چک‌پوینت ناموفق بود.");
  }
}

/* ---------------- node / edge mutations ---------------- */

export async function createNode(
  api: EngineApi,
  nodeType: RFNode["data"]["nodeType"],
  position: { x: number; y: number },
  opts?: Partial<RFNode["data"]> & { title?: string }
): Promise<string> {
  const prefix = nodeType === "agent" ? "node" : nodeType === "output-box" ? "box" : nodeType === "note" ? "note" : nodeType;
  const id = uid(prefix);
  const title = opts?.title ?? (nodeType === "agent" ? "ایجنت جدید" : nodeType === "output-box" ? "جعبه خروجی" : nodeType === "note" ? "یادداشت" : "نود جدید");
  const data = makeNodeData(nodeType, title, api.get().canvas.owner, {
    ...(nodeType === "agent" ? { agent: makeAgentConfig(id, "understander") } : {}),
    ...(nodeType === "output-box" ? { shape: "hexagon" as const } : {}),
    ...opts,
  });
  if (data.agent) data.agent = makeAgentConfig(id, data.agent.role_id, { require_approval: data.agent.require_approval });
  const node: RFNode = { id, type: "lc", position, data };
  api.set((st) => ({ nodes: [...st.nodes, node] }));
  if (nodeType === "agent") {
    const doc: MemDoc = {
      path: `memory/agents/${id}.md`,
      title: `حافظه‌ی ایجنت ${title}`,
      body: "- آخرین ورودی‌ها: —\n- تصمیم‌های گرفته‌شده: —\n- نکات مهم: اولین اجرا هنوز انجام نشده.",
      updated_at: nowIso(), last_accessed: nowIso(), confidence: 0.7, source: "agent",
    };
    api.set((st) => ({ memory: { ...st.memory, agents: { ...st.memory.agents, [id]: doc } } }));
    await storage.writeFile(`${ROOT}/memory/agents/${id}.md`, memoryToMd(doc));
  }
  await writeNodeArtifact(api, id, true);
  emit(api, "node.created", `نود «${title}» (${nodeType}) در ${id} ساخته شد`);
  touch(api);
  return id;
}

export async function deleteNode(api: EngineApi, id: string) {
  const n = getNode(api.get(), id);
  if (!n) return;
  const connected = api.get().edges.filter((e) => e.source === id || e.target === id);
  api.set((st) => ({
    nodes: st.nodes.filter((x) => x.id !== id),
    edges: st.edges.filter((e) => e.source !== id && e.target !== id),
  }));
  await storage.deleteFile(nodePath(id));
  for (const e of connected) await storage.deleteFile(edgePath(e.id));
  emit(api, "node.deleted", `نود «${n.data.title}» و ${connected.length} یال متصل حذف شد`);
  toast(api, "info", `«${n.data.title}» حذف شد`);
  touch(api);
}

export async function createEdge(api: EngineApi, source: string, target: string): Promise<string | null> {
  if (source === target) return null;
  const id = uid("edge");
  const data = makeEdgeData();
  const edge: RFEdge = { id, source, target, type: "lc", data };
  api.set((st) => ({ edges: [...st.edges, edge] }));
  await writeEdgeArtifact(api, id, true);
  emit(api, "edge.created", `یال ${source} ← ${target} ساخته شد`);
  touch(api);
  return id;
}

export async function deleteEdge(api: EngineApi, id: string) {
  api.set((st) => ({ edges: st.edges.filter((e) => e.id !== id) }));
  await storage.deleteFile(edgePath(id));
  emit(api, "edge.deleted", `یال ${id} حذف شد`);
  touch(api);
}

/* ---------------- workspace init & seed (§2) ---------------- */

export async function hydrate(api: EngineApi): Promise<boolean> {
  const hasManifest = await storage.exists(`${ROOT}/manifest.json`);
  if (!hasManifest) return false;
  try {
    const state = await storage.readJson<{
      canvas: AppState["canvas"]; memory: AppState["memory"]; outputs: AppState["outputs"];
      chats: AppState["chats"]; logs: AppState["logs"]; snapshots: AppState["snapshots"];
      execution: AppState["execution"];
    }>(`${ROOT}/state.json`);
    const graph = await storage.readJson<{ nodes: RFNode[]; edges: RFEdge[] }>(`${ROOT}/graph.json`);
    api.set({
      canvas: state.canvas, memory: state.memory, outputs: state.outputs ?? {}, chats: state.chats ?? {},
      logs: state.logs ?? {}, snapshots: state.snapshots ?? [],
      nodes: graph.nodes.map((n) => ({
        ...n,
        data: { ...n.data, lock: { status: "free" as const, locked_by: null, locked_at: null } },
      })),
      edges: graph.edges,
      execution: emptyExecution(),
    });
    return true;
  } catch {
    return false;
  }
}

export async function seedWorkspace(api: EngineApi) {
  const s = api.get();
  const seed = buildSeed(s.settings.owner);
  api.set({
    canvas: seed.canvas, nodes: seed.nodes, edges: seed.edges, memory: seed.memory,
    outputs: {}, chats: {}, logs: {}, snapshots: [], execution: emptyExecution(),
  });
  const st = api.get();
  const boot = async (path: string, content: string) => {
    await storage.writeFile(`${ROOT}/${path}`, content);
    api.set((prev) => ({ bootLines: [...prev.bootLines, { text: path, ok: true }] }));
    await sleep(46);
  };

  await boot("manifest.json", JSON.stringify({ version: "1.0", canvas_id: st.canvasId, structure_version: "1.3", last_validated: nowIso().slice(0, 10) }, null, 2));
  await boot("canvas.yaml", toYaml({ ...st.canvas, id: st.canvasId }));
  await boot("canvas-overview.md", overviewMd(st));
  for (const n of st.nodes) await boot(`nodes/${n.id}.md`, nodeToMarkdown(n.id, n.data));
  for (const e of st.edges) if (e.data) await boot(`edges/${e.id}.yaml`, edgeToYaml(e.id, e.source, e.target, e.data));
  await boot("memory/global.md", memoryToMd(st.memory.global));
  await boot("memory/decisions.md", memoryToMd(st.memory.decisions));
  await boot("memory/progress.md", memoryToMd(st.memory.progress));
  await boot("memory/user.md", memoryToMd(st.memory.user));
  for (const [id, doc] of Object.entries(st.memory.agents)) await boot(`memory/agents/${id}.md`, memoryToMd(doc));
  await boot("history/index.yaml", toYaml({ canvas_id: st.canvasId, snapshot_count: 0, snapshots: [] }));
  for (const role of ["understander", "risk-analyst", "solution-designer", "decision-maker"]) {
    const r = roleById(role);
    await boot(`library/roles/${role}.json`, JSON.stringify({
      id: r.id, name: r.name, description: r.description, system_prompt: `prompts/${r.id}.md`,
      model: r.model, tools: r.tools, version: "1.0",
      default_output_contract: { format: "markdown", required_fields: r.required_fields, validator: `schemas/${r.id}.schema.json`, save_to: "outputs/{node_id}/" },
      default_context_contract: { allowed_read_paths: ["canvas-overview.md", "memory/agents/{node_id}.md"], allowed_write_paths: ["outputs/{node_id}/", "memory/agents/{node_id}.md"] },
    }, null, 2));
  }
  await boot("library/shapes/agent-card.json", JSON.stringify({ id: "agent-card", name: "کارت ایجنت", type: "shape", default_size: { width: 280, height: 160 }, default_style: { strokeColor: "#0b1312", strokeWidth: 2, fillStyle: "solid", opacity: 100 } }, null, 2));
  await boot("library/shapes/hex-process.json", JSON.stringify({ id: "hex-process", name: "شش‌ضلعی فرایند", type: "shape", default_size: { width: 240, height: 140 }, default_style: { strokeColor: "#0b1312", strokeWidth: 2, fillStyle: "solid", opacity: 100 } }, null, 2));
  await boot("library/templates/quick-pipeline/template.yaml", toYaml({ template_id: "quick-pipeline", version: "1.0", description: "خط لوله‌ی ۴ مرحله‌ای فهم، ریسک، راه‌حل، تصمیم", nodes: 5, edges: 4 }));
  await storage.writeJson(`${ROOT}/graph.json`, {
    canvas_id: st.canvasId, version: "1.0", structure_version: "1.3",
    nodes: st.nodes.map((n) => ({ id: n.id, type: n.type, label: n.data.title, position: n.position, data: n.data, config_ref: `nodes/${n.id}.md` })),
    edges: st.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.data?.edgeType, label: e.data?.label, data: e.data, config_ref: `edges/${e.id}.yaml` })),
  });
  await storage.writeJson(`${ROOT}/state.json`, {
    canvas: st.canvas, memory: st.memory, outputs: {}, chats: {}, logs: {}, snapshots: [],
    execution: emptyExecution(), saved_at: nowIso(),
  });
  api.set((prev) => ({ bootLines: [...prev.bootLines, { text: "graph.json + state.json", ok: true }] }));
  emit(api, "system", "بوم جدید مقداردهی اولیه شد — ساختار §2 کامل است");
}

export async function initWorkspace(api: EngineApi) {
  const ok = await hydrate(api);
  if (!ok) await seedWorkspace(api);
  api.set({ booted: true });
  toast(api, "success", ok ? "بوم از حافظه‌ی IndexedDB بارگذاری شد." : "بوم جدید با ساختار فایل‌محور آماده شد.");
}

export async function resetWorkspace(api: EngineApi) {
  await storage.clear();
  api.set({ booted: false, bootLines: [], events: [], toasts: [], snapshots: [], outputs: {}, chats: {}, logs: {} });
  await seedWorkspace(api);
  api.set({ booted: true });
  toast(api, "success", "فضای کار پاک و دوباره ساخته شد.");
}
