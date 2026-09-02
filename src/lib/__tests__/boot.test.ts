/* ============================================================
   What boot actually costs.

   "The first load is slow" is not actionable until it is measured, so this file measures it: how many
   storage operations `initWorkspace` performs, how much wall-clock time it takes, and how much of that
   is the cold path (seeding a brand-new canvas) versus the warm path (reading an existing one back).

   The counts are the useful half. Wall-clock time here is CPU-only — `MemoryStorageAdapter` is a Map
   with no latency — so the milliseconds below understate a real browser, where every one of those
   operations is an async IndexedDB round-trip. That is exactly why the file asserts on *counts*:
   they are the part that transfers, and a budget on them stops boot from quietly growing reads.
   ============================================================ */
import { describe, it, expect, beforeEach } from "vitest";
import { setStorage, MemoryStorageAdapter } from "../core";
import { initWorkspace, hydrate } from "../engine";
import { emptyExecution, CANVAS_ID } from "../../state";
import type { AppState } from "../../state";


/** Counts every storage operation, because the operation count is the cost that survives a browser. */
class CountingAdapter extends MemoryStorageAdapter {
  counts = { read: 0, write: 0, list: 0, exists: 0, other: 0 };
  override async readFile(p: string) { this.counts.read++; return super.readFile(p); }
  override async writeFile(p: string, c: string) { this.counts.write++; return super.writeFile(p, c); }
  override async listDirectory(d: string) { this.counts.list++; return super.listDirectory(d); }
  override async exists(p: string) { this.counts.exists++; return super.exists(p); }
  override async readJson<T>(p: string) { this.counts.read++; return super.readJson<T>(p); }
  override async writeJson<T>(p: string, d: T) { this.counts.write++; return super.writeJson<T>(p, d); }
  get total() { const c = this.counts; return c.read + c.write + c.list + c.exists + c.other; }
}

function makeApi(initial?: Partial<AppState>) {
  let s: AppState = {
    booted: false,
    bootLines: [],
    canvasId: CANVAS_ID,
    canvas: {
      title: "default title", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
      layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true },
    },
    nodes: [], edges: [],
    memory: {
      global: { path: "memory/global.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
      decisions: { path: "memory/decisions.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
      progress: { path: "memory/progress.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
      user: { path: "memory/user.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "user" },
      agents: {},
    },
    outputs: {}, chats: {}, logs: {}, runs: [], snapshots: [], templates: [], strokes: [],
    execution: emptyExecution(), events: [], toasts: [],
    // `backendUrl` stays empty: a non-empty one makes boot probe an HTTP endpoint with a 2.5 s timeout,
    // which is the single most expensive thing boot can do and is off by default
    settings: { provider: "sim", apiKey: "", model: "deepseek-chat", owner: "mahla", simDelay: 1, backendUrl: "", workspaceRoot: null, theme: "plum", snapToGrid: false },
    saveState: "saved", typing: {},
    ui: { leftTab: "palette", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false, focusMode: false, chordDepth: 0 },
    ...initial,
  };
  return {
    get: () => s,
    set: (p: Partial<AppState> | ((st: AppState) => Partial<AppState>)) => {
      s = { ...s, ...(typeof p === "function" ? p(s) : p) };
    },
    peek: () => s,
  };
}

const ms = async (f: () => Promise<unknown>) => {
  const t0 = performance.now();
  await f();
  return performance.now() - t0;
};

describe("boot — measured, not guessed", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("cold boot: seeds a new canvas, and the seeding is the expensive half", async () => {
    const store = new CountingAdapter();
    setStorage(store);
    const api = makeApi();

    const elapsed = await ms(() => initWorkspace(api));

    expect(api.peek().booted).toBe(true);
    expect(api.peek().nodes.length).toBeGreaterThan(0);
    // seeding is mostly *writes*: it is the reason a first visit costs more than a second one
    expect(store.counts.write).toBeGreaterThan(store.counts.read);
    console.log(`boot cold: ${elapsed.toFixed(1)} ms, ${store.total} storage ops ` +
      `(${store.counts.write} write, ${store.counts.read} read, ${store.counts.list} list, ${store.counts.exists} exists)`);
  });

  it("warm boot: reading an existing canvas back costs far less than creating it", async () => {
    // first visit creates the workspace
    const store = new CountingAdapter();
    setStorage(store);
    await initWorkspace(makeApi());
    const coldOps = store.total;

    // second visit, same files: the hydrate path, not the seed path
    const warm = new CountingAdapter();
    for (const p of await store.allPaths()) warm.writeFile(p, await store.readFile(p));
    warm.counts = { read: 0, write: 0, list: 0, exists: 0, other: 0 };
    setStorage(warm);
    const api = makeApi();

    const elapsed = await ms(() => initWorkspace(api));

    expect(api.peek().booted).toBe(true);
    expect(api.peek().nodes.length).toBeGreaterThan(0);
    expect(warm.counts.write).toBe(0); // hydrate only reads; nothing is rewritten on the way in
    expect(warm.total).toBeLessThan(coldOps);
    console.log(`boot warm: ${elapsed.toFixed(1)} ms, ${warm.total} storage ops ` +
      `(${warm.counts.read} read, ${warm.counts.list} list, ${warm.counts.exists} exists) vs ${coldOps} cold`);
  });

  it("keeps the warm path inside an operation budget", async () => {
    const seed = new CountingAdapter();
    setStorage(seed);
    await initWorkspace(makeApi());

    const warm = new CountingAdapter();
    for (const p of await seed.allPaths()) warm.writeFile(p, await seed.readFile(p));
    warm.counts = { read: 0, write: 0, list: 0, exists: 0, other: 0 };
    setStorage(warm);

    await hydrate(makeApi());

    /* The budget is the regression guard: in a browser every one of these is an IndexedDB round-trip,
       so boot time grows with the count, not with the size of the files. `hydrate` reads the canvas in
       one directory walk plus the three side-lists it needs (strokes, templates, run ids), and that is
       the whole shape — anything past this number means boot grew a new pass over storage. */
    expect(warm.total).toBeLessThanOrEqual(40);
    expect(warm.counts.list).toBeLessThanOrEqual(6);
  });

  it("does not touch the network when no backend is configured", async () => {
    let fetches = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => { fetches++; throw new Error("boot must not reach the network"); }) as unknown as typeof fetch;
    try {
      const store = new CountingAdapter();
      setStorage(store);
      const api = makeApi();
      await initWorkspace(api);
      expect(fetches).toBe(0);
      expect(api.peek().booted).toBe(true);
    } finally {
      globalThis.fetch = real;
    }
  });
});
