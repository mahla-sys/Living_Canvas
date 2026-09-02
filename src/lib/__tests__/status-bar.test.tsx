// @vitest-environment jsdom
/* ============================================================
   The status bar (ADR-017).

   The bar is the one place a reader learns what is happening without opening a panel, so it must not print an
   internal enum. The table of phrases is a *total* Record on purpose: add a value to
   `ExecutionState["status"]` and TypeScript refuses to build, rather than a fallback quietly printing the raw
   enum to the reader. These tests hold the user-visible half of that promise.
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useStore } from "../../store";
import { setStorage, MemoryStorageAdapter } from "../core";
import { StatusBar, TopBar } from "../../components/Overlays";

const STATUSES = ["idle", "running", "paused", "waiting_approval", "completed", "failed", "stopped"] as const;

beforeEach(() => {
  setStorage(new MemoryStorageAdapter());
  useStore.setState((s) => ({
    nodes: [], edges: [],
    execution: { ...s.execution, status: "idle", queue: [], completed: [], current_node_id: null },
    saveState: "saved",
    ui: { ...s.ui, focusMode: false, chordDepth: 0 },
    canvas: { ...s.canvas, title: "Test canvas", layout: { leftWidth: 268, rightWidth: 292, leftOpen: true, rightOpen: true } },
  }));
});
afterEach(() => cleanup());

describe("the status bar speaks in words", () => {
  it("never prints a raw execution enum value", () => {
    for (const st of STATUSES) {
      useStore.setState((s) => ({ execution: { ...s.execution, status: st } }));
      const { unmount } = render(<StatusBar />);
      const text = document.querySelector("[data-lc-statusbar]")!.textContent ?? "";
      expect(text, `status "${st}" leaked its enum`).not.toMatch(/run: |waiting_approval|_approval/);
      unmount();
    }
  });

  it("gives every state a distinct, human phrase", () => {
    const seen = new Map<string, string>();
    for (const st of STATUSES) {
      useStore.setState((s) => ({ execution: { ...s.execution, status: st } }));
      const { unmount } = render(<StatusBar />);
      const phrase = document.querySelector("[data-lc-run-phrase]")!.textContent ?? "";
      expect(phrase.trim().length, `${st} has no phrase`).toBeGreaterThan(0);
      seen.set(phrase, st);
      unmount();
    }
    // seven states, seven phrases — two sharing one would hide which is which
    expect(seen.size).toBe(STATUSES.length);
  });

  it("says what an approval is waiting for, and what a pause is waiting for", () => {
    useStore.setState((s) => ({ execution: { ...s.execution, status: "waiting_approval" } }));
    const { unmount } = render(<StatusBar />);
    expect(screen.getByText(/waiting for your approval/i)).toBeInTheDocument();
    unmount();

    useStore.setState((s) => ({ execution: { ...s.execution, status: "paused" } }));
    render(<StatusBar />);
    expect(screen.getByText(/paused — press resume to continue/i)).toBeInTheDocument();
  });

  it("shows the queue position only while there is a queue to be in", () => {
    useStore.setState((s) => ({
      execution: { ...s.execution, status: "running", queue: ["a", "b", "c", "d", "e", "f", "g"], completed: ["a", "b", "c"] },
    }));
    const { unmount } = render(<StatusBar />);
    expect(screen.getByText("3 of 7")).toBeInTheDocument();
    unmount();

    // idle with no queue: a progress figure here would be noise
    useStore.setState((s) => ({ execution: { ...s.execution, status: "idle", queue: [], completed: [] } }));
    render(<StatusBar />);
    expect(screen.queryByText(/ of /)).not.toBeInTheDocument();
  });

  it("turns the save state into a sentence", () => {
    const { rerender } = render(<StatusBar />);
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    useStore.setState({ saveState: "saving" });
    rerender(<StatusBar />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("drops the ad-hoc glyph alphabet in favour of words", () => {
    const { container } = render(<StatusBar />);
    expect(container.textContent).not.toMatch(/[◧▨▫]/);
    expect(screen.getByText("Library on")).toBeInTheDocument();
    expect(screen.getByText("Inspector on")).toBeInTheDocument();
  });
});

describe("the top bar subtitle", () => {
  it("does not repeat the application name under the application name", () => {
    const { container } = render(<TopBar />);
    const subtitle = container.querySelector("[data-lc-topbar-subtitle]")!;
    expect(subtitle.textContent).not.toContain("Living Canvas");
    // the header still carries it exactly once
    expect((container.textContent ?? "").split("Living Canvas").length - 1).toBe(1);
  });
});
