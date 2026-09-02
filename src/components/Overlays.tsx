import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { roleById, APP_VERSION, type RFNode } from "../state";
import { fmtClock, fmtDate, EMPTY_ARR, THEMES, GRID_GAP, STATUS_BAR_HEIGHT, type BusEvent, type ChatMsg } from "../lib/core";
import {
  IPlay, IStop, ICamera, IHistory, IGear, IChat, IX, ISend, ICheck, IWarn,
  ITerminal, IRestore, IDatabase, ISpark, ITrash, IChevD, IFolder, IFile,
} from "./icons";
import { storageMode } from "../lib/core";
import { isFsAccessSupported } from "../lib/fs-access";

/* ================= status strip =================
   22px along the bottom (docs/patterns/layout-system.md). The split is the design, not the width: the left
   half describes the *document* — what this canvas is, where its files live, how big it is — and the right
   half describes the *moment* — what a run is doing, whether the last write landed, how to leave focus mode.
   One is read back from files on every boot; the other is gone when the tab closes. A reader should be able
   to tell which is which without being told. */

const RUN_TONE: Record<string, string> = {
  idle: "text-ink-500",
  running: "text-amber-lc",
  paused: "text-amber-lc",
  waiting_approval: "text-amber-lc",
  completed: "text-sage",
  failed: "text-ember",
  stopped: "text-ember",
};

export function StatusBar() {
  const title = useStore((s) => s.canvas.title);
  const nodeCount = useStore((s) => s.nodes.length);
  const edgeCount = useStore((s) => s.edges.length);
  const saveState = useStore((s) => s.saveState);
  const status = useStore((s) => s.execution.status);
  const leftOpen = useStore((s) => s.canvas.layout.leftOpen);
  const rightOpen = useStore((s) => s.canvas.layout.rightOpen);
  const focus = useStore((s) => s.ui.focusMode);
  const chordDepth = useStore((s) => s.ui.chordDepth);
  const actions = useStore((s) => s.actions);
  const mode = storageMode();

  const chip = "text-[9.5px] font-mono leading-none px-1.5 py-0.5 rounded border border-ink-700 bg-ink-850";
  return (
    <div
      data-lc-statusbar
      className="h-[22px] shrink-0 flex items-center justify-between gap-3 px-2.5 border-t border-ink-700 bg-ink-900 text-ink-400 select-none"
      style={{ height: STATUS_BAR_HEIGHT }}
    >
      {/* left — the document */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => actions.togglePanel("left")}
          title={`${leftOpen ? "Hide" : "Show"} the left panel`}
          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
            leftOpen ? "border-ink-600 text-ink-200 hover:border-amber-lc/60" : "border-ink-700 text-ink-500 hover:text-ink-200"
          }`}
        >
          {leftOpen ? "◧ Library" : "▫ Library"}
        </button>
        <span className="truncate text-[10px] font-bold text-ink-200">{title}</span>
        <span className={chip}>{nodeCount} nodes</span>
        <span className={chip}>{edgeCount} edges</span>
        <button
          onClick={() => actions.setPortOpen(true)}
          title="Where the files live — and how to move them"
          className={`${chip} text-sky-lc hover:border-sky-lc/60 cursor-pointer`}
        >
          {mode}
        </button>
      </div>

      {/* right — the moment */}
      <div className="flex items-center gap-2 shrink-0">
        {chordDepth > 0 && <span className="text-[9.5px] font-mono text-amber-lc">Ctrl+K … press Z</span>}
        {focus && (
          <button
            onClick={actions.toggleFocusMode}
            title="Leave focus mode — or press Escape twice"
            className="text-[9.5px] font-bold text-amber-lc px-1.5 py-0.5 rounded border border-amber-lc/50 cursor-pointer hover:bg-amber-lc/10"
          >
            Focus mode — Esc Esc
          </button>
        )}
        <span className={`text-[9.5px] font-bold ${RUN_TONE[status] ?? "text-ink-500"}`}>run: {status}</span>
        <span className={chip}>{saveState}</span>
        <button
          onClick={() => actions.togglePanel("right")}
          title={`${rightOpen ? "Hide" : "Show"} the inspector`}
          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
            rightOpen ? "border-ink-600 text-ink-200 hover:border-amber-lc/60" : "border-ink-700 text-ink-500 hover:text-ink-200"
          }`}
        >
          {rightOpen ? "Inspector ▨" : "Inspector ▫"}
        </button>
      </div>
    </div>
  );
}

/* ================= top bar ================= */

function Logo() {
  return (
    <span className="relative w-8 h-8 rounded-[9px] bg-ink-800 border border-amber-lc/35 flex items-center justify-center overflow-visible">
      <span className="w-2.5 h-2.5 rounded-full bg-amber-lc anim-breathe" style={{ boxShadow: "0 0 12px var(--color-amber-lc)" }} />
      <span className="absolute inset-1 rounded-[6px] border border-dashed border-amber-lc/30 anim-spin-slow" />
    </span>
  );
}

export function TopBar() {
  const canvas = useStore((s) => s.canvas);
  const saveState = useStore((s) => s.saveState);
  const backendUrl = useStore((s) => s.settings.backendUrl);
  const execution = useStore((s) => s.execution);
  const actions = useStore((s) => s.actions);
  const running = execution.status === "running";
  const waiting = execution.status === "waiting_approval";
  const progress = execution.queue.length ? execution.completed.length / execution.queue.length : 0;

  return (
    <header className="h-[54px] shrink-0 flex items-center gap-3 px-4 border-b border-ink-700 bg-ink-900/90 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <Logo />
        <div className="leading-none">
          <p className="font-display text-[19px] text-ink-50 tracking-wide">Living Canvas</p>
          <p className="text-[9px] text-ink-400 mt-0.5 flex items-center gap-1.5">
            Living Canvas
            <span className="font-mono text-amber-lc/90 px-1 py-px rounded bg-amber-lc/10 border border-amber-lc/25">v{APP_VERSION}</span>
            <span className="w-1 h-1 rounded-full bg-ink-500" />
            doc <span className="font-mono">1.3</span>
            <span className="w-1 h-1 rounded-full bg-sage" title="phase 1 closed" />
          </p>
        </div>
      </div>

      <div className="w-px h-6 bg-ink-700 mx-1" />

      <div className="min-w-0">
        <p className="text-[13px] font-extrabold text-ink-100 truncate">{canvas.title}</p>
        <p className="text-[9.5px] text-ink-400 flex items-center gap-1.5 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${saveState === "saving" ? "bg-amber-lc anim-blink" : "bg-sage"}`} />
          {saveState === "saving"
            ? "saving…"
            : backendUrl?.trim()
              ? "saved — server StorageAdapter"
              : "saved — IndexedDB"}
          <span className="font-mono">/{canvas.canvas_type}</span>
        </p>
      </div>

      {running && (
        <div className="hidden md:flex items-center gap-2 ms-2">
          <div className="w-24 h-1.5 rounded-full bg-ink-700 overflow-hidden">
            <div className="h-full bg-amber-lc rounded-full transition-all duration-700" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="text-[10px] font-bold text-amber-lc">{execution.completed.length}/{execution.queue.length}</span>
        </div>
      )}

      <div className="ms-auto flex items-center gap-1.5">
        <button
          onClick={() => actions.setPortOpen(true)}
          title="Export / Import and folder attach"
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-bold text-ink-300 hover:text-amber-lc hover:bg-ink-800 border border-ink-600 transition-all cursor-pointer"
        >
          <IFolder size={14} />
          Files
        </button>
        <button onClick={actions.snapshot} title="Manual checkpoint (§10)" className="p-2 rounded-lg text-ink-300 hover:text-amber-lc hover:bg-ink-800 border border-transparent hover:border-ink-600 transition-all cursor-pointer">
          <ICamera size={16} />
        </button>
        <button onClick={() => actions.setHistoryOpen(true)} title="History and rollback" className="p-2 rounded-lg text-ink-300 hover:text-amber-lc hover:bg-ink-800 border border-transparent hover:border-ink-600 transition-all cursor-pointer">
          <IHistory size={16} />
        </button>
        <button onClick={() => actions.setSettingsOpen(true)} title="Settings" className="p-2 rounded-lg text-ink-300 hover:text-amber-lc hover:bg-ink-800 border border-transparent hover:border-ink-600 transition-all cursor-pointer">
          <IGear size={16} />
        </button>
        <div className="w-px h-6 bg-ink-700 mx-1" />
        {running ? (
          <button onClick={actions.stop} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-ember/15 border border-ember/50 text-ember text-[12px] font-extrabold hover:bg-ember/25 transition-all cursor-pointer">
            <IStop size={14} /> Stop run
          </button>
        ) : waiting ? (
          <button onClick={actions.resume} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-ember/15 border border-ember/60 text-ember text-[12px] font-extrabold anim-waiting transition-all cursor-pointer">
            <IWarn size={14} /> Approve &amp; continue
          </button>
        ) : (
          <button onClick={actions.runAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-lc text-ink-950 text-[12px] font-black hover:brightness-110 hover:shadow-[0_6px_24px_-6px_rgba(232,176,75,0.6)] transition-all cursor-pointer active:scale-[0.98]">
            <IPlay size={14} /> Run pipeline
          </button>
        )}
      </div>
    </header>
  );
}

/* ================= activity console ================= */

const TAG_COLOR: Record<string, string> = {
  /* event-tag colours are chrome: six palette roles, re-mapped by whichever theme is on */
  "node.completed": "var(--color-sage)", "node.created": "var(--color-sky-lc)", "node.deleted": "var(--color-ember)", "node.updated": "var(--color-sky-lc)",
  "node.started": "var(--color-amber-lc)", "node.failed": "var(--color-ember)",
  "edge.created": "var(--color-sky-lc)", "edge.deleted": "var(--color-ember)", "edge.updated": "var(--color-sky-lc)",
  "run.started": "var(--color-amber-lc)", "run.completed": "var(--color-sage)", "run.paused": "var(--color-ember)", "run.resumed": "var(--color-sage)", "run.stopped": "var(--color-ember)",
  "lock.acquired": "var(--color-amber-lc)", "lock.released": "var(--color-ink-300)",
  "memory.updated": "var(--color-sky-lc)", "output.written": "var(--color-sage)",
  "snapshot.saved": "var(--color-plum)", "snapshot.restored": "var(--color-plum)",
  "graph.saved": "var(--color-ink-400)", "file.written": "var(--color-ink-400)", "chat.message": "var(--color-sky-lc)",
  "stroke.created": "var(--color-sand)", "stroke.deleted": "var(--color-sand)", "strokes.converted": "var(--color-plum)", "strokes.cleared": "var(--color-sand)",
  "validation.failed": "var(--color-ember)", system: "var(--color-ink-300)",
};

export function ActivityConsole() {
  const events = useStore((s) => s.events);
  const open = useStore((s) => s.ui.consoleOpen);
  const focus = useStore((s) => s.ui.focusMode);
  const actions = useStore((s) => s.actions);
  // focus mode is about the board: the log is chrome, and chrome is what leaves
  if (focus) return null;
  return (
    <div className={`shrink-0 border-t border-ink-700 bg-ink-900/90 transition-all duration-300 ${open ? "h-[168px]" : "h-[34px]"} flex flex-col`}>
      <button onClick={actions.toggleConsole} className="flex items-center gap-2 px-3.5 h-[34px] shrink-0 text-ink-300 hover:text-ink-100 transition-colors cursor-pointer">
        <ITerminal size={13} className="text-amber-lc" />
        <span className="text-[11px] font-bold">Events and system log</span>
        <span className="text-[9.5px] font-mono text-ink-500">Event Bus §11</span>
        <span className="text-[9.5px] text-ink-500 bg-ink-800 border border-ink-700 rounded px-1.5">{events.length}</span>
        <IChevD size={13} className={`ms-auto transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex-1 overflow-y-auto px-3.5 pb-2 space-y-[3px]">
          {events.length === 0 && <p className="text-[10.5px] text-ink-500 py-2">No event yet — start working on the canvas.</p>}
          {events.map((e: BusEvent) => {
            // one lookup per row, because the two alpha tints are derived from the same role
            const tagColor = TAG_COLOR[e.type] ?? "var(--color-ink-300)";
            return (
            <div key={e.id} className="flex items-center gap-2 text-[10.5px] anim-rise">
              <span className="font-mono text-ink-500 shrink-0 w-[52px]">{fmtClock(e.at)}</span>
              <span
                className="shrink-0 font-mono text-[9px] px-1.5 py-px rounded border"
                style={{ color: tagColor, borderColor: `color-mix(in srgb, ${tagColor} 27%, transparent)`, background: `color-mix(in srgb, ${tagColor} 6%, transparent)` }}
              >
                {e.type}
              </span>
              <span className="text-ink-300 truncate">{e.message}</span>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================= chat panel ================= */

export function ChatPanel() {
  const chatNodeId = useStore((s) => s.ui.chatNodeId);
  const node = useStore((s): RFNode | undefined => s.nodes.find((n) => n.id === s.ui.chatNodeId));
  const msgs = useStore((s): ChatMsg[] => (s.ui.chatNodeId ? s.chats[s.ui.chatNodeId] ?? EMPTY_ARR : EMPTY_ARR));
  const typing = useStore((s) => (s.ui.chatNodeId ? s.typing[s.ui.chatNodeId] ?? false : false));
  const actions = useStore((s) => s.actions);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, typing, chatNodeId]);

  if (!chatNodeId || !node) return null;
  const agent = node.data.agent;
  const role = agent ? roleById(agent.role_id) : null;

  const send = () => {
    const t = text.trim();
    if (!t || typing) return;
    setText("");
    actions.chat(chatNodeId, t);
  };

  return (
    <div className="fixed bottom-[180px] z-40 w-[370px] max-w-[calc(100vw-24rem)] rounded-2xl bg-ink-900 border border-ink-600 shadow-[0_24px_70px_-16px_rgba(0,0,0,0.85)] anim-pop overflow-hidden flex flex-col" style={{ height: 470, insetInlineEnd: 306 }}>
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-ink-700 bg-ink-850">
        <span className="w-8 h-8 rounded-[9px] flex items-center justify-center" style={{ background: `${node.data.color}1a`, color: node.data.color, border: `1px solid ${node.data.color}40` }}>
          <IChat size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-extrabold text-ink-50 truncate">{node.data.title}</p>
          <p className="text-[9.5px] text-ink-400 flex items-center gap-1.5">
            {role ? `role: ${role.name}` : "Chat"}
            {agent && <span className="font-mono">{agent.model}</span>}
          </p>
        </div>
        <span className="text-[9px] text-ink-500 font-mono">chats/chat-{node.id}.md</span>
        <button onClick={() => actions.setChatNode(null)} className="p-1 rounded-md text-ink-400 hover:text-ember transition-colors cursor-pointer"><IX size={14} /></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {msgs.length === 0 && (
          <div className="text-center py-8 anim-fade">
            <ISpark size={22} className="mx-auto text-amber-lc/60 mb-2" />
            <p className="text-[11.5px] text-ink-300 font-bold">Working memory of this agent</p>
            <p className="text-[10.5px] text-ink-400 mt-1 leading-5">
              {agent ? `The agent answers only through its own context contract.` : "Write a message to start the conversation."}
            </p>
            {agent && (
              <div className="mt-3 space-y-1 text-start">
                {["What is the success criterion for this step?", "What do you still not know?"].map((q) => (
                  <button key={q} onClick={() => actions.chat(chatNodeId, q)} className="block w-full text-start text-[10.5px] px-2.5 py-1.5 rounded-lg bg-ink-850 border border-ink-600 text-ink-300 hover:border-amber-lc/50 hover:text-amber-lc transition-colors cursor-pointer">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} anim-rise`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-[11.5px] leading-5 ${
              m.role === "user"
                ? "bg-amber-lc/15 border border-amber-lc/35 text-ink-100 rounded-2xl rounded-bl-sm"
                : "bg-ink-800 border border-ink-600 text-ink-200 rounded-2xl rounded-br-sm"
            }`}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className="text-[8.5px] text-ink-500 mt-1 text-end">{fmtClock(m.at)}</p>
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start anim-fade">
            <div className="px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-ink-800 border border-ink-600 flex items-center gap-1">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-amber-lc" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-amber-lc" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-amber-lc" />
            </div>
          </div>
        )}
      </div>

      <div className="p-2.5 border-t border-ink-700 bg-ink-850 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={agent ? "Type your message…" : "Note text…"}
          className="flex-1 px-3 py-2 rounded-xl bg-ink-900 border border-ink-600 text-[12px] text-ink-100 focus:border-amber-lc/60 focus:outline-none transition-colors"
        />
        <button onClick={send} disabled={!text.trim() || typing} className="w-9 h-9 rounded-xl bg-amber-lc text-ink-950 flex items-center justify-center hover:brightness-110 transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed active:scale-95">
          <ISend size={15} className="-scale-x-100" />
        </button>
      </div>
    </div>
  );
}

/* ================= history modal ================= */

export function HistoryModal() {
  const open = useStore((s) => s.ui.historyOpen);
  const snapshots = useStore((s) => s.snapshots);
  const actions = useStore((s) => s.actions);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink-950/75 backdrop-blur-[3px] anim-fade" onClick={() => actions.setHistoryOpen(false)}>
      <div className="w-full max-w-[560px] max-h-[75vh] flex flex-col rounded-2xl bg-ink-900 border border-ink-600 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] anim-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ink-700 bg-ink-850">
          <IHistory size={16} className="text-plum" />
          <div className="flex-1">
            <p className="text-[13px] font-extrabold text-ink-50">History and checkpoints</p>
            <p className="text-[9.5px] text-ink-400 font-mono">history/ — §10</p>
          </div>
          <button onClick={actions.snapshot} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-lc/12 border border-amber-lc/40 text-amber-lc text-[10.5px] font-bold hover:bg-amber-lc/20 transition-colors cursor-pointer">
            <ICamera size={12} /> New checkpoint
          </button>
          <button onClick={() => actions.setHistoryOpen(false)} className="p-1 rounded-md text-ink-400 hover:text-ember transition-colors cursor-pointer"><IX size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {snapshots.length === 0 && (
            <p className="text-center text-[11.5px] text-ink-400 py-10">
              No checkpoint yet.<br />One is saved automatically after every executed step.
            </p>
          )}
          {snapshots.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-ink-850 border border-ink-700 hover:border-plum/40 transition-colors anim-rise">
              <IRestore size={15} className="text-plum shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-bold text-ink-100 truncate">{s.label}</p>
                <p className="text-[9.5px] text-ink-400 flex items-center gap-2 mt-0.5">
                  <span>{fmtDate(s.at)} — {fmtClock(s.at)}</span>
                  <span className="font-mono">{s.node_count}n · {s.edge_count}e</span>
                  <span className={`font-mono ${s.status === "completed" ? "text-sage" : s.status === "failed" ? "text-ember" : "text-ink-500"}`}>{s.status}</span>
                </p>
              </div>
              <button onClick={() => actions.restore(s.id)} className="shrink-0 px-2.5 py-1.5 rounded-lg bg-ink-800 border border-ink-600 text-[10.5px] font-bold text-ink-200 hover:border-plum/60 hover:text-plum transition-colors cursor-pointer">
                Restore
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= settings modal ================= */

export function SettingsModal() {
  const open = useStore((s) => s.ui.settingsOpen);
  const settings = useStore((s) => s.settings);
  const actions = useStore((s) => s.actions);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink-950/75 backdrop-blur-[3px] anim-fade" onClick={() => actions.setSettingsOpen(false)}>
      <div className="w-full max-w-[520px] rounded-2xl bg-ink-900 border border-ink-600 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] anim-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ink-700 bg-ink-850">
          <IGear size={16} className="text-amber-lc" />
          <p className="text-[13px] font-extrabold text-ink-50 flex-1">Engine and model settings</p>
          <button onClick={() => actions.setSettingsOpen(false)} className="p-1 rounded-md text-ink-400 hover:text-ember transition-colors cursor-pointer"><IX size={15} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-[11px] font-bold text-ink-300 mb-2">AI provider (§15)</p>
            <div className="grid grid-cols-2 gap-2">
              {([["sim", "Internal simulator", "no key needed — phase 1 template answers"], ["deepseek", "DeepSeek API", "real connection to deepseek-chat"]] as const).map(([k, t, d]) => (
                <button
                  key={k}
                  onClick={() => actions.updateSettings({ provider: k })}
                  className={`text-start p-3 rounded-xl border transition-all cursor-pointer ${settings.provider === k ? "border-amber-lc/60 bg-amber-lc/10" : "border-ink-600 bg-ink-850 hover:border-ink-500"}`}
                >
                  <p className={`text-[12px] font-extrabold flex items-center gap-1.5 ${settings.provider === k ? "text-amber-lc" : "text-ink-100"}`}>
                    {settings.provider === k && <ICheck size={12} />}{t}
                  </p>
                  <p className="text-[9.5px] text-ink-400 mt-1 leading-4">{d}</p>
                </button>
              ))}
            </div>
          </div>

          {settings.provider === "deepseek" && (
            <div className="space-y-3 anim-rise">
              <label className="block">
                <span className="block text-[11px] font-bold text-ink-300 mb-1">API key</span>
                <input
                  type="password" value={settings.apiKey}
                  onChange={(e) => actions.updateSettings({ apiKey: e.target.value })}
                  placeholder="sk-…"
                  className="w-full px-3 py-2 rounded-xl bg-ink-850 border border-ink-600 text-[12px] font-mono text-ink-100 focus:border-amber-lc/60 focus:outline-none"
                />
              </label>
              <p className="text-[9.5px] text-ink-500 leading-4 flex gap-1.5"><IWarn size={11} className="shrink-0 mt-0.5 text-amber-lc" /> The key is stored only in your browser's localStorage. On a network error the engine falls back to the simulator automatically (§12.6).</p>
              <button
                onClick={() => actions.testFallback()}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-ink-850 border border-ink-600 text-[11px] font-bold text-sky-lc hover:border-sky-lc/60 hover:bg-sky-lc/10 transition-all cursor-pointer active:scale-[0.99]"
              >
                <ITerminal size={12} /> Test the real connection and fallback
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink-300 mb-1">
              <IDatabase size={11} className="text-sky-lc" /> Backend server — phase 2
            </span>
            <input
              value={settings.backendUrl}
              onChange={(e) => actions.updateSettings({ backendUrl: e.target.value })}
              placeholder="http://localhost:8000 — empty = local IndexedDB"
              className="w-full px-3 py-2 rounded-xl bg-ink-850 border border-ink-600 text-[12px] font-mono text-ink-100 focus:border-amber-lc/60 focus:outline-none"
            />
            <p className="text-[9.5px] text-ink-500 leading-4 mt-1">
              Once an address is filled in, every read/write goes through <span className="font-mono">HttpStorageAdapter</span> to the FastAPI server (contract §5.2). It applies on the next load; if the server does not answer, the system stays on IndexedDB.
            </p>
          </div>

          <label className="block">
            <span className="block text-[11px] font-bold text-ink-300 mb-1">Model</span>
            <input value={settings.model} onChange={(e) => actions.updateSettings({ model: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-ink-850 border border-ink-600 text-[12px] font-mono text-ink-100 focus:border-amber-lc/60 focus:outline-none" />
          </label>            <label className="block">
              <span className="block text-[11px] font-bold text-ink-300 mb-1">Canvas owner</span>
              <input value={settings.owner} onChange={(e) => actions.updateSettings({ owner: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-ink-850 border border-ink-600 text-[12px] text-ink-100 focus:border-amber-lc/60 focus:outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="block text-[11px] font-bold text-ink-300 mb-1">Simulation speed: {Math.round((1650 - settings.simDelay) / 14)}%</span>
            <input type="range" min={250} max={1400} step={50} value={1650 - settings.simDelay} onChange={(e) => actions.updateSettings({ simDelay: 1650 - Number(e.target.value) })} className="w-full accent-amber-lc" />
          </label>

          <div>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink-300 mb-2">
              <IGear size={11} className="text-amber-lc" /> Appearance — this device, not the canvas
            </span>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => actions.updateSettings({ theme: t.id })}
                  className={`text-start p-3 rounded-xl border transition-all cursor-pointer ${settings.theme === t.id ? "border-amber-lc/60 bg-amber-lc/10" : "border-ink-600 bg-ink-850 hover:border-ink-500"}`}
                >
                  <p className={`text-[12px] font-extrabold flex items-center gap-1.5 ${settings.theme === t.id ? "text-amber-lc" : "text-ink-100"}`}>
                    {settings.theme === t.id && <ICheck size={12} />}{t.label}
                  </p>
                  <p className="text-[9.5px] text-ink-400 mt-1 leading-4">{t.hint}</p>
                </button>
              ))}
            </div>
            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox" checked={settings.snapToGrid}
                onChange={(e) => actions.updateSettings({ snapToGrid: e.target.checked })}
                className="accent-amber-lc w-3.5 h-3.5 mt-0.5"
              />
              <span>
                <span className="block text-[11px] font-bold text-ink-300">Snap nodes to the {GRID_GAP}px grid</span>
                <span className="block text-[9.5px] text-ink-500 leading-4 mt-0.5">
                  The grid is the dot pattern, so a snapped node lands on visible dots. Off by default: snapping
                  rewrites <span className="font-mono">position</span> inside every node file it touches.
                </span>
              </span>
            </label>
            <p className="text-[9.5px] text-ink-500 leading-4 flex gap-1.5 mt-2">
              <IWarn size={11} className="shrink-0 mt-0.5 text-sky-lc" />
              Theme and grid are stored in this browser (<span className="font-mono">lc-settings</span>), never in the canvas
              folder: how you like your editor is not what you drew. Node colours stay yours — they are data.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={actions.saveSettingsLocal} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-lc text-ink-950 text-[12px] font-black hover:brightness-110 transition-all cursor-pointer">
              <ICheck size={14} /> Save settings
            </button>
            <button
              onClick={() => { if (confirm("The whole workspace is cleared and rebuilt. Continue?")) { actions.setSettingsOpen(false); void actions.reset(); } }}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-ember/10 border border-ember/40 text-ember text-[11.5px] font-bold hover:bg-ember/20 transition-colors cursor-pointer"
            >
              <ITrash size={13} /> Reset the canvas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= toasts ================= */

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const actions = useStore((s) => s.actions);
  const KIND = {
    info: { c: "var(--color-sky-lc)", Icon: ISpark },
    success: { c: "var(--color-sage)", Icon: ICheck },
    warn: { c: "var(--color-amber-lc)", Icon: IWarn },
    error: { c: "var(--color-ember)", Icon: IWarn },
  } as const;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] space-y-2 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-none">
      {toasts.map((t) => {
        const k = KIND[t.kind];
        return (
          <button
            key={t.id}
            onClick={() => actions.dismissToast(t.id)}
            className="pointer-events-auto w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-ink-900/95 border shadow-[0_14px_40px_-10px_rgba(0,0,0,0.7)] anim-toast text-start cursor-pointer backdrop-blur-sm"
            style={{ borderColor: `${k.c}55` }}
          >
            <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${k.c}18`, color: k.c }}>
              <k.Icon size={13} />
            </span>
            <span className="text-[11.5px] text-ink-100 font-bold leading-5">{t.text}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ================= boot overlay ================= */

export function BootOverlay() {
  const booted = useStore((s) => s.booted);
  const bootLines = useStore((s) => s.bootLines);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (booted) {
      const t = setTimeout(() => setGone(true), 900);
      return () => clearTimeout(t);
    }
  }, [booted]);

  if (gone) return null;
  return (
    <div className={`fixed inset-0 z-[70] lc-bg flex items-center justify-center transition-opacity duration-700 ${booted ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
      <div className="w-[420px] max-w-[90vw]">
        <div className="flex items-center gap-3 mb-6">
          <span className="relative w-11 h-11 rounded-xl bg-ink-800 border border-amber-lc/40 flex items-center justify-center">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-lc anim-breathe" style={{ boxShadow: "0 0 16px var(--color-amber-lc)" }} />
            <span className="absolute inset-1.5 rounded-lg border border-dashed border-amber-lc/30 anim-spin-slow" />
          </span>
          <div>
            <p className="font-display text-[26px] text-ink-50 leading-8">Living Canvas</p>
            <p className="text-[10.5px] text-ink-400">
              file-first layout — architecture doc <span className="font-mono">1.3</span> · release <span className="font-mono text-amber-lc/80">v{APP_VERSION}</span>
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-ink-900/80 border border-ink-700 p-3 min-h-[210px] max-h-[300px] overflow-hidden">
          {bootLines.length === 0 && (
            <p className="text-[11px] text-ink-400 flex items-center gap-2"><IDatabase size={13} className="text-amber-lc" /> connecting to StorageAdapter (IndexedDB)…</p>
          )}
          {bootLines.map((l, i) => (
            <p key={i} className="text-[10.5px] font-mono text-ink-300 flex items-center gap-2 py-[2.5px] anim-boot">
              <ICheck size={10} className="text-sage shrink-0" />
              <span className="truncate">{l.text}</span>
            </p>
          ))}
          {!booted && <p className="text-[10.5px] font-mono text-amber-lc anim-blink py-[2.5px]">▍ writing…</p>}
        </div>
        <div className="mt-3 h-1 rounded-full bg-ink-800 overflow-hidden">
          <div className="h-full bg-amber-lc rounded-full transition-all duration-200" style={{ width: `${Math.min(100, (bootLines.length / 27) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ================= export / import (portability) ================= */

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return Math.round((n / (1024 * 1024)) * 10) / 10 + " MB";
}

const MODE_LABEL: Record<string, string> = {
  idb: "IndexedDB (browser)",
  fs: "real folder on disk",
  http: "server (backend)",
  memory: "memory only (temporary)",
};

function ModeRow({ k, v, tone }: { k: string; v: string; tone?: "ok" | "warn" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[11px]">
      <span className="text-ink-400">{k}</span>
      <span className={`font-bold ${tone === "warn" ? "text-amber-lc" : tone === "ok" ? "text-sage" : "text-ink-100"}`}>{v}</span>
    </div>
  );
}

function ActBtn({ onClick, disabled, icon, title, desc, primary, danger }: {
  onClick: () => void; disabled?: boolean; icon: React.ReactNode; title: string; desc: string; primary?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-start gap-2.5 p-3 rounded-xl border text-start transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        primary
          ? "bg-amber-lc/12 border-amber-lc/45 hover:bg-amber-lc/20"
          : danger
            ? "bg-ink-850 border-ember/35 hover:border-ember/70"
            : "bg-ink-850 border-ink-600 hover:border-amber-lc/50"
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${primary ? "text-amber-lc" : danger ? "text-ember" : "text-ink-300"}`}>{icon}</span>
      <span className="min-w-0">
        <span className={`block text-[12px] font-extrabold ${primary ? "text-amber-lc" : "text-ink-100"}`}>{title}</span>
        <span className="block text-[10px] text-ink-400 leading-5 mt-0.5">{desc}</span>
      </span>
    </button>
  );
}

export function PortModal() {
  const open = useStore((s) => s.ui.portOpen);
  const actions = useStore((s) => s.actions);
  const canvas = useStore((s) => s.canvas);
  const canvasId = useStore((s) => s.canvasId);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const strokes = useStore((s) => s.strokes);
  const snapshots = useStore((s) => s.snapshots);
  const workspaceRoot = useStore((s) => s.settings.workspaceRoot);
  const mode = storageMode();
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<(Awaited<ReturnType<typeof actions.previewImport>> & { name: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fsOk = isFsAccessSupported();
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;
  const close = () => actions.setPortOpen(false);

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy("reading file");
    setError(null);
    try {
      const text = await f.text();
      const p = await actions.previewImport(text);
      setPreview({ ...p, name: f.name });
    } catch (err) {
      setPreview(null);
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink-950/78 backdrop-blur-[3px] anim-fade" onClick={close}>
      <div
        className="w-full max-w-[620px] max-h-[86vh] flex flex-col rounded-2xl bg-ink-900 border border-ink-600 shadow-[0_30px_90px_-24px_rgba(0,0,0,0.9)] anim-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ink-700 bg-ink-850">
          <IFolder size={16} className="text-amber-lc" />
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold text-ink-50">Canvas files — Export / Import</p>
            <p className="text-[9.5px] text-ink-400 mt-0.5">
              Both paths are file-first: the JSON bundle carries every §2 file, not just internal state.
            </p>
          </div>
          <button onClick={close} className="ms-auto p-1.5 rounded-md text-ink-400 hover:text-ember transition-colors cursor-pointer"><IX size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* source of truth */}
          <div className="rounded-xl border border-ink-700 bg-ink-950/60 px-3.5 py-2">
            <ModeRow k="storage source" v={MODE_LABEL[mode] ?? mode} tone={mode === "memory" ? "warn" : "ok"} />
            {workspaceRoot && <ModeRow k="attached folder" v={workspaceRoot + "/"} />}
            <ModeRow k="canvas content" v={`${nodes.length} nodes · ${edges.length} edges · ${strokes.length} strokes · ${snapshots.length} checkpoints`} />
            <ModeRow k="canvas id" v={canvasId} />
          </div>

          {/* live folder */}
          <section className="space-y-2">
            <p className="text-[11px] font-black text-ink-100 flex items-center gap-1.5">
              <IDatabase size={12} className="text-sage" /> Live folder mode
              <span className="text-[9px] font-normal text-ink-500">— files written verbatim to disk, Git/Obsidian compatible</span>
            </p>
            {fsOk ? (
              <div className="grid sm:grid-cols-2 gap-2">
                {mode === "fs" ? (
                  <>
                    <ActBtn onClick={() => run("reload", actions.reloadFromDisk)} icon={<IRestore size={15} />} title="Reload from disk" desc="If you changed the files outside the app (git pull or an editor), rebuild the canvas from those files." />
                    <ActBtn onClick={() => run("detach", actions.detachFolder)} icon={<ITrash size={15} />} title="Detach the folder" desc="Back to local IndexedDB. The files on disk stay untouched." />
                  </>
                ) : (
                  <ActBtn
                    onClick={() => run("attach", actions.attachFolder)}
                    icon={<IFolder size={15} />}
                    title="Attach a folder on disk"
                    desc="Pick a folder: if it holds a canvas it is loaded; if it is empty the §2 structure is created inside it."
                    primary
                  />
                )}
              </div>
            ) : (
              <div className="lc-import-warn">
                Your browser (Firefox/Safari) has no File System Access API. No problem — “Download canvas file” and “Load a file” do the same job with one JSON file.
              </div>
            )}
          </section>

          {/* export */}
          <section className="space-y-2">
            <p className="text-[11px] font-black text-ink-100">Export</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <ActBtn
                onClick={() => run("download", actions.exportJson)}
                icon={<IFile size={15} />}
                title="Download the .livingcanvas.json file"
                desc="Every canvas file inside one file. Works in any browser; best for sending to someone else."
                primary
              />
              <ActBtn
                onClick={() => run("folder", actions.exportFolder)}
                icon={<IFolder size={15} />}
                title="Copy into a folder"
                disabled={!fsOk}
                desc={fsOk ? "Writes the §2 tree to disk; commit it with Git afterwards." : "this browser does not support it"}
              />
            </div>
            <p className="text-[9.5px] text-ink-500 leading-5">
              Before an Export, pending debounced writes are flushed — the exported files are your latest edits.
              Canvas title: <span className="text-ink-300">{canvas.title}</span>
            </p>
          </section>

          {/* import */}
          <section className="space-y-2">
            <p className="text-[11px] font-black text-ink-100">Import</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <ActBtn onClick={() => fileRef.current?.click()} icon={<IRestore size={15} />} title="Load a canvas file" desc="A .livingcanvas.json (or any JSON holding canvas files)." primary />
              <ActBtn onClick={() => run("folder import", () => actions.importFolder(replace))} icon={<IFolder size={15} />} title="Import from a folder" disabled={!fsOk} desc={fs1Desc(fsOk)} />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <label className="flex items-center gap-2 text-[10.5px] text-ink-300 cursor-pointer select-none">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-amber-lc w-3.5 h-3.5" />
              Replace the whole current canvas (if unchecked, files are added/updated and the current canvas stays)
            </label>

            {busy === "reading file" && <p className="text-[10.5px] text-ink-400">reading and validating…</p>}

            {preview && (
              <div className="rounded-xl border border-sage/35 bg-ink-950/60 p-3 space-y-2 anim-fade">
                <p className="text-[11.5px] font-extrabold text-sage">Preview: {preview.title ?? "untitled"}</p>
                <ModeRow k="file" v={preview.name} />
                <ModeRow k="canvas" v={preview.canvasId ?? "—"} tone={preview.canvasId && preview.canvasId !== canvasId ? "warn" : undefined} />
                <ModeRow k="nodes / edges (buildable)" v={`${preview.nodes} / ${preview.edges}`} />
                <ModeRow k="file count" v={String(preview.fileCount)} />
                <ModeRow k="size" v={formatBytes(preview.bytes)} />
                {preview.warning && <div className="lc-import-warn">{preview.warning}</div>}
                {preview.skipped.length > 0 && (
                  <div className="lc-import-danger">
                    {preview.skipped.length} files rejected:
                    <div className="lc-import-list mt-1.5">
                      {preview.skipped.slice(0, 8).map((sk) => (
                        <div key={sk.path}><span className="text-ink-300">{sk.path}</span> — {sk.reason}</div>
                      ))}
                      {preview.skipped.length > 8 && <div className="text-ink-500">… and {preview.skipped.length - 8} more</div>}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() =>
                      run("import", async () => {
                        await actions.commitImport(preview.files, replace);
                        setPreview(null);
                        close();
                      })
                    }
                    className="flex-1 px-3 py-2 rounded-xl bg-amber-lc text-ink-950 text-[11.5px] font-black hover:brightness-110 transition-all cursor-pointer"
                  >
                    Confirm and {replace ? "replace the canvas" : "merge the files"}
                  </button>
                  <button onClick={() => setPreview(null)} className="px-3 py-2 rounded-xl bg-ink-800 border border-ink-600 text-[11px] font-bold text-ink-300 hover:text-ink-100 transition-all cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {error && <div className="lc-import-danger">{error}</div>}
            {busy && busy !== "reading file" && <p className="text-[10.5px] text-amber-lc">{busy}…</p>}
          </section>
        </div>

        <div className="px-4 py-2.5 border-t border-ink-700 bg-ink-850 flex items-center gap-2 text-[9.5px] text-ink-500">
          <ISpark size={11} className="text-amber-lc/70" />
          Import is file-first: the canvas is rebuilt from nodes/*.md, edges/*.yaml and memory/*.md. A bundle
          that still carries the old graph.json has it dropped on the way in — positions live in the node files now.
        </div>
      </div>
    </div>
  );
}

function fs1Desc(fsOk: boolean) {
  return fsOk ? "Pick a folder holding the §2 tree — it also works if you made the folder by hand with Obsidian/Git." : "this browser does not support it";
}
