// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReactFlowProvider } from "@xyflow/react";
import { CanvasInner } from "../../components/CanvasArea";
import { useStore } from "../../store";
import { MemoryStorageAdapter, setStorage } from "../core";
import { emptyExecution, makeNodeData, type RFNode } from "../../state";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function Canvas() {
  return (
    <ReactFlowProvider>
      <div style={{ width: 1200, height: 800 }}>
        <CanvasInner />
      </div>
    </ReactFlowProvider>
  );
}

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;
  (globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly ??= class { m22 = 1; constructor(_?: string) {} };
  setStorage(new MemoryStorageAdapter());
  useStore.setState((state) => ({
    booted: true,
    nodes: [], edges: [], strokes: [],
    execution: emptyExecution(),
    ui: { ...state.ui, chatNodeId: null, settingsOpen: false, focusMode: false, consoleOpen: false },
  }));
});

afterEach(() => cleanup());

describe("human-gate approval banner", () => {
  it("shows the gate's question rather than claiming an output is ready", () => {
    const question = "Review the plan before downstream work starts?";
    const gate: RFNode = {
      id: "review", type: "lc", position: { x: 100, y: 100 },
      data: makeNodeData("human-gate", "Review checkpoint", "mahla", { content: question }),
    } as RFNode;
    useStore.setState((state) => ({
      nodes: [gate],
      execution: {
        ...state.execution,
        run_id: "run-human-gate-test",
        queue: [gate.id],
        current_node_id: gate.id,
        status: "waiting_approval",
      },
    }));

    render(<Canvas />);

    expect(screen.getByText(question)).toBeInTheDocument();
    expect(screen.queryByText("The node output is ready; decide to continue the pipeline.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve & continue/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });
});
