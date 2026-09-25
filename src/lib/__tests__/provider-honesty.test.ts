// @vitest-environment jsdom
/* ============================================================
   ADR-041 — the model's words are the output, and ADR-045 — a request has an off-switch
   and a ceiling.

   The bug these hold shut: `{ summary: text, ...simFields(...) }` — the spread came last, so the
   simulated summary silently overwrote the model's answer. A provider run whose model simply
   answered in prose must store the model's prose, labelled as nothing but the model's, and a
   request must abort when the run stops and fail when the provider hangs.
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setStorage, storage, MemoryStorageAdapter, resolveModelRoute } from "../core";
import { runPipeline, askModel, extractFieldsFromReply, type EngineApi } from "../engine";
import {
  CANVAS_ID, emptyExecution, makeAgentConfig, makeNodeData, makeMemDoc, ROLE_SCHEMAS, schemaPathFor,
  type AppState, type RFNode,
} from "../../state";

const ROOT_PATH = `canvases/${CANVAS_ID}`;

function makeApi(roleId: string): EngineApi {
  let s: AppState = {
    booted: true, bootLines: [], canvasId: CANVAS_ID,
    canvas: {
      title: "honesty", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
      layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true },
    },
    nodes: [{
      id: "n1", type: "lc", position: { x: 10, y: 10 },
      data: makeNodeData("agent", "Solo agent", "mahla", { agent: makeAgentConfig("n1", roleId) }),
    }] as RFNode[],
    edges: [],
    memory: {
      global: makeMemDoc("memory/global.md", "G", "", 0, "system"),
      decisions: makeMemDoc("memory/decisions.md", "D", "", 0, "system"),
      progress: makeMemDoc("memory/progress.md", "P", "", 0, "system"),
      user: makeMemDoc("memory/user.md", "U", "", 0, "user"),
      agents: {},
    },
    outputs: {}, chats: {}, logs: {}, runs: [], snapshots: [], templates: [], strokes: [],
    execution: emptyExecution(), events: [], toasts: [],
    settings: { provider: "deepseek", apiKey: "test-key", model: "deepseek-chat", owner: "mahla", simDelay: 1, backendUrl: "", workspaceRoot: null, theme: "botanical", snapToGrid: false },
    saveState: "saved", typing: {},
    ui: { leftTab: "palette", inspectorTab: "config", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false, focusMode: false, chordDepth: 0 },
  };
  return {
    get: () => s,
    set: (p: Partial<AppState> | ((st: AppState) => Partial<AppState>)) => { s = { ...s, ...(typeof p === "function" ? p(s) : p) }; },
  };
}

describe("the real provider never mixes simulator content into the model's answer (ADR-041)", () => {
  const realFetch = globalThis.fetch;
  let reply: string;

  beforeEach(() => {
    reply = "";
    const files: Record<string, string> = {};
    for (const [role, schema] of Object.entries(ROLE_SCHEMAS)) files[`${ROOT_PATH}/${schemaPathFor(role)}`] = JSON.stringify(schema);
    setStorage(new MemoryStorageAdapter(files));
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: reply } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as unknown as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("a prose answer becomes the summary — the model's own words, verbatim, on disk", async () => {
    // manager needs only `summary` (minLength 20), so the prose is the entire output
    reply = "The manager restructured the pipeline and documented every change it made to the canvas.";
    const api = makeApi("manager");
    await runPipeline(api);
    expect(api.get().execution.status).toBe("completed");
    const summary = await storage.readFile(`${ROOT_PATH}/outputs/n1/summary.md`);
    expect(summary).toContain(reply);
    // and no simulated word may have dressed as the model's
    expect(summary).not.toContain("internal simulator");
  });

  it("a JSON reply is parsed into the fields it was asked for", async () => {
    const body = {
      summary: "The scout found three projects worth a bid, all within the target budget range for the week.",
      client_brief: "Client background, budget of 4000 dollars and a two-week timeline, recorded on the canvas.",
      project_requirements: "Core tech stack is React and Node, with a dashboard and weekly progress reports.",
    };
    reply = `Here is the output:\n${JSON.stringify(body)}`;
    const api = makeApi("project-scout");
    await runPipeline(api);
    expect(api.get().execution.status).toBe("completed");
    const brief = await storage.readFile(`${ROOT_PATH}/outputs/n1/client_brief.md`);
    expect(brief).toContain(body.client_brief);
    const reqs = await storage.readFile(`${ROOT_PATH}/outputs/n1/project_requirements.md`);
    expect(reqs).toContain(body.project_requirements);
  });

  it("a prose answer fills the fields the model did not say — labelled as simulation", async () => {
    // project-scout needs three fields; the model only spoke a summary
    reply = "The scout found three promising freelance projects worth a bid this week, within budget.";
    const api = makeApi("project-scout");
    await runPipeline(api);
    expect(api.get().execution.status).toBe("completed");
    const summary = await storage.readFile(`${ROOT_PATH}/outputs/n1/summary.md`);
    expect(summary).toContain(reply);
    expect(summary).not.toContain("internal simulator"); // the model's field is the model's
    const brief = await storage.readFile(`${ROOT_PATH}/outputs/n1/client_brief.md`);
    expect(brief).toContain("internal simulator"); // the placeholder says what it is
  });
});

describe("extractFieldsFromReply", () => {
  it("accepts a bare object, an embedded object, and rejects prose", () => {
    const bare = { summary: "s", risks: "r" };
    expect(extractFieldsFromReply(JSON.stringify(bare))).toEqual(bare);
    expect(extractFieldsFromReply(`Sure, here you go: ${JSON.stringify(bare)} — done.`)).toEqual(bare);
    expect(extractFieldsFromReply("just a paragraph of prose with no braces")).toBeNull();
    expect(extractFieldsFromReply("")).toBeNull();
    expect(extractFieldsFromReply("[1, 2, 3]")).toBeNull(); // an array is not a field object
  });
});

describe("a model request has an off-switch and a ceiling (ADR-045)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it("a run that stopped between requests means no further request leaves the machine", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const ctl = new AbortController();
    ctl.abort();
    await expect(askModel(resolveModelRoute("deepseek-chat"), "k", [{ role: "user", content: "hi" }], {
      signal: ctl.signal,
      shouldContinue: () => !ctl.signal.aborted,
    })).resolves.toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a hung provider times out with a named error, it does not hold the queue", async () => {
    // like the real fetch, the request dies when the signal aborts — it does not ignore it
    globalThis.fetch = vi.fn((_url: unknown, init: { signal?: AbortSignal }) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    })) as unknown as typeof fetch;
    await expect(
      askModel(resolveModelRoute("deepseek-chat"), "k", [{ role: "user", content: "hi" }], { timeoutMs: 60 }),
    ).rejects.toThrow(/timed out after 60 ms/);
  });

  it("a stop mid-request aborts the in-flight fetch and surfaces as a clean cancellation", async () => {
    // the request never settles on its own; only the abort can end it
    globalThis.fetch = vi.fn((_url: unknown, init: { signal?: AbortSignal }) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    })) as unknown as typeof fetch;
    const ctl = new AbortController();
    const p = askModel(resolveModelRoute("deepseek-chat"), "k", [{ role: "user", content: "hi" }], { signal: ctl.signal, shouldContinue: () => !ctl.signal.aborted });
    await new Promise((r) => setTimeout(r, 20));
    ctl.abort();
    await expect(p).rejects.toThrow(/aborted with the run/);
  });
});
