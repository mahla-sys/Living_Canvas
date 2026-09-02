// @vitest-environment jsdom
/* ============================================================
   Left-panel search and status glyphs (ADR-016).

   Two decisions are under test. The filter is local state, not `ui` state and not a file: a filter that
   survived a reload would reopen a half-hidden tree and read as a bug. And the status glyph is *derived*
   from execution and agent state that already exists — `NodeData` gains no `status` field, because a stored
   copy could drift from the thing it was derived from and then the panel would be lying.

   A folder whose rows all filtered out must disappear, otherwise a search leaves a tree of empty drawers.
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useStore } from "../../store";
import { setStorage, MemoryStorageAdapter } from "../core";
import { LeftPanel } from "../../components/SidePanels";
import { makeNodeData, makeAgentConfig } from "../../state";
import type { RFNode } from "../../state";

beforeEach(() => {
  (Element.prototype as unknown as { scrollTo?: unknown }).scrollTo ??= function () {};
  setStorage(new MemoryStorageAdapter());
  useStore.setState((s) => ({
    nodes: [], edges: [], logs: {}, outputs: {}, runs: [], snapshots: [], strokes: [],
    memory: { ...s.memory, agents: {} },
    execution: { ...s.execution, status: "idle", queue: [], completed: [], current_node_id: null },
    ui: { ...s.ui, leftTab: "files", focusMode: false },
    canvas: { ...s.canvas, layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true } },
  }));
});
afterEach(() => cleanup());

const agent = (id: string, status: "idle" | "running" | "done" | "failed" | "waiting" = "idle"): RFNode =>
  ({
    id, position: { x: 0, y: 0 }, selected: false,
    data: makeNodeData("agent", `Agent ${id}`, "mahla", { agent: { ...makeAgentConfig(id, "risk-analyst"), status } }),
  }) as RFNode;

const openFilesTab = () => {
  const { container } = render(<LeftPanel />);
  fireEvent.click(screen.getByRole("button", { name: /files/i }));
  return container;
};

const rows = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>("[data-lc-file]"));
const names = (container: HTMLElement) => rows(container).map((r) => r.dataset.lcFileName ?? "");

/* A folder only renders its rows while open, so a test that asserts on a row inside `logs/` has to open it
   first — otherwise it asserts on rows that were never rendered and fails for a reason that is not the code. */
const openFolder = (container: HTMLElement, name: string) =>
  fireEvent.click(within(container).getByText(`${name}/`));

describe("the filter box", () => {
  it("is on the Files tab and starts empty", () => {
    const container = openFilesTab();
    const box = container.querySelector<HTMLInputElement>("[data-lc-file-filter]")!;
    expect(box).toBeInTheDocument();
    expect(box.value).toBe("");
    expect(box).toHaveAttribute("aria-label", "Filter files");
  });

  it("keeps only files whose displayed name matches, case-insensitively", () => {
    useStore.setState({ nodes: [agent("alpha"), agent("beta")] });
    const container = openFilesTab();
    const before = names(container);
    expect(before).toContain("alpha.md");
    expect(before).toContain("beta.md");

    fireEvent.change(container.querySelector("[data-lc-file-filter]")!, { target: { value: "ALPHA" } });
    const after = names(container);
    expect(after).toContain("alpha.md");
    expect(after).not.toContain("beta.md");
  });

  it("clearing the filter brings the whole tree back", () => {
    useStore.setState({ nodes: [agent("alpha"), agent("beta")] });
    const container = openFilesTab();
    const box = container.querySelector("[data-lc-file-filter]")!;

    fireEvent.change(box, { target: { value: "alpha" } });
    expect(names(container)).not.toContain("beta.md");

    fireEvent.click(screen.getByLabelText("Clear the filter"));
    expect(names(container)).toContain("beta.md");
    expect((container.querySelector("[data-lc-file-filter]") as HTMLInputElement).value).toBe("");
  });

  it("a folder with nothing matching inside disappears, instead of becoming an empty drawer", () => {
    useStore.setState({ nodes: [agent("alpha")], logs: { zz9: ["[10:00:00] hi"] } });
    const container = openFilesTab();
    openFolder(container, "logs");
    expect(names(container)).toContain("zz9/…log");

    fireEvent.change(container.querySelector("[data-lc-file-filter]")!, { target: { value: "alpha" } });
    expect(names(container)).toContain("alpha.md");
    expect(names(container)).not.toContain("zz9/…log");
    // and the drawer itself is gone, not merely empty
    expect(within(container).queryByText("logs/")).not.toBeInTheDocument();
  });

  it("the filter is local state: nothing about it reaches the store", () => {
    const container = openFilesTab();
    const uiBefore = useStore.getState().ui;
    fireEvent.change(container.querySelector("[data-lc-file-filter]")!, { target: { value: "canvas" } });
    expect(useStore.getState().ui).toEqual(uiBefore);
    expect(JSON.stringify(useStore.getState().ui)).not.toMatch(/canvas"?$/i);
  });

  it("no match shows an empty list rather than the whole tree", () => {
    useStore.setState({ nodes: [agent("alpha")] });
    const container = openFilesTab();
    fireEvent.change(container.querySelector("[data-lc-file-filter]")!, { target: { value: "qqqq" } });
    expect(rows(container)).toHaveLength(0);
  });
});

describe("the status glyph is derived, never stored", () => {
  it("marks the node that is running right now", () => {
    useStore.setState((s) => ({
      nodes: [agent("n1"), agent("n2")],
      execution: { ...s.execution, status: "running", queue: ["n1", "n2"], current_node_id: "n1" },
    }));
    const container = openFilesTab();
    const row = rows(container).find((r) => r.dataset.lcFileName === "n1.md")!;
    expect(row.querySelector('[aria-label="running"]')).toBeTruthy();
    const other = rows(container).find((r) => r.dataset.lcFileName === "n2.md")!;
    expect(other.querySelector('[aria-label="running"]')).toBeNull();
  });

  it("marks a queued node as paused while the run is paused", () => {
    useStore.setState((s) => ({
      nodes: [agent("n1"), agent("n2")],
      execution: { ...s.execution, status: "paused", queue: ["n1", "n2"], completed: ["n1"], current_node_id: null },
    }));
    const container = openFilesTab();
    const queued = rows(container).find((r) => r.dataset.lcFileName === "n2.md")!;
    expect(queued.querySelector('[aria-label="paused"]')).toBeTruthy();
    // n1 already finished, so it is not "paused"
    const done = rows(container).find((r) => r.dataset.lcFileName === "n1.md")!;
    expect(done.querySelector('[aria-label="paused"]')).toBeNull();
  });

  it("marks a failed agent, and marks a finished one as done", () => {
    useStore.setState({ nodes: [agent("bad", "failed"), agent("good", "done")] });
    const container = openFilesTab();
    expect(rows(container).find((r) => r.dataset.lcFileName === "bad.md")!.querySelector('[aria-label="failed"]')).toBeTruthy();
    expect(rows(container).find((r) => r.dataset.lcFileName === "good.md")!.querySelector('[aria-label="done"]')).toBeTruthy();
  });

  it("shows nothing for an idle node — a gate-blocked node never ran, so a failure glyph would be a lie", () => {
    useStore.setState({ nodes: [agent("idle1")] });
    const container = openFilesTab();
    const row = rows(container).find((r) => r.dataset.lcFileName === "idle1.md")!;
    expect(row.querySelector("[aria-label]")).toBeNull();
  });

  it("the same status shows on the node's output and log files, because they are the same node", () => {
    useStore.setState((s) => ({
      nodes: [agent("n1", "failed")],
      logs: { n1: ["[10:00:00] boom"] },
      outputs: { n1: [{ file: "summary.md", type: "text/markdown", description: "", content: "x" }] },
      execution: { ...s.execution, status: "idle", queue: [], completed: [], current_node_id: null },
    }));
    const container = openFilesTab();
    openFolder(container, "logs");
    for (const label of ["n1.md", "n1/…log"]) {
      const row = rows(container).find((r) => r.dataset.lcFileName === label);
      expect(row, `expected a row for ${label}`).toBeTruthy();
      expect(row!.querySelector('[aria-label="failed"]'), `expected a failed glyph on ${label}`).toBeTruthy();
    }
  });

  it("shows nothing for a node that has no agent at all, such as a note", () => {
    /* This is the case a mutation exposed: deriving "failed" from the absence of an agent config would put a
       failure glyph on every note and output box in the tree. Not having run is not having failed. */
    useStore.setState({
      nodes: [{ id: "note1", position: { x: 0, y: 0 }, selected: false, data: makeNodeData("note", "A note", "mahla") } as RFNode],
    });
    const container = openFilesTab();
    const row = rows(container).find((r) => r.dataset.lcFileName === "note1.md")!;
    expect(row).toBeTruthy();
    expect(row.querySelector("[aria-label]")).toBeNull();
  });

  it("no status field was added to node data to make this work", () => {
    useStore.setState({ nodes: [agent("n1", "failed")] });
    openFilesTab();
    const data = useStore.getState().nodes[0].data as Record<string, unknown>;
    expect("status" in data).toBe(false);
    expect("fileStatus" in data).toBe(false);
  });
});
