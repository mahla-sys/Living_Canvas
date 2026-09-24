// @vitest-environment jsdom
/* ============================================================
   ADR-040 gate — every built-in template must run green on the internal simulator.

   Why this exists: the pipeline library (ADR-038/039) shipped roles whose simulator content
   did not exist, so the flagship Freelance pipeline failed its own schema validation on the
   very first node — in the app's default mode, with no provider key. A template that cannot
   run without a key is a template that cannot be tried, so the template list and the
   simulator must stay coupled by a test, not by a promise.

   The shape is what a first-time user does: load the template from the library, then Run.
   ============================================================ */
import { describe, it, expect, beforeEach } from "vitest";
import { setStorage, MemoryStorageAdapter, storage } from "../core";
import { runPipeline, loadTemplate, type EngineApi } from "../engine";
import {
  CANVAS_ID, ROOT, emptyExecution, makeMemDoc, BUILTIN_TEMPLATES, ROLES, ROLE_SCHEMAS, schemaPathFor, makeRoleSchema,
  type AppState,
} from "../../state";

function makeApi(): EngineApi {
  let s: AppState = {
    booted: true, bootLines: [], canvasId: CANVAS_ID,
    canvas: {
      title: "template gate", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
      default_model: "deepseek-chat", template_id: "—", template_version: "—",
      created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
      layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true },
    },
    nodes: [], edges: [],
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

/** The canvas a fresh boot would contain: the five template packages and every role schema. */
function freshLibrary(): MemoryStorageAdapter {
  const files: Record<string, string> = {};
  for (const t of BUILTIN_TEMPLATES) files[`${ROOT}/library/templates/${t.template_id}/template.json`] = JSON.stringify(t, null, 2);
  for (const r of ROLES) {
    files[`${ROOT}/${schemaPathFor(r.id)}`] = JSON.stringify(ROLE_SCHEMAS[r.id] ?? makeRoleSchema(r.id, r.name, r.required_fields), null, 2);
  }
  return new MemoryStorageAdapter(files);
}

describe("every built-in template runs green on the simulator (ADR-040)", () => {
  beforeEach(() => setStorage(freshLibrary()));

  it.each(BUILTIN_TEMPLATES.map((t) => [t.template_id, t.name] as const))(
    "%s — load from the library, run, every node completes",
    async (templateId) => {
      const api = makeApi();
      await loadTemplate(api, templateId);
      expect(api.get().nodes.length).toBeGreaterThan(0);
      await runPipeline(api);
      const s = api.get();
      for (const n of s.nodes) {
        if (!n.data.agent) continue; // the output box has no agent status
        expect(n.data.agent.status, `${n.id} (${n.data.agent.role_id}) ended ${n.data.agent.status}: ${s.execution.errors[n.id] ?? ""}`).toBe("done");
      }
      expect(s.execution.status).toBe("completed");
      expect(Object.keys(s.execution.errors).length).toBe(0);
      // the outputs are files, not just state
      const outputs = (await storage.allPaths()).filter((p) => p.startsWith(`${ROOT}/outputs/`));
      expect(outputs.length).toBeGreaterThan(0);
    },
  );
});
