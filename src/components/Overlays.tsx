import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { roleById, type RFNode } from "../state";
import { faNum, fmtClock, fmtDate, type BusEvent } from "../lib/core";
import {
  IPlay, IStop, ICamera, IHistory, IGear, IChat, IX, ISend, ICheck, IWarn,
  ITerminal, IRestore, IDatabase, ISpark, ITrash, IChevD,
} from "./icons";

/* ================= top bar ================= */

function Logo() {
  return (
    <span className="relative w-8 h-8 rounded-[9px] bg-ink-800 border border-amber-lc/35 flex items-center justify-center overflow-visible">
      <span className="w-2.5 h-2.5 rounded-full bg-amber-lc anim-breathe" style={{ boxShadow: "0 0 12px #e8b04b" }} />
      <span className="absolute inset-1 rounded-[6px] border border-dashed border-amber-lc/30 anim-spin-slow" />
    </span>
  );
}

export function TopBar() {
  const canvas = useStore((s) => s.canvas);
  const saveState = useStore((s) => s.saveState);
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
            بوم زنده <span className="font-mono text-amber-lc/80" dir="ltr">v1.3</span>
            <span className="w-1 h-1 rounded-full bg-ink-500" /> فاز ۱
          </p>
        </div>
      </div>

      <div className="w-px h-6 bg-ink-700 mx-1" />

      <div className="min-w-0">
        <p className="text-[13px] font-extrabold text-ink-100 truncate">{canvas.title}</p>
        <p className="text-[9.5px] text-ink-400 flex items-center gap-1.5 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${saveState === "saving" ? "bg-amber-lc anim-blink" : "bg-sage"}`} />
          {saveState === "saving" ? "در حال ذخیره روی IndexedDB…" : "ذخیره‌شده — StorageAdapter"}
          <span className="font-mono" dir="ltr">/{canvas.canvas_type}</span>
        </p>
      </div>

      {running && (
        <div className="hidden md:flex items-center gap-2 ms-2">
          <div className="w-24 h-1.5 rounded-full bg-ink-700 overflow-hidden">
            <div className="h-full bg-amber-lc rounded-full transition-all duration-700" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="text-[10px] font-bold text-amber-lc">{faNum(execution.completed.length)}/{faNum(execution.queue.length)}</span>
        </div>
      )}

      <div className="ms-auto flex items-center gap-1.5">
        <button onClick={actions.snapshot} title="چک‌پوینت دستی (§10)" className="p-2 rounded-lg text-ink-300 hover:text-amber-lc hover:bg-ink-800 border border-transparent hover:border-ink-600 transition-all cursor-pointer">
          <ICamera size={16} />
        </button>
        <button onClick={() => actions.setHistoryOpen(true)} title="تاریخچه و بازگشت" className="p-2 rounded-lg text-ink-300 hover:text-amber-lc hover:bg-ink-800 border border-transparent hover:border-ink-600 transition-all cursor-pointer">
          <IHistory size={16} />
        </button>
        <button onClick={() => actions.setSettingsOpen(true)} title="تنظیمات" className="p-2 rounded-lg text-ink-300 hover:text-amber-lc hover:bg-ink-800 border border-transparent hover:border-ink-600 transition-all cursor-pointer">
          <IGear size={16} />
        </button>
        <div className="w-px h-6 bg-ink-700 mx-1" />
        {running ? (
          <button onClick={actions.stop} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-ember/15 border border-ember/50 text-ember text-[12px] font-extrabold hover:bg-ember/25 transition-all cursor-pointer">
            <IStop size={14} /> توقف اجرا
          </button>
        ) : waiting ? (
          <button onClick={actions.resume} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-ember/15 border border-ember/60 text-ember text-[12px] font-extrabold anim-waiting transition-all cursor-pointer">
            <IWarn size={14} /> تأیید و ادامه
          </button>
        ) : (
          <button onClick={actions.runAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-lc text-ink-950 text-[12px] font-black hover:brightness-110 hover:shadow-[0_6px_24px_-6px_rgba(232,176,75,0.6)] transition-all cursor-pointer active:scale-[0.98]">
            <IPlay size={14} /> اجرای خط لوله
          </button>
        )}
      </div>
    </header>
  );
}

/* ================= activity console ================= */

const TAG_COLOR: Record<string, string> = {
  "node.completed": "#8fbf7f", "node.created": "#6fb3c7", "node.deleted": "#e06a4e", "node.updated": "#6fb3c7",
  "node.started": "#e8b04b", "node.failed": "#e06a4e",
  "edge.created": "#6fb3c7", "edge.deleted": "#e06a4e", "edge.updated": "#6fb3c7",
  "run.started": "#e8b04b", "run.completed": "#8fbf7f", "run.paused": "#e06a4e", "run.resumed": "#8fbf7f", "run.stopped": "#e06a4e",
  "lock.acquired": "#e8b04b", "lock.released": "#8ba39d",
  "memory.updated": "#6fb3c7", "output.written": "#8fbf7f",
  "snapshot.saved": "#b98bc2", "snapshot.restored": "#b98bc2",
  "graph.saved": "#5f7b76", "file.written": "#5f7b76", "chat.message": "#6fb3c7",
  "validation.failed": "#e06a4e", system: "#8ba39d",
};

export function ActivityConsole() {
  const events = useStore((s) => s.events);
  const open = useStore((s) => s.ui.consoleOpen);
  const actions = useStore((s) => s.actions);
  return (
    <div className={`shrink-0 border-t border-ink-700 bg-ink-900/90 transition-all duration-300 ${open ? "h-[168px]" : "h-[34px]"} flex flex-col`}>
      <button onClick={actions.toggleConsole} className="flex items-center gap-2 px-3.5 h-[34px] shrink-0 text-ink-300 hover:text-ink-100 transition-colors cursor-pointer">
        <ITerminal size={13} className="text-amber-lc" />
        <span className="text-[11px] font-bold">رویدادها و لاگ سیستم</span>
        <span className="text-[9.5px] font-mono text-ink-500" dir="ltr">Event Bus §11</span>
        <span className="text-[9.5px] text-ink-500 bg-ink-800 border border-ink-700 rounded px-1.5">{faNum(events.length)}</span>
        <IChevD size={13} className={`ms-auto transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex-1 overflow-y-auto px-3.5 pb-2 space-y-[3px]">
          {events.length === 0 && <p className="text-[10.5px] text-ink-500 py-2">هنوز رویدادی ثبت نشده — تعامل با بوم را شروع کنید.</p>}
          {events.map((e: BusEvent) => (
            <div key={e.id} className="flex items-center gap-2 text-[10.5px] anim-rise">
              <span className="font-mono text-ink-500 shrink-0 w-[52px]" dir="ltr">{fmtClock(e.at)}</span>
              <span
                className="shrink-0 font-mono text-[9px] px-1.5 py-px rounded border"
                style={{ color: TAG_COLOR[e.type] ?? "#8ba39d", borderColor: `${TAG_COLOR[e.type] ?? "#8ba39d"}44`, background: `${TAG_COLOR[e.type] ?? "#8ba39d"}10` }}
                dir="ltr"
              >
                {e.type}
              </span>
              <span className="text-ink-300 truncate">{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= chat panel ================= */

export function ChatPanel() {
  const chatNodeId = useStore((s) => s.ui.chatNodeId);
  const node = useStore((s): RFNode | undefined => s.nodes.find((n) => n.id === s.ui.chatNodeId));
  const msgs = useStore((s) => (s.ui.chatNodeId ? s.chats[s.ui.chatNodeId] ?? [] : []));
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
    <div className="fixed bottom-[180px] z-40 w-[370px] max-w-[calc(100vw-24rem)] rounded-2xl bg-ink-900 border border-ink-600 shadow-[0_24px_70px_-16px_rgba(0,0,0,0.85)] anim-pop overflow-hidden flex flex-col" style={{ height: 470, insetInlineStart: 306 }}>
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-ink-700 bg-ink-850">
        <span className="w-8 h-8 rounded-[9px] flex items-center justify-center" style={{ background: `${node.data.color}1a`, color: node.data.color, border: `1px solid ${node.data.color}40` }}>
          <IChat size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-extrabold text-ink-50 truncate">{node.data.title}</p>
          <p className="text-[9.5px] text-ink-400 flex items-center gap-1.5">
            {role ? `نقش: ${role.name}` : "گفتگو"}
            {agent && <span className="font-mono" dir="ltr">{agent.model}</span>}
          </p>
        </div>
        <span className="text-[9px] text-ink-500 font-mono" dir="ltr">chats/chat-{node.id}.md</span>
        <button onClick={() => actions.setChatNode(null)} className="p-1 rounded-md text-ink-400 hover:text-ember transition-colors cursor-pointer"><IX size={14} /></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {msgs.length === 0 && (
          <div className="text-center py-8 anim-fade">
            <ISpark size={22} className="mx-auto text-amber-lc/60 mb-2" />
            <p className="text-[11.5px] text-ink-300 font-bold">حافظه‌ی کاری این ایجنت</p>
            <p className="text-[10.5px] text-ink-400 mt-1 leading-5">
              {agent ? `ایجنت فقط بر اساس قرارداد زمینه‌ی خودش پاسخ می‌دهد.` : "پیامی بنویسید تا گفتگو آغاز شود."}
            </p>
            {agent && (
              <div className="mt-3 space-y-1 text-start">
                {["معیار موفقیت این گام چیست؟", "چه چیزی را هنوز نمی‌دانی؟"].map((q) => (
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
              <p className="text-[8.5px] text-ink-500 mt-1 text-end" dir="ltr">{fmtClock(m.at)}</p>
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
          placeholder={agent ? "پیام خود را بنویسید…" : "متن یادداشت…"}
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
            <p className="text-[13px] font-extrabold text-ink-50">تاریخچه و چک‌پوینت‌ها</p>
            <p className="text-[9.5px] text-ink-400 font-mono" dir="ltr">history/ — §10</p>
          </div>
          <button onClick={actions.snapshot} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-lc/12 border border-amber-lc/40 text-amber-lc text-[10.5px] font-bold hover:bg-amber-lc/20 transition-colors cursor-pointer">
            <ICamera size={12} /> چک‌پوینت جدید
          </button>
          <button onClick={() => actions.setHistoryOpen(false)} className="p-1 rounded-md text-ink-400 hover:text-ember transition-colors cursor-pointer"><IX size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {snapshots.length === 0 && (
            <p className="text-center text-[11.5px] text-ink-400 py-10">
              هنوز چک‌پوینتی گرفته نشده.<br />بعد از هر گام اجرا، به‌صورت خودکار snapshot ذخیره می‌شود.
            </p>
          )}
          {snapshots.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-ink-850 border border-ink-700 hover:border-plum/40 transition-colors anim-rise">
              <IRestore size={15} className="text-plum shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-bold text-ink-100 truncate">{s.label}</p>
                <p className="text-[9.5px] text-ink-400 flex items-center gap-2 mt-0.5">
                  <span>{fmtDate(s.at)} — {fmtClock(s.at)}</span>
                  <span className="font-mono" dir="ltr">{faNum(s.node_count)}n · {faNum(s.edge_count)}e</span>
                  <span className={`font-mono ${s.status === "completed" ? "text-sage" : s.status === "failed" ? "text-ember" : "text-ink-500"}`} dir="ltr">{s.status}</span>
                </p>
              </div>
              <button onClick={() => actions.restore(s.id)} className="shrink-0 px-2.5 py-1.5 rounded-lg bg-ink-800 border border-ink-600 text-[10.5px] font-bold text-ink-200 hover:border-plum/60 hover:text-plum transition-colors cursor-pointer">
                بازگردانی
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
          <p className="text-[13px] font-extrabold text-ink-50 flex-1">تنظیمات موتور و مدل</p>
          <button onClick={() => actions.setSettingsOpen(false)} className="p-1 rounded-md text-ink-400 hover:text-ember transition-colors cursor-pointer"><IX size={15} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-[11px] font-bold text-ink-300 mb-2">ارائه‌دهنده‌ی هوش مصنوعی (§15)</p>
            <div className="grid grid-cols-2 gap-2">
              {([["sim", "شبیه‌ساز داخلی", "بدون نیاز به کلید — پاسخ‌های قالبی فاز ۱"], ["deepseek", "DeepSeek API", "اتصال واقعی به deepseek-chat"]] as const).map(([k, t, d]) => (
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
                <span className="block text-[11px] font-bold text-ink-300 mb-1">کلید API</span>
                <input
                  type="password" value={settings.apiKey} dir="ltr"
                  onChange={(e) => actions.updateSettings({ apiKey: e.target.value })}
                  placeholder="sk-…"
                  className="w-full px-3 py-2 rounded-xl bg-ink-850 border border-ink-600 text-[12px] font-mono text-ink-100 focus:border-amber-lc/60 focus:outline-none"
                />
              </label>
              <p className="text-[9.5px] text-ink-500 leading-4 flex gap-1.5"><IWarn size={11} className="shrink-0 mt-0.5 text-amber-lc" /> کلید فقط در localStorage مرورگر شما ذخیره می‌شود. در صورت خطای شبکه، موتور به‌صورت خودکار به شبیه‌ساز برمی‌گردد (§12.6).</p>
              <button
                onClick={() => actions.testFallback()}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-ink-850 border border-ink-600 text-[11px] font-bold text-sky-lc hover:border-sky-lc/60 hover:bg-sky-lc/10 transition-all cursor-pointer active:scale-[0.99]"
              >
                <ITerminal size={12} /> تست واقعی اتصال و Fallback
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-bold text-ink-300 mb-1">مدل</span>
              <input value={settings.model} dir="ltr" onChange={(e) => actions.updateSettings({ model: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-ink-850 border border-ink-600 text-[12px] font-mono text-ink-100 focus:border-amber-lc/60 focus:outline-none" />
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold text-ink-300 mb-1">مالک بوم (owner)</span>
              <input value={settings.owner} onChange={(e) => actions.updateSettings({ owner: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-ink-850 border border-ink-600 text-[12px] text-ink-100 focus:border-amber-lc/60 focus:outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="block text-[11px] font-bold text-ink-300 mb-1">سرعت شبیه‌سازی: {faNum(Math.round((1650 - settings.simDelay) / 14))}٪</span>
            <input type="range" min={250} max={1400} step={50} value={1650 - settings.simDelay} onChange={(e) => actions.updateSettings({ simDelay: 1650 - Number(e.target.value) })} className="w-full accent-[#e8b04b]" />
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={actions.saveSettingsLocal} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-lc text-ink-950 text-[12px] font-black hover:brightness-110 transition-all cursor-pointer">
              <ICheck size={14} /> ذخیره‌ی تنظیمات
            </button>
            <button
              onClick={() => { if (confirm("کل فضای کار پاک و بازسازی می‌شود. ادامه می‌دهید؟")) { actions.setSettingsOpen(false); void actions.reset(); } }}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-ember/10 border border-ember/40 text-ember text-[11.5px] font-bold hover:bg-ember/20 transition-colors cursor-pointer"
            >
              <ITrash size={13} /> بازنشانی بوم
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
    info: { c: "#6fb3c7", Icon: ISpark },
    success: { c: "#8fbf7f", Icon: ICheck },
    warn: { c: "#e8b04b", Icon: IWarn },
    error: { c: "#e06a4e", Icon: IWarn },
  } as const;
  return (
    <div className="fixed bottom-5 start-1/2 translate-x-1/2 rtl:translate-x-[-50%] z-[60] space-y-2 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-none" style={{ insetInlineStart: "50%", transform: "translateX(50%)" }}>
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
            <span className="w-3.5 h-3.5 rounded-full bg-amber-lc anim-breathe" style={{ boxShadow: "0 0 16px #e8b04b" }} />
            <span className="absolute inset-1.5 rounded-lg border border-dashed border-amber-lc/30 anim-spin-slow" />
          </span>
          <div>
            <p className="font-display text-[26px] text-ink-50 leading-8">Living Canvas</p>
            <p className="text-[10.5px] text-ink-400">مقداردهی ساختار فایل‌محور — سند معماری v1.3</p>
          </div>
        </div>
        <div className="rounded-xl bg-ink-900/80 border border-ink-700 p-3 min-h-[210px] max-h-[300px] overflow-hidden">
          {bootLines.length === 0 && (
            <p className="text-[11px] text-ink-400 flex items-center gap-2"><IDatabase size={13} className="text-amber-lc" /> اتصال به StorageAdapter (IndexedDB)…</p>
          )}
          {bootLines.map((l, i) => (
            <p key={i} className="text-[10.5px] font-mono text-ink-300 flex items-center gap-2 py-[2.5px] anim-boot" dir="ltr">
              <ICheck size={10} className="text-sage shrink-0" />
              <span className="truncate">{l.text}</span>
            </p>
          ))}
          {!booted && <p className="text-[10.5px] font-mono text-amber-lc anim-blink py-[2.5px]" dir="ltr">▍ writing…</p>}
        </div>
        <div className="mt-3 h-1 rounded-full bg-ink-800 overflow-hidden">
          <div className="h-full bg-amber-lc rounded-full transition-all duration-200" style={{ width: `${Math.min(100, (bootLines.length / 27) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
