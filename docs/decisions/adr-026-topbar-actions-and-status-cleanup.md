---
title: TopBar direct actions and status bar toggle cleanup
status: accepted
updated: 2026-09-04
sources: [src/components/Overlays.tsx#StatusBar, src/components/Overlays.tsx#TopBar, src/lib/__tests__/status-bar.test.tsx]
---

# ADR-026 — TopBar Direct Actions and Status Bar Cleanup

## Context

The bottom status bar contained redundant toggles for `Library on` and `Inspector on`, which cluttered the footer when the primary top bar already provides navigation and panel management. Furthermore, starting a new canvas required digging into destructive settings menus, and accessing the Manager Copilot required navigating through deep node trees.

## Decision

1. **Status Bar Cleanup**: Remove redundant panel toggle buttons from `StatusBar`. The status bar focuses strictly on document metrics (nodes, edges, storage backend) and execution state phrases (ADR-017).
2. **New Canvas Direct Action**: Add a prominent `New` action in `TopBar` with confirmation to allow instant workspace reset and new canvas initialization.
3. **Manager Copilot Access**: Provide direct Copilot / Manager chat affordance from `TopBar` and `Palette` to allow direct interactive conversation with the Canvas Manager agent for workflow and pipeline synthesis.

## Consequences

- The footer status bar is clean, high-contrast, and focused on operational metrics without interactive toggle bloat.
- Users can start a new canvas in one click with safety confirmation.
- Users can instantly open and chat with the Canvas Manager agent to generate or modify graph pipelines.
