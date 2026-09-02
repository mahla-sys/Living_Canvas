import { describe, it, expect, beforeEach } from "vitest";
import { storage, setStorage, MemoryStorageAdapter } from "../core";
import { flushPending } from "../engine";
import { ROOT } from "../../state";
import { useStore } from "../../store";

/* ============================================================
   The two write paths that used to stop at the store.
   Both are the same class of failure and both are invisible until reload: `state.json` carries no
   nodes on purpose (Law 1), so anything a user did that never reached a file is simply gone —
   a deleted node came back, and a dragged node went home.
   ============================================================ */

const nodeFile = (id: string) => `${ROOT}/nodes/${id}.md`;
const edgeFile = (id: string) => `${ROOT}/edges/${id}.yaml`;

/** `deleteNode` and `writeNodeArtifact` are awaited inside `void`-called promises; with the memory
 *  adapter every one of them resolves on a microtask, so this drains them without a timer. */
async function settled() {
  await flushPending();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await flushPending();
}

async function addNote(x = 40, y = 40) {
  return useStore.getState().actions.addNode("note", { x, y });
}

describe("store write paths — the files are the canvas", () => {
  let mem: MemoryStorageAdapter;

  beforeEach(() => {
    mem = new MemoryStorageAdapter();
    setStorage(mem);
    useStore.setState({ nodes: [], edges: [], toasts: [], execution: { ...useStore.getState().execution, status: "idle", current_node_id: null } });
  });

  it("Delete on a selected node deletes its file, not only the store entry", async () => {
    const id = await addNote();
    await settled();
    expect(await storage.exists(nodeFile(id))).toBe(true); // the file is the node

    useStore.getState().actions.onNodesChange([{ id, type: "remove" }]);
    await settled();

    expect(useStore.getState().nodes.map((n) => n.id)).not.toContain(id);
    expect(await storage.exists(nodeFile(id))).toBe(false); // ← this line used to fail
  });

  it("a keyboard delete cascades edges the same way the inspector button does", async () => {
    const a = await addNote(0, 0);
    const b = await addNote(300, 0);
    useStore.getState().actions.onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    await settled();
    const edge = useStore.getState().edges[0];
    expect(edge).toBeTruthy();
    expect(await storage.exists(edgeFile(edge.id))).toBe(true);

    useStore.getState().actions.onNodesChange([{ id: a, type: "remove" }]);
    await settled();

    expect(useStore.getState().edges).toHaveLength(0);
    expect(await storage.exists(edgeFile(edge.id))).toBe(false);
    expect(await storage.exists(nodeFile(b))).toBe(true); // the survivor keeps its file
    expect(await storage.exists(nodeFile(a))).toBe(false);
  });

  it("a node locked by a run survives both the store change and the files", async () => {
    const id = await addNote();
    await settled();
    useStore.setState((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, lock: { status: "locked", locked_by: "run-7", locked_at: "2026-09-02T10:00:00.000Z" } } } : n
      ),
    }));

    useStore.getState().actions.onNodesChange([{ id, type: "remove" }]);
    await settled();

    expect(useStore.getState().nodes.map((n) => n.id)).toContain(id);
    expect(await storage.exists(nodeFile(id))).toBe(true);
    expect(useStore.getState().toasts.some((t) => /not allowed/i.test(t.text))).toBe(true);
  });

  it("drag end writes the new position into the node file (state.json is not storage)", async () => {
    const id = await addNote(40, 40);
    await settled();

    useStore.getState().actions.onNodesChange([
      { id, type: "position", position: { x: 546, y: 312 }, dragging: false },
    ]);
    await settled();

    const body = await storage.readFile(nodeFile(id));
    expect(body).toContain("x: 546");
    expect(body).toContain("y: 312");
  });

  it("a drag while dragging is still true does not touch the disk", async () => {
    const id = await addNote(40, 40);
    await settled();
    const before = await storage.readFile(nodeFile(id));

    useStore.getState().actions.onNodesChange([
      { id, type: "position", position: { x: 900, y: 900 }, dragging: true },
    ]);
    await settled();

    expect(await storage.readFile(nodeFile(id))).toBe(before);
  });
});
