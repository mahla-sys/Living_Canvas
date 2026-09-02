// @vitest-environment jsdom
/* ============================================================
   Freehand drawing on the canvas.

   The reader's report was "nothing gets drawn at all". The stroke *was* being created and written to
   `strokes/<id>.json` — it was being painted in the wrong coordinate space. Children of `<ReactFlow>` are
   rendered as siblings of GraphView, i.e. outside `.react-flow__viewport`, so they live in screen
   coordinates, while a stroke's points are flow coordinates because flow coordinates are what is written to
   disk. The two agree only at viewport {0, 0, 1}, and the canvas runs fitView() 80ms after boot.

   These tests assert the whole chain: pointer events → a stroke in state → a file on disk → a path painted
   in flow space under the viewport transform.
   ============================================================ */
import { useEffect } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReactFlowProvider, useStoreApi as useFlowStoreApi } from "@xyflow/react";
import { useStore } from "../../store";
import { setStorage, storage, MemoryStorageAdapter } from "../core";
import { CanvasInner } from "../../components/CanvasArea";
import { CANVAS_ID } from "../../state";

const ROOT = `canvases/${CANVAS_ID}`;

class ResizeObserverStub {
  observe() {} unobserve() {} disconnect() {}
}

/**
 * Sets a non-identity viewport from inside the provider. The bug only shows up once the viewport is not
 * {0, 0, 1}, and in production it never is — the canvas runs fitView() 80ms after boot.
 */
function ViewportProbe({ x, y, zoom }: { x: number; y: number; zoom: number }) {
  /* Written straight into React Flow's own store rather than through setViewport: d3-zoom never initialises
     in jsdom because the container has no measured size, so setViewport silently does nothing. The store is
     the single source the layer reads from, which is what is being asserted. */
  const rfStore = useFlowStoreApi();
  useEffect(() => {
    const t = setTimeout(() => rfStore.setState({ transform: [x, y, zoom] }), 150);
    return () => clearTimeout(t);
  }, [x, y, zoom, rfStore]);
  return null;
}

/* `CanvasArea` wraps itself in a ReactFlowProvider, so mounting it here would give the test a *different*
   store from the one the strokes layer reads. `CanvasInner` is the same component without that wrapper, so
   the probe and the layer under test share one store. */
function Canvas() {
  return (
    <ReactFlowProvider>
      <ViewportProbe x={140} y={90} zoom={2} />
      <div style={{ width: 1200, height: 800 }}>
        <CanvasInner />
      </div>
    </ReactFlowProvider>
  );
}

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;
  (globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly ??= class {
    m22 = 1; constructor(_?: string) {}
  };
  (Element.prototype as unknown as { scrollTo?: unknown }).scrollTo ??= function () {};
  /* Pointer capture is real browser API that jsdom does not implement. It is not part of the code under
     test — the canvas legitimately captures the pointer so a drag that leaves the element keeps drawing —
     but without it `onDrawDown` throws before it starts the stroke. */
  (Element.prototype as unknown as { setPointerCapture?: unknown }).setPointerCapture ??= function () {};
  (Element.prototype as unknown as { releasePointerCapture?: unknown }).releasePointerCapture ??= function () {};
  setStorage(new MemoryStorageAdapter());
  useStore.setState((s) => ({
    booted: true, bootLines: [], nodes: [], edges: [], strokes: [],
    ui: { ...s.ui, chatNodeId: null, settingsOpen: false, focusMode: false, consoleOpen: false },
  }));
});
afterEach(() => cleanup());

const enterDrawMode = () => fireEvent.click(screen.getByRole("button", { name: /draw on the canvas/i }));

describe("drawing on the canvas", () => {
  it("enters draw mode and offers the tools", () => {
    render(<Canvas />);
    enterDrawMode();
    expect(screen.getByText(/drawing mode/i)).toBeInTheDocument();
  });

  it("a left-button drag creates a stroke in state with the points it passed through", async () => {
    render(<Canvas />);
    enterDrawMode();
    const surface = document.querySelector(".react-flow") as HTMLElement;
    expect(surface).toBeTruthy();

    fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(surface, { button: 0, clientX: 260, clientY: 240, pointerId: 1 });
    fireEvent.pointerMove(surface, { button: 0, clientX: 320, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(surface, { button: 0, clientX: 320, clientY: 250, pointerId: 1 });

    await waitFor(() => expect(useStore.getState().strokes).toHaveLength(1));
    const stroke = useStore.getState().strokes[0];
    expect(stroke.points.length).toBeGreaterThanOrEqual(2);
    expect(stroke.tool).toBe("pen");
    expect(stroke.canvas_id).toBe(CANVAS_ID);
    expect(stroke.author).toBe(useStore.getState().canvas.owner);
  });

  it("the stroke is written to strokes/ — the file is the record, not the pixels (Law 1)", async () => {
    render(<Canvas />);
    enterDrawMode();
    const surface = document.querySelector(".react-flow") as HTMLElement;

    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(surface, { button: 0, clientX: 180, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(surface, { button: 0, clientX: 180, clientY: 160, pointerId: 1 });

    await waitFor(() => expect(useStore.getState().strokes).toHaveLength(1));
    const id = useStore.getState().strokes[0].id;
    const onDisk = JSON.parse(await storage.readFile(`${ROOT}/strokes/${id}.json`));
    expect(onDisk.points).toEqual(useStore.getState().strokes[0].points);
  });

  it("a plain click with no movement is not a stroke", async () => {
    render(<Canvas />);
    enterDrawMode();
    const surface = document.querySelector(".react-flow") as HTMLElement;

    fireEvent.pointerDown(surface, { button: 0, clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(surface, { button: 0, clientX: 300, clientY: 300, pointerId: 1 });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(useStore.getState().strokes).toHaveLength(0);
  });

  it("the right button pans instead of drawing", async () => {
    render(<Canvas />);
    enterDrawMode();
    const surface = document.querySelector(".react-flow") as HTMLElement;

    fireEvent.pointerDown(surface, { button: 2, clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(surface, { button: 2, clientX: 200, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(surface, { button: 2, clientX: 200, clientY: 200, pointerId: 2 });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(useStore.getState().strokes).toHaveLength(0);
  });

  it("strokes are painted under the viewport transform, in flow coordinates", async () => {
    render(<Canvas />);
    enterDrawMode();
    const surface = document.querySelector(".react-flow") as HTMLElement;

    fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(surface, { button: 0, clientX: 300, clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(surface, { button: 0, clientX: 300, clientY: 260, pointerId: 1 });

    await waitFor(() => expect(useStore.getState().strokes).toHaveLength(1));
    // let the probe's viewport land (see ViewportProbe) before asserting what the layer must reflect
    await act(async () => { await new Promise((r) => setTimeout(r, 220)); });
    const layer = document.querySelector("[data-lc-strokes]") as SVGSVGElement;
    expect(layer).toBeTruthy();

    /* The probe set the viewport to {x:140, y:90, zoom:2}. The layer must carry it, otherwise the stroke is
       painted in screen space while its points are flow coordinates — which is exactly the bug. */
    expect(layer.style.transform).toBe("translate(140px, 90px) scale(2)");

    // and the path is a real path with a move and at least one segment
    const path = layer.querySelector("path");
    expect(path).toBeTruthy();
    expect(path!.getAttribute("d")).toMatch(/^M\s/);
    expect(path!.getAttribute("d")).toMatch(/[QL]/);
  });

  it("a stroke drawn before draw mode is entered is still painted once it is", async () => {
    const { rerender } = render(<Canvas />);
    useStore.setState((s) => ({
      strokes: [{
        id: "stroke_existing", canvas_id: CANVAS_ID, tool: "pen", color: "#e06a4e", width: 4,
        points: [{ x: 10, y: 10 }, { x: 60, y: 40 }], author: "mahla", created_at: new Date().toISOString(),
      }],
    }));
    rerender(<Canvas />);
    expect(document.querySelector("[data-lc-strokes] path")).toBeTruthy();
  });
});
