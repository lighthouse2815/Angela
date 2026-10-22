# Feasibility Summary

This document records the validated state of the Angela-specific macOS desktop orchestration v1 in `services/computer-use-mcp`.

## Bottom Line

The current direction is feasible and materially stronger than the earlier pure-vision-only path.
The validated architecture is now:

- Angela keeps the control plane
- `computer-use-mcp` keeps trace, audit, screenshot persistence, policy, and the MCP surface
- the primary execution backend is local macOS window automation
- Angela desktop handles human approval through native dialogs
- terminal commands run in a controlled background shell runner instead of a Terminal tab script

That makes the feature an orchestration layer, not just a mouse-clicking demo.

## What Was Verified

### 1. The service still fits Angela's MCP attachment model

Angela continues to use the existing stdio MCP bridge through `mcp.json`.
No transport rewrite was required.

### 2. The service now exposes a tool-first desktop orchestration surface

Validated surface in this checkout:

- desktop observation tools
- deterministic app open/focus tools
- background terminal execution tools
- primitive UI interaction tools
- approval / trace / audit helpers

This is a better fit for Angela than leading with pure screenshot-driven action selection.

### 3. Terminal execution is now first-class and auditable

Validated by tests:

- commands run in a local background shell process
- non-zero exit codes are returned without throwing away stderr/stdout
- cwd is sticky across calls unless explicitly overridden
- reset clears terminal state

This gives Angela a deterministic execution path for many developer workflows without relying on Terminal.app scripting.

### 4. Native approval now sits in the Angela desktop layer

Validated by implementation shape:

- MCP still returns `approval_required`
- Angela renderer intercepts `computer_use` pending actions
- Electron main shows a native approval dialog
- Angela automatically follows up with approve/reject tool calls
- session-scoped approval reuse is limited to terminal and app open/focus actions

That keeps approval as a user action, not a model action.

### 5. The old remote Linux path still compiles and tests

The previous `linux-x11` backend remains available as a legacy experimental path.
It is not the primary v1 story anymore, but it was intentionally kept compiling so existing remote smoke tooling still works.

## Current Boundary

Main v1 story:

- executor: `macos-local`
- apps explicitly supported for open/focus by default:
  - `Terminal`
  - `Cursor`
  - `Google Chrome`
- safety boundary:
  - native approval dialogs
  - `denyApps`
  - trace / audit
  - screenshot persistence
  - operation budgets

Explicit non-goals of this pass:

- PTY/TUI terminal automation
- deep accessibility tree grounding
- strict app-level UI sandboxing
- remote sandbox hosting for other users
- Windows / Wayland / multi-monitor support

## Commands Verified In This Checkout

- `pnpm -F @angela/computer-use-mcp typecheck`
- `pnpm -F @angela/computer-use-mcp test`
- `pnpm -F @angela/stage-ui typecheck`
- `pnpm -F @angela/desktop typecheck`

## Practical Interpretation

The feature is now credible as:

- a macOS desktop orchestration layer for Angela
- a way to connect chat, MCP, terminal execution, and UI observation into one task flow
- a safer incremental path than trying to solve generic pure-vision computer use first

It should not be pitched as:

- a general desktop sandbox platform
- a no-approval autonomous agent
- a production-grade app-isolated desktop security boundary
