// @vitest-environment jsdom
/* ============================================================
   ADR-043 — a failed save is a state the reader sees.

   The old `.catch(() => undefined)` swallowed the error, so a revoked folder permission or a full
   disk left the status bar on "Saving…" forever, with no word that the files on disk were stale.
   The chain must land on `failed` and say so.
   ============================================================ */
import { describe, it, expect, beforeEach } from "vitest";
import { setStorage, MemoryStorageAdapter } from "../core";
import { touch, type EngineApi } from "../engine";
import { CANVAS_ID, emptyExecution, makeMemDoc, type AppState, type RFNode } from "../../state";

class FailingAdapter extends MemoryStorageAdapter {
  constructor(private reason: string) { super(); }
  override async writeFile(_path: string, _content: string): Promise<void> {
    throw new Error(this.reason);
  }
}

function makeApi(): EngineApi {
  let s: AppState = {
    booted: true, bootLines: [], canvasId: CANVAS_ID,
    canvas: {
      title: "save", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
      layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true },
    },
    nodes: [] as RFNode[], edges: [],
    memory: {
      global: makeMemDoc("memory/global.md", "G", "", 0, "system"),
      decisions: makeMemDoc("memory/decisions.md", "D", "", 0, "system"),
      progress: makeMemDoc("memory/progress.md", "P", "", 0, "system"),
      user: makeMemDoc("memory/user.md", "U", "", 0, "user"),
      agents: {},
    },
    outputs: {}, chats: {}, logs: {}, runs: [], snapshots: [], templates: [], strokes: [],
    execution: emptyExecution(), events: [], toasts: [],
    settings: { provider: "sim", apiKey: "", model: "deepseek-chat", owner: "mahla", simDelay: 1, backendUrl: "", workspaceRoot: null, theme: "botanical", snapToGrid: false },
    saveState: "saved", typing: {},
    ui: { leftTab: "palette", inspectorTab: "config", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false, focusMode: false, chordDepth: 0 },
  };
  return { get: () => s, set: (p: Partial<AppState> | ((st: AppState) => Partial<AppState>)) => { s = { ...s, ...(typeof p === "function" ? p(s) : p) }; } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("a write that does not land is visible (ADR-043)", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("lands on failed and says so, instead of sitting on Saving…", async () => {
    setStorage(new FailingAdapter("disk full (simulated)"));
    const api = makeApi();
    touch(api);
    expect(api.get().saveState).toBe("saving"); // the optimistic moment
    await sleep(900); // the debounce fires
    expect(api.get().saveState).toBe("failed");
    expect(api.get().toasts.some((t) => t.kind === "error" && /failed/i.test(t.text))).toBe(true);
  });

  it("recovers to saved once the storage stops failing", async () => {
    // a failing adapter whose first batch of writes (state.json + overview + canvas.yaml) fails,
    // and whose next batch lands — the status must walk failed → saved across them
    let calls = 0;
    const healing = new (class extends MemoryStorageAdapter {
      override async writeFile(path: string, content: string): Promise<void> {
        calls += 1;
        if (calls <= 3) throw new Error("transient (simulated)");
        return super.writeFile(path, content);
      }
    })();
    setStorage(healing);
    const api = makeApi();
    touch(api);
    await sleep(900);
    expect(api.get().saveState).toBe("failed");
    touch(api);
    await sleep(900);
    expect(api.get().saveState).toBe("saved");
  });
});
