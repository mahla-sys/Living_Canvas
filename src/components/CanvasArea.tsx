import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, Controls,
  Handle, Position, EdgeLabelRenderer, getBezierPath, useReactFlow, SelectionMode,
  useStore as useFlowStore,
  type NodeProps, type EdgeProps, type NodeTypes, type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStore } from "../store";
import { roleById, NODE_TYPE_LABEL, CANVAS_ID } from "../state";
import type { RFNode, RFEdge } from "../state";
import { uid, nowIso, mdInline, EMPTY_ARR, GRID_GAP, type AgentStatus, type LCNodeData, type Stroke, type StrokePoint } from "../lib/core";
import { ICheck, ILock, IWarn, IPlay, IX, IBrain, IBox, IFile, IChat, ISpark, IPen, IHighlight, IEraser, IUndo, IWand, ITrash } from "./icons";

/* ---------------- mini markdown ---------------- */

function Md({ text, compact = false }: { text: string; compact?: boolean }) {
  const lines = text.split("\n").slice(0, compact ? 14 : 200);
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      {lines.map((ln, i) => {
        const t = ln.trim();
        if (!t) return null;
        if (t.startsWith("###")) return <p key={i} className="text-[12px] font-bold text-sky-lc">{t.replace(/^###\s*/, "")}</p>;
        if (t.startsWith("##")) return <p key={i} className="text-[13px] font-extrabold text-lc-accent pt-1">{t.replace(/^##\s*/, "")}</p>;
        if (t.startsWith("#")) return <p key={i} className="text-[14px] font-black text-ink-50">{t.replace(/^#\s*/, "")}</p>;
        if (t.startsWith("---")) return <div key={i} className="h-px bg-ink-700 my-1" />;
        if (t.startsWith("- "))
          return (
            <p key={i} className="text-[11.5px] leading-5 text-ink-200 flex gap-1.5">
              <span className="text-lc-accent mt-[7px] w-1 h-1 rounded-full bg-lc-accent shrink-0" />
              {/* mdInline escapes the HTML first, then formats — so AI content never becomes a tag */}
              <span dangerouslySetInnerHTML={{ __html: mdInline(t.slice(2)) }} />
            </p>
          );
        return <p key={i} className="text-[11.5px] leading-5 text-ink-200" dangerouslySetInnerHTML={{ __html: mdInline(t) }} />;
      })}
    </div>
  );
}



/* ---------------- status ---------------- */

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Ready", running: "Running", done: "Done", failed: "Failed", waiting: "Awaiting approval",
};
/* Roles, not colours: a status is chrome, so it follows the theme like every other accent (§6). */
const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: "var(--color-ink-300)", running: "var(--color-lc-accent)", done: "var(--color-sage)",
  failed: "var(--color-ember)", waiting: "var(--color-ember)",
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
    // the surface itself is a class (`lc-card-surface` / `lc-card-empty`) so a theme can reach it;
    // `d.color` stays inline on purpose — a node's colour is canvas data, written into the node file,
    // and re-tinting it per theme would rewrite what somebody drew (§1.1, docs/ui-spec.md §3)
    boxShadow: `0 0 0 1px ${c}33, 0 10px 30px -12px ${c}40, inset 3px 0 0 0 ${c}`,
    opacity: d.style.opacity / 100,
  };
}

function LcNode({ id, data, selected }: NodeProps<RFNode>) {
  const logs = useStore((s): string[] => s.logs[id] ?? EMPTY_ARR);
  const outputs = useStore((s) => s.outputs[id]?.length ?? 0);
  const chatOpen = useStore((s) => s.ui.chatNodeId === id);
  const confidence = useStore((s) => s.memory.agents[id]?.confidence ?? 0.7);
  const execWaiting = useStore((s) => s.execution.status === "waiting_approval" && s.execution.current_node_id === id);
  // why the run refused this node (§3.6) — the executor's refusal is the interesting part of a
  // non-deterministic pipeline, so it belongs on the card, not only in a console the user has to open
  const failReason = useStore((s) => s.execution.errors[id] ?? "");
  const actions = useStore((s) => s.actions);
  /* double-click editing, markdown mode only — see the note at the render site */
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const agent = data.agent;
  const status: AgentStatus = agent?.status ?? "idle";
  const running = status === "running";
  const waiting = status === "waiting" || execWaiting;
  const locked = data.lock.status === "locked";

  const ring = running ? "anim-running" : waiting ? "anim-waiting" : "";
  const wide = data.viewMode === "card" || data.viewMode === "markdown";
  const breathe = data.animation.type === "breathe" && !running ? "anim-breathe" : "";
  const breatheDur = { animationDuration: `${3.2 / data.animation.speed}s` };

  const shell = (inner: React.ReactNode, w?: string) => (
    <div
      className={`relative ${w ?? "w-[264px]"} transition-shadow duration-200 ${ring} ${selected ? "lc-node-selected" : ""} ${data.style.fillStyle === "empty" ? "lc-card-empty" : "lc-card-surface"}`}
      style={{ ...shapeStyle(data), ...(breathe ? breatheDur : {}) }}
    >
      <div className={breathe ? "anim-breathe" : ""} style={breathe ? breatheDur : undefined}>
        {inner}
      </div>
      {locked && (
        <span className="absolute -top-2 -left-2 z-10 w-5 h-5 rounded-full bg-ink-800 border border-lc-accent/60 text-lc-accent flex items-center justify-center">
          <ILock size={10} />
        </span>
      )}
      {agent?.require_approval && !running && (
        <span className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-ink-800 border border-ember/60 text-ember flex items-center justify-center" title="Needs human approval">
          <IWarn size={10} />
        </span>
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {selected && <span className="sr-only">selected</span>}
      {failReason && (wide ? (
        <div
          className="lc-fail-band absolute inset-x-0 bottom-0 z-10 flex items-start gap-1.5 px-2.5 py-1.5 rounded-b-[inherit] border-t border-ember/45"
          title={failReason}
        >
          <IWarn size={10} className="shrink-0 mt-[2px] text-ember" />
          <p className="text-[9.5px] font-mono leading-[13px] text-ember line-clamp-2 break-words">{failReason}</p>
        </div>
      ) : (
        <span
          className="absolute -bottom-1.5 -right-1.5 z-10 w-4 h-4 rounded-full bg-ink-950 border border-ember/70 text-ember flex items-center justify-center"
          title={failReason}
        >
          <IWarn size={9} />
        </span>
      ))}
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
        <span className="text-[9px] text-ink-300 max-w-[70px] truncate">{data.title}</span>
      </div>
    );
  }

  /* name mode */
  if (data.viewMode === "name") {
    return shell(
      <div className="flex items-center gap-2 px-3.5 py-2 min-w-[110px]">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: data.color, boxShadow: `0 0 8px ${data.color}80` }} />
        <span className="text-[12.5px] font-bold text-ink-100 whitespace-nowrap">{data.title}</span>
        {running && <ISpark size={12} className="text-lc-accent anim-blink shrink-0" />}
      </div>
    );
  }

  /* markdown mode.
     Double-click writes here instead of in the inspector — the habit Excalidraw has and we did not.
     Deliberately a `<textarea>` overlay rather than `contentEditable` (Law 2: raw HTML must never become
     node state), and deliberately **not** a separate text record (no `boundElements`/`containerId`): the
     text already lives in the node file's body, which is the split Excalidraw needs and we do not. */
  if (data.viewMode === "markdown") {
    const commit = () => {
      const next = draft;
      setDraft(null);
      if (next !== null && !cancelled.current && next !== data.content) actions.updateNodeData(id, { content: next });
      cancelled.current = false;
    };
    return shell(
      <div
        className="p-3.5 w-[280px]"
        onDoubleClick={(e) => {
          if (locked) return;
          e.stopPropagation();
          setDraft(data.content);
        }}
        title={locked ? "Locked by a run (§12.5)" : "Double-click to write on the canvas"}
      >
        <div className="flex items-center gap-2 mb-2">
          <span style={{ color: data.color }}><TypeIcon type={data.nodeType} /></span>
          <h3 className="text-[13px] font-extrabold text-ink-50 leading-5">{data.title}</h3>
        </div>
        {draft !== null ? (
          <textarea
            autoFocus
            value={draft}
            dir="auto"
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); cancelled.current = true; setDraft(null); }
              else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
            }}
            className="nodrag nowheel w-full min-h-[110px] resize-y rounded-lg bg-ink-950/70 border border-lc-accent/50 px-2 py-1.5 text-[11.5px] leading-5 text-ink-100 font-mono focus:outline-none focus:border-lc-accent"
          />
        ) : data.content ? (
          <Md text={data.content} compact />
        ) : (
          <p className="text-[11px] text-ink-400">No content — double-click here, or write it in the inspector.</p>
        )}
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
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>

      {agent && (
        <div className="px-3.5 pb-2.5 flex flex-wrap gap-1">
          <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700">{agent.model}</span>
          {agent.tools.slice(0, 3).map((t) => (
            <span key={t} className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700">{t}</span>
          ))}
          {agent.tools.length > 3 && <span className="text-[9.5px] text-ink-400 self-center">+{agent.tools.length - 3}</span>}
        </div>
      )}

      {running && lastLogs.length > 0 && (
        <div className="mx-3.5 mb-2.5 px-2 py-1.5 rounded-md bg-ink-950/80 border border-lc-accent/20">
          {lastLogs.map((l, i) => (
            <p key={i} className="text-[9.5px] font-mono text-lc-accent/90 truncate leading-4">{l.replace(/^\[[^\]]+\]\s*/, "")}</p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-3.5 py-2 border-t border-ink-700/70 bg-ink-950/40">
        <span className="text-[10px] text-ink-400">
          {data.nodeType === "agent"
            ? <span className="flex items-center gap-2">
                <span className="flex items-center gap-1"><IFile size={10} /> {outputs} outputs</span>
                {agent && <span className="flex items-center gap-1"><ISpark size={10} /> confidence {Math.round(confidence * 100) / 100}</span>}
              </span>
            : data.content
              ? <span className="truncate block max-w-[170px]">{data.content.replace(/[#*\n-]/g, " ").slice(0, 42)}…</span>
              : NODE_TYPE_LABEL[data.nodeType]}
        </span>
        <button
          onClick={() => actions.setChatNode(chatOpen ? null : id)}
          className="nodrag text-ink-400 hover:text-lc-accent transition-colors cursor-pointer"
          title={agent ? "Chat with the agent" : "Note"}
        >
          <IChat size={14} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- custom edge ---------------- */

/* The edge *type* picks a role; the edge file carries no colour, so this is chrome and it themes. */
const EDGE_COLOR: Record<string, string> = {
  flow: "var(--color-lc-accent)", relation: "var(--color-ink-400)", "event-flow": "var(--color-sky-lc)",
  blackboard: "var(--color-sage)", "direct-message": "var(--color-plum)",
};
const EDGE_FALLBACK = "var(--color-ink-400)";

function LcEdge(props: EdgeProps<RFEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.28 });
  const color = EDGE_COLOR[data?.edgeType ?? "flow"] ?? EDGE_FALLBACK;
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
            className="absolute pointer-events-none text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border anim-fade"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              // `var()` cannot take a hex-alpha suffix, so the tint is a colour-mix — which also means the
              // tint follows the theme instead of freezing the botanical palette into an inline style
              background: "var(--color-ink-850)", borderColor: `color-mix(in srgb, ${color} 33%, transparent)`, color,
            }}
          >
            {data.label}
            {data.trigger?.type === "condition" && <span className="font-mono opacity-70"> · {data.trigger.condition}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes: NodeTypes = { lc: LcNode as never };
const edgeTypes: EdgeTypes = { lc: LcEdge as never };

/* ---------------- freehand drawing layer (§2 strokes/) ---------------- */

/* lc-data-colour: a stroke's colour is written into `strokes/<id>.json`, so it is canvas *data* (§4.8).
   A theme that re-tinted it would rewrite what the user drew — Law 1 seen from the other side. */
const DRAW_COLORS = ["#e8b04b", "#e06a4e", "#6fb3c7", "#8fbf7f", "#b98bc2", "#eef2ef"]; // lc-data-colour
const DRAW_WIDTHS = [2, 4, 7];

function strokePath(pts: StrokePoint[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function strokeHit(s: Stroke, p: StrokePoint, th: number): boolean {
  for (let i = 0; i < s.points.length - 1; i++) {
    if (distToSeg(p.x, p.y, s.points[i].x, s.points[i].y, s.points[i + 1].x, s.points[i + 1].y) < th) return true;
  }
  if (s.points.length === 1 && Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) < th) return true;
  return false;
}

function StrokesLayer({ strokes, live, liveColor, liveWidth, liveTool }: {
  strokes: Stroke[];
  live: StrokePoint[] | null;
  liveColor: string;
  liveWidth: number;
  liveTool: "pen" | "highlight";
}) {
  const strokeWidth = (w: number, tool: "pen" | "highlight") => (tool === "highlight" ? w * 2.6 : w);
  /* Children of <ReactFlow> are rendered as SIBLINGS of GraphView, which means outside .react-flow__viewport
     — i.e. in screen coordinates (see the children position in @xyflow/react's GraphView render). But a
     stroke's points are flow coordinates, because flow coordinates are what gets written to
     `strokes/<id>.json`. The two only agree while the viewport is exactly {x:0, y:0, zoom:1}, and it never is
     for long: the canvas runs fitView() 80ms after boot. So the layer has to apply the pan/zoom itself, and
     without it every stroke lands somewhere the reader cannot see. */
  const [vx, vy, vz] = useFlowStore((st) => st.transform);
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      data-lc-strokes
      style={{
        width: 1, height: 1, overflow: "visible", zIndex: 3,
        transform: `translate(${vx}px, ${vy}px) scale(${vz})`,
        transformOrigin: "0 0",
      }}
    >
      {strokes.map((s) => (
        <path
          key={s.id}
          d={strokePath(s.points)}
          fill="none"
          stroke={s.color}
          strokeWidth={strokeWidth(s.width, s.tool)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={s.tool === "highlight" ? 0.32 : 0.92}
        />
      ))}
      {live && live.length > 1 && (
        <path
          d={strokePath(live)}
          fill="none"
          stroke={liveColor}
          strokeWidth={strokeWidth(liveWidth, liveTool)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />
      )}
      {live && live.length === 1 && (
        <circle cx={live[0].x} cy={live[0].y} r={liveWidth / 2 + 1} fill={liveColor} opacity={0.9} />
      )}
    </svg>
  );
}

function DrawToolbar({ drawMode, setDrawMode }: { drawMode: boolean; setDrawMode: (v: boolean) => void }) {
  const strokes = useStore((s) => s.strokes);
  const actions = useStore((s) => s.actions);
  const [tool, setTool] = useState<"pen" | "highlight" | "eraser">("pen");
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [width, setWidth] = useState(DRAW_WIDTHS[1]);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertType, setConvertType] = useState<"note" | "agent" | "shape">("note");
  const [connect, setConnect] = useState(true);

  // expose tool state to the canvas via a custom event-free channel
  useEffect(() => {
    (window as unknown as { __lcDraw?: unknown }).__lcDraw = { tool, color, width };
  }, [tool, color, width]);

  const clusters = useMemo(() => {
    // lightweight cluster count (reuses engine logic via a local greedy merge)
    const boxes = strokes.map((s) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of s.points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      return { minX, minY, maxX, maxY };
    });
    const parent = strokes.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const gap = 80;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.minX - gap < b.maxX && a.maxX + gap > b.minX && a.minY - gap < b.maxY && a.maxY + gap > b.minY) parent[find(i)] = find(j);
      }
    return new Set(strokes.map((_, i) => find(i))).size;
  }, [strokes]);

  if (!drawMode) {
    return (
      <button
        onClick={() => setDrawMode(true)}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-ink-900/90 border border-ink-600 text-ink-200 text-[12px] font-bold shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] hover:border-lc-accent/60 hover:text-lc-accent transition-all cursor-pointer backdrop-blur-sm group"
      >
        <IPen size={15} className="text-lc-accent group-hover:scale-110 transition-transform" />
        Draw on the canvas
        {strokes.length > 0 && <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-full bg-lc-accent/15 border border-lc-accent/40 text-lc-accent">{strokes.length}</span>}
      </button>
    );
  }

  const ToolBtn = ({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) => (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${active ? "bg-lc-accent/20 text-lc-accent border border-lc-accent/50" : "text-ink-300 border border-transparent hover:text-ink-100 hover:bg-ink-700"}`}
    >
      {children}
    </button>
  );

  return (
    <>
      {convertOpen && (
        <div className="absolute bottom-[76px] left-1/2 -translate-x-1/2 z-40 w-[300px] rounded-2xl bg-ink-900 border border-ink-600 shadow-[0_24px_70px_-16px_rgba(0,0,0,0.85)] anim-pop overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-ink-700 bg-ink-850">
            <IWand size={15} className="text-plum" />
            <p className="text-[12.5px] font-extrabold text-ink-50 flex-1">Convert strokes to a graph</p>
            <button onClick={() => setConvertOpen(false)} className="text-ink-400 hover:text-ember transition-colors cursor-pointer"><IX size={14} /></button>
          </div>
          <div className="p-3.5 space-y-3">
            <p className="text-[11px] text-ink-300 leading-5">
              {strokes.length} strokes found in <strong className="text-plum">{clusters} clusters</strong>. Each cluster becomes a node.
            </p>
            <div>
              <p className="text-[10px] font-bold text-ink-400 mb-1.5">Node type</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([["note", "Note"], ["agent", "Agent"], ["shape", "Shape"]] as const).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setConvertType(v)}
                    className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${convertType === v ? "bg-plum/15 border-plum/50 text-plum" : "bg-ink-850 border-ink-600 text-ink-300 hover:border-ink-500"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className={`w-8 rounded-full p-0.5 transition-colors shrink-0 ${connect ? "bg-plum" : "bg-ink-600"}`} style={{ height: 18 }}>
                <span className={`block w-3.5 h-3.5 rounded-full bg-ink-100 transition-transform ${connect ? "-translate-x-3.5" : ""}`} />
              </span>
              <input type="checkbox" checked={connect} onChange={(e) => setConnect(e.target.checked)} className="hidden" />
              <span className="text-[11px] text-ink-200">Connect the nodes in drawing order</span>
            </label>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { actions.convertStrokes({ nodeType: convertType, connect }); setConvertOpen(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-plum text-ink-950 text-[11.5px] font-black hover:brightness-110 transition-all cursor-pointer active:scale-[0.98]"
              >
                <IWand size={13} /> Convert
              </button>
              <button onClick={() => setConvertOpen(false)} className="px-3.5 py-2 rounded-xl bg-ink-850 border border-ink-600 text-[11.5px] font-bold text-ink-300 hover:text-ink-100 transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2.5 py-2 rounded-2xl bg-ink-900/95 border border-ink-600 shadow-[0_14px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-sm anim-pop">
        <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} title="Pen"><IPen size={15} /></ToolBtn>
        <ToolBtn active={tool === "highlight"} onClick={() => setTool("highlight")} title="Highlighter"><IHighlight size={15} /></ToolBtn>
        <ToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} title="Eraser"><IEraser size={15} /></ToolBtn>

        <span className="w-px h-6 bg-ink-700 mx-0.5" />

        <div className="flex items-center gap-1">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`w-5.5 h-5.5 rounded-full transition-all cursor-pointer border-2 ${color === c ? "scale-110 border-ink-100" : "border-transparent opacity-70 hover:opacity-100"}`}
              style={{ background: c, width: 20, height: 20 }}
            />
          ))}
        </div>

        <span className="w-px h-6 bg-ink-700 mx-0.5" />

        <div className="flex items-center gap-0.5">
          {DRAW_WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setWidth(w)}
              title={`width ${w}`}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${width === w ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-200"}`}
            >
              <span className="rounded-full bg-current" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>

        <span className="w-px h-6 bg-ink-700 mx-0.5" />

        <ToolBtn onClick={() => actions.undoStroke()} title="Undo last stroke"><IUndo size={15} /></ToolBtn>
        <ToolBtn onClick={() => setConvertOpen(true)} title="Convert strokes to a graph"><IWand size={15} /></ToolBtn>
        <ToolBtn onClick={() => actions.clearStrokes()} title="Clear all strokes"><ITrash size={15} /></ToolBtn>

        <span className="w-px h-6 bg-ink-700 mx-0.5" />

        <ToolBtn onClick={() => { setDrawMode(false); setConvertOpen(false); }} title="Leave drawing mode"><IX size={15} /></ToolBtn>
      </div>
    </>
  );
}

/* ---------------- canvas ---------------- */

/* Exported so a test can mount the canvas inside its own ReactFlowProvider and therefore reach the same
   React Flow store the strokes layer reads. Without it, a test's provider is a *different* store and anything
   it does to the viewport is invisible to the component under test. */
export function CanvasInner() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const strokes = useStore((s) => s.strokes);
  const booted = useStore((s) => s.booted);
  const execution = useStore((s) => s.execution);
  const actions = useStore((s) => s.actions);
  const { screenToFlowPosition, fitView, getZoom } = useReactFlow();
  const didFit = useRef(false);

  const snapToGrid = useStore((s) => s.settings.snapToGrid);
  const [drawMode, setDrawMode] = useState(false);
  const [live, setLive] = useState<StrokePoint[] | null>(null);
  const drawingRef = useRef(false);
  const liveRef = useRef<StrokePoint[] | null>(null);

  useEffect(() => {
    if (booted && !didFit.current) {
      didFit.current = true;
      setTimeout(() => void fitView({ padding: 0.18, duration: 700 }), 80);
    }
  }, [booted, fitView]);

  const drawCfg = () =>
    ((window as unknown as { __lcDraw?: { tool: "pen" | "highlight" | "eraser"; color: string; width: number } }).__lcDraw ?? {
      tool: "pen" as const, color: DRAW_COLORS[0], width: 4,
    });

  const toFlow = (e: React.PointerEvent) => screenToFlowPosition({ x: e.clientX, y: e.clientY });

  const eraseAt = useCallback((p: StrokePoint) => {
    const zoom = getZoom() || 1;
    const th = 12 / zoom;
    const hit = useStore.getState().strokes.find((s) => strokeHit(s, p, th + s.width / zoom));
    if (hit) void actions.removeStroke(hit.id);
  }, [getZoom, actions]);

  const onDrawDown = useCallback((e: React.PointerEvent) => {
    if (!drawMode || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest(".react-flow__controls, .react-flow__minimap, .react-flow__attribution, .react-flow__panel, [data-drawui]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const cfg = drawCfg();
    const p = toFlow(e);
    if (cfg.tool === "eraser") {
      drawingRef.current = true;
      eraseAt(p);
      return;
    }
    drawingRef.current = true;
    liveRef.current = [p];
    setLive([p]);
  }, [drawMode, toFlow, eraseAt]);

  const onDrawMove = useCallback((e: React.PointerEvent) => {
    if (!drawMode || !drawingRef.current) return;
    const cfg = drawCfg();
    const p = toFlow(e);
    if (cfg.tool === "eraser") {
      eraseAt(p);
      return;
    }
    const prev = liveRef.current;
    if (!prev) return;
    const last = prev[prev.length - 1];
    const minD = 2.2 / (getZoom() || 1);
    if (Math.hypot(p.x - last.x, p.y - last.y) < minD) return;
    liveRef.current = [...prev, p];
    setLive(liveRef.current);
  }, [drawMode, toFlow, eraseAt, getZoom]);

  const onDrawUp = useCallback(() => {
    if (!drawMode) return;
    const wasDrawing = drawingRef.current;
    drawingRef.current = false;
    const cfg = drawCfg();
    if (cfg.tool === "eraser") return;
    const pts = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (!wasDrawing || !pts || pts.length < 2) return;
    const stroke: Stroke = {
      id: uid("stroke"),
      canvas_id: CANVAS_ID,
      tool: cfg.tool === "highlight" ? "highlight" : "pen",
      color: cfg.color,
      width: cfg.width,
      points: pts,
      author: useStore.getState().canvas.owner,
      created_at: nowIso(),
    };
    void actions.addStroke(stroke);
  }, [drawMode, actions]);

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

  const drawToolNow = drawCfg().tool;

  return (
    <div
      className="relative h-full w-full lc-bg"
      onPointerDown={drawMode ? onDrawDown : undefined}
      onPointerMove={drawMode ? onDrawMove : undefined}
      onPointerUp={drawMode ? onDrawUp : undefined}
      onPointerCancel={drawMode ? onDrawUp : undefined}
      style={drawMode ? { cursor: drawToolNow === "eraser" ? "cell" : "crosshair", touchAction: "none" } : undefined}
    >
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
        deleteKeyCode={drawMode ? null : ["Backspace", "Delete"]}
        proOptions={{ hideAttribution: false }}
        defaultEdgeOptions={{ type: "lc" }}
        /* §11.3 of the spec: the grid and the dots are one number, and a snap that falls between two
           visible dots reads as broken alignment. Opt-in, because it rewrites `position` in node files. */
        elevateNodesOnSelect
        /* Marquee selection needs the whole node inside the box. This is already the library default in
           @xyflow/react v12 (`selectionMode = SelectionMode.Full` in its Pane), so the prop is stated rather
           than relied upon: a library default is not a decision this app made, and a silent upstream change
           would otherwise change what "select these three" means. */
        selectionMode={SelectionMode.Full}
        snapToGrid={snapToGrid}
        snapGrid={[GRID_GAP, GRID_GAP]}
        panOnDrag={drawMode ? [1, 2] : true}
        nodesDraggable={!drawMode}
        nodesConnectable={!drawMode}
        elementsSelectable={!drawMode}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_GAP} size={1.4} />
        <StrokesLayer
          strokes={strokes}
          live={live}
          liveColor={drawCfg().color}
          liveWidth={drawCfg().width}
          liveTool={drawToolNow === "highlight" ? "highlight" : "pen"}
        />
        <MiniMap
          position="top-right"
          pannable zoomable
          nodeColor={(n) => (n.data as LCNodeData).color}
        />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>

      {drawMode && (
        <>
          <div className="absolute inset-2 rounded-2xl border-2 border-dashed border-lc-accent/25 pointer-events-none z-10" />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none anim-fade">
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-lc-accent/10 border border-lc-accent/40 text-lc-accent text-[10.5px] font-bold backdrop-blur-sm">
              <IPen size={12} />
              Drawing mode — {drawToolNow === "eraser" ? "trace over strokes to erase them" : "drag with the left button · scroll: zoom · right click: pan"}
            </span>
          </div>
        </>
      )}
      <div data-drawui>
        <DrawToolbar drawMode={drawMode} setDrawMode={setDrawMode} />
      </div>

      {/* stats chip */}
      <div data-drawui className="absolute top-3 left-3 z-10 flex items-center gap-2 anim-fade">
        <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-ink-900/85 border border-ink-700 backdrop-blur-sm text-[11px] text-ink-300">
          <span className="flex items-center gap-1.5"><IBrain size={13} className="text-ink-300" /> {agentCount} agents</span>
          <span className="w-px h-3.5 bg-ink-700" />
          <span>{nodes.length} nodes</span>
          <span className="w-px h-3.5 bg-ink-700" />
          <span>{edges.length} edges</span>
          <span className="w-px h-3.5 bg-ink-700" />
          <span className={`flex items-center gap-1.5 font-bold ${running ? "text-lc-accent" : execution.status === "completed" ? "text-sage" : ""}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${running ? "anim-blink" : ""}`} style={{ background: running ? "var(--color-lc-accent)" : execution.status === "completed" ? "var(--color-sage)" : "var(--color-ink-400)" }} />
            {running ? "Running" : execution.status === "waiting_approval" ? "Awaiting approval" : execution.status === "completed" ? "Completed" : execution.status === "failed" ? "Failed" : "Ready"}
          </span>
        </div>
      </div>

      {/* approval banner */}
      {waitingNode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 anim-pop">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-ink-900/95 border border-ember/50 shadow-[0_8px_40px_-8px_rgba(224,106,78,0.35)]">
            <IWarn size={18} className="text-ember" />
            <div className="text-[12px]">
              <p className="font-extrabold text-ink-50">Human approval required — “{waitingNode.data.title}”</p>
              <p className="text-ink-300 text-[10.5px]">The node output is ready; decide to continue the pipeline.</p>
            </div>
            <button onClick={actions.resume} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sage/15 border border-sage/50 text-sage text-[11.5px] font-bold hover:bg-sage/25 transition-colors cursor-pointer">
              <ICheck size={13} /> Approve &amp; continue
            </button>
            <button onClick={actions.reject} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 text-[11.5px] font-bold hover:border-ember/60 hover:text-ember transition-colors cursor-pointer">
              <IX size={13} /> Reject
            </button>
          </div>
        </div>
      )}

      {/* empty state */}
      {booted && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center anim-rise">
            <IPlay size={28} className="mx-auto text-ink-500 mb-3" />
            <p className="text-ink-300 font-bold">The canvas is empty</p>
            <p className="text-ink-400 text-[12px] mt-1">Drag nodes here from the library on the left</p>
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
