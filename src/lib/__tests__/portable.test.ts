import { describe, it, expect } from "vitest";
import {
  buildBundle, parseBundleText, deriveCanvasFromFiles, parseNodeDoc, parseEdgeDoc, parseMemoryDoc,
  BUNDLE_KIND,
} from "../portable";
import { nodeToMarkdown, toYaml, memoryToMd, frontmatter, parseYaml } from "../test-helpers";

/* ==========================================================================
   Export/Import — the bundle must be the §2 files themselves and must reject unsafe paths
   ========================================================================== */

const ROOT = "canvases/nexus-edu-001";

const sampleFiles = (): Record<string, string> => ({
  [`${ROOT}/manifest.json`]: JSON.stringify({ version: "1.0", canvas_id: "nexus-edu-001", structure_version: "1.3" }, null, 2),
  [`${ROOT}/canvas.yaml`]: toYaml({ id: "nexus-edu-001", title: "Smart School", owner: "mahla", tags: ["nexus", "school"] }),
  [`${ROOT}/nodes/node-001.md`]: nodeToMarkdown("node-001", { title: "Understand the problem", nodeType: "agent" }),
  [`${ROOT}/edges/edge-001.yaml`]: toYaml({ id: "edge-001", source: "node-001", target: "node-002", type: "flow" }),
});

describe("buildBundle / parseBundleText", () => {
  it("round-trips cleanly: every file comes back with the same path and content", () => {
    const files = sampleFiles();
    const bundle = buildBundle(files);
    expect(bundle.kind).toBe(BUNDLE_KIND);
    expect(bundle.canvas_id).toBe("nexus-edu-001");
    expect(Object.keys(bundle.files).sort()).toEqual(Object.keys(files).sort());
    const parsed = parseBundleText(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    expect(parsed.files[`${ROOT}/nodes/node-001.md`]).toBe(files[`${ROOT}/nodes/node-001.md`]);
    expect(parsed.title).toBe("Smart School");
    expect(parsed.canvasId).toBe("nexus-edu-001");
    expect(parsed.skipped).toHaveLength(0);
  });

  it("rejects an escaping path (../) instead of importing it", () => {
    const bundle = {
      kind: BUNDLE_KIND, version: 1, canvas_id: "nexus-edu-001",
      files: {
        [`${ROOT}/manifest.json`]: "{}",
        "../../etc/passwd": "root:x:0:0",
        [`${ROOT}/../escape.md`]: "bad",
        "/absolute/path.md": "bad",
      },
    };
    const parsed = parseBundleText(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true); // the healthy files stay
    const keys = Object.keys(parsed.files);
    expect(keys).toEqual([`${ROOT}/manifest.json`]);
    expect(parsed.skipped).toHaveLength(3);
  });

  it("rejects non-string (binary) content", () => {
    const bundle = { kind: BUNDLE_KIND, version: 1, files: { [`${ROOT}/manifest.json`]: "{}", [`${ROOT}/assets/x.png`]: { type: "Buffer" } } };
    const parsed = parseBundleText(JSON.stringify(bundle));
    expect(Object.keys(parsed.files)).toEqual([`${ROOT}/manifest.json`]);
    expect(parsed.skipped[0].reason).toMatch(/not a string|binary/);
  });

  it("rejects invalid JSON and a foreign kind with a readable error", () => {
    expect(parseBundleText("not json").error).toMatch(/JSON/);
    expect(parseBundleText("").error).toMatch(/empty/);
    expect(parseBundleText(JSON.stringify({ kind: "obsidian-vault", files: {} })).error).toMatch(/Living Canvas/);
  });

  it("rejects a bundle newer than the app (protects data from corruption)", () => {
    const r = parseBundleText(JSON.stringify({ kind: BUNDLE_KIND, version: 99, files: { "manifest.json": "{}" } }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/newer/);
  });

  it("warns about a missing manifest but keeps hand-made files", () => {
    const r = parseBundleText(JSON.stringify({ [`${ROOT}/nodes/a.md`]: "---\ntitle: A\n---\n\nbody" }));
    expect(r.ok).toBe(true);
    expect(r.source).toBe("raw-files");
    expect(r.skipped.some((s) => s.path === "manifest.json")).toBe(true);
  });

  it("never imports a file that belongs to another canvas", () => {
    const r = parseBundleText(JSON.stringify({ files: { "canvases/other-canvas/nodes/x.md": "hello" } }));
    expect(r.skipped[0].reason).toMatch(/different canvas/);
  });
});

/* ==========================================================================
   Restoration from the Markdown/YAML files themselves (not state.json)
   ========================================================================== */

describe("deriveCanvasFromFiles", () => {
  it("returns a long (>120 chars) and multiline prompt intact (the 120-char truncation fix)", () => {
    const long = "You are the analysis agent. " + "This long sentence must survive verbatim in the file. ".repeat(6);
    const md = nodeToMarkdown("n9", { nodeType: "agent", title: "Long", agent: { system_prompt: long, max_steps: 12 } });
    const n = parseNodeDoc(`${ROOT}/nodes/n9.md`, md)!;
    expect(n.data.agent?.system_prompt).toBe(long);
    expect(n.data.agent?.max_steps).toBe(12);
    const multiline = "first line\nsecond line: with a colon\n  - a list item";
    const md2 = nodeToMarkdown("n10", { nodeType: "agent", title: "Multiline", agent: { system_prompt: multiline } });
    expect(parseNodeDoc(`${ROOT}/nodes/n10.md`, md2)!.data.agent?.system_prompt).toBe(multiline);
  });

  it("builds nodes, edges and memory from files", () => {
    const files: Record<string, string> = {
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/canvas.yaml`]: toYaml({ id: "nexus-edu-001", title: "Recovered canvas" }),
      [`${ROOT}/nodes/node-001.md`]: nodeToMarkdown("node-001", { title: "Analysis", nodeType: "agent", position: { x: 340, y: 90 } }),
      [`${ROOT}/nodes/node-002.md`]: nodeToMarkdown("node-002", { title: "Box", nodeType: "output-box", position: { x: 700, y: 250 } }),
      [`${ROOT}/edges/edge-001.yaml`]: toYaml({ id: "edge-001", source: "node-001", target: "node-002", type: "flow", label: "output" }),
      [`${ROOT}/memory/agents/node-001.md`]: memoryToMd({ path: "memory/agents/node-001.md", title: "memory", body: "- recovered note", confidence: 0.66 }),
    };
    const d = deriveCanvasFromFiles(files);
    expect(d.nodes.map((n) => n.id)).toEqual(["node-001", "node-002"]);
    expect(d.nodes[0].position).toEqual({ x: 340, y: 90 });
    expect(d.nodes[0].data.title).toBe("Analysis");
    expect(d.edges).toHaveLength(1);
    expect(d.canvasTitle).toBe("Recovered canvas");
    expect(d.memory.agents["node-001"]?.body).toContain("recovered note");
    expect(d.unreadable).toEqual([]);
  });

  it("keeps a manual Obsidian edit (title + body + prompt) after import", () => {
    const md = [
      "---",
      'id: "node-001"',
      'type: "agent"',
      'title: "edited by hand"',
      "position:",
      "  x: 12",
      "  y: 34",
      'color: "#e8b04b"',
      "agent:",
      "  system_prompt: \"a fresh prompt I wrote by hand\"",
      "  max_steps: 9",
      "---",
      "",
      "## edited body",
      "",
      "new text.",
    ].join("\n");
    const n = parseNodeDoc(`${ROOT}/nodes/node-001.md`, md)!;
    expect(n.data.title).toBe("edited by hand");
    expect(n.data.content).toContain("new text.");
    expect(n.data.agent?.system_prompt).toBe("a fresh prompt I wrote by hand");
    expect(n.data.agent?.max_steps).toBe(9);
    expect(n.position).toEqual({ x: 12, y: 34 });
    // a lock never comes from a file (§12.5)
    expect(n.data.lock.status).toBe("free");
  });

  it("drops an edge that points at a missing node (prevents a React Flow crash)", () => {
    const d = deriveCanvasFromFiles({
      [`${ROOT}/nodes/only.md`]: nodeToMarkdown("only", { title: "Alone", nodeType: "note" }),
      [`${ROOT}/edges/ghost.yaml`]: toYaml({ id: "ghost", source: "only", target: "nope", type: "flow" }),
    });
    expect(d.nodes).toHaveLength(1);
    expect(d.edges).toHaveLength(0);
  });

  it("a broken file does not build a node, but the rest survives", () => {
    const d = deriveCanvasFromFiles({
      [`${ROOT}/nodes/good.md`]: nodeToMarkdown("good", { title: "Healthy", nodeType: "note" }),
      [`${ROOT}/nodes/bad.md`]: "",
      [`${ROOT}/edges/bad.yaml`]: ": :: :",
    });
    expect(d.nodes.map((n) => n.id)).toEqual(["good"]);
    expect(d.unreadable.length).toBeGreaterThan(0);
  });

  it("hostile content in a node file stays text and never becomes HTML", () => {
    const evil = frontmatter({ id: "n1", type: "note", title: "<img src=x onerror=alert(1)>" }, "<script>steal()</script>");
    const n = parseNodeDoc(`${ROOT}/nodes/n1.md`, evil)!;
    expect(n.data.title).toBe("<img src=x onerror=alert(1)>");
    expect(n.data.content).toContain("<script>steal()</script>");
    // the render pipeline (mdInline) neutralises it — see storage.test.ts
  });
});

describe("parseNodeDoc / parseEdgeDoc / parseMemoryDoc", () => {
  it("the files-only mode turns an unfinished run status into idle", () => {
    const md = nodeToMarkdown("n1", { nodeType: "agent", title: "t", agent: { status: "running" } });
    const n = parseNodeDoc(`${ROOT}/nodes/n1.md`, md)!;
    expect(n.data.agent?.status).toBe("idle");
  });

  it("accepts done from a file (a real checkpoint)", () => {
    const md = nodeToMarkdown("n1", { nodeType: "agent", title: "t", agent: { status: "done" } });
    expect(parseNodeDoc(`${ROOT}/nodes/n1.md`, md)!.data.agent?.status).toBe("done");
  });

  it("rejects an invalid color and keeps the default", () => {
    const md = ["---", 'id: "n1"', 'type: "note"', 'color: "red; drop table"', "---", "", "x"].join("\n");
    const n = parseNodeDoc(`${ROOT}/nodes/n1.md`, md)!;
    expect(n.data.color).not.toContain("drop");
  });

  it("an edge with an unknown type falls back to flow", () => {
    const e = parseEdgeDoc(`${ROOT}/edges/e1.yaml`, toYaml({ id: "e1", source: "a", target: "b", type: "evil|type" }))!;
    expect(e.data.edgeType).toBe("flow");
  });

  it("clips a confidence outside the range", () => {
    const m = parseMemoryDoc(`${ROOT}/memory/agents/n1.md`, memoryToMd({ path: "p", title: "t", body: "b", confidence: 42 }))!;
    expect(m.confidence).toBe(1);
  });
});

describe("parseYaml (the counterpart reader of toYaml)", () => {
  it("round-trips: whatever toYaml writes, parseYaml reads back", () => {
    const obj = {
      id: "node-001",
      title: "a title with : a colon",
      tags: ["a", "b"],
      position: { x: 1, y: 2, z: 0 },
      agent: { tools: ["read_memory", "write_output"], require_approval: true, max_steps: 5 },
    };
    expect(parseYaml(toYaml(obj))).toEqual(obj);
  });

  it("keeps a string inside a list of objects", () => {
    const y = "outputs:\n  - file: \"summary.md\"\n    type: \"summary\"\n  - file: \"risks.md\"\n    type: \"detailed\"\n";
    expect(parseYaml(y)).toEqual({ outputs: [{ file: "summary.md", type: "summary" }, { file: "risks.md", type: "detailed" }] });
  });

  it("YAML interop: nothing is emitted as a bare flow mapping", () => {
    // `condition: {{ risk_score < 7 }}` used to land unquoted in the file. A real YAML
    // parser (Obsidian tooling, yamllint, CI) reads that as a nested flow mapping and
    // either fails or returns an object — so it must be quoted on the write side.
    const y = toYaml({ trigger: { type: "condition", condition: "{{ risk_score < 7 }}" } });
    expect(y).toContain('condition: "{{ risk_score < 7 }}"');
    const line = y.split("\n").find((l) => l.includes("condition:"))!;
    expect(/^\s*condition: (["']).*\1\s*$/.test(line)).toBe(true);
    expect(parseYaml(y)).toEqual({ trigger: { type: "condition", condition: "{{ risk_score < 7 }}" } });
  });

  it("YAML interop: a string never comes back as another type", () => {
    // "1.0" must not degrade to the number 1 — template.yaml and manifest.json carry versions.
    for (const value of ["1.0", "0", "42", "true", "false", "null", "no", "yes", "on", "- ", "  spaced", "a: b", "# tag", "[x]", "{y}", "a, b"]) {
      const back = parseYaml(toYaml({ v: value })) as { v: unknown };
      expect(back.v, `value ${JSON.stringify(value)}`).toBe(value);
    }
  });
});
