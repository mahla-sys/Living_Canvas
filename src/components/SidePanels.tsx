import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStore, buildFileContent } from "../store";
import { PALETTE, ROLES, roleById, CANVAS_ID, ROOT, NODE_COLORS } from "../state";
import type { RFNode } from "../state";
import { storage, type NodeType, type ShapeKind, type ViewMode, type EdgeType } from "../lib/core";
import {
  IBrain, IBox, IFile, IFolder, IChevD, IChevR, ITrash, IPlay, IChat, ILock,
  ISpark, IDatabase, IHistory, IX, IEye, INode, IPulse, ICheck, IStop, IWarn,
} from "./icons";

/* lc-data-colour: the picker writes the chosen value into the node file, so these are canvas data, not
   chrome. Re-tinting them under a theme would silently rewrite somebody's graph (docs/ARCHITECTURE.md §6). */
const SWATCHES = ["#e8b04b", "#e06a4e", "#8fbf7f", "#6fb3c7", "#b98bc2", "#d9c9a3", "#c96a8a", "#8ba39d"]; // lc-data-colour
const ALL_TOOLS = ["read_memory", "write_memory", "chat_with_user", "write_output", "get_canvas_overview", "get_node_context", "get_agent_brief"];
import { FIELD_DESC } from "../lib/engine";

function pathLabel(p: string, selfId: string): string {
  if (p === "canvas-overview.md") return "Canvas summary — the first thing an agent reads";
  if (p === `nodes/${selfId}.md`) return "This node's own file (prompt and mission)";
  if (p === `memory/agents/${selfId}.md`) return "Its own private memory";
  if (p.startsWith("memory/agents/")) return "Another agent's memory";
  if (p === "memory/decisions.md") return "Key decisions memory";
  if (p === "memory/progress.md") return "Progress memory";
  if (p === "memory/global.md") return "Global project memory";
  if (p.startsWith("outputs/")) return `Outputs of ${p.replace("outputs/", "").replace("/", "")}`;
  if (p.startsWith("logs/")) return "Execution log of this node";
  return "custom path";
}

function ContractGroup({ title, color, paths, nodeId }: { title: string; color: string; paths: string[]; nodeId: string }) {
  return (
    <div className="rounded-lg border overflow-hidden mb-2" style={{ borderColor: `${color}35`, background: `${color}08` }}>
      <p className="text-[9.5px] font-black px-2.5 py-1.5 flex items-center gap-1.5" style={{ color, background: `${color}12` }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {title === "Read" ? "Read — allowed_read_paths" : "Write — allowed_write_paths"}
        <span className="ms-auto font-mono opacity-70">{paths.length}</span>
      </p>
      <div className="divide-y" style={{ borderColor: `${color}15` }}>
        {paths.map((p) => (
          <div key={p} className="px-2.5 py-1.5 group hover:bg-ink-850/60 transition-colors">
            <p className="text-[10px] font-bold text-ink-200">{pathLabel(p, nodeId)}</p>
            <p className="text-[8.5px] font-mono text-ink-500 group-hover:text-ink-300 transition-colors">{p}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= palette + file tree (left) ================= */

function Palette() {
  const actions = useStore((s) => s.actions);
  const templates = useStore((s) => s.templates);
  return (
    <div className="p-3 space-y-2">
      <p className="text-[10.5px] text-ink-400 leading-5 px-1">
        Drag elements <strong className="text-ink-200">into the canvas</strong>, or click to add one.
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
          className="group flex items-center gap-3 p-2.5 rounded-xl bg-ink-850 border border-ink-700 hover:border-lc-accent/40 hover:bg-ink-800 cursor-grab active:cursor-grabbing transition-all duration-150 hover:translate-x-[-2px]"
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

      <div className="pt-3 mt-2 border-t border-ink-700">
        <p className="text-[10px] font-bold text-ink-300 px-1 mb-2 flex items-center gap-1.5">
          <IHistory size={11} className="text-plum" />
          Ready-made templates <span className="font-mono text-ink-500 text-[8.5px]">library/templates/</span>
        </p>
        {templates.map((t) => (
          <div key={t.id} className="flex items-center gap-2 p-2 rounded-xl bg-ink-850 border border-ink-700 hover:border-plum/40 transition-colors mb-1.5 anim-rise">
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-bold text-ink-100 flex items-center gap-1.5">
                {t.name}
                {t.builtin && <span className="text-[8px] font-mono px-1 py-px rounded bg-plum/15 border border-plum/40 text-plum">built-in</span>}
              </p>
              <p className="text-[9.5px] text-ink-400 mt-0.5">
                {t.nodes} nodes · {t.edges} edges
              </p>
            </div>
            <button
              onClick={() => actions.loadTemplate(t.id)}
              className="shrink-0 text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-ink-800 border border-ink-600 text-plum hover:border-plum/60 hover:bg-plum/10 transition-all cursor-pointer active:scale-95"
            >
              Load
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* The palette preview shows the colour a new node will actually get, so it reads the one place that decides
   it (`NODE_COLORS` in state.ts) instead of keeping a second copy of the map here. Those are node *data*
   colours, written into `nodes/<id>.md`, so they are literals by design and do not follow the theme. */
function nodeColor(t: NodeType) {
  return NODE_COLORS[t] ?? "#8ba39d"; // lc-data-colour
}

/* ---------------------------------------------------------------- file-tree filter and status (ADR-016)
   Neither the filter text nor the status is stored. The filter is local state, because a filter that
   survived a reload would reopen a half-hidden tree and read as a bug. The glyph is derived from execution
   and agent state that already exists, because a stored copy could drift from what it was derived from. */
const TreeFilter = createContext("");

/** Which node a path is about, so its status can be looked up. Returns null for files that are not per-node. */
function nodeOfPath(path: string): string | null {
  const m = /^(?:nodes|memory\/agents)\/([\w-]+)\./.exec(path) ?? /^outputs\/(?:shared\/)?([\w-]+)\//.exec(path) ?? /^logs\/([\w-]+)\//.exec(path);
  return m ? m[1] : null;
}

type FileStatus = "running" | "paused" | "failed" | "done" | null;

function StatusGlyph({ path }: { path: string }) {
  const id = nodeOfPath(path);
  const ex = useStore((s) => s.execution);
  const nodes = useStore((s) => s.nodes);
  if (!id) return null;
  let st: FileStatus = null;
  if (ex.current_node_id === id && ex.status === "running") st = "running";
  else if (ex.status === "paused" && ex.queue.includes(id) && !ex.completed.includes(id)) st = "paused";
  else {
    const a = nodes.find((n) => n.id === id)?.data.agent;
    // a node a gate kept from running stays "idle" — showing a failure glyph for it would be a lie
    if (a?.status === "failed") st = "failed";
    else if (a?.status === "done") st = "done";
  }
  if (!st) return null;
  const map: Record<Exclude<FileStatus, null>, { Icon: typeof ICheck; cls: string; label: string }> = {
    running: { Icon: IPulse, cls: "text-lc-accent", label: "running" },
    paused: { Icon: IStop, cls: "text-lc-warn", label: "paused" },
    failed: { Icon: IWarn, cls: "text-ember", label: "failed" },
    done: { Icon: ICheck, cls: "text-lc-success", label: "done" },
  };
  const { Icon, cls, label } = map[st];
  return <Icon size={11} className={`${cls} shrink-0`} aria-label={label} />;
}

function Folder({ name, children, badge, defaultOpen = false }: { name: string; children: React.ReactNode; badge?: number; defaultOpen?: boolean }) {
  const q = useContext(TreeFilter);
  const [open, setOpen] = useState(defaultOpen);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [empty, setEmpty] = useState(false);
  /* A folder whose rows all filtered out must disappear, or a search leaves a tree of empty drawers. Children
     are rendered first and then counted, because the rows themselves decide whether they match — the folder
     has no list of its descendants' names and must not be given one to keep in sync. */
  useEffect(() => {
    if (!q) { setEmpty(false); return; }
    setEmpty((bodyRef.current?.querySelectorAll("[data-lc-file]").length ?? 0) === 0);
  }, [q, children]);
  if (q && empty) return null;
  const shown = q ? true : open;
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2 py-[5px] rounded-md text-ink-200 hover:bg-ink-800 transition-colors cursor-pointer"
      >
        {open ? <IChevD size={11} className="text-ink-500" /> : <IChevR size={11} className="text-ink-500" />}
        <IFolder size={13} className={open ? "text-lc-accent" : "text-ink-400"} />
        <span className="text-[11.5px] font-mono">{name}/</span>
        {badge !== undefined && badge > 0 && (
          <span className="ms-auto text-[9px] font-bold text-ink-400 bg-ink-800 border border-ink-700 rounded px-1">{badge}</span>
        )}
      </button>
      {shown && (
        <div ref={bodyRef} className="ms-[13px] border-s border-ink-700 ps-1.5 mt-0.5 space-y-px anim-fade">{children}</div>
      )}
    </div>
  );
}

function FileRow({ path, name }: { path: string; name?: string }) {
  const actions = useStore((s) => s.actions);
  const q = useContext(TreeFilter);
  const label = name ?? path;
  // matched on the displayed name, case-insensitively — not on the full path, which nobody types
  if (q && !label.toLowerCase().includes(q)) return null;
  return (
    <button
      data-lc-file
      data-lc-file-name={label}
      onClick={() => actions.openFile(buildFileContent(path))}
      className="w-full flex items-center gap-1.5 px-2 py-[4.5px] rounded-md text-ink-300 hover:text-lc-accent hover:bg-ink-800 transition-colors cursor-pointer group"
      title={path}
    >
      <IFile size={12} className="text-ink-500 group-hover:text-lc-accent/70 shrink-0" />
      <span className="text-[11px] font-mono truncate">{label}</span>
      <span className="ms-auto flex items-center"><StatusGlyph path={path} /></span>
    </button>
  );
}

/* ---------------- real file-system tree (live folder mode) ----------------
 * When storage is a real folder, *that tree* must be what you see here — not a
 * projection from state; otherwise the user cannot tell what actually lives on disk.
 */
function RealFileRow({ path, name }: { path: string; name: string }) {
  const actions = useStore((s) => s.actions);
  return (
    <button
      onClick={() => void actions.openStorageFile(path)}
      className="w-full flex items-center gap-1.5 px-2 py-[4.5px] rounded-md text-ink-300 hover:text-lc-accent hover:bg-ink-800 transition-colors cursor-pointer group"
      title={path}
    >
      <IFile size={12} className="text-ink-500 group-hover:text-lc-accent/70 shrink-0" />
      <span className="text-[11px] font-mono truncate">{name}</span>
    </button>
  );
}

function RealFolder({ path, name, depth }: { path: string; name: string; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const [items, setItems] = useState<string[]>([]);
  // saveState flips to "saved" after each flush → the listing is re-read
  const tick = useStore((s) => s.saveState);
  const rootName = useStore((s) => s.settings.workspaceRoot);
  useEffect(() => {
    let alive = true;
    void storage
      .listDirectory(path)
      .then((list) => alive && setItems(list))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [path, tick, rootName]);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2 py-[5px] rounded-md text-ink-200 hover:bg-ink-800 transition-colors cursor-pointer"
      >
        {open ? <IChevD size={11} className="text-ink-500" /> : <IChevR size={11} className="text-ink-500" />}
        <IFolder size={13} className={open ? "text-lc-accent" : "text-ink-400"} />
        <span className="text-[11.5px] font-mono">{name}/</span>
        {items.length > 0 && (
          <span className="ms-auto text-[9px] font-bold text-ink-400 bg-ink-800 border border-ink-700 rounded px-1">{items.length}</span>
        )}
      </button>
      {open && (
        <div className="ms-[13px] border-s border-ink-700 ps-1.5 mt-0.5 space-y-px anim-fade">
          {items.length === 0 && <p className="text-[10px] text-ink-500 px-2 py-1">empty</p>}
          {items.map((e) =>
            e.endsWith("/") ? (
              <RealFolder key={e} path={`${path}/${e.replace(/\/$/, "")}`} name={e.replace(/\/$/, "")} depth={depth + 1} />
            ) : (
              <RealFileRow key={e} path={`${path}/${e}`} name={e} />
            )
          )}
        </div>
      )}
    </div>
  );
}

function LiveFolderTree() {
  const actions = useStore((s) => s.actions);
  const rootName = useStore((s) => s.settings.workspaceRoot);
  return (
    <div className="p-2 space-y-0.5">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-sage/10 border border-sage/35">
        <IDatabase size={12} className="text-sage shrink-0" />
        <p className="text-[10.5px] leading-5 text-sage font-bold min-w-0">
          Live folder mode — real tree <span className="font-mono">{rootName}/</span>
          <span className="block font-normal text-ink-300">These files are on disk right now; Git and Obsidian work on this same folder.</span>
        </p>
        <button onClick={() => actions.detachFolder()} className="ms-auto shrink-0 text-[9.5px] font-bold px-2 py-1 rounded-md bg-ink-850 border border-ink-600 text-ink-300 hover:text-ember hover:border-ember/50 transition-colors cursor-pointer">
          Detach
        </button>
      </div>
      <RealFolder path={ROOT} name={CANVAS_ID} depth={0} />
    </div>
  );
}

function FileTree() {
  // local state on purpose: see ADR-016 — a persisted filter would reopen a half-hidden tree
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const outputs = useStore((s) => s.outputs);
  const chats = useStore((s) => s.chats);
  const logs = useStore((s) => s.logs);
  const snapshots = useStore((s) => s.snapshots);
  const runs = useStore((s) => s.runs);
  const memory = useStore((s) => s.memory);
  const strokes = useStore((s) => s.strokes);

  const agentIds = useMemo(() => nodes.filter((n) => n.data.agent).map((n) => n.id), [nodes]);
  const liveRoot = useStore((s) => s.settings.workspaceRoot);
  const outputIds = Object.keys(outputs).filter((k) => outputs[k].length > 0);
  const chatIds = Object.keys(chats).filter((k) => chats[k].length > 0);
  const logIds = Object.keys(logs).filter((k) => logs[k].length > 0);
  const boxIds = nodes.filter((n) => n.data.nodeType === "output-box").map((n) => n.id);

  // in live folder mode the real tree is the source of the view (all hooks called above)
  if (liveRoot) return <LiveFolderTree />;

  return (
    <TreeFilter.Provider value={q}>
    <div className="p-2 space-y-0.5">
      <div className="relative px-0.5 pb-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter files…"
          aria-label="Filter files"
          data-lc-file-filter
          className="w-full bg-ink-850 border border-ink-600 rounded-lg py-1.5 ps-7 pe-6 text-[11px] font-mono text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-lc-accent/60 transition-colors"
        />
        <IFile size={12} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear the filter"
            className="absolute end-1.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-200 cursor-pointer"
          >
            <IX size={12} />
          </button>
        )}
      </div>
      <p className="text-[10.5px] text-ink-400 leading-5 px-2 pb-1.5">
        File-first layout of the document — every node, edge and memory is its own file. Click to inspect.
      </p>
      <div className="px-2 py-1 text-[10px] font-mono text-ink-500">canvases/{CANVAS_ID}/</div>
      <FileRow path="manifest.json" />
      <FileRow path="canvas.yaml" />
      <FileRow path="canvas-overview.md" />
      <FileRow path="state.json" name="state.json (cache)" />

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
        {outputIds.length === 0 && <p className="text-[10.5px] text-ink-500 px-2 py-1">No output yet — run the pipeline.</p>}
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
        {chatIds.length === 0 && <p className="text-[10.5px] text-ink-500 px-2 py-1">No saved conversation.</p>}
        {chatIds.map((id) => <FileRow key={id} path={`chats/chat-${id}.md`} />)}
      </Folder>
      <Folder name="history" badge={snapshots.length}>
        <FileRow path="history/index.yaml" />
        {snapshots.slice(0, 8).map((s) => <FileRow key={s.id} path={`history/${s.id}.json`} name={`${s.id}.json`} />)}
      </Folder>
      <Folder name="logs" badge={logIds.length}>
        {logIds.length === 0 && <p className="text-[10.5px] text-ink-500 px-2 py-1">No log recorded.</p>}
        {logIds.map((id) => <FileRow key={id} path={`logs/${id}/${new Date().toISOString().slice(0, 10)}.log`} name={`${id}/…log`} />)}
      </Folder>
      <Folder name="runs" badge={runs.length}>
        {runs.length === 0 && <p className="text-[10.5px] text-ink-500 px-2 py-1">No run yet — the ledger appears after the first one.</p>}
        {runs.slice(0, 10).map((r) => <FileRow key={r} path={`runs/${r}.md`} name={`${r}.md`} />)}
      </Folder>
      <Folder name="library">
        <Folder name="roles" badge={ROLES.length}>
          {ROLES.map((r) => <FileRow key={r.id} path={`library/roles/${r.id}.json`} />)}
        </Folder>
        <Folder name="shapes" badge={2}>
          <FileRow path="library/shapes/agent-card.json" />
          <FileRow path="library/shapes/hex-process.json" />
        </Folder>
        <Folder name="schemas" badge={ROLES.length}>
          {ROLES.map((r) => <FileRow key={r.id} path={`library/schemas/${r.id}.schema.json`} />)}
        </Folder>
        <TemplatesSection />
      </Folder>
      <Folder name="strokes" badge={strokes.length} defaultOpen>
        {strokes.length === 0 && (
          <p className="text-[10.5px] text-ink-500 px-2 py-1 leading-5">The drawing layer is empty — use the “Draw on the canvas” button below.</p>
        )}
        {strokes.slice(0, 14).map((st) => (
          <FileRow key={st.id} path={`strokes/${st.id}.json`} name={`${st.id.slice(0, 18)}….json`} />
        ))}
        {strokes.length > 14 && <p className="text-[10px] text-ink-500 px-2 py-1">… and {strokes.length - 14} more</p>}
      </Folder>
      <p className="text-[10px] text-ink-500 px-2 pt-2 pb-1 flex items-center gap-1.5">
        <IDatabase size={11} />
        Global memory: confidence {Math.round(memory.global.confidence * 100) / 100}
      </p>
    </div>
    </TreeFilter.Provider>
  );
}

function TemplatesSection() {
  const templates = useStore((s) => s.templates);
  const actions = useStore((s) => s.actions);
  const [name, setName] = useState("");
  return (
    <Folder name="templates" badge={templates.length} defaultOpen>
      {templates.map((t) => (
        <div key={t.id} className="group flex items-center gap-1 pe-1">
          <div className="flex-1 min-w-0">
            <FileRow path={`library/templates/${t.id}/template.yaml`} name={t.builtin ? `${t.name} ★` : t.name} />
          </div>
          <button
            onClick={() => actions.loadTemplate(t.id)}
            title="Load onto the canvas"
            className="shrink-0 text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-ink-800 border border-ink-600 text-ink-300 opacity-0 group-hover:opacity-100 hover:border-plum/60 hover:text-plum transition-all cursor-pointer"
          >
            Load
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5 px-1.5 pt-1.5 pb-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              actions.saveTemplate(name.trim());
              setName("");
            }
          }}
          placeholder="New template name…"
          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-ink-900 border border-ink-600 text-[10.5px] text-ink-100 focus:border-lc-accent/60 focus:outline-none transition-colors"
        />
        <button
          onClick={() => {
            if (name.trim()) {
              actions.saveTemplate(name.trim());
              setName("");
            }
          }}
          disabled={!name.trim()}
          className="shrink-0 text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-lc-accent text-ink-950 hover:brightness-110 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
      <p className="text-[9px] text-ink-500 px-2 pb-1 leading-4">
        The current canvas graph is stored as a template in library/templates/ (§13).
      </p>
    </Folder>
  );
}

/**
 * The draggable edge of a side panel (docs/patterns/layout-system.md).
 *
 * Two rules worth naming. The drag writes state on every move — the panel has to follow the pointer — but
 * reaches the file only once, 500 ms after the last move (`touchLayout`, ADR-009). And `clamp` lives in
 * `resizePanel`, not here: the file is the contract, so a hand-edited `canvas.yaml` is clamped at the same
 * door as a mouse drag.
 */
function ResizeHandle({ side }: { side: "left" | "right" }) {
  const resizePanel = useStore((s) => s.actions.resizePanel);
  const drag = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${side} panel`}
      title="Drag to resize"
      data-lc-resize={side}
      className={`w-[5px] shrink-0 cursor-col-resize bg-transparent hover:bg-lc-accent/40 active:bg-lc-accent/70 transition-colors ${
        side === "left" ? "border-e" : "border-s"
      } border-ink-700`}
      onPointerDown={(e) => {
        e.preventDefault();
        const lay = useStore.getState().canvas.layout;
        drag.current = { x: e.clientX, w: side === "left" ? lay.leftWidth : lay.rightWidth };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        // dragging right widens the left panel and narrows the right one
        resizePanel(side, drag.current.w + (side === "left" ? dx : -dx));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }}
    />
  );
}

export function LeftPanel() {
  const tab = useStore((s) => s.ui.leftTab);
  const actions = useStore((s) => s.actions);
  const open = useStore((s) => s.canvas.layout.leftOpen);
  const width = useStore((s) => s.canvas.layout.leftWidth);
  const focus = useStore((s) => s.ui.focusMode);
  // focus mode is a moment of work, not a setting: nothing here is written to a file (ADR-009)
  if (focus || !open) return null;
  return (
    <>
    <aside style={{ width }} className="shrink-0 border-e border-ink-700 bg-ink-900/80 flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex shrink-0 border-b border-ink-700">
        {([["palette", "Library", ISpark], ["files", "Files", IFolder]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => actions.setLeftTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11.5px] font-bold transition-colors cursor-pointer border-b-2 ${
              tab === key ? "text-lc-accent border-lc-accent bg-ink-850" : "text-ink-400 border-transparent hover:text-ink-200"
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{tab === "palette" ? <Palette /> : <FileTree />}</div>
    </aside>
    <ResizeHandle side="left" />
    </>
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

const inputCls = "w-full px-2.5 py-1.5 rounded-lg bg-ink-850 border border-ink-600 text-[12px] text-ink-100 focus:border-lc-accent/60 focus:outline-none transition-colors";
const selectCls = inputCls + " cursor-pointer";

/* ---------------------------------------------------------------- inspector tabs (ADR-015)
   Each tab shows something with a real file behind it. Diary is `memory/agents/<id>.md`, Logs is
   `logs/<id>/<date>.log`, Status is execution state that already exists. There is deliberately no
   CPU/memory bar: browsers expose no CPU figure at all and `performance.memory` is Chrome-only and
   approximate, and a number nobody can trust is worse than no number. */

/** Colour comes out of the text itself, not a parallel field — two sources of truth drift apart (ADR-015). */
function diaryTone(line: string): "error" | "warn" | "ok" {
  const l = line.toLowerCase();
  if (l.includes("✗") || l.includes("failed") || l.includes("error")) return "error";
  if (l.includes("⚠") || l.includes("warn")) return "warn";
  return "ok";
}
const TONE_CLS: Record<"error" | "warn" | "ok", string> = {
  error: "text-ember", warn: "text-lc-warn", ok: "text-lc-success",
};

function EmptyTab({ what }: { what: string }) {
  // honest about nothing having happened yet, rather than a placeholder that implies data
  return <p className="px-3.5 py-6 text-[11px] leading-5 text-ink-500 text-center">{what}</p>;
}

/* Stable fallbacks, so a selector can return them without handing zustand a new reference (see StatusTab). */
const NO_ENTRIES: never[] = [];
const NO_LINES: string[] = [];

function StatusTab({ node }: { node: RFNode }) {
  const d = node.data;
  const agent = d.agent;
  const ex = useStore((s) => s.execution);
  /* Select the record, not `record[id] ?? []`: a fallback array literal is a new reference on every call and
     zustand compares with Object.is, so the component would re-render forever. */
  const outputs = useStore((s) => s.outputs);
  const logs = useStore((s) => s.logs);
  const output = outputs[node.id] ?? NO_ENTRIES;
  const log = logs[node.id] ?? NO_LINES;
  const isCurrent = ex.current_node_id === node.id;
  const st = agent?.status ?? "idle";
  /* `AgentConfig` has no `last_error` field and deliberately does not get one: the failure already lives in
     `logs/<node>/`, so a second copy in the node file could drift from it. The last error is therefore read
     out of the log, with the same tone rule the Diary tab uses. */
  const lastError = [...log].reverse().find((l) => diaryTone(l) === "error");
  return (
    <div className="px-3.5 py-3 space-y-2.5" data-lc-status-tab>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Execution status</span>
        {/* `waiting` is `lc-warn`, not the accent: the accent marks something actionable */}
        <span className={`text-[11px] font-extrabold ${
          st === "failed" ? "text-ember"
            : st === "running" ? "text-lc-accent"
            : st === "waiting" ? "text-lc-warn"
            : "text-ink-300"
        }`}>{st}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">In the current run</span>
        <span className="text-[11px] font-bold text-ink-300">{isCurrent ? "yes — running now" : ex.queue.includes(node.id) ? "queued" : "no"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Last output</span>
        <span className="text-[11px] font-mono text-ink-300">{output.length ? output[output.length - 1].file.split("/").pop() : "none"}</span>
      </div>
      {lastError && (
        <div className="px-2.5 py-2 rounded-lg bg-ember/10 border border-ember/40">
          <p className="text-[10px] font-bold text-ember uppercase tracking-wider mb-1">Last error, from the log</p>
          <p className="text-[10.5px] leading-4 text-ember/90 font-mono break-words">{lastError}</p>
        </div>
      )}
    </div>
  );
}

function DiaryTab({ nodeId }: { nodeId: string }) {
  const doc = useStore((s) => s.memory.agents[nodeId]);
  const body = (doc?.body ?? "").trim();
  if (!body) return <EmptyTab what="Nothing written to this agent's diary yet. It is written by the memory manager when the agent runs." />;
  const lines = body.split("\n").filter((l) => l.trim());
  return (
    <div className="px-3.5 py-3 space-y-1" data-lc-diary-tab>
      {lines.map((line, i) => {
        const tone = diaryTone(line);
        return (
          <p key={i} className={`text-[10.5px] leading-[1.7] font-mono break-words ${TONE_CLS[tone]}`}>
            {line}
          </p>
        );
      })}
    </div>
  );
}

function LogsTab({ nodeId }: { nodeId: string }) {
  const all = useStore((s) => s.logs);
  const lines = all[nodeId] ?? NO_LINES;
  if (!lines.length) return <EmptyTab what="No log lines for this node yet. Running it writes logs/<node>/<date>.log." />;
  return (
    <pre
      data-lc-logs-tab
      className="mx-3.5 my-3 px-2.5 py-2 rounded-lg bg-ink-950/70 border border-ink-700 text-[10px] leading-[1.6] font-mono text-ink-300 whitespace-pre-wrap break-words max-h-[45vh] overflow-y-auto overscroll-contain"
    >{lines.join("\n")}</pre>
  );
}

const INSPECTOR_TABS = [
  ["config", "Config"], ["status", "Status"], ["diary", "Diary"], ["logs", "Logs"],
] as const;

function NodeInspector({ node }: { node: RFNode }) {
  const actions = useStore((s) => s.actions);
  const d = node.data;
  const agent = d.agent;
  const locked = d.lock.status === "locked";
  const runLocked = locked && (d.lock.locked_by ?? "").startsWith("run-");
  const runDisabled = useStore((s) => s.execution.status === "running" || s.execution.status === "waiting_approval");
  const tab = useStore((s) => s.ui.inspectorTab);
  const setTab = useStore((s) => s.actions.setInspectorTab);
  const isAgent = node.data.nodeType === "agent";

  return (
    <div className="anim-fade">
      <div className="px-3.5 py-3 border-b border-ink-700 flex items-start gap-2.5">
        <span className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: `${d.color}1a`, color: d.color, border: `1px solid ${d.color}40` }}>
          {d.nodeType === "agent" ? <IBrain size={17} /> : d.nodeType === "output-box" ? <IBox size={17} /> : <IFile size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <input
            value={d.title}
            disabled={runLocked}
            onChange={(e) => actions.updateNodeData(node.id, { title: e.target.value })}
            className={`w-full bg-transparent text-[14px] font-extrabold text-ink-50 focus:outline-none border-b border-transparent focus:border-lc-accent/50 transition-colors ${runLocked ? "opacity-50 cursor-not-allowed" : ""}`}
          />
          <p className="text-[10px] font-mono text-ink-500 mt-0.5">{node.id} · {d.nodeType}</p>
        </div>
        {locked && <ILock size={15} className="text-lc-accent mt-1" />}
      </div>

      {runLocked && (
        <div className="mx-3.5 mt-3 mb-0.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-lc-warn/10 border border-lc-warn/45 anim-rise">
          <ILock size={13} className="text-lc-warn shrink-0" />
          <p className="text-[10.5px] leading-4 text-lc-warn font-bold">Locked while running — editing is disabled until this step ends (§12.5)</p>
        </div>
      )}

      {/* Status / Diary / Logs only exist for an agent node: an output box has no diary and no run log */}
      <div className="flex shrink-0 border-b border-ink-700" data-lc-inspector-tabs>
        {INSPECTOR_TABS.filter(([k]) => isAgent || k === "config").map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`flex-1 py-2 text-[10.5px] font-bold transition-colors cursor-pointer border-b-2 ${
              tab === key ? "text-lc-accent border-lc-accent bg-ink-850" : "text-ink-400 border-transparent hover:text-ink-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "status" && isAgent && <StatusTab node={node} />}
      {tab === "diary" && isAgent && <DiaryTab nodeId={node.id} />}
      {tab === "logs" && isAgent && <LogsTab nodeId={node.id} />}

      {tab === "config" && (
      <div className={runLocked ? "lc-locked-panel" : ""}>
      <Section title="Display & shape" icon={<IEye size={12} />}>
        <Field label="Display mode (viewMode)">
          <div className="grid grid-cols-4 gap-1">
            {([["dot", "Dot"], ["name", "Name"], ["card", "Card"], ["markdown", "Text"]] as [ViewMode, string][]).map(([m, l]) => (
              <button
                key={m}
                onClick={() => actions.updateNodeData(node.id, { viewMode: m })}
                className={`py-1.5 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer ${
                  d.viewMode === m ? "bg-lc-accent/15 border-lc-accent/50 text-lc-accent" : "bg-ink-850 border-ink-600 text-ink-400 hover:text-ink-200"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Shape">
            <select value={d.shape} onChange={(e) => actions.updateNodeData(node.id, { shape: e.target.value as ShapeKind })} className={selectCls}>
              <option value="rectangle">Rectangle</option><option value="card">Card</option><option value="circle">Circle</option>
              <option value="diamond">Diamond</option><option value="hexagon">Hexagon</option><option value="empty">Empty</option>
            </select>
          </Field>
          <Field label="Animation">
            <select
              value={d.animation.type}
              onChange={(e) => actions.updateNodeData(node.id, { animation: { ...d.animation, type: e.target.value as "breathe" | "pulse" | "none" } })}
              className={selectCls}
            >
              <option value="breathe">Breathe</option><option value="pulse">Pulse</option><option value="none">None</option>
            </select>
          </Field>
        </div>
        <Field label="Node color">
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
        <Field label={`opacity: ${d.style.opacity}%`}>
          <input
            type="range" min={20} max={100} value={d.style.opacity}
            onChange={(e) => actions.updateNodeData(node.id, { style: { ...d.style, opacity: Number(e.target.value) } })}
            className="w-full accent-lc-accent"
          />
        </Field>
      </Section>

      <Section title="Content">
        <textarea
          value={d.content}
          onChange={(e) => actions.updateNodeData(node.id, { content: e.target.value })}
          rows={4}
          placeholder="Markdown description…"
          className={inputCls + " resize-y leading-5"}
        />
      </Section>

      {agent && (
        <>
          <Section title="Agent configuration" icon={<IBrain size={12} />}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Role (from library/roles)">
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
              <Field label="Model">
                <select value={agent.model} onChange={(e) => actions.updateAgentField(node.id, { model: e.target.value })} className={selectCls}>
                  {["deepseek-chat", "glm-4-flash", "ollama:qwen2.5"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            <Field label="System prompt">
              <textarea value={agent.system_prompt} onChange={(e) => actions.updateAgentField(node.id, { system_prompt: e.target.value })} rows={4} className={inputCls + " resize-y leading-5"} />
            </Field>
            <Field label={`max steps (max_steps): ${agent.max_steps}`}>
              <input type="range" min={2} max={12} value={agent.max_steps} onChange={(e) => actions.updateAgentField(node.id, { max_steps: Number(e.target.value) })} className="w-full accent-lc-accent" />
            </Field>
            <Field label="Allowed tools">
              <div className="flex flex-wrap gap-1">
                {ALL_TOOLS.map((t) => {
                  const on = agent.tools.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => actions.updateAgentField(node.id, { tools: on ? agent.tools.filter((x) => x !== t) : [...agent.tools, t] })}
                      className={`text-[9.5px] font-mono px-1.5 py-1 rounded-md border transition-all cursor-pointer ${on ? "bg-sage/12 border-sage/50 text-sage" : "bg-ink-850 border-ink-600 text-ink-500 hover:text-ink-300"}`}
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
              <span className="text-[11px] text-ink-200">Stop for human approval (interrupt)</span>
              <span className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${agent.require_approval ? "bg-ember" : "bg-ink-600"}`} style={{ height: 18 }}>
                <span className={`block w-3.5 h-3.5 rounded-full bg-ink-100 transition-transform ${agent.require_approval ? "-translate-x-3.5" : ""}`} />
              </span>
            </button>
            <button
              onClick={() => actions.saveRole(node.id)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-plum/10 border border-plum/40 text-plum text-[11px] font-bold hover:bg-plum/20 transition-colors cursor-pointer active:scale-[0.99]"
            >
              <ICheck size={12} /> Save role to the library
              <span className="text-[8.5px] font-mono opacity-70">save_role</span>
            </button>
          </Section>

          <Section title="Context contract" icon={<ILock size={12} />}>
            <p className="text-[10px] text-ink-400 leading-5 mb-2.5 bg-ink-850 border border-ink-700 rounded-lg px-2.5 py-2">
              The agent sees <strong className="text-ink-200">no file</strong> outside this list and writes nowhere else — per §9 of the document.
            </p>

            <ContractGroup
              title="Read"
              color="var(--color-sky-lc)"
              paths={agent.context_contract.allowed_read_paths}
              nodeId={node.id}
            />
            <ContractGroup
              title="Write"
              color="var(--color-sage)"
              paths={agent.context_contract.allowed_write_paths}
              nodeId={node.id}
            />

            <p className="text-[10px] text-ink-500 mb-1 mt-3">Required output fields (missing them fails the output):</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {agent.context_contract.output_contract.required_fields.map((f) => (
                <span key={f} className="text-[9.5px] px-1.5 py-1 rounded-md bg-lc-accent/10 border border-lc-accent/30 text-lc-accent flex items-center gap-1.5" title={f}>
                  <span className="font-bold">{FIELD_DESC[f] ?? f}</span>
                  <span className="font-mono opacity-60">{f}</span>
                </span>
              ))}
            </div>

            <button
              onClick={() => actions.selfTest(node.id)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-sky-lc/10 border border-sky-lc/40 text-sky-lc text-[11px] font-bold hover:bg-sky-lc/20 transition-all cursor-pointer active:scale-[0.99]"
            >
              <ILock size={12} /> Self-test this node's contract
              <span className="text-[8.5px] font-mono opacity-70">§9</span>
            </button>
            <p className="text-[9px] text-ink-500 mt-1.5 leading-4">
              Simulates one allowed write and two intrusion attempts (global memory and another agent's memory); the result lands in the event console.
            </p>
          </Section>
        </>
      )}

      <Section title="Actions">
        <div className="flex gap-1.5">
          {agent && (
            <button
              onClick={() => actions.runOne(node.id)}
              disabled={runDisabled || locked}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-lc-accent/15 border border-lc-accent/50 text-lc-accent text-[11.5px] font-bold hover:bg-lc-accent/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IPlay size={13} /> Run node
            </button>
          )}
          {/* Run scopes (ADR-012): the choice is runtime-only, nothing here is written to a file */}
          {agent && (
            <>
              <button
                onClick={() => actions.runFromNode(node.id)}
                disabled={runDisabled || locked}
                title="Run this node and everything downstream of it"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ink-850 border border-ink-600 text-ink-200 text-[11.5px] font-bold hover:border-lc-accent/60 hover:text-lc-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Run from here
              </button>
              <button
                onClick={() => actions.runUntilNode(node.id)}
                disabled={runDisabled || locked}
                title="Run everything upstream of this node, then this node"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ink-850 border border-ink-600 text-ink-200 text-[11.5px] font-bold hover:border-lc-accent/60 hover:text-lc-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Run until here
              </button>
            </>
          )}
          <button
            onClick={() => actions.setChatNode(useStore.getState().ui.chatNodeId === node.id ? null : node.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ink-850 border border-ink-600 text-ink-200 text-[11.5px] font-bold hover:border-sky-lc/60 hover:text-sky-lc transition-colors cursor-pointer"
          >
            <IChat size={13} /> Chat
          </button>
        </div>
        <button
          onClick={() => actions.removeNode(node.id)}
          className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ink-850 border border-ink-600 text-ink-400 text-[11.5px] font-bold hover:border-ember/60 hover:text-ember transition-colors cursor-pointer"
        >
          <ITrash size={13} /> Delete node and its files
        </button>
      </Section>
      </div>
      )}
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
        <p className="text-[13px] font-extrabold text-ink-50 flex items-center gap-2"><IPulse size={15} className="text-ink-300" /> Edge</p>
        <p className="text-[10px] font-mono text-ink-500 mt-1">{edge.source} → {edge.target}</p>
      </div>
      <Section title="Connection">
        <Field label="Label">
          <input value={d.label} onChange={(e) => actions.updateEdgeData(edge.id, { label: e.target.value })} className={inputCls} placeholder="e.g. analysis output" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Edge type">
            <select value={d.edgeType} onChange={(e) => actions.updateEdgeData(edge.id, { edgeType: e.target.value as EdgeType })} className={selectCls}>
              <option value="flow">flow</option><option value="relation">relation</option><option value="event-flow">event-flow</option>
              <option value="blackboard">blackboard</option><option value="direct-message">direct-message</option>
            </select>
          </Field>
          <Field label="Line style">
            <select value={d.line_style} onChange={(e) => actions.updateEdgeData(edge.id, { line_style: e.target.value as "solid" | "dashed" | "dotted" })} className={selectCls}>
              <option value="solid">solid</option><option value="dashed">dashed</option><option value="dotted">dotted</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Animation">
            <select value={d.animation} onChange={(e) => actions.updateEdgeData(edge.id, { animation: e.target.value as "none" | "flow" | "pulse" })} className={selectCls}>
              <option value="flow">flow</option><option value="pulse">pulse</option><option value="none">none</option>
            </select>
          </Field>
          <Field label="Trigger">
            <select value={d.trigger.type} onChange={(e) => actions.updateEdgeData(edge.id, { trigger: { ...d.trigger, type: e.target.value as "on_completed" | "manual" | "condition" } })} className={selectCls}>
              <option value="on_completed">on_completed</option><option value="condition">condition</option><option value="manual">manual</option>
            </select>
          </Field>
        </div>
        {d.trigger.type === "condition" && (
          <Field label="Condition — example: {{ risk_score < 7 }}">
            <input value={d.trigger.condition} onChange={(e) => actions.updateEdgeData(edge.id, { trigger: { ...d.trigger, condition: e.target.value } })} className={inputCls + " font-mono"} />
          </Field>
        )}
      </Section>
      <Section title="Actions">
        <button onClick={() => actions.removeEdge(edge.id)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ink-850 border border-ink-600 text-ink-400 text-[11.5px] font-bold hover:border-ember/60 hover:text-ember transition-colors cursor-pointer">
          <ITrash size={13} /> Delete edge
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
        <p className="text-[13px] font-extrabold text-ink-50 flex items-center gap-2"><INode size={15} className="text-ink-300" /> Canvas settings</p>
        <p className="text-[10px] text-ink-400 mt-1 leading-5">Select a node to inspect it. With nothing selected, canvas-wide settings live here.</p>
      </div>
      <Section title="canvas.yaml">
        <Field label="Canvas title">
          <input value={canvas.title} onChange={(e) => actions.updateCanvas({ title: e.target.value })} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Owner">
            <input value={canvas.owner} onChange={(e) => actions.updateCanvas({ owner: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Canvas type">
            <select value={canvas.canvas_type} onChange={(e) => actions.updateCanvas({ canvas_type: e.target.value })} className={selectCls}>
              <option value="system-design">system-design</option><option value="agent-pipeline">agent-pipeline</option>
              <option value="notes">notes</option><option value="free">free</option>
            </select>
          </Field>
        </div>
        <Field label="Default model">
          <select value={canvas.default_model} onChange={(e) => actions.updateCanvas({ default_model: e.target.value })} className={selectCls}>
            {["deepseek-chat", "glm-4-flash", "ollama:qwen2.5"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Tags (comma separated)">
          <input value={canvas.tags.join(", ")} onChange={(e) => actions.updateCanvas({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} className={inputCls} />
        </Field>
        <p className="text-[10px] text-ink-500 font-mono mt-1">template: {canvas.template_id} v{canvas.template_version}</p>
      </Section>
      <Section title="Live stats" icon={<IPulse size={12} />}>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            [nodes.length, "nodes"], [edges.length, "edges"], [snapshots.length, "checkpoints"],
          ].map(([n, l]) => (
            <div key={l as string} className="py-2.5 rounded-lg bg-ink-850 border border-ink-700">
              <p className="text-[18px] font-display text-lc-accent leading-6">{n as number}</p>
              <p className="text-[9.5px] text-ink-400">{l}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Danger zone">
        <button
          onClick={() => { if (confirm("The whole workspace is cleared and rebuilt. Are you sure?")) void actions.reset(); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ember/10 border border-ember/40 text-ember text-[11.5px] font-bold hover:bg-ember/20 transition-colors cursor-pointer"
        >
          <ITrash size={13} /> Clear and rebuild the canvas
        </button>
      </Section>
    </div>
  );
}

export function RightPanel() {
  const selectedNode = useStore((s) => s.nodes.find((n) => n.selected));
  const selectedEdge = useStore((s) => s.edges.find((e) => e.selected));
  const open = useStore((s) => s.canvas.layout.rightOpen);
  const width = useStore((s) => s.canvas.layout.rightWidth);
  const focus = useStore((s) => s.ui.focusMode);
  if (focus || !open) return null;
  return (
    <>
    <ResizeHandle side="right" />
    <aside style={{ width }} className="shrink-0 border-s border-ink-700 bg-ink-900/80 flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {selectedNode ? <NodeInspector node={selectedNode} /> : selectedEdge ? <EdgeInspector edgeId={selectedEdge.id} /> : <CanvasInspector />}
      </div>
    </aside>
    </>
  );
}

/* ================= file viewer modal ================= */

export function FileViewer() {
  const viewer = useStore((s) => s.ui.fileViewer);
  const actions = useStore((s) => s.actions);
  const [copied, setCopied] = useState(false);
  if (!viewer) return null;
  const langColor = viewer.lang === "json" ? "var(--color-sky-lc)" : viewer.lang === "yaml" ? "var(--color-sage)" : viewer.lang === "log" ? "var(--color-ember)" : "var(--color-lc-accent)";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink-950/75 backdrop-blur-[3px] anim-fade" onClick={() => actions.openFile(null)}>
      <div className="w-full max-w-[720px] max-h-[80vh] flex flex-col rounded-2xl bg-ink-900 border border-ink-600 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] anim-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ink-700 bg-ink-850">
          <IFile size={15} style={{ color: langColor }} />
          <p className="text-[12px] font-mono text-ink-100 truncate">{CANVAS_ID}/{viewer.path}</p>
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border" style={{ color: langColor, borderColor: `color-mix(in srgb, ${langColor} 33%, transparent)`, background: `color-mix(in srgb, ${langColor} 7%, transparent)` }}>{viewer.lang}</span>
          <div className="ms-auto flex items-center gap-1.5">
            <button
              onClick={() => { void navigator.clipboard?.writeText(viewer.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-ink-300 hover:text-lc-accent border border-ink-600 hover:border-lc-accent/50 transition-colors cursor-pointer"
            >
              {copied ? <ICheck size={11} /> : <IFile size={11} />} {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => actions.openFile(null)} className="p-1 rounded-md text-ink-400 hover:text-ember transition-colors cursor-pointer"><IX size={15} /></button>
          </div>
        </div>
        <pre className="flex-1 min-h-0 overflow-auto overscroll-contain p-4 text-[11.5px] leading-5 font-mono text-ink-200 whitespace-pre-wrap" dir="auto">
          {viewer.content}
        </pre>
        <div className="px-4 py-2 border-t border-ink-700 bg-ink-850 flex items-center gap-2 text-[10px] text-ink-500">
          <IHistory size={11} />
          This file is stored on IndexedDB through StorageAdapter — in phase 2 it is replaced by the server file system.
        </div>
      </div>
    </div>
  );
}
