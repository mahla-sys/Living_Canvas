import { useEffect } from "react";
import { useStore } from "./store";
import CanvasArea from "./components/CanvasArea";
import { LeftPanel, RightPanel, FileViewer } from "./components/SidePanels";
import { TopBar, ActivityConsole, ChatPanel, HistoryModal, SettingsModal, PortModal, Toasts, BootOverlay } from "./components/Overlays";

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
    // a save is debounced 700ms (§11.3 of the architecture doc); Export flushes, and so does a hidden tab,
    // or the last edit dies with the tab — which is a real loss here, because the files are the product
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

  return (
    <div className="h-full flex flex-col bg-ink-950 text-ink-100 overflow-hidden" style={{ fontFamily: "var(--font-body)" }}>
      <TopBar />
      <div className="flex-1 flex min-h-0">
        {/* LTR order: library on the left, canvas in the middle, inspector on the right */}
        <LeftPanel />
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <CanvasArea />
          </div>
          <ActivityConsole />
        </main>
        <RightPanel />
      </div>

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
