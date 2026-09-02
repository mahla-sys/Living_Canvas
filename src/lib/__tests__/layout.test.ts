import { describe, it, expect, beforeEach } from "vitest";
import {
  setStorage, storage, MemoryStorageAdapter, parseYaml, normalizeLayout, nodeToMarkdown,
  createChord, createDoubleTap, PANEL_MIN, PANEL_MAX,
  PANEL_DEFAULT_LEFT, PANEL_DEFAULT_RIGHT,
} from "../core";
import { hydrate, writeCanvasYaml } from "../engine";
import { emptyExecution, CANVAS_ID, DEFAULT_LAYOUT } from "../../state";
import type { AppState } from "../../state";
import { toYaml } from "../test-helpers";
import { makeNodeData } from "../../state";

/* ============================================================
   The layout system (docs/patterns/layout-system.md, ADR-009). Three claims, each with a way to break it:

     1. `layout` is canvas content — it is written to `canvas.yaml` and read back by `hydrate`. Break it by
        putting the widths in `state.json` instead and this file's round-trip test fails.
     2. A hand-edited `canvas.yaml` cannot break the interface. Break it by trusting the parsed number and
        the clamp tests fail.
     3. Focus mode is a moment of work, not data. Break it by writing `focusMode` into a file and the
        "hydrate leaves focus mode off" test fails.

   The keyboard sequences are tested as the pure machines they are, so the shortcuts stay honest without a
   DOM: a chord that only fires on an exact key order, and a double tap that forgets itself after it fires.
   ============================================================ */

const ROOT = `canvases/${CANVAS_ID}`;

function makeApi(initial?: Partial<AppState>) {
  let s: AppState = {
    booted: false,
    bootLines: [],
    canvasId: CANVAS_ID,
    canvas: {
      title: "layout test", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
      layout: { ...DEFAULT_LAYOUT },
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
    settings: { provider: "sim", apiKey: "", model: "deepseek-chat", owner: "mahla", simDelay: 1, backendUrl: "", workspaceRoot: null, theme: "botanical", snapToGrid: false },
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

describe("normalizeLayout — the reader clamps, so a hand-edited file cannot break the UI", () => {
  it("passes a sane layout through untouched", () => {
    expect(normalizeLayout({ leftWidth: 320, rightWidth: 400, leftOpen: false, rightOpen: true }))
      .toEqual({ leftWidth: 320, rightWidth: 400, leftOpen: false, rightOpen: true });
  });

  it("clamps an absurd width instead of pushing the canvas off screen", () => {
    expect(normalizeLayout({ leftWidth: 9000, rightWidth: -50 }).leftWidth).toBe(PANEL_MAX);
    expect(normalizeLayout({ leftWidth: 9000, rightWidth: -50 }).rightWidth).toBe(PANEL_MIN);
  });

  it("treats a non-number as absent, not as zero — the string \"300\" is not a width", () => {
    const l = normalizeLayout({ leftWidth: "300", rightWidth: Number.NaN });
    expect(l.leftWidth).toBe(PANEL_DEFAULT_LEFT);
    expect(l.rightWidth).toBe(PANEL_DEFAULT_RIGHT);
  });

  it("treats a missing key as *open*: an old canvas.yaml must not hide a panel", () => {
    const l = normalizeLayout({});
    expect(l.leftOpen).toBe(true);
    expect(l.rightOpen).toBe(true);
    expect(l).toMatchObject({ leftWidth: PANEL_DEFAULT_LEFT, rightWidth: PANEL_DEFAULT_RIGHT });
  });

  it("survives garbage without throwing", () => {
    for (const junk of [undefined, null, 0, "wide", [], true]) {
      expect(() => normalizeLayout(junk)).not.toThrow();
    }
    expect(normalizeLayout(null)).toMatchObject({ leftOpen: true, rightOpen: true });
  });
});

describe("layout round-trip — canvas.yaml is the only place the widths live (ADR-009)", () => {
  beforeEach(() => setStorage(new MemoryStorageAdapter()));

  it("writeCanvasYaml writes a layout block that parses back to the same numbers", async () => {
    const api = makeApi();
    api.set({ canvas: { ...api.peek().canvas, layout: { leftWidth: 341, rightWidth: 402, leftOpen: false, rightOpen: true } } });
    await writeCanvasYaml(api.peek());

    const text = await storage.readFile(`${ROOT}/canvas.yaml`);
    const y = parseYaml(text)!;
    expect(y.layout).toMatchObject({ leftWidth: 341, rightWidth: 402, leftOpen: false, rightOpen: true });
  });

  it("hydrate reads the widths back from the file, so a reload keeps the layout", async () => {
    const mem = new MemoryStorageAdapter({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/canvas.yaml`]: toYaml({
        id: CANVAS_ID, title: "Wide inspector",
        layout: { leftWidth: 210, rightWidth: 500, leftOpen: true, rightOpen: true },
      }),
      [`${ROOT}/nodes/n1.md`]: nodeToMarkdown("n1", { ...makeNodeData("note", "One", "mahla"), content: "body" }, { x: 1, y: 2 }),
    });
    setStorage(mem);

    const api = makeApi();
    expect(await hydrate(api)).toBe(true);
    expect(api.peek().canvas.layout.leftWidth).toBe(210);
    expect(api.peek().canvas.layout.rightWidth).toBe(500);
  });

  it("a canvas.yaml with no layout key hydrates to the defaults — panels visible, not collapsed", async () => {
    setStorage(new MemoryStorageAdapter({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/canvas.yaml`]: toYaml({ id: CANVAS_ID, title: "Pre-layout canvas" }),
      [`${ROOT}/nodes/n1.md`]: nodeToMarkdown("n1", { ...makeNodeData("note", "One", "mahla"), content: "body" }, { x: 1, y: 2 }),
    }));
    const api = makeApi();
    await hydrate(api);
    expect(api.peek().canvas.layout).toEqual(DEFAULT_LAYOUT);
  });

  it("a hand-edited canvas.yaml with leftWidth: 9000 comes back clamped, not broken", async () => {
    setStorage(new MemoryStorageAdapter({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/canvas.yaml`]: `${"layout:\n  leftWidth: 9000\n  rightWidth: 3\n  leftOpen: false\n"}id: ${CANVAS_ID}\ntitle: Hand edited\n`,
      [`${ROOT}/nodes/n1.md`]: nodeToMarkdown("n1", { ...makeNodeData("note", "One", "mahla"), content: "body" }, { x: 1, y: 2 }),
    }));
    const api = makeApi();
    await hydrate(api);
    expect(api.peek().canvas.layout.leftWidth).toBe(PANEL_MAX);
    expect(api.peek().canvas.layout.rightWidth).toBe(PANEL_MIN);
    expect(api.peek().canvas.layout.leftOpen).toBe(false);
  });

  it("hydrate leaves focus mode off — it is a moment of work, never data (ADR-009)", async () => {
    setStorage(new MemoryStorageAdapter({
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/canvas.yaml`]: toYaml({ id: CANVAS_ID, title: "T", layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true } }),
      [`${ROOT}/nodes/n1.md`]: nodeToMarkdown("n1", { ...makeNodeData("note", "One", "mahla"), content: "body" }, { x: 1, y: 2 }),
    }));
    const api = makeApi({ ui: { ...makeApi().peek().ui, focusMode: true, chordDepth: 1 } });
    await hydrate(api);
    expect(api.peek().ui.focusMode).toBe(true); // hydrate does not touch the session
    // ...and nothing in the tree can set it, because it is never written:
    const paths = await storage.allPaths();
    expect(paths.filter((p) => /focus/i.test(p))).toEqual([]);
    const yaml = await storage.readFile(`${ROOT}/canvas.yaml`);
    expect(yaml).not.toMatch(/focus/i);
  });
});

describe("createChord — Ctrl+K Z, one completion per sequence", () => {
  it("fires exactly once, on the key that completes it", () => {
    const c = createChord(["k", "z"]);
    expect(c.push("k", 0)).toBe(false);
    expect(c.depth).toBe(1);
    expect(c.push("z", 100)).toBe(true);
    expect(c.depth).toBe(0);
  });

  it("a wrong key restarts rather than merely failing, so k, x, k, z still fires", () => {
    const c = createChord(["k", "z"]);
    c.push("k", 0);
    expect(c.push("x", 50)).toBe(false);
    expect(c.depth).toBe(0);
    expect(c.push("k", 100)).toBe(false);
    expect(c.push("z", 150)).toBe(true);
  });

  it("an unrelated key between the two does not silently complete a stale sequence", () => {
    const c = createChord(["k", "z"]);
    c.push("k", 0);
    expect(c.push("q", 10)).toBe(false);
    expect(c.push("z", 20)).toBe(false); // z without k first is not the chord
  });

  it("expires: a k now and a z a minute later are two keystrokes, not a shortcut", () => {
    const c = createChord(["k", "z"], 1500);
    c.push("k", 0);
    expect(c.push("z", 60_000)).toBe(false);
    expect(c.depth).toBe(0);
  });

  it("is case-insensitive, so Caps Lock does not disable the shortcut", () => {
    const c = createChord(["k", "z"]);
    c.push("K", 0);
    expect(c.push("Z", 50)).toBe(true);
  });
});

describe("createDoubleTap — Escape twice, and only twice", () => {
  it("the second press inside the window reports true", () => {
    const d = createDoubleTap(400);
    expect(d.push(0)).toBe(false);
    expect(d.push(200)).toBe(true);
  });

  it("forgets itself after firing, so a third press starts a new pair", () => {
    const d = createDoubleTap(400);
    d.push(0);
    expect(d.push(100)).toBe(true);
    expect(d.push(150)).toBe(false); // not a triple-tap
    expect(d.push(200)).toBe(true);
  });

  it("a single Escape stays a single Escape", () => {
    const d = createDoubleTap(400);
    expect(d.push(0)).toBe(false);
    expect(d.push(5000)).toBe(false);
  });
});
