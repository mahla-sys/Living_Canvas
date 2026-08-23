import { useMemo, useState } from "react";
import { useStore, buildFileContent } from "../store";
import { PALETTE, ROLES, roleById, NODE_TYPE_LABEL, CANVAS_ID } from "../state";
import type { RFNode } from "../state";
import { faNum, type NodeType, type ShapeKind, type ViewMode, type EdgeType } from "../lib/core";
import {
  IBrain, IBox, IFile, IFolder, IChevD, IChevR, ITrash, IPlay, IChat, ILock,
  ISpark, IDatabase, IHistory, IX, IEye, INode, IPulse, ICheck,
} from "./icons";

const SWATCHES = ["#e8b04b", "#e06a4e", "#8fbf7f", "#6fb3c7", "#b98bc2", "#d9c9a3", "#c96a8a", "#8ba39d"];
const ALL_TOOLS = ["read_memory", "write_memory", "chat_with_user", "write_output", "get_canvas_overview", "get_node_context", "get_agent_brief"];

/* ================= palette + file tree (left) ================= */

function Palette() {
  const actions = useStore((s) => s.actions);
  return (
    <div className="p-3 space-y-2">
      <p className="text-[10.5px] text-ink-400 leading-5 px-1">
        المان‌ها را به داخل بوم <strong className="text-ink-200">بکشید</strong> یا برای افزودن کلیک کنید.
      </p>
      {PALETTE.map((p) => (
        <div
          key={p.nodeType}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/lc", p.nodeType);
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={() => void actions.addNode(p.nodeType, { x: 420 + Math.random() * 420, y: 120 + Math.random() * 280 })}
          className="group flex items-center gap-3 p-2.5 rounded-xl bg-ink-850 border border-ink-700 hover:border-amber-lc/40 hover:bg-ink-800 cursor-grab active:cursor-grabbing transition-all duration-150 hover:translate-x-[-2px]"
        >
          <span
            className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
            style={{
              background: `${nodeColor(p.nodeType)}1a`, color: nodeColor(p.nodeType), border: `1px solid ${nodeColor(p.nodeType)}40`,
            }}
          >
            {p.nodeType === "agent" ? <IBrain size={17} /> : p.nodeType === "output-box" ? <IBox size={17} /> : <IFile size={17} />}
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-ink-100 flex items-center gap-1.5">
              {p.label}
              <span className="text-[9px] font-mono text-ink-500 uppercase">{p.nodeType}</span>
            </p>
            <p className="text-[10.5px] text-ink-400 leading-4">{p.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function nodeColor(t: NodeType) {
  const map: Record<string, string> = { agent: "#e8b04b", note: "#6fb3c7", "output-box": "#8fbf7f", "pipeline-step": "#b98bc2", folder: "#d9c9a3", shape: "#e06a4e" };
  return map[t] ?? "#8ba39d";
}

interface TreeFile { name: string; path: string }
function Folder({ name, children, badge, defaultOpen = false }: { name: string; children: React.ReactNode; badge?: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2 py-[5px] rounded-md text-ink-200 hover:bg-ink-800 transition-colors cursor-pointer"
      >
        {open ? <IChevD size={11} className="text-ink-500" /> : <IChevR size={11} className="text-ink-500" />}
        <IFolder size={13} className={open ? "text-amber-lc" : "text-ink-400"} />
        <span className="text-[11.5px] font-mono" dir="ltr">{name}/</span>
        {badge !== undefined && badge > 0 && (
          <span className="ms-auto text-[9px] font-bold text-ink-400 bg-ink-800 border border-ink-700 rounded px-1">{faNum(badge)}</span>
        )}
      </button>
      {open && <div className="ms-[13px] border-s border-ink-700 ps-1.5 mt-0.5 space-y-px anim-fade">{children}</div>}
    </div>
  );
}

function FileRow({ path, name }: { path: string; name?: string }) {
  const actions = useStore((s) => s.actions);
  return (
    <button
      onClick={() => actions.openFile(buildFileContent(path))}
      className="w-full flex items-center gap-1.5 px-2 py-[4.5px] rounded-md text-ink-300 hover:text-amber-lc hover:bg-ink-800 transition-colors cursor-pointer group"
      title={path}
    >
      <IFile size={12} className="text-ink-500 group-hover:text-amber-lc/70 shrink-0" />
      <span className="text-[11px] font-mono truncate" dir="ltr">{name ?? path}</span>
    </button>
  );
}

function FileTree() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const outputs = useStore((s) => s.outputs);
  const chats = useStore((s) => s.chats);
  const logs = useStore((s) => s.logs);
  const snapshots = useStore((s) => s.snapshots);
  const memory = useStore((s) => s.memory);

  const agentIds = useMemo(() => nodes.filter((n) => n.data.agent).map((n) => n.id), [nodes]);
  const outputIds = Object.keys(outputs).filter((k) => outputs[k].length > 0);
  const chatIds = Object.keys(chats).filter((k) => chats[k].length > 0);
  const logIds = Object.keys(logs).filter((k) => logs[k].length > 0);
  const boxIds = nodes.filter((n) => n.data.nodeType === "output-box").map((n) => n.id);

  return (
    <div className="p-2 space-y-0.5">
      <p className="text-[10.5px] text-ink-400 leading-5 px-2 pb-1.5">
        ساختار فایل‌محور سند — هر نود، یال و حافظه یک فایل مستقل است. برای مشاهده کلیک کنید.
      </p>
      <div className="px-2 py-1 text-[10px] font-mono text-ink-500" dir="ltr">canvases/{CANVAS_ID}/</div>
      <FileRow path="manifest.json" />
      <FileRow path="canvas.yaml" />
      <FileRow path="canvas-overview.md" />
      <FileRow path="graph.json" />

      <Folder name="nodes" badge={nodes.length} defaultOpen>
        {nodes.map((n) => <FileRow key={n.id} path={`nodes/${n.id}.md`} name={`${n.id}.md`} />)}
      </Folder>
      <Folder name="edges" badge={edges.length}>
        {edges.map((e) => <FileRow key={e.id} path={`edges/${e.id}.yaml`} name={`${e.id}.yaml`} />)}
      </Folder>
      <Folder name="memory" badge={4 + agentIds.length} defaultOpen>
        <FileRow path="memory/global.md" />
        <FileRow path="memory/decisions.md" />
        <FileRow path="memory/progress.md" />
        <FileRow path="memory/user.md" />
        <Folder name="agents" badge={agentIds.length}>
          {agentIds.map((id) => <FileRow key={id} path={`memory/agents/${id}.md`} />)}
        </Folder>
      </Folder>
      <Folder name="outputs" badge={outputIds.length}>
        {outputIds.length === 0 && <p className="text-[10.5px] text-ink-500 px-2 py-1">هنوز خروجی ثبت نشده — خط لوله را اجرا کنید.</p>}
        {outputIds.filter((id) => !boxIds.includes(id)).map((id) => (
          <Folder key={id} name={id} badge={outputs[id].length}>
            {outputs[id].map((o) => <FileRow key={o.file} path={`outputs/${id}/${o.file}`} />)}
            <FileRow path={`outputs/${id}/index.yaml`} />
          </Folder>
        ))}
        {boxIds.filter((id) => outputs[id]?.length).length > 0 && (
          <Folder name="shared" badge={boxIds.filter((id) => outputs[id]?.length).length}>
            {boxIds.filter((id) => outputs[id]?.length).map((id) => (
              <Folder key={id} name={`output-${id}`} badge={outputs[id].length}>
                {outputs[id].map((o) => <FileRow key={o.file} path={`outputs/shared/${id}/${o.file}`} />)}
                <FileRow path={`outputs/shared/${id}/index.yaml`} />
              </Folder>
            ))}
          </Folder>
        )}
      </Folder>
      <Folder name="chats" badge={chatIds.length}>
        {chatIds.length === 0 && <p className="text-[10.5px] text-ink-500 px-2 py-1">گفتگویی ذخیره نشده است.</p>}
        {chatIds.map((id) => <FileRow key={id} path={`chats/chat-${id}.md`} />)}
      </Folder>
      <Folder name="history" badge={snapshots.length}>
        <FileRow path="history/index.yaml" />
        {snapshots.slice(0, 8).map((s) => <FileRow key={s.id} path={`history/${s.id}.json`} name={`${s.id}.json`} />)}
      </Folder>
      <Folder name="logs" badge={logIds.length}>
        {logIds.length === 0 && <p className="text-[10.5px] text-ink-500 px-2 py-1">لاگی ثبت نشده است.</p>}
        {logIds.map((id) => <FileRow key={id} path={`logs/${id}/${new Date().toISOString().slice(0, 10)}.log`} name={`${id}/…log`} />)}
      </Folder>
      <Folder name="library">
        <Folder name="roles" badge={ROLES.length}>
          {ROLES.map((r) => <FileRow key={r.id} path={`library/roles/${r.id}.json`} />)}
        </Folder>
        <Folder name="shapes" badge={2}>
          <FileRow path="library/shapes/agent-card.json" />
          <FileRow path="library/shapes/hex-process.json" />
        </Folder>
        <Folder name="templates" badge={1}>
          <FileRow path="library/templates/quick-pipeline/template.yaml" />
        </Folder>
      </Folder>
      <Folder name="strokes">
        <p className="text-[10.5px] text-ink-500 px-2 py-1">لایه‌ی نقاشی — فاز بعد</p>
      </Folder>
      <p className="text-[10px] text-ink-500 px-2 pt-2 pb-1 flex items-center gap-1.5">
        <IDatabase size={11} />
        حافظه‌ی سراسری: اعتماد {faNum(Math.round(memory.global.confidence * 100) / 100)}
      </p>
    </div>
  );
}

export function LeftPanel() {
  const tab = useStore((s) => s.ui.leftTab);
  const actions = useStore((s) => s.actions);
  return (
    <aside className="w-[268px] shrink-0 border-s border-ink-700 bg-ink-900/80 flex flex-col h-full">
      <div className="flex border-b border-ink-700">
        {([["palette", "کتابخانه", ISpark], ["files", "فایل‌ها", IFolder]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => actions.setLeftTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11.5px] font-bold transition-colors cursor-pointer border-b-2 ${
              tab === key ? "text-amber-lc border-amber-lc bg-ink-850" : "text-ink-400 border-transparent hover:text-ink-200"
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">{tab === "palette" ? <Palette /> : <FileTree />}</div>
    </aside>
  );
}

/* ================= inspector (right) ================= */

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3 border-b border-ink-700/70">
      <p className="text-[10.5px] font-extrabold text-ink-400 mb-2.5 flex items-center gap-1.5">
        {icon}{title}
      </p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2.5">
      <span className="block text-[10.5px] text-ink-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full px-2.5 py-1.5 rounded-lg bg-ink-850 border border-ink-600 text-[12px] text-ink-100 focus:border-amber-lc/60 focus:outline-none transition-colors";
const selectCls = inputCls + " cursor-pointer";

function NodeInspector({ node }: { node: RFNode }) {
  const actions = useStore((s) => s.actions);
  const d = node.data;
  const agent = d.agent;
  const locked = d.lock.status === "locked";
  const runDisabled = useStore((s) => s.execution.status === "running" || s.execution.status === "waiting_approval");

  return (
    <div className="anim-fade">
      <div className="px-3.5 py-3 border-b border-ink-700 flex items-start gap-2.5">
        <span className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: `${d.color}1a`, color: d.color, border: `1px solid ${d.color}40` }}>
          {d.nodeType === "agent" ? <IBrain size={17} /> : d.nodeType === "output-box" ? <IBox size={17} /> : <IFile size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <input
            value={d.title}
            onChange={(e) => actions.updateNodeData(node.id, { title: e.target.value })}
            className="w-full bg-transparent text-[14px] font-extrabold text-ink-50 focus:outline-none border-b border-transparent focus:border-amber-lc/50 transition-colors"
          />
          <p className="text-[10px] font-mono text-ink-500 mt-0.5" dir="ltr">{node.id} · {d.nodeType}</p>
        </div>
        {locked && <ILock size={15} className="text-amber-lc mt-1" />}
      </div>

      <Section title="نمایش و شکل" icon={<IEye size={12} />}>
        <Field label="حالت نمایش (viewMode)">
          <div className="grid grid-cols-4 gap-1">
            {([["dot", "نقطه"], ["name", "نام"], ["card", "کارت"], ["markdown", "متن"]] as [ViewMode, string][]).map(([m, l]) => (
              <button
                key={m}
                onClick={() => actions.updateNodeData(node.id, { viewMode: m })}
                className={`py-1.5 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer ${
                  d.viewMode === m ? "bg-amber-lc/15 border-amber-lc/50 text-amber-lc" : "bg-ink-850 border-ink-600 text-ink-400 hover:text-ink-200"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="شکل">
            <select value={d.shape} onChange={(e) => actions.updateNodeData(node.id, { shape: e.target.value as ShapeKind })} className={selectCls}>
              <option value="rectangle">مستطیل</option><option value="card">کارت</option><option value="circle">دایره</option>
              <option value="diamond">لوزی</option><option value="hexagon">شش‌ضلعی</option><option value="empty">خالی</option>
            </select>
          </Field>
          <Field label="انیمیشن">
            <select
              value={d.animation.type}
              onChange={(e) => actions.updateNodeData(node.id, { animation: { ...d.animation, type: e.target.value as "breathe" | "pulse" | "none" } })}
              className={selectCls}
            >
              <option value="breathe">تفس (breathe)</option><option value="pulse">تپش</option><option value="none">بدون</option>
            </select>
          </Field>
        </div>
        <Field label="رنگ نود">
          <div className="flex gap-1.5 flex-wrap">
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => actions.updateNodeData(node.id, { color: c })}
                className={`w-6 h-6 rounded-lg cursor-pointer transition-transform hover:scale-110 ${d.color === c ? "ring-2 ring-ink-100 ring-offset-2 ring-offset-ink-900" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <Field label={`شفافیت: ${faNum(d.style.opacity)}٪`}>
          <input
            type="range" min={20} max={100} value={d.style.opacity}
            onChange={(e) => actions.updateNodeData(node.id, { style: { ...d.style, opacity: Number(e.target.value) } })}
            className="w-full accent-[#e8b04b]"
          />
        </Field>
      </Section>

      <Section title="محتوا">
        <textarea
          value={d.content}
          onChange={(e) => actions.updateNodeData(node.id, { content: e.target.value })}
          rows={4}
          placeholder="توضیحات مارک‌داون…"
          className={inputCls + " resize-y leading-5"}
        />
      </Section>

      {agent && (
        <>
          <Section title="پیکربندی ایجنت" icon={<IBrain size={12} />}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="نقش (از library/roles)">
                <select
                  value={agent.role_id}
                  onChange={(e) => {
                    const r = roleById(e.target.value);
                    actions.updateAgentField(node.id, {
                      role_id: r.id, system_prompt: r.system_prompt,
                      context_contract: { ...agent.context_contract, output_contract: { ...agent.context_contract.output_contract, required_fields: [...r.required_fields] } },
                    });
                  }}
                  className={selectCls}
                >
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="مدل">
                <select value={agent.model} onChange={(e) => actions.updateAgentField(node.id, { model: e.target.value })} className={selectCls}>
                  {["deepseek-chat", "glm-4-flash", "ollama:qwen2.5"].map((m) => <option key={m} value={m} dir="ltr">{m}</option>)}
                </select>
              </Field>
            </div>
            <Field label="پرامپت سیستم">
              <textarea value={agent.system_prompt} onChange={(e) => actions.updateAgentField(node.id, { system_prompt: e.target.value })} rows={4} className={inputCls + " resize-y leading-5"} />
            </Field>
            <Field label={`سقف گام‌ها (max_steps): ${faNum(agent.max_steps)}`}>
              <input type="range" min={2} max={12} value={agent.max_steps} onChange={(e) => actions.updateAgentField(node.id, { max_steps: Number(e.target.value) })} className="w-full accent-[#e8b04b]" />
            </Field>
            <Field label="ابزارهای مجاز">
              <div className="flex flex-wrap gap-1">
                {ALL_TOOLS.map((t) => {
                  const on = agent.tools.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => actions.updateAgentField(node.id, { tools: on ? agent.tools.filter((x) => x !== t) : [...agent.tools, t] })}
                      className={`text-[9.5px] font-mono px-1.5 py-1 rounded-md border transition-all cursor-pointer ${on ? "bg-sage/12 border-sage/50 text-sage" : "bg-ink-850 border-ink-600 text-ink-500 hover:text-ink-300"}`}
                      dir="ltr"
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </Field>
            <button
              onClick={() => actions.updateAgentField(node.id, { require_approval: !agent.require_approval })}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-ink-850 border border-ink-600 cursor-pointer hover:border-ember/50 transition-colors"
            >
              <span className="text-[11px] text-ink-200">توقف برای تأیید انسانی (interrupt)</span>
              <span className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${agent.require_approval ? "bg-ember" : "bg-ink-600"}`} style={{ height: 18 }}>
                <span className={`block w-3.5 h-3.5 rounded-full bg-ink-100 transition-transform ${agent.require_approval ? "-translate-x-3.5" : ""}`} />
              </span>
            </button>
          </Section>

          <Section title="قرارداد زمینه (Context Contract)" icon={<ILock size={12} />}>
            <p className="text-[10px] text-ink-500 mb-1.5">مسیرهای خواندن مجاز:</p>
            <div className="space-y-0.5 mb-2.5">
              {agent.context_contract.allowed_read_paths.map((p) => (
                <p key={p} className="text-[9.5px] font-mono text-sky-lc bg-ink-850 border border-ink-700 rounded px-1.5 py-1" dir="ltr">{p}</p>
              ))}
            </div>
            <p className="text-[10px] text-ink-500 mb-1.5">مسیرهای نوشتن مجاز:</p>
            <div className="space-y-0.5 mb-2.5">
              {agent.context_contract.allowed_write_paths.map((p) => (
                <p key={p} className="text-[9.5px] font-mono text-sage bg-ink-850 border border-ink-700 rounded px-1.5 py-1" dir="ltr">{p}</p>
              ))}
            </div>
            <p className="text-[10px] text-ink-500 mb-1">فیلدهای الزامی خروجی:</p>
            <div className="flex flex-wrap gap-1">
              {agent.context_contract.output_contract.required_fields.map((f) => (
                <span key={f} className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-amber-lc/10 border border-amber-lc/30 text-amber-lc" dir="ltr">{f}</span>
              ))}
            </div>
          </Section>
        </>
      )}

      <Section title="عملیات">
        <div className="flex gap-1.5">
          {agent && (
            <button
              onClick={() => actions.runOne(node.id)}
              disabled={runDisabled || locked}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-lc/15 border border-amber-lc/50 text-amber-lc text-[11.5px] font-bold hover:bg-amber-lc/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IPlay size={13} /> اجرای نود
            </button>
          )}
          <button
            onClick={() => actions.setChatNode(useStore.getState().ui.chatNodeId === node.id ? null : node.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ink-850 border border-ink-600 text-ink-200 text-[11.5px] font-bold hover:border-sky-lc/60 hover:text-sky-lc transition-colors cursor-pointer"
          >
            <IChat size={13} /> گفتگو
          </button>
        </div>
        <button
          onClick={() => actions.removeNode(node.id)}
          className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ink-850 border border-ink-600 text-ink-400 text-[11.5px] font-bold hover:border-ember/60 hover:text-ember transition-colors cursor-pointer"
        >
          <ITrash size={13} /> حذف نود و فایل‌ها
        </button>
      </Section>
    </div>
  );
}

function EdgeInspector({ edgeId }: { edgeId: string }) {
  const edge = useStore((s) => s.edges.find((e) => e.id === edgeId));
  const actions = useStore((s) => s.actions);
  if (!edge?.data) return null;
  const d = edge.data;
  return (
    <div className="anim-fade">
      <div className="px-3.5 py-3 border-b border-ink-700">
        <p className="text-[13px] font-extrabold text-ink-50 flex items-center gap-2"><IPulse size={15} className="text-amber-lc" /> یال</p>
        <p className="text-[10px] font-mono text-ink-500 mt-1" dir="ltr">{edge.source} → {edge.target}</p>
      </div>
      <Section title="اتصال">
        <Field label="برچسب">
          <input value={d.label} onChange={(e) => actions.updateEdgeData(edge.id, { label: e.target.value })} className={inputCls} placeholder="مثلاً: خروجی تحلیل" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="نوع یال">
            <select value={d.edgeType} onChange={(e) => actions.updateEdgeData(edge.id, { edgeType: e.target.value as EdgeType })} className={selectCls}>
              <option value="flow">flow</option><option value="relation">relation</option><option value="event-flow">event-flow</option>
              <option value="blackboard">blackboard</option><option value="direct-message">direct-message</option>
            </select>
          </Field>
          <Field label="سبک خط">
            <select value={d.line_style} onChange={(e) => actions.updateEdgeData(edge.id, { line_style: e.target.value as "solid" | "dashed" | "dotted" })} className={selectCls}>
              <option value="solid">solid</option><option value="dashed">dashed</option><option value="dotted">dotted</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="انیمیشن">
            <select value={d.animation} onChange={(e) => actions.updateEdgeData(edge.id, { animation: e.target.value as "none" | "flow" | "pulse" })} className={selectCls}>
              <option value="flow">flow</option><option value="pulse">pulse</option><option value="none">none</option>
            </select>
          </Field>
          <Field label="ماشه (trigger)">
            <select value={d.trigger.type} onChange={(e) => actions.updateEdgeData(edge.id, { trigger: { ...d.trigger, type: e.target.value as "on_completed" | "manual" | "condition" } })} className={selectCls}>
              <option value="on_completed">on_completed</option><option value="condition">condition</option><option value="manual">manual</option>
            </select>
          </Field>
        </div>
        {d.trigger.type === "condition" && (
          <Field label="شرط — مثال: {{ risk_score < 7 }}">
            <input value={d.trigger.condition} onChange={(e) => actions.updateEdgeData(edge.id, { trigger: { ...d.trigger, condition: e.target.value } })} className={inputCls + " font-mono"} dir="ltr" />
          </Field>
        )}
      </Section>
      <Section title="عملیات">
        <button onClick={() => actions.removeEdge(edge.id)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ink-850 border border-ink-600 text-ink-400 text-[11.5px] font-bold hover:border-ember/60 hover:text-ember transition-colors cursor-pointer">
          <ITrash size={13} /> حذف یال
        </button>
      </Section>
    </div>
  );
}

function CanvasInspector() {
  const canvas = useStore((s) => s.canvas);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const snapshots = useStore((s) => s.snapshots);
  const actions = useStore((s) => s.actions);
  return (
    <div className="anim-fade">
      <div className="px-3.5 py-3 border-b border-ink-700">
        <p className="text-[13px] font-extrabold text-ink-50 flex items-center gap-2"><INode size={15} className="text-amber-lc" /> تنظیمات بوم</p>
        <p className="text-[10px] text-ink-400 mt-1 leading-5">نود یا یالی انتخاب نشده — تنظیمات کل بوم اینجاست.</p>
      </div>
      <Section title="canvas.yaml">
        <Field label="عنوان بوم">
          <input value={canvas.title} onChange={(e) => actions.updateCanvas({ title: e.target.value })} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="مالک">
            <input value={canvas.owner} onChange={(e) => actions.updateCanvas({ owner: e.target.value })} className={inputCls} />
          </Field>
          <Field label="نوع بوم">
            <select value={canvas.canvas_type} onChange={(e) => actions.updateCanvas({ canvas_type: e.target.value })} className={selectCls}>
              <option value="system-design">system-design</option><option value="agent-pipeline">agent-pipeline</option>
              <option value="notes">notes</option><option value="free">free</option>
            </select>
          </Field>
        </div>
        <Field label="مدل پیش‌فرض">
          <select value={canvas.default_model} onChange={(e) => actions.updateCanvas({ default_model: e.target.value })} className={selectCls}>
            {["deepseek-chat", "glm-4-flash", "ollama:qwen2.5"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="برچسب‌ها (با ویرگول)">
          <input value={canvas.tags.join(", ")} onChange={(e) => actions.updateCanvas({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} className={inputCls} dir="ltr" />
        </Field>
        <p className="text-[10px] text-ink-500 font-mono mt-1" dir="ltr">template: {canvas.template_id} v{canvas.template_version}</p>
      </Section>
      <Section title="آمار زنده" icon={<IPulse size={12} />}>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            [nodes.length, "نود"], [edges.length, "یال"], [snapshots.length, "چک‌پوینت"],
          ].map(([n, l]) => (
            <div key={l as string} className="py-2.5 rounded-lg bg-ink-850 border border-ink-700">
              <p className="text-[18px] font-display text-amber-lc leading-6">{faNum(n as number)}</p>
              <p className="text-[9.5px] text-ink-400">{l}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="منطقه‌ی خطر">
        <button
          onClick={() => { if (confirm("کل فضای کار پاک و از نو ساخته می‌شود. مطمئنید؟")) void actions.reset(); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ember/10 border border-ember/40 text-ember text-[11.5px] font-bold hover:bg-ember/20 transition-colors cursor-pointer"
        >
          <ITrash size={13} /> پاک‌سازی و بازسازی بوم
        </button>
      </Section>
    </div>
  );
}

export function RightPanel() {
  const selectedNode = useStore((s) => s.nodes.find((n) => n.selected));
  const selectedEdge = useStore((s) => s.edges.find((e) => e.selected));
  return (
    <aside className="w-[292px] shrink-0 border-e border-ink-700 bg-ink-900/80 h-full overflow-y-auto">
      {selectedNode ? <NodeInspector node={selectedNode} /> : selectedEdge ? <EdgeInspector edgeId={selectedEdge.id} /> : <CanvasInspector />}
    </aside>
  );
}

/* ================= file viewer modal ================= */

export function FileViewer() {
  const viewer = useStore((s) => s.ui.fileViewer);
  const actions = useStore((s) => s.actions);
  const [copied, setCopied] = useState(false);
  if (!viewer) return null;
  const langColor = viewer.lang === "json" ? "#6fb3c7" : viewer.lang === "yaml" ? "#8fbf7f" : viewer.lang === "log" ? "#e06a4e" : "#e8b04b";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink-950/75 backdrop-blur-[3px] anim-fade" onClick={() => actions.openFile(null)}>
      <div className="w-full max-w-[720px] max-h-[80vh] flex flex-col rounded-2xl bg-ink-900 border border-ink-600 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] anim-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ink-700 bg-ink-850">
          <IFile size={15} style={{ color: langColor }} />
          <p className="text-[12px] font-mono text-ink-100 truncate" dir="ltr">{CANVAS_ID}/{viewer.path}</p>
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border" style={{ color: langColor, borderColor: `${langColor}55`, background: `${langColor}12` }}>{viewer.lang}</span>
          <div className="ms-auto flex items-center gap-1.5">
            <button
              onClick={() => { void navigator.clipboard?.writeText(viewer.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-ink-300 hover:text-amber-lc border border-ink-600 hover:border-amber-lc/50 transition-colors cursor-pointer"
            >
              {copied ? <ICheck size={11} /> : <IFile size={11} />} {copied ? "کپی شد" : "کپی"}
            </button>
            <button onClick={() => actions.openFile(null)} className="p-1 rounded-md text-ink-400 hover:text-ember transition-colors cursor-pointer"><IX size={15} /></button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto p-4 text-[11.5px] leading-5 font-mono text-ink-200 whitespace-pre-wrap" dir="auto">
          {viewer.content}
        </pre>
        <div className="px-4 py-2 border-t border-ink-700 bg-ink-850 flex items-center gap-2 text-[10px] text-ink-500">
          <IHistory size={11} />
          این فایل روی IndexedDB از طریق StorageAdapter ذخیره شده — در فاز ۲ با فایل‌سیستم سرور جایگزین می‌شود.
        </div>
      </div>
    </div>
  );
}
