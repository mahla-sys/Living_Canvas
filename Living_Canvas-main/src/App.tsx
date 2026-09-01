import { useEffect } from "react";
import { useStore } from "./store";
import CanvasArea from "./components/CanvasArea";
import { LeftPanel, RightPanel, FileViewer } from "./components/SidePanels";
import { TopBar, ActivityConsole, ChatPanel, HistoryModal, SettingsModal, Toasts, BootOverlay } from "./components/Overlays";

export default function App() {
  const init = useStore((s) => s.actions.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="h-full flex flex-col bg-ink-950 text-ink-100 overflow-hidden" style={{ fontFamily: "var(--font-body)" }}>
      <TopBar />
      <div className="flex-1 flex min-h-0">
        {/* در RTL اولین فرزند سمت راست قرار می‌گیرد: اینسپکتور راست، کتابخانه چپ */}
        <RightPanel />
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <CanvasArea />
          </div>
          <ActivityConsole />
        </main>
        <LeftPanel />
      </div>

      <ChatPanel />
      <FileViewer />
      <HistoryModal />
      <SettingsModal />
      <Toasts />
      <BootOverlay />
    </div>
  );
}
