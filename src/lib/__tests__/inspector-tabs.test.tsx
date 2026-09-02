// @vitest-environment jsdom
/* ============================================================
   Inspector tabs (ADR-015).

   The rule under test is not "there are four buttons". It is that every tab shows something with a real file
   behind it, and that an empty one says so instead of implying data. The Diary tab derives its colouring from
   the text of `memory/agents/<id>.md` rather than from a parallel field, because two sources of truth drift
   apart. The Status tab reads the last error out of the log for the same reason — `AgentConfig` has no
   `last_error` field and deliberately does not get one.
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useStore } from "../../store";
import { setStorage, MemoryStorageAdapter } from "../core";
import { RightPanel } from "../../components/SidePanels";
import { makeNodeData, makeAgentConfig } from "../../state";
import type { RFNode } from "../../state";

beforeEach(() => {
  (Element.prototype as unknown as { scrollTo?: unknown }).scrollTo ??= function () {};
  setStorage(new MemoryStorageAdapter());
  useStore.setState((s) => ({
    nodes: [], edges: [], logs: {},
    memory: { ...s.memory, agents: {} },
    outputs: {},
    ui: { ...s.ui, inspectorTab: "config", chatNodeId: null, focusMode: false },
    canvas: { ...s.canvas, layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true } },
  }));
});
afterEach(() => cleanup());

const agent = (over: Partial<ReturnType<typeof makeAgentConfig>> = {}): RFNode =>
  ({
    id: "n1", position: { x: 0, y: 0 }, selected: true,
    data: makeNodeData("agent", "Risk analyst", "mahla", { agent: { ...makeAgentConfig("n1", "risk-analyst"), ...over } }),
  }) as RFNode;

const selectAgent = (node: RFNode) => useStore.setState({ nodes: [node] });

describe("the inspector tab bar", () => {
  it("shows all four tabs for an agent node, and only Config for a non-agent", () => {
    selectAgent(agent());
    render(<RightPanel />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Diary")).toBeInTheDocument();
    expect(screen.getByText("Logs")).toBeInTheDocument();

    cleanup();
    useStore.setState({
      nodes: [{ id: "b1", position: { x: 0, y: 0 }, selected: true, data: makeNodeData("output-box", "Box", "mahla") } as RFNode],
    });
    render(<RightPanel />);
    // an output box has no diary and no run log, so those tabs are not offered
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.queryByText("Diary")).not.toBeInTheDocument();
    expect(screen.queryByText("Logs")).not.toBeInTheDocument();
  });

  it("defaults to Config, and switching tabs swaps the body", () => {
    selectAgent(agent());
    const { container } = render(<RightPanel />);
    // the editing surface is what is on screen first
    expect(screen.getByText("Display & shape")).toBeInTheDocument();
    expect(container.querySelector("[data-lc-status-tab]")).toBeNull();

    fireEvent.click(screen.getByText("Status"));
    // absence needs queryByText: getByText throws when it finds nothing, which would fail for the wrong reason
    expect(screen.queryByText("Display & shape")).not.toBeInTheDocument();
    expect(container.querySelector("[data-lc-status-tab]")).toBeInTheDocument();
  });

  it("the active tab is marked, so the bar is readable by assistive tech too", () => {
    selectAgent(agent());
    render(<RightPanel />);
    fireEvent.click(screen.getByText("Logs"));
    expect(screen.getByText("Logs")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Status")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("the Status tab shows execution state that already exists", () => {
  it("reports the agent status, whether it is in the current run, and the last output", () => {
    selectAgent(agent({ status: "failed" }));
    useStore.setState((s) => ({
      nodes: [agent({ status: "failed" })],
      outputs: { n1: [{ file: "outputs/n1/summary.md", type: "text/markdown", description: "", content: "x" }] },
      execution: { ...s.execution, queue: ["n1", "n2"], current_node_id: "n1" },
    }));
    render(<RightPanel />);
    fireEvent.click(screen.getByText("Status"));

    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("yes — running now")).toBeInTheDocument();
    expect(screen.getByText("summary.md")).toBeInTheDocument();
  });

  it("reads the last error out of the log rather than a field that would drift from it", () => {
    useStore.setState({
      nodes: [agent({ status: "failed" })],
      logs: { n1: ["[10:00:01] starting", "[10:00:02] ✗ the API refused the call", "[10:00:03] retrying"] },
    });
    render(<RightPanel />);
    fireEvent.click(screen.getByText("Status"));

    expect(screen.getByText("Last error, from the log")).toBeInTheDocument();
    expect(screen.getByText(/\[10:00:02\] ✗ the API refused the call/)).toBeInTheDocument();
    // the newest line is not an error, so it must not be shown as one
    expect(screen.queryByText(/\[10:00:03\] retrying/)).not.toBeInTheDocument();
  });

  it("shows no error block at all when the log has none", () => {
    useStore.setState({ nodes: [agent()], logs: { n1: ["[10:00:01] all good"] } });
    render(<RightPanel />);
    fireEvent.click(screen.getByText("Status"));
    expect(screen.queryByText("Last error, from the log")).not.toBeInTheDocument();
  });

  it("shows no CPU or memory figure, because no source for one exists", () => {
    useStore.setState({ nodes: [agent()] });
    const { container } = render(<RightPanel />);
    fireEvent.click(screen.getByText("Status"));
    // an invented number is worse than none (ADR-015)
    expect(container.textContent).not.toMatch(/cpu|memory|heap/i);
  });
});

describe("the Diary tab reads the agent's memory file", () => {
  it("colours events by what the text says, not by a parallel field", () => {
    useStore.setState({
      nodes: [agent()],
      memory: {
        ...useStore.getState().memory,
        agents: {
          n1: {
            path: "memory/agents/n1.md", title: "Risk analyst", updated_at: "", last_accessed: "", confidence: 0.9, source: "agent",
            body: "✗ first attempt failed\n⚠ the source was stale\nfinished the section",
          },
        },
      },
    });
    const { container } = render(<RightPanel />);
    fireEvent.click(screen.getByText("Diary"));

    const lines = container.querySelectorAll("[data-lc-diary-tab] p");
    expect(lines).toHaveLength(3);
    expect(lines[0].className).toContain("text-ember");
    expect(lines[1].className).toContain("text-lc-warn");
    expect(lines[2].className).toContain("text-lc-success");
  });

  it("says nothing has been written, rather than showing an empty box that implies data", () => {
    useStore.setState({ nodes: [agent()] });
    render(<RightPanel />);
    fireEvent.click(screen.getByText("Diary"));
    expect(screen.getByText(/nothing written to this agent's diary yet/i)).toBeInTheDocument();
  });
});

describe("the Logs tab reads logs/<node>/", () => {
  it("prints the log lines with their timestamps", () => {
    useStore.setState({ nodes: [agent()], logs: { n1: ["[10:00:01] starting", "[10:00:09] done"] } });
    const { container } = render(<RightPanel />);
    fireEvent.click(screen.getByText("Logs"));

    const pre = container.querySelector("[data-lc-logs-tab]")!;
    expect(pre.textContent).toContain("[10:00:01] starting");
    expect(pre.textContent).toContain("[10:00:09] done");
  });

  it("says there are no log lines, rather than showing a blank terminal", () => {
    useStore.setState({ nodes: [agent()] });
    render(<RightPanel />);
    fireEvent.click(screen.getByText("Logs"));
    expect(screen.getByText(/no log lines for this node yet/i)).toBeInTheDocument();
  });
});

describe("nothing selected", () => {
  it("asks for a node instead of guessing", () => {
    useStore.setState({ nodes: [] });
    render(<RightPanel />);
    expect(screen.getByText(/select a node to inspect/i)).toBeInTheDocument();
  });
});
