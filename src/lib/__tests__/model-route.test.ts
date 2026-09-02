import { describe, it, expect } from "vitest";
import {
  resolveModelRoute, DEEPSEEK_BASE, OLLAMA_BASE, DEFAULT_MODEL,
} from "../core";
import { MODELS } from "../../state";

/* ============================================================
   `agent.model` selects the model that runs (ADR-008).

   This file exists because the field used to be a label: the inspector showed it, `nodes/<id>.md` stored it,
   and all three `askModel` call sites sent `settings.model` instead. The routing rules below are the whole
   contract, and the last one is the part that keeps the dropdown honest — a model the app cannot reach must
   not be offered, because a 400 that degrades to the simulator reads to the user as "the model ignored me".

   The network itself is not tested here (there is no key in CI and there should not be); what is tested is
   the decision that happens before the request leaves the browser.
   ============================================================ */

describe("resolveModelRoute — the provider comes from the model name, not from a second setting", () => {
  it("a bare name goes to DeepSeek, which is the shipped provider", () => {
    const r = resolveModelRoute("deepseek-chat", "deepseek-chat");
    expect(r).toEqual({ endpoint: `${DEEPSEEK_BASE}/chat/completions`, model: "deepseek-chat", provider: "deepseek" });
  });

  it("an `ollama:` prefix goes to the local OpenAI-compatible endpoint, with the prefix stripped", () => {
    const r = resolveModelRoute("ollama:qwen2.5", "deepseek-chat");
    expect(r.endpoint).toBe(`${OLLAMA_BASE}/v1/chat/completions`);
    expect(r.model).toBe("qwen2.5"); // the prefix is ours; the provider must not see it
    expect(r.provider).toBe("ollama");
  });

  it("the node's own model wins over the global setting — that is the whole point of ADR-008", () => {
    expect(resolveModelRoute("ollama:llama3.2", "deepseek-chat").provider).toBe("ollama");
    expect(resolveModelRoute("deepseek-chat", "ollama:llama3.2").provider).toBe("deepseek");
  });

  it("an empty model falls back to the global setting, so an old node file keeps working", () => {
    for (const empty of ["", "   ", null, undefined]) {
      const r = resolveModelRoute(empty, "ollama:qwen2.5");
      expect(r.provider).toBe("ollama");
      expect(r.model).toBe("qwen2.5");
    }
  });

  it("with no model anywhere it still produces a callable route rather than an empty request", () => {
    const r = resolveModelRoute("", "");
    expect(r.model).toBe(DEFAULT_MODEL);
    expect(r.provider).toBe("deepseek");
  });

  it("`ollama:` with nothing after it does not send an empty model name", () => {
    const r = resolveModelRoute("ollama:", "deepseek-chat");
    expect(r.provider).toBe("ollama");
    expect(r.model.length).toBeGreaterThan(0);
  });

  it("is pure: the same input gives the same route, and no route is shared between calls", () => {
    const a = resolveModelRoute("deepseek-chat", "deepseek-chat");
    const b = resolveModelRoute("deepseek-chat", "deepseek-chat");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it("trims whitespace, because a hand-edited node file will have some", () => {
    expect(resolveModelRoute("  deepseek-chat  ", "x").model).toBe("deepseek-chat");
  });
});

describe("every model the UI offers is one the app can actually call", () => {
  it("each entry of MODELS routes somewhere real", () => {
    for (const m of MODELS) {
      const r = resolveModelRoute(m, DEFAULT_MODEL);
      expect(r.endpoint).toMatch(/^https?:\/\/.+\/chat\/completions$/);
      expect(r.model.length).toBeGreaterThan(0);
    }
  });

  it("the shipped list is exactly the providers that exist — a removed model stays removed", () => {
    /* `glm-4-flash` was in this list while the only endpoint was DeepSeek, so choosing it produced a 400
       and a silent fall back to the simulator. It comes back with a Zhipu route, not with a placeholder. */
    expect(MODELS).toEqual([DEFAULT_MODEL, "ollama:qwen2.5"]);
  });
});

/* ---------------- the end-to-end half: the model reaches the request ---------------- */

import { setStorage, MemoryStorageAdapter } from "../core";
import { sendChat } from "../engine";
import { emptyExecution, makeNodeData, makeAgentConfig, CANVAS_ID } from "../../state";
import type { AppState, RFNode } from "../../state";
import { beforeEach, afterEach } from "vitest";

describe("the model a node names is the model that is called (the control is not decorative)", () => {
  const REAL_FETCH = globalThis.fetch;
  let calls: { url: string; body: Record<string, unknown> }[] = [];

  beforeEach(() => {
    setStorage(new MemoryStorageAdapter());
    calls = [];
    globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = REAL_FETCH;
  });

  const apiWith = (model: string, maxTokens: number) => {
    const node: RFNode = {
      id: "n1", type: "lc", position: { x: 0, y: 0 },
      data: {
        ...makeNodeData("agent", "Risk analyst", "mahla"),
        agent: makeAgentConfig("n1", "risk-analyst", { model, max_tokens: maxTokens, tools: ["chat_with_user"] }),
      },
    } as RFNode;
    let s: AppState = {
      booted: true, bootLines: [], canvasId: CANVAS_ID,
      canvas: {
        title: "t", owner: "mahla", canvas_type: "agent-pipeline", tags: [], default_model: "deepseek-chat",
        template_id: "—", template_version: "—", created_at: "", updated_at: "",
        layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true },
      },
      nodes: [node], edges: [],
      memory: {
        global: { path: "memory/global.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
        decisions: { path: "memory/decisions.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
        progress: { path: "memory/progress.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "system" },
        user: { path: "memory/user.md", title: "", body: "", updated_at: "", last_accessed: "", confidence: 0, source: "user" },
        agents: {},
      },
      outputs: {}, chats: {}, logs: {}, runs: [], snapshots: [], templates: [], strokes: [],
      execution: emptyExecution(), events: [], toasts: [],
      settings: { provider: "deepseek", apiKey: "test-key", model: "deepseek-chat", owner: "mahla", simDelay: 1, backendUrl: "", workspaceRoot: null, theme: "botanical", snapToGrid: false },
      saveState: "saved", typing: {},
      ui: { leftTab: "palette", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false, focusMode: false, chordDepth: 0 },
    };
    return {
      get: () => s,
      set: (p: Partial<AppState> | ((st: AppState) => Partial<AppState>)) => {
        s = { ...s, ...(typeof p === "function" ? p(s) : p) };
      },
    };
  };

  it("an ollama model on the node calls the ollama endpoint, not DeepSeek", async () => {
    await sendChat(apiWith("ollama:qwen2.5", 1234), "n1", "what is the risk?");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${OLLAMA_BASE}/v1/chat/completions`);
    expect(calls[0].body.model).toBe("qwen2.5");
  });

  it("the node's own max_tokens is sent — it used to be pinned at 900 in askModel", async () => {
    await sendChat(apiWith("deepseek-chat", 4000), "n1", "hi");
    expect(calls[0].body.max_tokens).toBe(4000);
  });

  it("an empty model on the node falls back to the global setting", async () => {
    await sendChat(apiWith("", 900), "n1", "hi");
    expect(calls[0].body.model).toBe("deepseek-chat");
    expect(calls[0].url).toBe(`${DEEPSEEK_BASE}/chat/completions`);
  });
});
