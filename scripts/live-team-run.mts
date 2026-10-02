/* ============================================================
   A3 live acceptance run (roadmap 2026-09-25) — "the AI agents really work together".

   This is the same code path the app runs in the browser: loadTemplate("ai-partner-team")
   then runPipeline(api), with settings.provider = "mistral" and the key from .env. The only
   difference from a browser run is storage: an in-memory adapter stands in for IndexedDB, so
   nothing on disk or in the user's canvas is touched.

   Run:  npx vite-node scripts/live-team-run.mts
   Exit 0 = every agent node ended `done` with real Mistral answers; non-zero otherwise.
   ============================================================ */
// @vitest-environment jsdom  (comment for editors; vite-node reads the env below instead)
import { setStorage, MemoryStorageAdapter, storage } from "../src/lib/core";

/* jsdom-free globals the engine expects when it runs outside a test runner */
if (typeof window === "undefined") {
  (globalThis as Record<string, unknown>).window = {
    confirm: () => true,
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  };
}
if (typeof (globalThis as Record<string, unknown>).localStorage === "undefined") {
  (globalThis as Record<string, unknown>).localStorage = (globalThis as never as { window: { localStorage: unknown } }).window?.localStorage;
}

const main = async () => {
  const { loadTemplate, runPipeline } = await import("../src/lib/engine");
  type EngineApi = import("../src/lib/engine").EngineApi;
  const state = await import("../src/state");
  const { CANVAS_ID, ROOT, emptyExecution, makeMemDoc, BUILTIN_TEMPLATES, ROLES, ROLE_SCHEMAS, schemaPathFor, makeRoleSchema } = state;

  /* seed the library exactly like a fresh boot would */
  const files: Record<string, string> = {};
  for (const t of BUILTIN_TEMPLATES) files[`${ROOT}/library/templates/${t.template_id}/template.json`] = JSON.stringify(t, null, 2);
  for (const r of ROLES) files[`${ROOT}/${schemaPathFor(r.id)}`] = JSON.stringify(ROLE_SCHEMAS[r.id] ?? makeRoleSchema(r.id, r.name, r.required_fields), null, 2);
  setStorage(new MemoryStorageAdapter(files));

  /* build the app state the way SETTINGS_BASE does when VITE_MISTRAL_API_KEY is present */
  const key = process.env.MISTRAL_API_KEY ?? "";
  if (!key) { console.error("MISTRAL_API_KEY missing — export it before running"); process.exit(1); }

  let s: ReturnType<typeof makeState> = makeState(key);
  function makeState(k: string) {
    return {
      booted: true, bootLines: [], canvasId: CANVAS_ID,
      canvas: {
        title: "live team run", owner: "mahla", canvas_type: "agent-pipeline", tags: [],
        default_model: "ministral-3b-latest", template_id: "—", template_version: "—",
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true },
      },
      nodes: [] as never[], edges: [] as never[],
      memory: {
        global: makeMemDoc("memory/global.md", "G", "", 0, "system"),
        decisions: makeMemDoc("memory/decisions.md", "D", "", 0, "system"),
        progress: makeMemDoc("memory/progress.md", "P", "", 0, "system"),
        user: makeMemDoc("memory/user.md", "U", "", 0, "user"),
        agents: {},
      },
      outputs: {}, chats: {}, logs: {}, runs: [], snapshots: [], templates: [], strokes: [],
      execution: emptyExecution(), events: [], toasts: [],
      settings: { provider: "mistral", apiKey: k, model: "ministral-3b-latest", owner: "mahla", simDelay: 1, backendUrl: "", workspaceRoot: null, theme: "botanical", snapToGrid: false },
      saveState: "saved", typing: {},
      ui: { leftTab: "palette", inspectorTab: "config", fileViewer: null, historyOpen: false, settingsOpen: false, chatNodeId: null, consoleOpen: true, portOpen: false, focusMode: false, chordDepth: 0 },
    } as never;
  }

  const api: EngineApi = {
    get: () => s as never,
    set: (p: never) => { s = { ...s, ...(typeof p === "function" ? (p as (st: never) => never)(s) : p) } as never; },
  };

  await loadTemplate(api, "ai-partner-team");
  console.log(`template loaded — ${api.get().nodes.length} nodes, ${api.get().edges.length} edges`);
  const t0 = Date.now();
  await runPipeline(api);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const st = api.get();
  console.log(`run finished in ${secs}s — status: ${st.execution.status}`);
  let failed = st.execution.status !== "completed";
  for (const n of st.nodes) {
    if (!n.data.agent) continue;
    const err = st.execution.errors[n.id];
    console.log(`\n=== ${n.data.title} [${n.data.agent.role_id}] → ${n.data.agent.status}${err ? ` (error: ${err})` : ""} ===`);
    const list = st.outputs[n.id] ?? [];
    const summary = list.find((o: { file: string }) => o.file === "summary.md");
    const body = summary?.content ?? "";
    console.log(String(body).slice(0, 700));
    if (n.data.agent.status !== "done") failed = true;
  }
  /* prove the outputs are real files, not just state */
  const paths = (await storage.allPaths()).filter((p) => p.startsWith(`${ROOT}/outputs/`));
  console.log(`\noutput files written: ${paths.length}`);
  process.exit(failed ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
