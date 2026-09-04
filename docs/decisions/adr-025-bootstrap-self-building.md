---
title: ADR-025 Bootstrap Self-Building via Manager Agent
status: proposed
updated: 2026-09-04
sources: src/lib/engine.ts, src/state.ts
---

# Context and Problem Statement

Living Canvas is designed as a collaborative workspace for humans and AIs. Currently, agents can create outputs and interact with memories, but they lack the capability to observe the canvas state visually, modify the graph topology (nodes, edges), or manage the system itself. We want Living Canvas to be capable of "self-building"—an AI operating within the canvas should be able to analyze user requests, architect pipelines, find bugs, and modify the canvas elements accordingly, without manual human translation.

# Decision

1.  **Manager / Copilot Agent**: We introduce a concept of a Manager Agent. While any agent can technically be given canvas manipulation tools, the Manager has intrinsic awareness of the UI and full canvas manipulation rights to act as an assistant to the user.
2.  **UI-Awareness Tools**:
    *   `get_ui_state`: Returns current `AppState` UI properties (selected node, active tabs, theme).
    *   `capture_canvas_snapshot`: Returns a clean JSON representation of the canvas (nodes, coordinates, roles) avoiding heavy HTML DOM parsing.
3.  **Canvas Manipulation Tools**: Provide `create_node`, `update_node`, `delete_node`, `create_edge`, `update_edge`, `delete_edge` to agents that have them listed in their context contract (these are already partially implemented in `CANVAS_TOOL_DEFINITIONS` but need to be fully exposed and tested).
4.  **Isolated Manager State**: The Manager uses `memory/agents/manager-<canvas-id>.md` and `chats/manager-<canvas-id>.md`.
5.  **living-canvas-builder Canvas**: We will create a specialized canvas initialized with `Researcher` and `Planner` agents to bootstrap the self-building process as the first test of this ecosystem.

# Consequences

*   **Security Risk**: Modifying canvas files directly is safe within the isolated canvas directory (`outputs/`, `nodes/`, `edges/`). However, we explicitly withhold shell execution (`npm test`, `fs.writeFile` to `src/`) to prevent catastrophic local file mutations for now.
*   **Token Overhead**: Sending the whole canvas snapshot to the model might consume significant context. We must ensure `capture_canvas_snapshot` is lightweight and only provides bounding boxes, node types, and titles.
*   **Bootstrapping**: We transition from manual human-driven graph construction to AI-driven graph generation.
