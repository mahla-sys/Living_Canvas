import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

/* ---------------- error surface: به‌جای صفحه‌ی سبزِ خالی، دلیل را نشان بده ---------------- */

function renderErrorPanel(title: string, detail: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b1312;color:#dce5e1;font-family:Vazirmatn,Tahoma,sans-serif;padding:20px;">
      <div style="max-width:520px;width:100%;background:#0f1a19;border:1px solid #e06a4e55;border-radius:16px;padding:28px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <span style="width:34px;height:34px;border-radius:10px;background:#e06a4e1f;border:1px solid #e06a4e55;color:#e06a4e;display:flex;align-items:center;justify-content:center;font-weight:900;">!</span>
          <h1 style="font-size:17px;margin:0;">${title}</h1>
        </div>
        <p style="font-size:12px;color:#8ba39d;line-height:2;margin:0 0 12px;">
          خطای زیر رخ داده است. اگر فکر می‌کنی داده‌ی ذخیره‌شده خراب شده، دکمه‌ی بازیابی را بزن
          (نودها و نقاشی‌ها پاک و بوم از نو ساخته می‌شود):
        </p>
        <pre style="background:#12201e;border:1px solid #1e3230;border-radius:10px;padding:12px;font-size:10.5px;color:#e8b04b;direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto;font-family:'IBM Plex Mono',monospace;">${detail}</pre>
        <div style="display:flex;gap:10px;margin-top:16px;">
          <button id="lc-recover" style="flex:1;padding:10px;border-radius:10px;background:#e8b04b;color:#0b1312;border:none;font-weight:800;font-size:12px;cursor:pointer;font-family:inherit;">بازیابی و شروع دوباره</button>
          <button id="lc-reload" style="flex:1;padding:10px;border-radius:10px;background:#162624;color:#dce5e1;border:1px solid #2a423f;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;">فقط صفحه را تازه کن</button>
        </div>
      </div>
    </div>`;
  document.getElementById("lc-recover")?.addEventListener("click", () => {
    try {
      indexedDB.deleteDatabase("living-canvas");
      localStorage.removeItem("lc-settings");
    } catch { /* ignore */ }
    setTimeout(() => location.reload(), 250);
  });
  document.getElementById("lc-reload")?.addEventListener("click", () => location.reload());
}

window.addEventListener("error", (e) => {
  // فقط اگر واقعاً چیزی رندر نشده باشد دخالت کن
  if (document.querySelector("[data-lc-mounted]")) return;
  renderErrorPanel("بوم بالا نیامد — خطای جاوااسکریپت", String(e.message ?? e.error ?? "نامشخص"));
});
window.addEventListener("unhandledrejection", (e) => {
  if (document.querySelector("[data-lc-mounted]")) return;
  renderErrorPanel("بوم بالا نیامد — خطای ناهمگام", String(e.reason ?? "نامشخص"));
});

/* ---------------- React error boundary ---------------- */

class Boundary extends React.Component<{ children?: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1312", padding: 20 }}>
          <div style={{ maxWidth: 520, width: "100%", background: "#0f1a19", border: "1px solid #e06a4e55", borderRadius: 16, padding: 28, fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>
            <h1 style={{ fontSize: 17, margin: "0 0 12px", color: "#dce5e1" }}>خطا در میانه‌ی اجرای بوم</h1>
            <p style={{ fontSize: 12, color: "#8ba39d", lineHeight: 2 }}>
              اگر داده‌ی ذخیره‌شده در IndexedDB خراب شده باشد، بازیابی مشکل را حل می‌کند:
            </p>
            <pre style={{ background: "#12201e", border: "1px solid #1e3230", borderRadius: 10, padding: 12, fontSize: 10.5, color: "#e8b04b", direction: "ltr", textAlign: "left", whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto" }}>
              {String(this.state.err?.message ?? this.state.err)}
            </pre>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                onClick={() => {
                  try {
                    indexedDB.deleteDatabase("living-canvas");
                    localStorage.removeItem("lc-settings");
                  } catch { /* ignore */ }
                  setTimeout(() => location.reload(), 250);
                }}
                style={{ flex: 1, padding: 10, borderRadius: 10, background: "#e8b04b", color: "#0b1312", border: "none", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
              >
                بازیابی و شروع دوباره
              </button>
              <button onClick={() => location.reload()} style={{ flex: 1, padding: 10, borderRadius: 10, background: "#162624", color: "#dce5e1", border: "1px solid #2a423f", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                تازه‌کردن صفحه
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Boundary>
    <div data-lc-mounted>
      <App />
    </div>
  </Boundary>
);
