import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { StatusBar } from "../../components/Overlays";
import { LeftPanel, RightPanel } from "../../components/SidePanels";
import { PANEL_DEFAULT_LEFT, PANEL_DEFAULT_RIGHT, STATUS_BAR_HEIGHT } from "../core";

/* ============================================================
   A render smoke test for the layout chrome.

   The layout *logic* is covered by `layout.test.ts`; logic passing does not prove the interface exists. Nothing
   there would notice a `StatusBar` that was written and never mounted, or a panel that ignored
   `canvas.layout.leftWidth` and kept its old hardcoded `w-[268px]` class. These render the real components and
   assert on the HTML.

   THE LIMIT, stated rather than hidden: `renderToStaticMarkup` + zustand v5 renders the store's **initial**
   state (v5 passes `api.getInitialState` as the server snapshot), so a `setState` before rendering has no
   effect here. That rules out asserting focus mode, closed panels or a custom width through this route — and
   testing them would mean adding jsdom, which `docs/ARCHITECTURE.md` §7 deliberately refuses. So this file
   proves three things and no more: the chrome mounts, its geometry comes from the store's layout (the numbers
   below are `DEFAULT_LAYOUT`, read from `core`, not retyped), and the status strip is 22px. The state-driven
   behaviour is covered by `layout.test.ts` at the data layer.
   ============================================================ */

const left = renderToStaticMarkup(createElement(LeftPanel));
const right = renderToStaticMarkup(createElement(RightPanel));
const strip = renderToStaticMarkup(createElement(StatusBar));

describe("the status strip is mounted chrome, 22px, with a document half and a moment half", () => {
  it("renders at exactly STATUS_BAR_HEIGHT and is findable by the app's own marker", () => {
    expect(strip).toContain("data-lc-statusbar=\"true\"");
    expect(strip).toContain(`height:${STATUS_BAR_HEIGHT}px`);
  });

  it("left half names the document and the storage mode; right half names the run status", () => {
    expect(strip).toContain("nodes"); // counts
    expect(strip).toContain("edges");
    // the moment — as a sentence, not the store's enum (ADR-017). `run: idle` was the old, machine-facing form.
    expect(strip).toContain("Ready — nothing running");
    expect(strip).not.toContain("run: idle");
  });

  it("does not offer the focus-mode way out before focus mode is on", () => {
    expect(strip).not.toContain("Focus mode");
    expect(strip).not.toContain("press Z");
  });
});

describe("the panels take their geometry from the store, not from a hardcoded class", () => {
  it("left panel renders at DEFAULT_LAYOUT.leftWidth with its drag handle", () => {
    expect(left).toContain(`width:${PANEL_DEFAULT_LEFT}px`);
    expect(left).toContain("data-lc-resize=\"left\"");
    // the old hardcoded utility must be gone, or a theme/user width would lose to it
    expect(left).not.toContain("w-[268px]");
  });

  it("right panel renders at DEFAULT_LAYOUT.rightWidth, with the handle on the inner edge", () => {
    expect(right).toContain(`width:${PANEL_DEFAULT_RIGHT}px`);
    expect(right).toContain("data-lc-resize=\"right\"");
    expect(right).not.toContain("w-[292px]");
    // handle before <aside>: it sits between the canvas and the inspector, not outside the panel
    expect(right.indexOf("data-lc-resize=\"right\"")).toBeLessThan(right.indexOf("<aside"));
  });

  it("the handle is a real separator, so a screen reader is told what it is", () => {
    for (const html of [left, right]) {
      expect(html).toContain("role=\"separator\"");
      expect(html).toContain("aria-orientation=\"vertical\"");
    }
  });
});

/* ============================================================
   Both panels must actually scroll, and the handle must survive that.

   The bug was one missing class: the scroller was `flex-1 overflow-y-auto` with no `min-h-0`, and a flex
   item's `min-height` defaults to `auto`, so it refuses to shrink below its content and `overflow-y: auto`
   never engages. Nothing fails, nothing warns — a long file tree is simply cut off by the root's
   `overflow-hidden`. The fix is invisible to every logic test, so it is asserted here, on the rendered HTML,
   together with the half that must not regress: the resize handle still sits on the inner edge.
   ============================================================ */
describe("both panels scroll, and scrolling did not cost the resize handle", () => {
  it("the left panel has a real scroller: min-h-0 with overflow-y-auto and lc-panel-scroller", () => {
    expect(left).toContain("flex-1 min-h-0 overflow-y-auto");
    expect(left).toContain('data-lc-panel-scroller="left"');
    expect(left).toContain("lc-panel-scroller");
    // `min-h-0` is the load-bearing half. `overflow-y-auto` alone is the shape of the bug, so asserting only
    // the overflow would pass on the broken markup too.
    expect(left).toMatch(/class="[^"]*\bmin-h-0\b[^"]*overflow-y-auto/);
  });

  it("the right panel scrolls the same way, from its own inner scroller", () => {
    expect(right).toContain("flex-1 min-h-0 overflow-y-auto");
    expect(right).toContain('data-lc-panel-scroller="right"');
    expect(right).toContain("lc-panel-scroller");
    expect(right).toMatch(/<aside[^>]*class="[^"]*flex flex-col[^"]*min-h-0[^"]*overflow-hidden/);
  });

  it("the width still comes from layout, and the handle is still there to change it", () => {
    expect(left).toContain(`width:${PANEL_DEFAULT_LEFT}px`);
    expect(right).toContain(`width:${PANEL_DEFAULT_RIGHT}px`);
    expect(left).toContain('role="separator"');
    expect(right).toContain('role="separator"');
  });
});
