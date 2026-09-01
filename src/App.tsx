import { useEffect } from "react";
import { useStore } from "./store";
import CanvasArea from "./components/CanvasArea";
import { LeftPanel, RightPanel, FileViewer } from "./components/SidePanels";
import { TopBar, ActivityConsole, ChatPanel, HistoryModal, SettingsModal, PortModal, Toasts, BootOverlay } from "./components/Overlays";

export default function App() {
  const init = useStore((s) => s.actions.init);

  useEffect(() => {
    void init();
  }, [init]);

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
