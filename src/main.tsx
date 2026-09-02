import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { DEFAULT_THEME, isThemeId, readSettingsLocal, clearSettingsLocal } from "./lib/core";

/* The theme must be on <html> before the first paint: setting it in a component effect means the canvas
   flashes botanical for a frame under every other theme. An unknown id from an older build falls back to
   the default rather than reaching `data-theme`, where it would silently select nothing.

   This reads through `readSettingsLocal` and not through its own `getItem` (ADR-007): the settings store is
   a named seam, and a seam with a second reader is not a seam. `readSettingsLocal` never throws, so a broken
   blob still costs one default instead of a blank page. */
(() => {
  const stored = readSettingsLocal();
  document.documentElement.dataset.theme = stored && isThemeId(stored.theme) ? stored.theme : DEFAULT_THEME;
})();

/* ---------------- error surface: show the reason instead of a blank page ---------------- */

function renderErrorPanel(title: string, detail: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b1312;color:#dce5e1;font-family:Inter,ui-sans-serif,system-ui,sans-serif;padding:20px;">
      <div style="max-width:520px;width:100%;background:#0f1a19;border:1px solid #e06a4e55;border-radius:16px;padding:28px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <span style="width:34px;height:34px;border-radius:10px;background:#e06a4e1f;border:1px solid #e06a4e55;color:#e06a4e;display:flex;align-items:center;justify-content:center;font-weight:900;">!</span>
          <h1 style="font-size:17px;margin:0;">${title}</h1>
        </div>
        <p style="font-size:12px;color:#8ba39d;line-height:2;margin:0 0 12px;">
          The error below stopped the canvas. Try <b>Reload</b> first; if it repeats and the message mentions
          <span style="color:#e8b04b"> IndexedDB or JSON </span>
          , use Recover — nodes and drawings are cleared and the canvas is rebuilt from files.
        </p>
        <pre style="background:#12201e;border:1px solid #1e3230;border-radius:10px;padding:12px;font-size:10.5px;color:#e8b04b;text-align:left;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto;font-family:'IBM Plex Mono',monospace;">${detail}</pre>
        <div style="display:flex;gap:10px;margin-top:16px;">
          <button id="lc-recover" style="flex:1;padding:10px;border-radius:10px;background:#e8b04b;color:#0b1312;border:none;font-weight:800;font-size:12px;cursor:pointer;font-family:inherit;">Recover &amp; rebuild</button>
          <button id="lc-reload" style="flex:1;padding:10px;border-radius:10px;background:#162624;color:#dce5e1;border:1px solid #2a423f;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;">Just reload</button>
        </div>
      </div>
    </div>`;
  document.getElementById("lc-recover")?.addEventListener("click", () => {
    try {
      indexedDB.deleteDatabase("living-canvas");
    } catch { /* ignore */ }
    clearSettingsLocal();
    setTimeout(() => location.reload(), 250);
  });
  document.getElementById("lc-reload")?.addEventListener("click", () => location.reload());
}

window.addEventListener("error", (e) => {
  // only intervene if nothing actually rendered
  if (document.querySelector("[data-lc-mounted]")) return;
  renderErrorPanel("Canvas failed to start — JavaScript error", String(e.message ?? e.error ?? "unknown"));
});
window.addEventListener("unhandledrejection", (e) => {
  if (document.querySelector("[data-lc-mounted]")) return;
  renderErrorPanel("Canvas failed to start — unhandled rejection", String(e.reason ?? "unknown"));
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
          <div style={{ maxWidth: 520, width: "100%", background: "#0f1a19", border: "1px solid #e06a4e55", borderRadius: 16, padding: 28, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
            <h1 style={{ fontSize: 17, margin: "0 0 12px", color: "#dce5e1" }}>Error while the canvas was running</h1>
            <p style={{ fontSize: 12, color: "#8ba39d", lineHeight: 2 }}>
              If the data stored in IndexedDB is corrupted, recovery will fix it:
            </p>
            <pre style={{ background: "#12201e", border: "1px solid #1e3230", borderRadius: 10, padding: 12, fontSize: 10.5, color: "#e8b04b", whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto" }}>
              {String(this.state.err?.message ?? this.state.err)}
            </pre>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                onClick={() => {
                  try {
                    indexedDB.deleteDatabase("living-canvas");
                    clearSettingsLocal();
                  } catch { /* ignore */ }
                  setTimeout(() => location.reload(), 250);
                }}
                style={{ flex: 1, padding: 10, borderRadius: 10, background: "#e8b04b", color: "#0b1312", border: "none", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
              >
                Recover &amp; rebuild
              </button>
              <button onClick={() => location.reload()} style={{ flex: 1, padding: 10, borderRadius: 10, background: "#162624", color: "#dce5e1", border: "1px solid #2a423f", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Reload the page
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
