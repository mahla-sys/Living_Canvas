import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, Controls,
  Handle, Position, EdgeLabelRenderer, getBezierPath, useReactFlow,
  type NodeProps, type EdgeProps, type NodeTypes, type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStore } from "../store";
import { roleById, NODE_TYPE_LABEL } from "../state";
import type { RFNode, RFEdge } from "../state";
import { faNum, type AgentStatus, type LCNodeData } from "../lib/core";
import { ICheck, ILock, IWarn, IPlay, IX, IBrain, IBox, IFile, IChat, ISpark } from "./icons";

/* ---------------- mini markdown ---------------- */

function Md({ text, compact = false }: { text: string; compact?: boolean }) {
  const lines = text.split("\n").slice(0, compact ? 14 : 200);
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      {lines.map((ln, i) => {
        const t = ln.trim();
        if (!t) return null;
        if (t.startsWith("###")) return <p key={i} className="text-[12px] font-bold text-sky-lc">{t.replace(/^###\s*/, "")}</p>;
        if (t.startsWith("##")) return <p key={i} className="text-[13px] font-extrabold text-amber-lc pt-1">{t.replace(/^##\s*/, "")}</p>;
        if (t.startsWith("#")) return <p key={i} className="text-[14px] font-black text-ink-50">{t.replace(/^#\s*/, "")}</p>;
        if (t.startsWith("---")) return <div key={i} className="h-px bg-ink-700 my-1" />;
        if (t.startsWith("- "))
          return (
            <p key={i} className="text-[11.5px] leading-5 text-ink-200 flex gap-1.5">
              <span className="text-amber-lc mt-[7px] w-1 h-1 rounded-full bg-amber-lc shrink-0" />
              <span dangerouslySetInnerHTML={{ __html: bold(t.slice(2)) }} />
            </p>
          );
        return <p key={i} className="text-[11.5px] leading-5 text-ink-200" dangerouslySetInnerHTML={{ __html: bold(t) }} />;
      })}
    </div>
  );
}

const bold = (s: string) =>
  s.replace(/\*\*(.+?)\*\*/g, "<strong class='text-ink-50 font-bold'>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>");

/* ---------------- status ---------------- */

const STATUS_FA: Record<AgentStatus, string> = {
  idle: "آماده", running: "در حال اجرا", done: "تکمیل شد", failed: "خطا", waiting: "در انتظار تأیید",
};
const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: "#8ba39d", running: "#e8b04b", done: "#8fbf7f", failed: "#e06a4e", waiting: "#e06a4e",
};

function TypeIcon({ type, size = 14 }: { type: LCNodeData["nodeType"]; size?: number }) {
  if (type === "agent") return <IBrain size={size} />;
  if (type === "output-box") return <IBox size={size} />;
  if (type === "note" || type === "file") return <IFile size={size} />;
  return <ISpark size={size} />;
}

/* ---------------- custom node ---------------- */

function shapeStyle(d: LCNodeData): React.CSSProperties {
  const c = d.color;
  const clip =
    d.shape === "diamond" ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)"
    : d.shape === "hexagon" ? "polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)"
    : undefined;
  return {
    clipPath: clip,
    borderRadius: d.shape === "circle" ? "9999px" : d.shape === "card" ? "14px" : "8px",
    border: d.shape === "rectangle" || d.shape === "card" || d.shape === "empty" ? `${Math.max(1, d.style.strokeWidth / 2)}px solid ${d.style.strokeColor}4d` : "none",
    background: d.style.fillStyle === "empty" ? "rgba(15,26,25,0.55)" : `linear-gradient(150deg, #182826 0%, #121d1c 100%)`,
    boxShadow: `0 0 0 1px ${c}33, 0 10px 30px -12px ${c}40, inset 3px 0 0 0 ${c}`,
    opacity: d.style.opacity / 100,
  };
}

function LcNode({ id, data, selected }: NodeProps<RFNode>) {
  const logs = useStore((s) => s.logs[id] ?? []);
  const outputs = useStore((s) => s.outputs[id]?.length ?? 0);
  const chatOpen = useStore((s) => s.ui.chatNodeId === id);
  const confidence = useStore((s) => s.memory.agents[id]?.confidence ?? 0.7);
  const execWaiting = useStore((s) => s.execution.status === "waiting_approval" && s.execution.current_node_id === id);
  const actions = useStore((s) => s.actions);
  const agent = data.agent;
  const status: AgentStatus = agent?.status ?? "idle";
  const running = status === "running";
  const waiting = status === "waiting" || execWaiting;
  const locked = data.lock.status === "locked";

  const ring = running ? "anim-running" : waiting ? "anim-waiting" : "";
  const breathe = data.animation.type === "breathe" && !running ? "anim-breathe" : "";
  const breatheDur = { animationDuration: `${3.2 / data.animation.speed}s` };

  const shell = (inner: React.ReactNode, w?: string) => (
    <div
      dir="rtl"
      className={`relative ${w ?? "w-[264px]"} transition-shadow duration-200 ${ring} ${selected ? "lc-node-selected" : ""}`}
      style={{ ...shapeStyle(data), ...(breathe ? breatheDur : {}) }}
    >
      <div className={breathe ? "anim-breathe" : ""} style={breathe ? breatheDur : undefined}>
        {inner}
      </div>
      {locked && (
        <span className="absolute -top-2 -left-2 z-10 w-5 h-5 rounded-full bg-ink-800 border border-amber-lc/60 text-amber-lc flex items-center justify-center">
          <ILock size={10} />
        </span>
      )}
      {agent?.require_approval && !running && (
        <span className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-ink-800 border border-ember/60 text-ember flex items-center justify-center" title="نیاز به تأیید انسانی">
          <IWarn size={10} />
        </span>
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {selected && <span className="sr-only">selected</span>}
    </div>
  );

  /* dot mode */
  if (data.viewMode === "dot") {
    return shell(
      <div className="flex flex-col items-center gap-1 py-1 px-2" title={data.title}>
        <span
          className={`w-6 h-6 rounded-full ${running ? "anim-running" : ""}`}
          style={{ background: data.color, boxShadow: `0 0 14px ${data.color}90` }}
        />
        <span className="text-[9px] text-ink-300 max-w-[70px] truncate" dir="rtl">{data.title}</span>
      </div>
    );
  }

  /* name mode */
  if (data.viewMode === "name") {
    return shell(
      <div className="flex items-center gap-2 px-3.5 py-2 min-w-[110px]">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: data.color, boxShadow: `0 0 8px ${data.color}80` }} />
        <span className="text-[12.5px] font-bold text-ink-100 whitespace-nowrap">{data.title}</span>
        {running && <ISpark size={12} className="text-amber-lc anim-blink shrink-0" />}
      </div>
    );
  }

  /* markdown mode */
  if (data.viewMode === "markdown") {
    return shell(
      <div className="p-3.5 w-[280px]">
        <div className="flex items-center gap-2 mb-2">
          <span style={{ color: data.color }}><TypeIcon type={data.nodeType} /></span>
          <h3 className="text-[13px] font-extrabold text-ink-50 leading-5">{data.title}</h3>
        </div>
        {data.content ? <Md text={data.content} compact /> : <p className="text-[11px] text-ink-400">بدون محتوا — از پنل بازرسی بنویسید.</p>}
      </div>
    );
  }

  /* card mode */
  const role = agent ? roleById(agent.role_id) : null;
  const lastLogs = running ? logs.slice(-2) : [];

  return shell(
    <div className="w-[264px]">
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <span
          className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
          style={{ background: `${data.color}1f`, color: data.color, border: `1px solid ${data.color}44` }}
        >
          <TypeIcon type={data.nodeType} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-extrabold text-ink-50 leading-5 truncate">{data.title}</h3>
          <p className="text-[10px] text-ink-400 flex items-center gap-1.5">
            <span className="uppercase tracking-wide font-mono">{data.nodeType}</span>
            {role && <span className="text-ink-300">· {role.name}</span>}
          </p>
        </div>
        {agent && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0" style={{ color: STATUS_COLOR[status], background: `${STATUS_COLOR[status]}18` }}>
            <span className={`w-1.5 h-1.5 rounded-full ${running || waiting ? "anim-blink" : ""}`} style={{ background: STATUS_COLOR[status] }} />
            {STATUS_FA[status]}
          </span>
        )}
      </div>

      {agent && (
        <div className="px-3.5 pb-2.5 flex flex-wrap gap-1">
          <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700">{agent.model}</span>
          {agent.tools.slice(0, 3).map((t) => (
            <span key={t} className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700" dir="ltr">{t}</span>
          ))}
          {agent.tools.length > 3 && <span className="text-[9.5px] text-ink-400 self-center">+{faNum(agent.tools.length - 3)}</span>}
        </div>
      )}

      {running && lastLogs.length > 0 && (
        <div className="mx-3.5 mb-2.5 px-2 py-1.5 rounded-md bg-ink-950/80 border border-amber-lc/20">
          {lastLogs.map((l, i) => (
            <p key={i} className="text-[9.5px] font-mono text-amber-lc/90 truncate leading-4" dir="rtl">{l.replace(/^\[[^\]]+\]\s*/, "")}</p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-3.5 py-2 border-t border-ink-700/70 bg-ink-950/40">
        <span className="text-[10px] text-ink-400">
          {data.nodeType === "agent"
            ? <span className="flex items-center gap-2">
                <span className="flex items-center gap-1"><IFile size={10} /> {faNum(outputs)} خروجی</span>
                {agent && <span className="flex items-center gap-1"><ISpark size={10} /> اعتماد {faNum(Math.round(confidence * 100) / 100)}</span>}
              </span>
            : data.content
              ? <span className="truncate block max-w-[170px]">{data.content.replace(/[#*\n-]/g, " ").slice(0, 42)}…</span>
              : NODE_TYPE_LABEL[data.nodeType]}
        </span>
        <button
          onClick={() => actions.setChatNode(chatOpen ? null : id)}
          className="nodrag text-ink-400 hover:text-amber-lc transition-colors cursor-pointer"
          title={agent ? "گفتگو با ایجنت" : "یادداشت"}
        >
          <IChat size={14} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- custom edge ---------------- */

const EDGE_COLOR: Record<string, string> = {
  flow: "#e8b04b", relation: "#5f7b76", "event-flow": "#6fb3c7", blackboard: "#8fbf7f", "direct-message": "#b98bc2",
};

function LcEdge(props: EdgeProps<RFEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.28 });
  const color = EDGE_COLOR[data?.edgeType ?? "flow"] ?? "#5f7b76";
  const anim = data?.animation === "flow" ? "lc-edge-flow" : data?.animation === "pulse" ? "lc-edge-pulse" : "";
  const line = data?.line_style === "dashed" ? "lc-edge-dashed" : data?.line_style === "dotted" ? "lc-edge-dotted" : "";
  return (
    <>
      <g className={`${anim} ${line}`}>
        <path d={path} fill="none" stroke={color} strokeOpacity={selected ? 1 : 0.5} strokeWidth={selected ? 2.4 : 1.7} className="react-flow__edge-path" markerEnd={markerEnd} />
        <path d={path} fill="none" stroke="transparent" strokeWidth={18} className="react-flow__edge-interaction" />
      </g>
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            dir="rtl"
            className="absolute pointer-events-none text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border anim-fade"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: "#12201e", borderColor: `${color}55`, color,
            }}
          >
            {data.label}
            {data.trigger?.type === "condition" && <span className="font-mono opacity-70" dir="ltr"> · {data.trigger.condition}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes: NodeTypes = { lc: LcNode as never };
const edgeTypes: EdgeTypes = { lc: LcEdge as never };

/* ---------------- canvas ---------------- */

function CanvasInner() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const booted = useStore((s) => s.booted);
  const execution = useStore((s) => s.execution);
  const actions = useStore((s) => s.actions);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const didFit = useRef(false);

  useEffect(() => {
    if (booted && !didFit.current) {
      didFit.current = true;
      setTimeout(() => void fitView({ padding: 0.18, duration: 700 }), 80);
    }
  }, [booted, fitView]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/lc");
      if (!raw) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      void actions.addNode(raw as RFNode["data"]["nodeType"], { x: pos.x - 40, y: pos.y - 30 });
    },
    [screenToFlowPosition, actions]
  );

  const waitingNode = useMemo(
    () => (execution.status === "waiting_approval" ? nodes.find((n) => n.id === execution.current_node_id) : null),
    [execution, nodes]
  );

  const agentCount = nodes.filter((n) => n.data.nodeType === "agent").length;
  const running = execution.status === "running";

  return (
    <div className="relative h-full w-full lc-bg" dir="ltr">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={actions.onNodesChange}
        onEdgesChange={actions.onEdgesChange}
        onConnect={actions.onConnect}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        minZoom={0.15}
        maxZoom={2.2}
        fitView={false}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: false }}
        defaultEdgeOptions={{ type: "lc" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="#22383440" />
        <MiniMap
          position="top-right"
          pannable zoomable
          nodeColor={(n) => (n.data as LCNodeData).color}
          maskColor="rgba(11,19,18,0.82)"
          style={{ background: "#0f1a19" }}
        />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>

      {/* stats chip */}
      <div dir="rtl" className="absolute top-3 left-3 z-10 flex items-center gap-2 anim-fade">
        <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-ink-900/85 border border-ink-700 backdrop-blur-sm text-[11px] text-ink-300">
          <span className="flex items-center gap-1.5"><IBrain size={13} className="text-amber-lc" /> {faNum(agentCount)} ایجنت</span>
          <span className="w-px h-3.5 bg-ink-700" />
          <span>{faNum(nodes.length)} نود</span>
          <span className="w-px h-3.5 bg-ink-700" />
          <span>{faNum(edges.length)} یال</span>
          <span className="w-px h-3.5 bg-ink-700" />
          <span className={`flex items-center gap-1.5 font-bold ${running ? "text-amber-lc" : execution.status === "completed" ? "text-sage" : ""}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${running ? "anim-blink" : ""}`} style={{ background: running ? "#e8b04b" : execution.status === "completed" ? "#8fbf7f" : "#5f7b76" }} />
            {running ? "در حال اجرا" : execution.status === "waiting_approval" ? "منتظر تأیید" : execution.status === "completed" ? "کامل شد" : execution.status === "failed" ? "خطا" : "آماده"}
          </span>
        </div>
      </div>

      {/* approval banner */}
      {waitingNode && (
        <div dir="rtl" className="absolute top-3 left-1/2 -translate-x-1/2 z-20 anim-pop">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-ink-900/95 border border-ember/50 shadow-[0_8px_40px_-8px_rgba(224,106,78,0.35)]">
            <IWarn size={18} className="text-ember" />
            <div className="text-[12px]">
              <p className="font-extrabold text-ink-50">تأیید انسانی لازم است — «{waitingNode.data.title}»</p>
              <p className="text-ink-300 text-[10.5px]">خروجی نود آماده است؛ برای ادامه‌ی خط لوله تصمیم بگیرید.</p>
            </div>
            <button onClick={actions.resume} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sage/15 border border-sage/50 text-sage text-[11.5px] font-bold hover:bg-sage/25 transition-colors cursor-pointer">
              <ICheck size={13} /> تأیید و ادامه
            </button>
            <button onClick={actions.reject} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 text-[11.5px] font-bold hover:border-ember/60 hover:text-ember transition-colors cursor-pointer">
              <IX size={13} /> رد
            </button>
          </div>
        </div>
      )}

      {/* empty state */}
      {booted && nodes.length === 0 && (
        <div dir="rtl" className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center anim-rise">
            <IPlay size={28} className="mx-auto text-ink-500 mb-3" />
            <p className="text-ink-300 font-bold">بوم خالی است</p>
            <p className="text-ink-400 text-[12px] mt-1">از کتابخانه‌ی سمت راست، نودها را به اینجا بکشید</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CanvasArea() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
