import { useEffect } from "react";
import { useStore } from "./store";
import CanvasArea from "./components/CanvasArea";
import { LeftPanel, RightPanel, FileViewer } from "./components/SidePanels";
import { TopBar, ActivityConsole, ChatPanel, HistoryModal, SettingsModal, PortModal, Toasts, BootOverlay, StatusBar } from "./components/Overlays";

export default function App() {
  const init = useStore((s) => s.actions.init);
  const theme = useStore((s) => s.settings.theme);

  useEffect(() => {
    void init();
  }, [init]);

  /* the attribute also gets set in main.tsx before the first paint; this keeps it honest when the
     Settings modal changes it, so there is exactly one place that owns `data-theme` per moment in time */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    // a save is debounced 700ms (§11.3 of the architecture doc) and a layout drag 500ms; Export flushes, and
    // so does a hidden tab, or the last edit dies with the tab — a real loss here, because the files are the
    // product. `pagehide` rather than `beforeunload`: it also fires when the page enters the back/forward
    // cache, where `beforeunload` does not, and it does not opt the tab out of bfcache.
    const flush = () => {
      if (document.visibilityState === "hidden") void useStore.getState().actions.flushSave();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    /* The two multi-key sequences (docs/patterns/layout-system.md). Both delegate to the store, which owns
       the state machines — so a half-pressed chord survives a re-render, and the sequences stay testable as
       pure functions in core.ts. Only keys that can matter are fed, so typing on the canvas is untouched. */
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const a = useStore.getState().actions;
      const k = e.key.toLowerCase();

      if (k === "escape") {
        // one Escape still belongs to in-place node editing and the modals; `escapeKey` decides what is left
        if (!typing) a.escapeKey();
        return;
      }
      if (k === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); // Ctrl+K is "search" in most browsers; on the canvas it starts this chord
        if (!typing) a.chordKey("k");
        return;
      }
      // a bare Z only counts while the chord is half-pressed — Ctrl+Z must stay the browser's undo
      if (k === "z" && !e.ctrlKey && !e.metaKey && useStore.getState().ui.chordDepth === 1) {
        e.preventDefault();
        if (!typing) a.chordKey("z");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="h-full w-full max-h-full max-w-full flex flex-col bg-ink-950 text-ink-100 overflow-hidden select-none min-h-0 min-w-0" style={{ fontFamily: "var(--font-body)", maxHeight: "100dvh" }}>
      <TopBar />
      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
        {/* LTR order: library on the left, canvas in the middle, inspector on the right */}
        <LeftPanel />
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <CanvasArea />
          </div>
          <ActivityConsole />
        </main>
        <RightPanel />
      </div>

      <StatusBar />

      <ChatPanel />
      <FileViewer />
      <HistoryModal />
      <SettingsModal />
      <PortModal />
      <Toasts />
      <BootOverlay />
    </div>
  );
}
