// @vitest-environment jsdom
/* ============================================================
   ADR-042 — a rollback that does not reach the files is a rollback that evaporates.

   `hydrate` rebuilds the canvas from `nodes/*.md` and `edges/*.yaml`. A restore that only
   touched in-memory state left the old files on disk, so the very next reload resurrected the
   pre-rollback graph. The restore must rewrite the node/edge files — and delete the ones the
   restored graph no longer owns — while memory, outputs, chats and logs (the record of what
   happened) survive.
   ============================================================ */
import { describe, it, expect, beforeEach } from "vitest";
import { setStorage, storage, MemoryStorageAdapter } from "../core";
import { takeSnapshot, restoreSnapshot, createNode, createEdge, writeNodeArtifact, type EngineApi } from "../engine";
import {
  CANVAS_ID, emptyExecution, makeNodeData, makeMemDoc,
  type AppState, type RFNode, type RFEdge,
} from "../../state";

const R = `canvases/${CANVAS_ID}`;

function makeApi(nodes: RFNode[], edges: RFEdge[]): EngineApi {
  let s: AppState = {
    booted: true, bootLines: [], canvasId: CANVAS_ID,
    canvas: {
      title: "rollback", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
      layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true },
    },
    nodes, edges,
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
  return {
    get: () => s,
    set: (p: Partial<AppState> | ((st: AppState) => Partial<AppState>)) => { s = { ...s, ...(typeof p === "function" ? p(s) : p) }; },
  };
}

const node = (id: string, title: string): RFNode =>
  ({ id, type: "lc", position: { x: 10, y: 10 }, data: makeNodeData("note", title, "mahla", { content: `body of ${title}` }) }) as RFNode;

describe("a restored snapshot is durable across a reload (ADR-042)", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("rewrites the node/edge files and deletes the ones the rollback no longer owns", async () => {
    const api = makeApi([node("a", "A"), node("b", "B")], []);
    for (const n of api.get().nodes) await writeNodeArtifact(api, n.id, true);
    const id = await createEdge(api, "a", "b");
    if (id) await writeNodeArtifact(api, "a", true);

    await takeSnapshot(api, "before the additions");
    const snapshotId = api.get().snapshots[0].id;
    const contentOfA = await storage.readFile(`${R}/nodes/a.md`);

    // move on: a new node, a second edge, an edit to a's body
    await createNode(api, "note", { x: 50, y: 50 }, { id: "c", title: "C" });
    const id2 = await createEdge(api, "b", "c");
    expect(id2).not.toBeNull();
    api.set((st) => ({
      nodes: st.nodes.map((n) => (n.id === "a" ? { ...n, data: { ...n.data, content: "edited body of A" } } : n)),
    }));
    await writeNodeArtifact(api, "a", true);

    await restoreSnapshot(api, snapshotId);

    const paths = await storage.allPaths();
    expect(paths).toContain(`${R}/nodes/a.md`);
    expect(paths).toContain(`${R}/nodes/b.md`);
    expect(paths).not.toContain(`${R}/nodes/c.md`); // the added node is gone from disk
    expect(paths.filter((p) => p.startsWith(`${R}/edges/`)).length).toBe(1); // the added edge is gone
    expect(await storage.readFile(`${R}/nodes/a.md`)).toBe(contentOfA); // the edit is undone on disk
    expect(api.get().nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps the record: memory, outputs, chats, logs and history survive a rollback", async () => {
    const api = makeApi([node("a", "A")], []);
    await writeNodeArtifact(api, "a", true);
    await storage.writeFile(`${R}/memory/global.md`, "the memory file");
    await storage.writeFile(`${R}/outputs/a/summary.md`, "the output file");
    await storage.writeFile(`${R}/chats/chat-a.md`, "the chat file");
    await storage.writeFile(`${R}/logs/a/2026-09-24.log`, "the log file");

    await takeSnapshot(api, "keep the record");
    await restoreSnapshot(api, api.get().snapshots[0].id);

    const paths = await storage.allPaths();
    expect(paths).toContain(`${R}/memory/global.md`);
    expect(paths).toContain(`${R}/outputs/a/summary.md`);
    expect(paths).toContain(`${R}/chats/chat-a.md`);
    expect(paths).toContain(`${R}/logs/a/2026-09-24.log`);
    expect(paths.some((p) => p.startsWith(`${R}/history/`))).toBe(true);
  });
});
