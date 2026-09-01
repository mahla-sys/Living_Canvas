/* ============================================================
   Living Canvas — engine: MemoryManager §6, Executor §7,
   checkpoints §10, persistence, DeepSeek provider
   ============================================================ */
import {
  storage, setStorage, createDefaultStorage, storageMode, HttpStorageAdapter, bus, uid, nowIso, nowStamp, fmtClock, sleep, debounce,
  nodeToMarkdown, edgeToYaml, memoryToMd, outputsIndexYaml, chatToMd, logText, toYaml, frontmatter,
  type BusEventType, type OutputEntry, type MemDoc, type ChatMsg, type Stroke, type StrokePoint, type NodeType,
} from "./core";
import {
  FsAccessStorageAdapter, isFsAccessSupported, pickCanvasDirectory, ensurePermission,
  writeFilesToDirectory, readCanvasFromDirectory, ensureStructure, type FsDirHandle,
} from "./fs-access";
import {
  collectCanvasFiles, buildBundle, parseBundleText, deriveCanvasFromFiles, installFiles,
  downloadJson, readFileAsText, bundleBytes, MAX_BUNDLE_BYTES, type CanvasFiles,
} from "./portable";
import {
  ROOT, CANVAS_ID, APP_VERSION, buildSeed, emptyExecution, roleById,
  makeAgentConfig, makeNodeData, makeEdgeData, makeMemDoc,
  BUILTIN_TEMPLATE, builtinTemplateInfo,
  type AppState, type RFNode, type RFEdge, type TemplateSpec, type TemplateInfo,
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

let lastLockToast = 0;

/** Node edit — while a run holds the lock, user edits are rejected (§12.5) */
export function patchNode(api: EngineApi, id: string, data: Partial<RFNode["data"]>, internal = false) {
  if (!internal) {
    const n = getNode(api.get(), id);
    if (n && n.data.lock.status === "locked" && (n.data.lock.locked_by ?? "").startsWith("run-")) {
      emit(api, "system", `Edit of “${n.data.title}” was rejected — the node is locked by a run (§12.5)`);
      const now = Date.now();
      if (now - lastLockToast > 2500) {
        lastLockToast = now;
        toast(api, "warn", "This node is locked mid-run — editing is not allowed until the run ends (§12.5).");
      }
      return;
    }
  }
  api.set((st) => ({
    nodes: st.nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, ...data, updated_at: nowIso() } } : n
    ),
  }));
}

export async function writeNodeArtifact(api: EngineApi, id: string, quiet = false) {
  const n = getNode(api.get(), id);
  if (!n) return;
  await storage.writeFile(nodePath(id), nodeToMarkdown(id, n.data, n.position));
  if (!quiet) emit(api, "file.written", `nodes/${id}.md written`);
}

export async function writeEdgeArtifact(api: EngineApi, id: string, quiet = false) {
  const e = api.get().edges.find((x) => x.id === id);
  if (!e || !e.data) return;
  await storage.writeFile(edgePath(id), edgeToYaml(id, e.source, e.target, e.data));
  if (!quiet) emit(api, "file.written", `edges/${id}.yaml written`);
}

/* ---------------- logs ---------------- */

export async function appendLog(api: EngineApi, nodeId: string, line: string) {
  const stamp = fmtClock(nowIso());
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
      : last ? last.data.title : "not started";
  const summary = `The canvas “${s.canvas.title}” is an agent-driven pipeline with ${s.nodes.filter((n) => n.data.nodeType === "agent").length} agents. Run status: ${s.execution.status}.`;
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
    `# Canvas summary\n\n${summary}\n\nAgents read this file before reading the whole canvas.\n\n## Status\n- run: **${s.execution.status}**\n- current step: ${currentStep}\n- nodes: ${s.nodes.length} — edges: ${s.edges.length}`
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

let saveChain: Promise<void> = Promise.resolve();

async function saveNow(api: EngineApi) {
  await writeCore(api.get());
  api.set({ saveState: "saved" });
  const s = api.get();
  emit(api, "graph.saved", `graph.json saved — ${s.nodes.length} nodes, ${s.edges.length} edges`);
}

/**
 * debounced save (§5.2). every write sits on the chain so flush can actually
 * wait for all pending writes — before an Export and before a reload.
 */
const debouncedSave = debounce((api: EngineApi) => {
  saveChain = saveChain.then(() => saveNow(api)).catch(() => undefined);
}, 700);

export function touch(api: EngineApi) {
  api.set({ saveState: "saving" });
  debouncedSave(api);
}

/** Waits until every pending write has landed on the StorageAdapter. Export always calls this first. */
export async function flushPending(): Promise<void> {
  debouncedSave.flush();
  await saveChain;
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
  async write(api: EngineApi, agentId: string, content: string, confidence: number, targetPath?: string): Promise<boolean> {
    const s = api.get();
    const node = getNode(s, agentId);
    const agent = node?.data.agent;
    if (!agent) return false;
    const path = targetPath ?? `memory/agents/${agentId}.md`;
    // 1) access check against context_contract (§9)
    if (!agent.context_contract.allowed_write_paths.some((p) => path.startsWith(p))) {
      emit(api, "validation.failed", `write to ${path} denied for ${agentId} — outside allowed_write_paths`);
      return false;
    }
    // 2) lock check
    if (node!.data.lock.status === "locked" && node!.data.lock.locked_by && !node!.data.lock.locked_by.startsWith("run-")) {
      emit(api, "system", `memory write rejected — node is locked by ${node!.data.lock.locked_by}`);
      return false;
    }
    const prev = s.memory.agents[agentId];
    // 3/4) confidence conflict
    if (prev && prev.confidence > confidence) {
      emit(api, "memory.updated", `memory conflict at ${path} — previous entry (confidence ${prev.confidence}) kept`);
      toast(api, "warn", "Memory conflict: the previous entry had higher confidence and was kept.");
      return false;
    }
    if (prev && prev.confidence === confidence && prev.body.trim() !== content.trim()) {
      emit(api, "memory.updated", `equal-weight conflict at ${path} — the user is asked in a later version; replaced for now`);
    }
    const fresh: MemDoc = {
      path,
      title: prev?.title ?? `Memory of ${node!.data.title}`,
      body: content,
      updated_at: nowIso(),
      last_accessed: nowIso(),
      confidence,
      source: "agent",
    };
    api.set((st) => ({ memory: { ...st.memory, agents: { ...st.memory.agents, [agentId]: fresh } } }));
    await storage.writeFile(`${ROOT}/${path}`, memoryToMd(fresh));
    emit(api, "memory.updated", `${path} updated (confidence ${confidence})`);
    return true;
  },
};

/* ---------------- fallback probe (§12.6) ---------------- */

export async function testFallback(api: EngineApi) {
  const s = api.get();
  if (s.settings.provider !== "deepseek" || !s.settings.apiKey.trim()) {
    emit(api, "system", "fallback test: no API key configured — internal simulator is active (phase 1 default)");
    toast(api, "info", "No key configured; the system runs on the internal simulator.");
    return;
  }
  emit(api, "system", "fallback test: calling DeepSeek for real…");
  try {
    const text = await askModel(s.settings.apiKey.trim(), s.settings.model, [
      { role: "user", content: "Answer in one word: hello" },
    ]);
    emit(api, "system", `fallback test passed — model answered “${String(text).slice(0, 50)}”`);
    toast(api, "success", "DeepSeek connection is up ✓");
  } catch (err) {
    emit(api, "system", `fallback test: “${String(err)}” — runs fall back to the simulator automatically (§12.6)`);
    toast(api, "warn", "Connection failed; runs continue on the simulator without interruption.");
  }
}

/* ---------------- contract self-test (§9 verification) ---------------- */

export async function contractSelfTest(api: EngineApi, preferNodeId?: string) {
  const s = api.get();
  const subject = (preferNodeId && getNode(s, preferNodeId)?.data.agent ? getNode(s, preferNodeId)! : s.nodes.find((n) => n.data.agent));
  if (!subject?.data.agent) {
    toast(api, "warn", "No agent node available to self-test.");
    return;
  }
  const id = subject.id;
  const other = s.nodes.find((n) => n.data.agent && n.id !== id);
  emit(api, "system", `context contract self-test started (§9) — subject: ${id}`);
  await sleep(120);

  const legit = await MemoryManager.write(api, id, api.get().memory.agents[id]?.body ?? "- self-test: memory content preserved.", 0.8);
  await sleep(120);
  const denyGlobal = await MemoryManager.write(api, id, "attempt to write outside the contract", 0.95, "memory/global.md");
  await sleep(120);
  const denyForeign = other
    ? await MemoryManager.write(api, id, 'attempt to write in another agent\'s memory', 0.95, `memory/agents/${other.id}.md`)
    : false;

  const pass = legit && !denyGlobal && !denyForeign;
  if (pass) {
    emit(api, "system", `self-test passed: the allowed write was accepted; 2 out-of-contract attempts (global.md${other ? ` and the memory of ${other.id}` : ""}) were rejected ✓`);
    toast(api, "success", "Context contract is sound — writes outside the allowed path were rejected.");
  } else {
    emit(api, "validation.failed", "contract self-test FAILED — §9 and allowed_write_paths need review");
    toast(api, "error", "Self-test failed! Contract behaviour does not match §9.");
  }
}

/* ---------------- outputs & validation (§3.6, §12.10) ---------------- */

export const FIELD_DESC: Record<string, string> = {
  summary: "summary",
  problem_statement: "the precise problem statement",
  questions_asked: "questions raised",
  risks: "risk list",
  decision: "recommended decision",
  solution: "executable solution",
  next_actions: "next actions",
  approval_request: "human approval request",
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
  emit(api, "output.written", `${entries.length} output files saved in outputs/${shared ? `shared/${nodeId}` : nodeId}/`);
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
  if (!text) throw new Error("empty response from the model");
  return String(text);
}

/* ---------------- simulated generation ---------------- */

function simFields(roleId: string, title: string, upstream: string, owner: string): Record<string, string> {
  const d = nowIso().slice(0, 10);
  const up = upstream ? upstream.slice(0, 140) : "—";
  switch (roleId) {
    case "understander":
      return {
        summary: `The “${title}” problem was reviewed in a simulated session with the user. Core of the problem: the gap between the current experience of students and the expectation of personalised learning. Reference input: ${up}`,
        problem_statement: `Students aged 12 to 15 in online classes get no immediate feedback and lose motivation in week three. Before any build, the solution must define an “active engagement” metric. (recorded on ${d} by the ${owner} pipeline)`,
        questions_asked: `1. What exactly is the success metric for “active learning”?\n2. What are the time and budget limits of the pilot phase?\n3. Is access to teachers for interviews possible?`,
      };
    case "risk-analyst":
      return {
        summary: `Three main risks were identified for “${title}”. Analysis input from the previous node: ${up}`,
        risks: `- risk 1: dependence on teacher availability — severity 6\n- risk 2: technical complexity of instant feedback — severity 5\n- risk 3: motivation drop in the pilot — severity 4\n\nTotal risk score: **5 out of 10** (acceptable with fixes)`,
        decision: `Conditional approval: continue the path with a revision of step two. No risk exceeds the threshold of 7.`,
      };
    case "solution-designer":
      return {
        summary: `The “${title}” solution was designed in three steps; the reported risks are covered in step 2.`,
        solution: `step 1: build the instant-feedback prototype (output: clickable demo — criterion: cover 80% of scenarios)\nstep 2: test with 20 students (output: engagement report — criterion: retain 60% in week three)\nstep 3: refine and prepare deployment (output: version 0.9 — criterion: no critical errors)`,
        next_actions: `- define the “active engagement” metric with the user\n- recruit 20 students for the test\n- schedule step 1 on the canvas`,
      };
    default:
      return {
        summary: `All allowed outputs were read. No serious conflict between steps; one small inconsistency in the success criteria, which the decision accounts for.`,
        decision: `Final decision: start step 1 (prototype) with a limited budget and a weekly review. Reasons: acceptable risk (5/10), a clear three-step solution, alignment with the canvas goal.`,
        approval_request: `This decision needs human approval before it runs. Options: approve and start step 1 / revise and return to the “Design the solution” node / reject entirely.`,
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
    description: "structured output data",
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

  // cancellation guard — aborts the run if the user stopped it or restored a checkpoint (§12.5)
  const aborted = () => api.get().execution.run_id !== runId;
  const guard = async (ms: number) => {
    await sleep(ms);
    if (aborted()) throw new Error("__abort__");
  };

  // lock §3.4
  patchNode(api, nodeId, { lock: { status: "locked", locked_by: runId, locked_at: nowIso() }, agent: agent ? { ...agent, status: "running" } : agent }, true);
  emit(api, "lock.acquired", `node ${nodeId} locked by ${runId}`);
  emit(api, "node.started", `run of “${node.data.title}” started`);
  api.set((st) => ({ execution: { ...st.execution, current_node_id: nodeId } }));
  await appendLog(api, nodeId, `== run started (${runId}) ==`);

  try {
    let steps = 0;
    const maxSteps = agent?.max_steps ?? 6;

    // step 1 — overview (§9)
    await appendLog(api, nodeId, "tool get_canvas_overview → read canvas-overview.md");
    await guard(delay * 0.7);
    steps++;

    // step 2 — brief
    if (agent) {
      const role = roleById(agent.role_id);
      await appendLog(api, nodeId, `tool get_agent_brief → role “${role.name}” loaded (max_steps=${agent.max_steps})`);
      await guard(delay * 0.6);
      steps++;
    }

    // step 3 — read_memory via MemoryManager
    let memoryTxt = "";
    if (agent) {
      const parts = await MemoryManager.read(api, nodeId);
      memoryTxt = parts.join("\n\n");
      await appendLog(api, nodeId, `tool read_memory → ${agent.context_contract.allowed_read_paths.length} allowed paths read`);
      await guard(delay * 0.6);
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
      ? `calling model ${api.get().settings.model}…`
      : "generating a response in the phase 1 simulator…");
    let fields: Record<string, string>;
    const required = agent?.context_contract.output_contract.required_fields ?? ["summary"];
    if (agent && api.get().settings.provider === "deepseek" && api.get().settings.apiKey) {
      try {
        const text = await askModel(api.get().settings.apiKey, api.get().settings.model, [
          { role: "system", content: agent.system_prompt },
          { role: "user", content: `Canvas summary and memory:\n${memoryTxt.slice(0, 1200)}\n\nOutput of the previous node:\n${upstream.slice(0, 800)}\n\nWrite the output with these fields: ${required.join(", ")}.` },
        ]);
        fields = { summary: text, ...simFields(agent.role_id, node.data.title, upstream, s0.canvas.owner) };
      } catch (err) {
        await appendLog(api, nodeId, `API error: ${String(err)} — falling back to the simulator (§12.6 fallback)`);
        toast(api, "warn", "DeepSeek unreachable; used the internal simulator.");
        fields = simFields(agent.role_id, node.data.title, upstream, s0.canvas.owner);
      }
    } else {
      await guard(delay * 1.4);
      fields = simFields(agent?.role_id ?? "decision-maker", node.data.title, upstream, s0.canvas.owner);
    }
    steps++;
    if (steps > maxSteps) throw new Error("max_steps exceeded (§12.3)");

    // step 5 — write_output + validation §3.6
    const entries = buildEntries(nodeId, required, fields);
    const missing = validateOutput(entries, required);
    if (missing.length) {
      emit(api, "validation.failed", `output of ${nodeId} is missing ${missing.join(", ")} — rejected`);
      throw new Error(`invalid output: ${missing.join(", ")}`);
    }
    await writeOutputs(api, nodeId, entries);
    await appendLog(api, nodeId, `tool write_output → validation passed (${required.length}/${required.length} fields)`);
    steps++;

    // step 6 — write_memory §6
    const memLines = [
      `# Memory of ${node.data.title}`,
      "",
      `- latest inputs: ${upstream ? upstream.slice(0, 90).replace(/\n/g, " ") + "…" : "the output of the previous node was unavailable"}`,
      `- decisions taken: ${(fields.decision ?? fields.problem_statement ?? "").slice(0, 120).replace(/\n/g, " ")}`,
      `- notes for the next run: the required fields ${required.join(", ")} must always be in the output.`,
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
    patchNode(api, nodeId, { lock: { status: "free", locked_by: null, locked_at: null }, agent: agent ? { ...agent, status: "done" } : agent }, true);
    emit(api, "lock.released", `lock of ${nodeId} released`);
    emit(api, "node.completed", `“${node.data.title}” completed successfully`);
    await appendLog(api, nodeId, "== completed ==");
    api.set((st) => ({ execution: { ...st.execution, completed: [...st.execution.completed, nodeId] } }));
    toast(api, "success", `Node “${node.data.title}” is done ✓`);

    // checkpoint §10
    await takeSnapshot(api, `end of “${node.data.title}”`, true);
    if (aborted()) throw new Error("__abort__");

    // human-in-the-loop
    if (agent?.require_approval) {
      api.set((st) => ({ execution: { ...st.execution, status: "waiting_approval" } }));
      emit(api, "run.paused", `run paused for human approval — node “${node.data.title}”`);
      toast(api, "warn", "The decision of this node needs your approval.");
    }
  } catch (err) {
    if (String(err).includes("__abort__")) {
      // run was cancelled mid-flight (stop / restore) — leave state to the canceller
      emit(api, "system", `run of “${node.data.title}” cancelled by a stop or a rollback`);
      return;
    }
    const agentNow = getNode(api.get(), nodeId)?.data.agent;
    patchNode(api, nodeId, { lock: { status: "free", locked_by: null, locked_at: null }, agent: agentNow ? { ...agentNow, status: "failed" } : agentNow }, true);
    emit(api, "node.failed", `run of “${node.data.title}” failed: ${String(err)}`);
    await appendLog(api, nodeId, `error: ${String(err)}`);
    api.set((st) => ({ execution: { ...st.execution, status: "failed" } }));
    toast(api, "error", `Error in “${node.data.title}” — the run stopped`);
  }
}

async function collectToBox(api: EngineApi, boxId: string) {
  const s = api.get();
  const box = getNode(s, boxId);
  if (!box) return;
  emit(api, "node.started", `collecting outputs in “${box.data.title}”`);
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
    `# Final output package\n\n${parts.join("\n\n---\n\n")}`
  );
  const entries: OutputEntry[] = [{
    file: "final-package.md", type: "summary", description: "final package of pipeline outputs", content,
  }];
  await writeOutputs(api, boxId, entries, true);
  patchNode(api, boxId, { content: `Final package with ${parts.length} sections saved in outputs/shared/${boxId}/.` }, true);
  emit(api, "node.completed", `“${box.data.title}” collected ${parts.length} outputs`);
  api.set((st) => ({ execution: { ...st.execution, completed: [...st.execution.completed, boxId] } }));
  await takeSnapshot(api, "final output collection", true);
}

async function processQueue(api: EngineApi) {
  while (true) {
    const ex = api.get().execution;
    if (ex.status !== "running") return;
    const nextId = ex.queue.find((q) => !ex.completed.includes(q));
    if (!nextId) {
      api.set((st) => ({ execution: { ...st.execution, status: "completed", current_node_id: null } }));
      emit(api, "run.completed", "the pipeline run completed successfully");
      toast(api, "success", "Pipeline finished — every output is saved ✓");
      await takeSnapshot(api, "end of full run", false);
      touch(api);
      return;
    }
    // edge condition check §7.1
    const prev = ex.current_node_id;
    if (prev && prev !== nextId) {
      const edge = api.get().edges.find((e) => e.source === prev && e.target === nextId);
      const cond = edge?.data?.trigger;
      if (cond?.type === "condition" && cond.condition && !evalCondition(cond.condition, ex.context)) {
        emit(api, "system", `edge condition “${cond.condition}” was not met — ${nextId} skipped`);
        await appendLog(api, nextId, `skipped: condition ${cond.condition} is not satisfied`);
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
    toast(api, "warn", "A run is in progress; stop or approve it first.");
    return;
  }
  const start = findStart(s);
  if (!start) {
    toast(api, "error", "No agent node to run.");
    return;
  }
  const order = computeOrder(s, start.id);
  api.set({
    execution: {
      ...emptyExecution(), run_id: uid("run"), status: "running",
      queue: order, started_at: nowIso(),
    },
  });
  emit(api, "run.started", `pipeline started from “${start.data.title}” — ${order.length} nodes queued`);
  toast(api, "info", `Run started — ${order.length} nodes queued`);
  await processQueue(api);
}

export async function runSingle(api: EngineApi, nodeId: string) {
  const s = api.get();
  if (s.execution.status === "running" || s.execution.status === "waiting_approval") {
    toast(api, "warn", "Another run is already in progress.");
    return;
  }
  api.set({ execution: { ...emptyExecution(), run_id: uid("run"), status: "running", queue: [nodeId], started_at: nowIso() } });
  emit(api, "run.started", `single-node run: ${nodeId}`);
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
  emit(api, "run.resumed", "human approval recorded — the run continued");
  toast(api, "success", "Approved — resuming the run…");
  await processQueue(api);
}

export function rejectRun(api: EngineApi) {
  api.set((st) => ({ execution: { ...st.execution, status: "stopped", current_node_id: null, run_id: null } }));
  emit(api, "run.stopped", "the decision was rejected by the user — run stopped");
  toast(api, "info", "Decision rejected and the run stopped.");
  touch(api);
}

export function stopRun(api: EngineApi) {
  const s = api.get();
  const cur = s.execution.current_node_id;
  if (cur) {
    const n = getNode(s, cur);
    const ag = n?.data.agent;
    patchNode(api, cur, { lock: { status: "free", locked_by: null, locked_at: null }, agent: ag ? { ...ag, status: ag.status === "running" ? "idle" : ag.status } : ag }, true);
  }
  // invalidating run_id makes any in-flight node abort at its next guard (§12.5)
  api.set((st) => ({ execution: { ...st.execution, status: "stopped", current_node_id: null, run_id: null } }));
  emit(api, "run.stopped", "run stopped by the user");
  toast(api, "info", "Run stopped.");
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
  emit(api, "system", "run status reset");
  touch(api);
}

/* ---------------- chat (§1.3 working memory) ---------------- */

function simChatReply(roleId: string, roleTitle: string, userText: string, memDoc?: MemDoc): string {
  const short = userText.length > 80 ? userText.slice(0, 80) + "…" : userText;
  const base: Record<string, string[]> = {
    understander: [
      `I read your message: “${short}”. From my side there is still one ambiguity — what exactly is the numeric success metric? Once you set it, I will finalise the problem statement.`,
      `Good point. I will add it to questions_asked. Which group of users does this matter to most?`,
    ],
    "risk-analyst": [
      `I weighed your request against the current risk list. It looks like you mean the risk “dependence on teacher availability” — severity 6, reducible with one corrective step.`,
      `Early analysis: if this change is applied, the total risk score drops from 5 to 4. Should I update the report?`,
    ],
    "solution-designer": [
      `Your suggestion fits step 2 of the solution. I would set the success criterion of that step to “retain 60% of users in week three”. Agreed?`,
      `This idea can run as a small experiment before step 1. Output: a short A/B report. Estimated time: one week.`,
    ],
    "decision-maker": [
      `My summary of your message: you agree with the current path but worry about the schedule. I will add a weekly review to the final decision.`,
      `The final decision still needs human approval. If you want, run the pipeline so the decision package is built.`,
    ],
  };
  const opts = base[roleId] ?? base["decision-maker"];
  const pick = opts[(userText.length + roleTitle.length) % opts.length];
  const memNote = memDoc ? `\n\n_memory last updated: ${memDoc.updated_at.slice(0, 10)} — confidence ${memDoc.confidence}_` : "";
  return pick + memNote;
}

export async function sendChat(api: EngineApi, nodeId: string, text: string) {
  const s = api.get();
  const node = getNode(s, nodeId);
  if (!node) return;
  const msg: ChatMsg = { role: "user", text, at: nowIso() };
  api.set((st) => ({ chats: { ...st.chats, [nodeId]: [...(st.chats[nodeId] ?? []), msg] } }));
  api.set((st) => ({ typing: { ...st.typing, [nodeId]: true } }));
  emit(api, "chat.message", `user message sent to “${node.data.title}”`);

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
      toast(api, "warn", "Model unavailable; the reply was simulated.");
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
  emit(api, "chat.message", `reply from “${node.data.title}” saved in chats/chat-${nodeId}.md`);
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
  emit(api, "snapshot.saved", `checkpoint “${label}” saved in history/`);
  if (!quiet) toast(api, "success", "Checkpoint saved.");
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
    emit(api, "snapshot.restored", `canvas restored to checkpoint ${id}`);
    toast(api, "success", "The canvas rolled back to the selected checkpoint.");
    touch(api);
  } catch {
    toast(api, "error", "Reading the checkpoint failed.");
  }
}

/* ---------------- freehand drawing layer (§2 strokes/) ---------------- */

interface Box { minX: number; minY: number; maxX: number; maxY: number }

function strokeBox(pts: StrokePoint[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export interface StrokeCluster {
  strokes: Stroke[];
  box: Box;
  cx: number;
  cy: number;
  order: number;
}

/** Groups nearby strokes with union-find over their bounding boxes */
export function clusterStrokes(strokes: Stroke[], gap = 80): StrokeCluster[] {
  const boxes = strokes.map((s) => strokeBox(s.points));
  const parent = strokes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const touch = a.minX - gap < b.maxX && a.maxX + gap > b.minX && a.minY - gap < b.maxY && a.maxY + gap > b.minY;
      if (touch) union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  strokes.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  });
  return [...groups.values()]
    .map((idxs) => {
      const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const i of idxs) {
        box.minX = Math.min(box.minX, boxes[i].minX);
        box.minY = Math.min(box.minY, boxes[i].minY);
        box.maxX = Math.max(box.maxX, boxes[i].maxX);
        box.maxY = Math.max(box.maxY, boxes[i].maxY);
      }
      return {
        strokes: idxs.map((i) => strokes[i]),
        box,
        cx: (box.minX + box.maxX) / 2,
        cy: (box.minY + box.maxY) / 2,
        order: Math.min(...idxs.map((i) => new Date(strokes[i].created_at).getTime())),
      };
    })
    .sort((a, b) => a.order - b.order);
}

export async function addStroke(api: EngineApi, stroke: Stroke) {
  api.set((st) => ({ strokes: [...st.strokes, stroke] }));
  await storage.writeJson(`${ROOT}/strokes/${stroke.id}.json`, stroke);
  emit(api, "stroke.created", `stroke ${stroke.id.slice(0, 16)}… saved in strokes/ (${stroke.points.length} points)`);
}

export async function removeStroke(api: EngineApi, id: string) {
  api.set((st) => ({ strokes: st.strokes.filter((s) => s.id !== id) }));
  await storage.deleteFile(`${ROOT}/strokes/${id}.json`);
}

export async function undoStroke(api: EngineApi) {
  const s = api.get();
  const last = s.strokes[s.strokes.length - 1];
  if (!last) {
    toast(api, "info", "Nothing to undo.");
    return;
  }
  await removeStroke(api, last.id);
  emit(api, "stroke.deleted", `last stroke (${last.id.slice(0, 14)}…) removed`);
}

export async function clearStrokes(api: EngineApi) {
  const s = api.get();
  if (!s.strokes.length) return;
  await Promise.all(s.strokes.map((st) => storage.deleteFile(`${ROOT}/strokes/${st.id}.json`)));
  api.set({ strokes: [] });
  emit(api, "strokes.cleared", `${s.strokes.length} strokes cleared from the drawing layer`);
  toast(api, "info", "Drawing layer emptied.");
}

/** Converts strokes into a graph — one node per cluster, in drawing order */
export async function convertStrokesToGraph(api: EngineApi, opts: { nodeType: NodeType; connect: boolean }) {
  const s = api.get();
  const clusters = clusterStrokes(s.strokes);
  if (!clusters.length) {
    toast(api, "warn", "No stroke to convert — draw something first.");
    return;
  }
  emit(api, "strokes.converted", `conversion started — ${clusters.length} clusters found`);
  const ids: string[] = [];
  let i = 1;
  for (const c of clusters) {
    const title = `Sketch ${i++}`;
    const id = await createNode(api, opts.nodeType, { x: c.cx - 40, y: c.cy - 32 }, {
      title,
      content: `This node was converted from the drawing layer.\n\n- cluster centre: (${Math.round(c.cx)}, ${Math.round(c.cy)})\n- stroke count: ${c.strokes.length}`,
    });
    ids.push(id);
  }
  if (opts.connect && ids.length > 1) {
    for (let k = 0; k < ids.length - 1; k++) await createEdge(api, ids[k], ids[k + 1]);
  }
  emit(api, "strokes.converted", `${clusters.length} “${opts.nodeType}” nodes built from strokes${opts.connect ? " and connected in drawing order" : ""}`);
  toast(api, "success", `${clusters.length} nodes built from strokes — the strokes stay as the reference document.`);
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
  const title = opts?.title ?? (nodeType === "agent" ? "New agent" : nodeType === "output-box" ? "Output box" : nodeType === "note" ? "Note" : "New node");
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
      title: `Memory of ${title}`,
      body: "- latest inputs: —\n- decisions taken: —\n- notes: the first run has not happened yet.",
      updated_at: nowIso(), last_accessed: nowIso(), confidence: 0.7, source: "agent",
    };
    api.set((st) => ({ memory: { ...st.memory, agents: { ...st.memory.agents, [id]: doc } } }));
    await storage.writeFile(`${ROOT}/memory/agents/${id}.md`, memoryToMd(doc));
  }
  await writeNodeArtifact(api, id, true);
  emit(api, "node.created", `node “${title}” (${nodeType}) created at ${id}`);
  touch(api);
  return id;
}

export async function deleteNode(api: EngineApi, id: string) {
  const n = getNode(api.get(), id);
  if (!n) return;
  if (n.data.lock.status === "locked" && (n.data.lock.locked_by ?? "").startsWith("run-")) {
    emit(api, "system", `delete of “${n.data.title}” rejected — the node is locked by a run (§12.5)`);
    toast(api, "warn", "Deleting a node mid-run is not allowed (§12.5).");
    return;
  }
  const connected = api.get().edges.filter((e) => e.source === id || e.target === id);
  api.set((st) => ({
    nodes: st.nodes.filter((x) => x.id !== id),
    edges: st.edges.filter((e) => e.source !== id && e.target !== id),
  }));
  await storage.deleteFile(nodePath(id));
  for (const e of connected) await storage.deleteFile(edgePath(e.id));
  emit(api, "node.deleted", `node “${n.data.title}” and ${connected.length} connected edges deleted`);
  toast(api, "info", `“${n.data.title}” deleted`);
  touch(api);
}

export async function createEdge(api: EngineApi, source: string, target: string): Promise<string | null> {
  if (source === target) return null;
  const id = uid("edge");
  const data = makeEdgeData();
  const edge: RFEdge = { id, source, target, type: "lc", data };
  api.set((st) => ({ edges: [...st.edges, edge] }));
  await writeEdgeArtifact(api, id, true);
  emit(api, "edge.created", `edge ${source} ← ${target} created`);
  touch(api);
  return id;
}

export async function deleteEdge(api: EngineApi, id: string) {
  api.set((st) => ({ edges: st.edges.filter((e) => e.id !== id) }));
  await storage.deleteFile(edgePath(id));
  emit(api, "edge.deleted", `edge ${id} deleted`);
  touch(api);
}

/* ---------------- workspace init & seed (§2) ---------------- */

/** Free drawing layer, from separate files (§2 / §3 strokes). */
async function loadStrokes(): Promise<Stroke[]> {
  const strokes: Stroke[] = [];
  try {
    for (const f of await storage.listDirectory(`${ROOT}/strokes`)) {
      if (!f.endsWith(".json")) continue;
      try {
        const st = await storage.readJson<Stroke>(`${ROOT}/strokes/${f}`);
        if (st?.points?.length) strokes.push(st);
      } catch { /* corrupt stroke file — skipped */ }
    }
  } catch { /* the folder is empty */ }
  return strokes.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Saved templates from library/templates/ (§13).
 * A template package lives in a subfolder; the `listDirectory` fix was needed so
 * folders are visible here (before it returned empty and user templates vanished after a refresh).
 */
async function loadTemplates(): Promise<TemplateInfo[]> {
  const out = [builtinTemplateInfo()];
  try {
    for (const d of await storage.listDirectory(`${ROOT}/library/templates`)) {
      const dir = d.replace(/\/$/, "");
      if (!dir) continue;
      const spec = await storage.readJson<TemplateSpec>(`${ROOT}/library/templates/${dir}/template.json`).catch(() => null);
      if (spec?.template_id && spec.template_id !== BUILTIN_TEMPLATE.template_id) {
        out.push({
          id: spec.template_id, name: spec.name, description: spec.description,
          nodes: spec.nodes?.length ?? 0, edges: spec.edges?.length ?? 0,
          builtin: false, saved_at: (spec as TemplateSpec & { saved_at?: string }).saved_at ?? nowIso(),
        });
      }
    }
  } catch { /* no custom template yet */ }
  return out;
}

/** global / per-agent memory read from files (§3.7) — for the "no state.json" path. */
function pickMemory(derived: ReturnType<typeof deriveCanvasFromFiles>, fallback: AppState["memory"]): AppState["memory"] {
  const memory = { ...fallback, agents: { ...fallback.agents } };
  for (const key of ["global", "decisions", "progress", "user"] as const) {
    const doc = derived.memory[key];
    if (doc) memory[key] = doc;
  }
  for (const [id, doc] of Object.entries(derived.memory.agents)) memory.agents[id] = doc;
  return memory;
}

/**
 * Loads the canvas from the StorageAdapter (§2/§4).
 * Two valid paths:
 *   1) graph.json + state.json  → fast load (the usual IndexedDB path)
 *   2) the Markdown/YAML files themselves → when there is no machine cache (Obsidian/Git folder, file import)
 * On path 1 the title/content/system_prompt of each node are still overlaid from its file, so a manual
 * edit in an external editor survives a refresh (§1.3-1: files are the storage substrate).
 * Locks are always released: a lock is a moment of execution, not data (§12.5).
 */
export async function hydrate(api: EngineApi): Promise<boolean> {
  if (!(await storage.exists(`${ROOT}/manifest.json`))) return false;
  try {
    const graph = await storage.readJson<{ nodes: RFNode[]; edges: RFEdge[] }>(`${ROOT}/graph.json`).catch(() => null);

    /* read only what is needed: with graph.json present, only node files are required for the overlay
       (one cheap allPaths + a few readFile); otherwise the whole §2 tree is read.
       without this split, boot on a big canvas meant reading every log/output file. */
    const files = graph?.nodes?.length
      ? await collectCanvasFiles({ filter: (p) => new RegExp(`^${ROOT}/nodes/[^/]+\\.md$`).test(p) || p === `${ROOT}/canvas.yaml` })
      : await collectCanvasFiles();
    const derived = deriveCanvasFromFiles(files);
    const state = await storage
      .readJson<{
        canvas?: AppState["canvas"]; memory?: AppState["memory"]; outputs?: AppState["outputs"];
        chats?: AppState["chats"]; logs?: AppState["logs"]; snapshots?: AppState["snapshots"];
      }>(`${ROOT}/state.json`)
      .catch(() => null);

    if (!graph?.nodes?.length && !derived.nodes.length) return false;

    const mdById = new Map(derived.nodes.map((n) => [n.id, n]));
    const nodes: RFNode[] = (graph?.nodes?.length
      ? graph.nodes.map((n) => {
          const md = mdById.get(n.id);
          const data = { ...n.data } as RFNode["data"];
          if (md) {
            if (md.data.title) data.title = md.data.title;
            if (typeof md.data.content === "string" && md.data.content.trim()) data.content = md.data.content;
            const sp = md.data.agent?.system_prompt;
            if (data.agent && sp && sp.length > 1) data.agent = { ...data.agent, system_prompt: sp };
          }
          return { ...n, data: { ...data, lock: { status: "free" as const, locked_by: null, locked_at: null } } };
        })
      : derived.nodes.map((n) => ({ ...n, data: { ...n.data, lock: { status: "free" as const, locked_by: null, locked_at: null } } }))) as RFNode[];

    const ids = new Set(nodes.map((n) => n.id));
    const edges = (graph?.edges?.length ? graph.edges : derived.edges).filter((e) => ids.has(e.source) && ids.has(e.target)) as RFEdge[];
    const memory = pickMemory(derived, state?.memory ?? api.get().memory);
    const mode = storageMode();

    api.set({
      canvas: { ...api.get().canvas, ...(state?.canvas ?? {}), title: derived.canvasTitle ?? state?.canvas?.title ?? api.get().canvas.title },
      memory,
      outputs: state?.outputs ?? {},
      chats: state?.chats ?? {},
      logs: state?.logs ?? {},
      snapshots: state?.snapshots ?? [],
      strokes: await loadStrokes(),
      templates: await loadTemplates(),
      nodes,
      edges,
      execution: emptyExecution(),
    });
    emit(
      api,
      "system",
      graph?.nodes?.length
        ? `canvas loaded — ${nodes.length} nodes, ${edges.length} edges (source: graph.json${mode === "fs" ? " + folder files" : ""})`
        : `canvas rebuilt from Markdown/YAML files — ${nodes.length} nodes, ${edges.length} edges`
    );
    if (derived.unreadable.length) {
      emit(api, "validation.failed", `${derived.unreadable.length} unreadable files were ignored: ${derived.unreadable.slice(0, 4).join(", ")}`);
    }
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
    outputs: {}, chats: {}, logs: {}, snapshots: [], strokes: [], execution: emptyExecution(),
  });
  const st = api.get();
  const boot = async (path: string, content: string) => {
    await storage.writeFile(`${ROOT}/${path}`, content);
    api.set((prev) => ({ bootLines: [...prev.bootLines, { text: path, ok: true }] }));
    await sleep(46);
  };

  await boot("manifest.json", JSON.stringify({ version: "1.0", app_version: APP_VERSION, canvas_id: st.canvasId, structure_version: "1.3", last_validated: nowIso().slice(0, 10) }, null, 2));
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
  await boot("library/shapes/agent-card.json", JSON.stringify({ id: "agent-card", name: "Agent card", type: "shape", default_size: { width: 280, height: 160 }, default_style: { strokeColor: "#0b1312", strokeWidth: 2, fillStyle: "solid", opacity: 100 } }, null, 2));
  await boot("library/shapes/hex-process.json", JSON.stringify({ id: "hex-process", name: "Process hexagon", type: "shape", default_size: { width: 240, height: 140 }, default_style: { strokeColor: "#0b1312", strokeWidth: 2, fillStyle: "solid", opacity: 100 } }, null, 2));
  await boot("library/templates/quick-pipeline/template.yaml", toYaml({ template_id: "quick-pipeline", version: "1.0", description: "4-step pipeline: understand, risk, solution, decision", nodes: 5, edges: 4 }));
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
  emit(api, "system", "a fresh canvas was initialised — the §2 structure is complete");
}

/** If backendUrl is set, the server StorageAdapter replaces IndexedDB (§5.2) */
async function maybeSwitchStorage(api: EngineApi) {
  const url = api.get().settings.backendUrl?.trim();
  if (!url) return;
  const http = new HttpStorageAdapter(url, CANVAS_ID);
  try {
    const ok = await Promise.race([
      http.exists("manifest.json").then(() => true),
      sleep(2500).then(() => false),
    ]);
    if (!ok) throw new Error("timeout");
    setStorage(http);
    emit(api, "system", `StorageAdapter switched to the server: ${url}`);
    toast(api, "success", "Server connection up — files are stored on a real file system.");
  } catch {
    emit(api, "validation.failed", `server ${url} did not answer — continuing with local IndexedDB`);
    toast(api, "error", "Server unreachable; continuing with local storage.");
  }
}

export async function initWorkspace(api: EngineApi) {
  await maybeSwitchStorage(api);
  // "live folder mode" outranks IndexedDB: if a folder was attached before,
  // the data source is those files on disk (§5.1).
  const resumed = await maybeResumeWorkspace(api);
  const ok = resumed || (await hydrate(api));
  if (!ok) await seedWorkspace(api);
  api.set({ booted: true });
  toast(api, "success", ok ? "Canvas loaded from storage." : "A new canvas is ready with the file-first layout.");
}

/**
 * "re-read from disk": if the files changed outside (git pull / Obsidian edit),
 * the canvas is rebuilt from those files. We do not flush first, so pending edits are not lost,
 * but we warn when a save is in flight.
 */
export async function reloadFromStorage(api: EngineApi) {
  if (api.get().saveState === "saving") {
    toast(api, "warn", "A save is in flight — try again in a moment so your edits are not lost.");
    return;
  }
  emit(api, "system", "canvas re-read from files (user request)");
  const ok = await hydrate(api);
  if (!ok) {
    toast(api, "error", "Reload failed — the canvas files are not reachable.");
    return;
  }
  toast(api, "success", "Reloaded from disk.");
}

export async function resetWorkspace(api: EngineApi) {
  await storage.clear();
  api.set({ booted: false, bootLines: [], events: [], toasts: [], snapshots: [], outputs: {}, chats: {}, logs: {}, strokes: [], templates: api.get().templates.filter((t) => t.builtin) });
  await seedWorkspace(api);
  api.set({ booted: true });
  toast(api, "success", "Workspace cleared and rebuilt.");
}

/* ============================================================
   Templates and roles — save_pipeline_template /
   load_pipeline_template / save_role (§8, §13)
   ============================================================ */

function slugify(s: string): string {
  const base = s.trim().toLowerCase().replace(/[^\w\u0600-\u06FF-]+/g, "-").replace(/^-+|-+$/g, "");
  return base || `tpl-${Date.now().toString(36)}`;
}

/** save_pipeline_template tool — stores the whole graph as a template */
export async function saveTemplate(api: EngineApi, name: string) {
  const st = api.get();
  if (!st.nodes.length) {
    toast(api, "warn", "The canvas is empty — there is no node to keep in a template.");
    return;
  }
  if (st.execution.status === "running") {
    toast(api, "warn", "Templates cannot be saved mid-run.");
    return;
  }
  const id = slugify(name);
  const dir = `${ROOT}/library/templates/${id}`;
  const spec: TemplateSpec & { structure_version: string; saved_at: string; saved_by: string } = {
    template_id: id,
    name: name.trim(),
    description: `saved from the canvas “${st.canvas.title}” — ${st.nodes.length} nodes and ${st.edges.length} edges`,
    version: "1.0",
    structure_version: "1.3",
    saved_at: nowIso(),
    saved_by: st.settings.owner,
    nodes: st.nodes.map((n) => ({
      id: n.id,
      nodeType: n.data.nodeType,
      title: n.data.title,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      shape: n.data.shape,
      color: n.data.color,
      viewMode: n.data.viewMode,
      content: n.data.content || null,
      role: n.data.agent?.role_id ?? null,
    })),
    edges: st.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      edgeType: e.data?.edgeType ?? "flow",
      label: e.data?.label ?? "",
      line_style: e.data?.line_style ?? "solid",
    })),
  };

  await storage.writeJson(`${dir}/template.json`, spec);
  await storage.writeFile(`${dir}/template.yaml`, toYaml({
    template_id: id, name: spec.name, version: "1.0",
    description: spec.description, nodes: spec.nodes.length, edges: spec.edges.length, saved_at: spec.saved_at,
  }));
  for (const n of spec.nodes) await storage.writeJson(`${dir}/nodes/${n.id}.json`, n);
  for (const e of spec.edges) await storage.writeJson(`${dir}/edges/${e.id}.json`, e);

  const info = { id, name: spec.name, description: spec.description, nodes: spec.nodes.length, edges: spec.edges.length, builtin: false, saved_at: spec.saved_at };
  api.set((s) => ({ templates: [...s.templates.filter((t) => t.id !== id), info] }));
  emit(api, "system", `template “${spec.name}” saved in library/templates/${id}/`);
  toast(api, "success", `Template “${spec.name}” saved to the library.`);
}

/** load_pipeline_template tool — loads a template onto the canvas */
export async function loadTemplate(api: EngineApi, id: string) {
  const st = api.get();
  if (st.execution.status === "running" || st.execution.status === "waiting_approval") {
    toast(api, "warn", "Templates cannot be loaded mid-run.");
    return;
  }
  let spec: TemplateSpec | null = null;
  if (id === BUILTIN_TEMPLATE.template_id) spec = BUILTIN_TEMPLATE;
  else spec = await storage.readJson<TemplateSpec>(`${ROOT}/library/templates/${id}/template.json`).catch(() => null);
  if (!spec) {
    toast(api, "error", "Template file not found.");
    return;
  }
  if (!window.confirm(`The current canvas will be replaced by the template “${spec.name}”. Continue?`)) return;

  // clean up artifacts of the previous graph
  for (const n of st.nodes) await storage.deleteFile(`${ROOT}/nodes/${n.id}.md`).catch(() => undefined);
  for (const e of st.edges) await storage.deleteFile(`${ROOT}/edges/${e.id}.yaml`).catch(() => undefined);

  const owner = st.settings.owner;
  const nodes: RFNode[] = (spec.nodes ?? []).map((sn) => {
    const data = makeNodeData(sn.nodeType ?? "note", sn.title ?? "Untitled", owner, {
      shape: sn.shape, color: sn.color, viewMode: sn.viewMode, content: sn.content ?? "",
      ...(sn.role ? { agent: makeAgentConfig(sn.id, sn.role) } : {}),
    });
    return { id: sn.id, type: "lc", position: { x: sn.position?.x ?? 120, y: sn.position?.y ?? 120 }, data } as RFNode;
  });
  const edges: RFEdge[] = (spec.edges ?? []).map((se) => ({
    id: se.id, source: se.source, target: se.target, type: "lc",
    data: makeEdgeData({ edgeType: se.edgeType ?? "flow", label: se.label ?? "", line_style: se.line_style ?? "solid" }),
  } as RFEdge));

  // create a private memory for the new agents (§6)
  const agents = { ...st.memory.agents };
  for (const n of nodes) {
    if (n.data.agent && !agents[n.id]) {
      agents[n.id] = makeMemDoc(
        `memory/agents/${n.id}.md`, `Memory of ${n.data.title}`,
        "- latest inputs: —\n- decisions taken: —\n- notes for the next run: —", 0.7, "agent"
      );
      await storage.writeFile(`${ROOT}/memory/agents/${n.id}.md`, memoryToMd(agents[n.id])).catch(() => undefined);
    }
  }

  api.set({
    nodes, edges,
    memory: { ...st.memory, agents },
    execution: emptyExecution(),
    canvas: { ...st.canvas, template_id: id, template_version: spec.version ?? "1.0", updated_at: nowIso() },
  });
  for (const n of nodes) await writeNodeArtifact(api, n.id, true);
  for (const e of edges) await writeEdgeArtifact(api, e.id, true);
  touch(api);
  emit(api, "system", `template “${spec.name}” loaded — ${nodes.length} nodes, ${edges.length} edges`);
  toast(api, "success", `Template “${spec.name}” loaded onto the canvas.`);
}

/** save_role tool — keeps an agent's customised role in the library */
export async function saveRoleFromNode(api: EngineApi, nodeId: string) {
  const st = api.get();
  const n = st.nodes.find((x) => x.id === nodeId);
  const agent = n?.data.agent;
  if (!n || !agent) return;
  const rid = slugify(`${n.data.title}`);
  const base = roleById(agent.role_id);
  const role = {
    id: rid,
    name: n.data.title,
    description: `${base.name} — customised from node ${nodeId}`,
    system_prompt: agent.system_prompt,
    model: agent.model,
    tools: agent.tools,
    version: "1.0",
    default_output_contract: {
      format: agent.context_contract.output_contract.format,
      required_fields: agent.context_contract.output_contract.required_fields,
      validator: `schemas/${rid}.schema.json`,
      save_to: "outputs/{node_id}/",
    },
    default_context_contract: {
      allowed_read_paths: ["canvas-overview.md", "memory/agents/{node_id}.md"],
      allowed_write_paths: ["outputs/{node_id}/", "memory/agents/{node_id}.md"],
    },
  };
  await storage.writeJson(`${ROOT}/library/roles/${rid}.json`, role);
  emit(api, "system", `role “${n.data.title}” saved in library/roles/${rid}.json`);
  toast(api, "success", "Agent role saved to the library.");
}

/* ============================================================
   Portability — Export/Import and "live folder mode" (§5.1)
   ============================================================ */

/* ---------- root handle (File System Access) ---------- */

/* We keep the folder handle in IndexedDB; localStorage cannot store a handle
   (and a DB separate from living-canvas means LRU/clear never destroys the folder link). */
const ROOT_DB = "living-canvas-root";
const openRootDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(ROOT_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function persistRootHandle(handle: FsDirHandle | null): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const idb = await openRootDb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction("kv", "readwrite");
      if (handle) tx.objectStore("kv").put(handle, "dir");
      else tx.objectStore("kv").delete("dir");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    idb.close();
  } catch {
    /* keeping the handle is optional; if it fails the user just attaches again */
  }
}

async function loadRootHandle(): Promise<FsDirHandle | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const idb = await openRootDb();
    const handle = await new Promise<FsDirHandle | null>((resolve, reject) => {
      const tx = idb.transaction("kv", "readonly");
      const r = tx.objectStore("kv").get("dir");
      r.onsuccess = () => resolve((r.result as FsDirHandle) ?? null);
      r.onerror = () => reject(r.error);
    });
    idb.close();
    return handle;
  } catch {
    return null;
  }
}

/** Activates the handle on storage; false means the attachment is impossible. */
export async function applyRootHandle(api: EngineApi, handle: FsDirHandle): Promise<boolean> {
  if (!(await ensurePermission(handle, "readwrite"))) return false;
  try {
    // write probe: a read-only folder is discovered here, not mid-work
    await ensureStructure(handle);
  } catch {
    return false;
  }
  setStorage(new FsAccessStorageAdapter(handle, ROOT));
  api.set((st) => ({ settings: { ...st.settings, workspaceRoot: handle.name } }));
  return true;
}

/** Attaches a real folder on disk: if it has a canvas we load it, otherwise we seed from the current state. */
export async function attachWorkspaceFolder(api: EngineApi, handle: FsDirHandle): Promise<void> {
  emit(api, "system", `workspace folder opened: ${handle.name}/ — checking the §2 structure…`);
  if (!(await applyRootHandle(api, handle))) {
    toast(api, "error", "Write permission for the folder was not granted — no attachment.");
    return;
  }
  await persistRootHandle(handle);
  const ok = await hydrate(api);
  if (ok) {
    emit(api, "system", "canvas loaded from the files of this folder");
    toast(api, "success", `Attached to “${handle.name}” — every change is written verbatim to disk.`);
  } else {
    await seedWorkspace(api);
    toast(api, "success", `Folder “${handle.name}” now holds the §2 structure — Git and Obsidian can work on it.`);
  }
}

export async function detachWorkspaceFolder(api: EngineApi): Promise<void> {
  setStorage(createDefaultStorage());
  await persistRootHandle(null);
  api.set((st) => ({ settings: { ...st.settings, workspaceRoot: null } }));
  const ok = await hydrate(api);
  if (!ok) await seedWorkspace(api);
  emit(api, "system", "folder mode closed — storage fell back to local IndexedDB");
  toast(api, "info", "Folder detached. The files stay on disk, untouched.");
}

/** Picks a folder through the File System Access API (with a guidance fallback). */
export async function pickCanvasFolder(api: EngineApi): Promise<void> {
  if (!isFsAccessSupported()) {
    toast(api, "warn", "This browser has no File System Access API (Firefox/Safari). Use the file Export/Import instead.");
    return;
  }
  try {
    const handle = await pickCanvasDirectory();
    await attachWorkspaceFolder(api, handle);
  } catch (err) {
    if (String(err).includes("AbortError") || (err as { name?: string })?.name === "AbortError") return;
    emit(api, "validation.failed", `folder attach failed: ${String(err)}`);
    toast(api, "error", "Attaching the folder failed.");
  }
}

/* ---------- Export ----------

/**
 * Export always runs after a flush; otherwise the 700ms debounce window would leave
 * the last edits out of the exported files — exactly the sensitive case in live folder
 * mode, because the user diffs those files with Git.
 */
export async function exportBundleText(api: EngineApi): Promise<{ text: string; files: number; bytes: number; canvasId: string }> {
  await flushPending();
  // collectCanvasFiles takes the whole §2 tree; graph.json and state.json are part of the
  // canvas files too (state.json is now documented in the spec) — so importing this bundle restores it byte for byte.
  const files = await collectCanvasFiles();
  const bundle = buildBundle(files, api.get().canvasId);
  return {
    text: JSON.stringify(bundle, null, 2),
    files: bundle.stats.files,
    bytes: new Blob([bundle ? JSON.stringify(bundle) : ""]).size,
    canvasId: api.get().canvasId,
  };
}

export async function exportToJsonFile(api: EngineApi): Promise<void> {
  try {
    const { text, canvasId, files } = await exportBundleText(api);
    if (new Blob([text]).size > MAX_BUNDLE_BYTES) {
      toast(api, "error", "the export is above the 32MB ceiling — use folder mode.");
      return;
    }
    await downloadJson(`${canvasId}.livingcanvas.json`, text);
    emit(api, "system", `export: ${files} files downloaded as one JSON bundle`);
    toast(api, "success", "Canvas exported — every file lives inside one JSON.");
  } catch (err) {
    toast(api, "error", `Export failed: ${String(err)}`);
  }
}

/** Export to a folder (static copy, no live attachment). The §2 tree is written verbatim. */
export async function exportToFolder(api: EngineApi): Promise<void> {
  if (!isFsAccessSupported()) {
    toast(api, "warn", "Export to a folder needs Chrome/Edge; for now download the JSON file instead.");
    return;
  }
  try {
    const dir = await pickCanvasDirectory("living-canvas-export");
    await flushPending();
    const files = await collectCanvasFiles();
    const res = await writeFilesToDirectory(dir, files);
    emit(api, "system", `folder export: ${res.written} files written${res.failed.length ? `, ${res.failed.length} failed` : ""}`);
    toast(api, res.failed.length ? "warn" : "success",
      `${res.written} files written into “${dir.name}”${res.failed.length ? ` — ${res.failed.length} failed` : ""}.`);
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return;
    toast(api, "error", `Folder export failed: ${String(err)}`);
  }
}

/* ---------- Import ---------- */

export interface ImportPreview {
  canvasId: string | null;
  title: string | null;
  /** number of valid files in the input */
  fileCount: number;
  nodes: number;
  edges: number;
  bytes: number;
  skipped: { path: string; reason: string }[];
  warning: string | null;
}

function summarize(api: EngineApi, r: ReturnType<typeof parseBundleText>): ImportPreview {
  const derived = deriveCanvasFromFiles(r.files);
  const bytes = bundleBytes(r.files);
  const foreign = r.canvasId && r.canvasId !== api.get().canvasId;
  return {
    canvasId: r.canvasId,
    title: r.title ?? derived.canvasTitle,
    fileCount: Object.keys(r.files).length,
    nodes: derived.nodes.length,
    edges: derived.edges.length,
    bytes,
    skipped: r.skipped,
    warning:
      !r.files[`${ROOT}/manifest.json`]
        ? "no manifest.json — this may be an older export or a hand-made folder; import with care."
        : foreign
          ? `canvas id “${r.canvasId}” differs from the current canvas; files will be written under the current canvas path.`
          : null,
  };
}

export async function previewImportText(api: EngineApi, text: string): Promise<ImportPreview & { files: CanvasFiles }> {
  const r = parseBundleText(text);
  if (!r.ok) throw new Error(r.error ?? "invalid file");
  return { ...summarize(api, r), files: r.files };
}

/** The actual Import: write the files + reload from those very files. */
export async function applyImport(api: EngineApi, files: CanvasFiles, opts?: { replace?: boolean }): Promise<void> {
  const replace = opts?.replace ?? true;
  if (replace) {
    await storage.clear();
  }
  await installFiles(files, { replace: false });
  // some exports (or a hand-made Obsidian folder) have no manifest.json; hydrate refuses without it
  if (!(await storage.exists(`${ROOT}/manifest.json`))) {
    await storage.writeJson(`${ROOT}/manifest.json`, {
      version: "1.0", app_version: APP_VERSION, canvas_id: api.get().canvasId,
      structure_version: "1.3", last_validated: nowIso().slice(0, 10), imported: nowIso(),
    });
  }
  const ok = await hydrate(api);
  if (!ok) {
    emit(api, "validation.failed", "import wrote files but the canvas could not be built — the files are in storage");
    toast(api, "error", "Files were written but no canvas was built (no node found).");
    return;
  }
  if (replace) await writeCore(api.get());
  emit(api, "system", `import complete — ${api.get().nodes.length} nodes rebuilt from files`);
  toast(api, "success", "Canvas restored — all nodes, memories and files were replaced.");
}

export async function importFromText(api: EngineApi, text: string, opts?: { replace?: boolean }): Promise<ImportPreview> {
  const preview = await previewImportText(api, text);
  await applyImport(api, preview.files, opts);
  const { files: _drop, ...rest } = preview;
  void _drop;
  return rest;
}

/** Import from a folder (File System Access) — read the §2 tree and rebuild the canvas. */
export async function importFromFolder(api: EngineApi, replace = true): Promise<void> {
  if (!isFsAccessSupported()) {
    toast(api, "warn", "Your browser has no File System Access API; pick the .livingcanvas.json file instead.");
    return;
  }
  try {
    const dir = await pickCanvasDirectory("living-canvas-import");
    const raw = await readCanvasFromDirectory(dir);
    // normalise paths: if the folder is the canvases/<id> root, we re-attach the prefix
    const files: CanvasFiles = {};
    for (const [rel, text] of Object.entries(raw)) files[`${ROOT}/${rel}`] = text;
    const parsed = parseBundleText(JSON.stringify(files));
    if (!parsed.ok) {
      toast(api, "error", "no canvas file found in this folder (nodes/ or manifest.json is empty).");
      return;
    }
    const preview = { ...summarize(api, parsed), files: parsed.files };
    if (!preview.files[`${ROOT}/manifest.json`] && !preview.nodes) {
      toast(api, "error", "this folder has no Living Canvas structure.");
      return;
    }
    await applyImport(api, preview.files, { replace });
    emit(api, "system", `folder import from “${dir.name}” — ${preview.nodes} nodes, ${preview.edges} edges`);
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return;
    toast(api, "error", `Folder import failed: ${String(err)}`);
  }
}

/** Picks a file with <input type=file> — its result is a File. */
export async function importFromFile(api: EngineApi, file: File, replace = true): Promise<void> {
  try {
    const text = await readFileAsText(file);
    const preview = await importFromText(api, text, { replace });
    toast(api, "success", `restored — ${preview.nodes} nodes, ${preview.fileCount} files.`);
  } catch (err) {
    toast(api, "error", `Import failed: ${String(err)}`);
  }
}

/** Tries to re-attach the folder that was picked before. */
export async function maybeResumeWorkspace(api: EngineApi): Promise<boolean> {
  const handle = await loadRootHandle();
  if (!handle) return false;
  if (!(await ensurePermission(handle, "readwrite"))) {
    emit(api, "system", "the workspace folder needs permission again — use “Attach a folder” to re-grant it");
    return false;
  }
  if (!(await applyRootHandle(api, handle))) return false;
  const ok = await hydrate(api);
  if (ok) {
    emit(api, "system", `live folder mode continued: ${handle.name}/`);
    toast(api, "success", `Attached to “${handle.name}” — changes are written to disk.`);
  }
  return ok;
}

