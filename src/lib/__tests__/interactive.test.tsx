// @vitest-environment jsdom
/* ============================================================
   Interactive tests: real components, the real store, real DOM events.

   Every bug in this file's reason-for-existing was invisible to the node-environment suite. A `/* … *\/`
   comment placed in JSX *children* renders as literal text and pushed the canvas off screen; four scrollers
   had `overflow-y: auto` with no `min-h-0`, so nothing scrolled and nothing threw; a chat panel's close
   button was crushed to zero width by a long title. All three pass every unit test in the repo, because none
   of them is a logic error — they are only visible once something is actually mounted.

   The existing suite stays on the node environment and is untouched: the `@vitest-environment` docblock at
   the top of this file is per-file, so jsdom is loaded for these tests only.
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReactFlowProvider } from "@xyflow/react";
import { useStore } from "../../store";
import { setStorage, MemoryStorageAdapter, DEFAULT_THEME, THEME_IDS } from "../core";
import { CanvasInner } from "../../components/CanvasArea";
import { LeftPanel, RightPanel } from "../../components/SidePanels";
import { TopBar, ChatPanel, SettingsModal, StatusBar } from "../../components/Overlays";
import { makeNodeData, makeAgentConfig } from "../../state";
import type { RFNode } from "../../state";


/* React Flow measures itself with APIs jsdom does not implement. These are not stubs of the code under test —
   they are the browser surface the library expects to exist. */
class ResizeObserverStub {
  observe() {} unobserve() {} disconnect() {}
}
beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;
  (globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly ??= class {
    m22 = 1; constructor(_?: string) {}
  };
  // jsdom implements no scrolling at all; the chat list calls scrollTo on mount
  (Element.prototype as unknown as { scrollTo?: unknown }).scrollTo ??= function () {};
  setStorage(new MemoryStorageAdapter());
  // a known starting point, so a test cannot pass because it inherited the previous test's state
  useStore.setState((s) => ({
    nodes: [], edges: [],
    ui: { ...s.ui, chatNodeId: null, settingsOpen: false, focusMode: false, consoleOpen: true },
    canvas: { ...s.canvas, layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true } },
  }));
});
afterEach(() => cleanup());

const agentNode = (id: string, title: string): RFNode =>
  ({ id, position: { x: 40, y: 40 }, selected: false, data: makeNodeData("agent", title, "mahla", { agent: makeAgentConfig(id, "risk-analyst") }) }) as RFNode;

/* ---------------------------------------------------------------- scrolling
   jsdom does no layout at all: `scrollHeight` and `clientHeight` are both 0 for every element, so asserting
   `scrollHeight > clientHeight` here would be asserting a stub against a stub. What *is* assertable is the
   precondition — the CSS contract a flex child needs in order to scroll — and that contract is exactly what
   broke. The real failure was not in the scrollers at all: `src/index.css` declared
   `html, body, #root { height: 100% }` and the bundler emitted `,body,#root{…}`, an invalid selector list
   that the browser discards whole. With no bounded height anywhere, no `overflow-y: auto` container can ever
   scroll, and no amount of `min-h-0` on the scrollers would have helped. `scripts/check-css.mjs` guards the
   stylesheet; this test guards the components. */
describe("the panel scrollers carry the contract a flex child needs in order to scroll", () => {
  it("the left panel is a bounded flex column with a scrollable body", () => {
    const { container } = render(<LeftPanel />);
    const aside = container.querySelector("aside")!;
    expect(aside).toBeInTheDocument();
    expect(aside.className).toContain("flex-col");
    expect(aside.className).toContain("h-full"); // bounded height, inherited from #root
    expect(aside.className).toContain("max-h-full");
    expect(aside.className).toContain("min-h-0");
    expect(aside.className).toContain("overflow-hidden"); // the aside clips; the child scrolls

    const scroller = aside.querySelector<HTMLElement>('[class*="overflow-y-auto"]')!;
    expect(scroller).toBeTruthy();
    expect(scroller.className).toContain("flex-1");
    expect(scroller.className).toContain("min-h-0"); // without this a flex child refuses to shrink below its content
    expect(scroller.className).toContain("overscroll-contain");
    expect(scroller.className).not.toContain("overflow-hidden");
  });

  it("the right panel is a bounded flex column with a scrollable body", () => {
    const { container } = render(<RightPanel />);
    const aside = container.querySelector("aside")!;
    expect(aside.className).toContain("flex-col");
    expect(aside.className).toContain("h-full");
    expect(aside.className).toContain("max-h-full");
    expect(aside.className).toContain("min-h-0");

    const scroller = aside.querySelector<HTMLElement>('[class*="overflow-y-auto"]')!;
    expect(scroller).toBeTruthy();
    expect(scroller.className).toContain("flex-1");
    expect(scroller.className).toContain("min-h-0");
  });

  it("the root layout is pinned to the viewport bounds so laptop screens do not overflow", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, "../../index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/body,\s*#root\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/body,\s*#root\s*\{[^}]*inset:\s*0/);
    expect(css).toMatch(/body,\s*#root\s*\{[^}]*max-height:\s*100dvh/);
    expect(css).toMatch(/body,\s*#root\s*\{[^}]*max-width:\s*100vw/);
  });

  it("the height chain the scrollers depend on is declared, and `html` is not merged into it", () => {
    /* Read the real stylesheet rather than trusting a description of it. This is the regression that made
       both panels unscrollable while every class on the scrollers looked correct. */
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, "../../index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/html\s*\{[^}]*height:\s*100%/);
    expect(css).toMatch(/body,\s*#root\s*\{[^}]*height:\s*100%/);
    expect(css).not.toMatch(/html\s*,\s*body/);
  });
});

/* ---------------------------------------------------------------- panels */
describe("the side panels open and close", () => {
  it("hides the left panel when the layout says it is closed, and brings it back", () => {
    const { container, rerender } = render(<LeftPanel />);
    expect(container.querySelector("aside")).toBeInTheDocument();

    useStore.setState((s) => ({ canvas: { ...s.canvas, layout: { ...s.canvas.layout, leftOpen: false } } }));
    rerender(<LeftPanel />);
    expect(container.querySelector("aside")).not.toBeInTheDocument();

    useStore.setState((s) => ({ canvas: { ...s.canvas, layout: { ...s.canvas.layout, leftOpen: true } } }));
    rerender(<LeftPanel />);
    expect(container.querySelector("aside")).toBeInTheDocument();
  });

  it("focus mode hides both panels — that is what focus mode is", () => {
    useStore.setState((s) => ({ ui: { ...s.ui, focusMode: true } }));
    const left = render(<LeftPanel />);
    const right = render(<RightPanel />);
    expect(left.container.querySelector("aside")).not.toBeInTheDocument();
    expect(right.container.querySelector("aside")).not.toBeInTheDocument();
  });

  it("the status strip offers the way back out of focus mode only once focus mode is on", () => {
    render(<StatusBar />);
    expect(screen.queryByTitle(/focus mode/i)).not.toBeInTheDocument();
    useStore.setState((s) => ({ ui: { ...s.ui, focusMode: true } }));
    render(<StatusBar />);
    expect(screen.getAllByTitle(/focus mode/i).length).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------- scrolling */
describe("the panels and the modals actually scroll", () => {
  /* jsdom does not lay anything out, so it cannot report a real scrollHeight. What it can do is fail when the
     classes that make scrolling possible are missing — and `min-h-0` is the half that matters, because
     `overflow-y-auto` on its own is exactly the shape of the bug: a flex item's `min-height: auto` keeps it at
     content height, the scroller never engages, and nothing anywhere reports an error. */
  const scroller = (el: Element | null) => {
    expect(el, "expected a scroller element").toBeTruthy();
    const cls = el!.className;
    expect(cls).toMatch(/\bmin-h-0\b/);
    expect(cls).toMatch(/\boverflow-y-auto\b|\boverflow-auto\b/);
  };

  it("left panel", () => {
    const { container } = render(<LeftPanel />);
    scroller(container.querySelector("aside > div:nth-of-type(2)"));
  });

  it("right panel", () => {
    const { container } = render(<RightPanel />);
    scroller(container.querySelector("aside > div"));
  });

  it("the settings modal — the one that was reported as unscrollable", () => {
    useStore.setState((s) => ({ ui: { ...s.ui, settingsOpen: true } }));
    const { container } = render(<SettingsModal />);
    scroller(container.querySelector("[data-lc-modal-body]"));
  });

  it("the chat panel message list", () => {
    useStore.setState({ nodes: [agentNode("a", "Analyst")] } as never);
    useStore.setState((s) => ({ ui: { ...s.ui, chatNodeId: "a" } }));
    const { container } = render(<ChatPanel />);
    scroller(container.querySelector("[data-lc-chatpanel] .overflow-y-auto"));
  });
});

/* ---------------------------------------------------------------- chat panel */
describe("the chat panel can be closed", () => {
  beforeEach(() => {
    useStore.setState({ nodes: [agentNode("a", "Risk analyst")] } as never);
    useStore.setState((s) => ({ ui: { ...s.ui, chatNodeId: "a" } }));
  });

  it("renders a labelled close button, and clicking it closes the panel", () => {
    const { container } = render(<ChatPanel />);
    expect(container.querySelector("[data-lc-chatpanel]")).toBeInTheDocument();

    const close = container.querySelector("[data-lc-chat-close]");
    expect(close, "the close button must exist").toBeTruthy();
    expect(close).toHaveAttribute("aria-label");
    // the bug was a long node title crushing this to zero width; the class is what prevents it
    expect(close!.className).toMatch(/\bshrink-0\b/);

    fireEvent.click(close!);
    expect(useStore.getState().ui.chatNodeId).toBeNull();
  });

  it("sits beside the inspector rather than over the middle of the canvas", () => {
    useStore.setState((s) => ({ canvas: { ...s.canvas, layout: { ...s.canvas.layout, rightWidth: 420, rightOpen: true } } }));
    const { container } = render(<ChatPanel />);
    const panel = container.querySelector<HTMLElement>("[data-lc-chatpanel]");
    // 420 + 14 — derived from the layout, not the hardcoded 306 that put it in the middle of the screen
    expect(panel!.style.insetInlineEnd).toBe("434px");

    useStore.setState((s) => ({ canvas: { ...s.canvas, layout: { ...s.canvas.layout, rightOpen: false } } }));
    const wide = render(<ChatPanel />);
    const flush = wide.container.querySelector<HTMLElement>("[data-lc-chatpanel]");
    expect(flush!.style.insetInlineEnd).toBe("14px");
  });
});

/* ---------------------------------------------------------------- inspector */
describe("selecting a node shows it in the inspector", () => {
  it("with nothing selected it says so, and names the node once one is selected", () => {
    const first = render(<RightPanel />);
    expect(first.container.textContent).toMatch(/canvas settings|nothing selected/i);
    cleanup();

    useStore.setState({ nodes: [agentNode("a", "Risk analyst"), { ...agentNode("b", "Designer"), selected: true }] } as never);
    const second = render(<RightPanel />);
    // the node's own file path proves *which* node the inspector picked up
    expect(second.container.textContent).toContain("nodes/b.md");
    // the title is an editable field, so it is an input's value and not part of textContent
    const title = second.container.querySelector<HTMLInputElement>('input[value="Designer"]');
    expect(title, "the selected node's title must be in the inspector").toBeTruthy();
  });
});

/* ---------------------------------------------------------------- theme */
describe("changing the theme reaches the document", () => {
  it("every registered theme can be selected from Settings, and the last one wins", () => {
    useStore.setState((s) => ({ ui: { ...s.ui, settingsOpen: true } }));
    const { container } = render(<SettingsModal />);
    for (const id of THEME_IDS) {
      const btn = container.querySelector<HTMLElement>(`[data-lc-theme="${id}"]`);
      expect(btn, `a picker entry for "${id}"`).toBeTruthy();
      fireEvent.click(btn!);
      expect(useStore.getState().settings.theme).toBe(id);
    }
    // and the attribute the CSS keys off follows the store, which is what main.tsx sets before first paint
    document.documentElement.dataset.theme = useStore.getState().settings.theme;
    expect(THEME_IDS).toContain(document.documentElement.dataset.theme);
    expect(DEFAULT_THEME).toBe(THEME_IDS[0]);
  });
});

/* ---------------------------------------------------------------- a regression that unit tests cannot see */
describe("no component leaks its own comments into the page", () => {
  /* A `/* … *\/` written in JSX children is not a comment — it is a text node. One of these replaced the
     canvas with four lines of prose about `min-h-0` and pushed the layout apart. No type error, no test
     failure, nothing in the console: the app simply rendered its own source. */
  it("the panels render no prose where markup belongs", () => {
    const left = render(<LeftPanel />);
    const right = render(<RightPanel />);
    const top = render(<TopBar />);
    for (const c of [left.container, right.container, top.container]) {
      expect(c.textContent).not.toMatch(/min-h-0|overflow-y|flex item|resize handle/i);
      // a stray comment node is the other half of the same mistake
      expect(c.textContent).not.toContain("/*");
    }
    // and the canvas region is still where it should be: the panels are siblings of it, not on top of it
    expect(within(left.container).getAllByRole("separator").length).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------- node shape badge layering (ADR-018) */
describe("node shape rendering preserves badge overlays on geometric shapes", () => {
  it("diamond and hexagon nodes separate clip-path backdrop so badges and handles remain unclipped", () => {
    const lockedDiamondNode: RFNode = {
      id: "node-diamond",
      type: "lc",
      position: { x: 50, y: 50 },
      selected: false,
      data: {
        ...makeNodeData("shape", "Diamond decision", "user"),
        shape: "diamond",
        lock: { status: "locked", locked_by: "run-1", locked_at: "2026-09-02T00:00:00Z" },
      },
    } as RFNode;

    const approvalHexagonNode: RFNode = {
      id: "node-hex",
      type: "lc",
      position: { x: 300, y: 50 },
      selected: false,
      data: {
        ...makeNodeData("agent", "Hex agent", "user", {
          agent: { ...makeAgentConfig("node-hex", "risk-analyst"), require_approval: true },
        }),
        shape: "hexagon",
      },
    } as RFNode;

    useStore.setState({ nodes: [lockedDiamondNode, approvalHexagonNode] });

    const { container } = render(
      <ReactFlowProvider>
        <div style={{ width: 800, height: 600 }}>
          <CanvasInner />
        </div>
      </ReactFlowProvider>
    );

    // The root node wrappers must NOT have clip-path directly clipping peripheral badges
    const backdropSurfaces = container.querySelectorAll<HTMLElement>(".lc-card-surface, .lc-card-empty");
    expect(backdropSurfaces.length).toBeGreaterThanOrEqual(2);

    // One of the backdrop surfaces carries the diamond clip polygon
    const clips = Array.from(backdropSurfaces).map((el) => el.style.clipPath);
    expect(clips.some((c) => c.includes("polygon(50% 0%"))).toBe(true);
    expect(clips.some((c) => c.includes("polygon(12% 0%"))).toBe(true);

    // Badges must exist in DOM and not be trapped inside the clipped element
    const lockTitle = container.querySelector('[title="Locked by a run (§12.5)"], [title*="Lock"], svg');
    expect(lockTitle).toBeTruthy();

    const approvalBadge = container.querySelector('[title="Needs human approval"]');
    expect(approvalBadge).toBeTruthy();
  });
});

