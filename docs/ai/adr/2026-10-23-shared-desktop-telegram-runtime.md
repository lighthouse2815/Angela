# Shared desktop and Telegram companion runtime

## Status

Implementation in progress. This document defines the target and migration requirements.
It does not certify that the current applications share a runtime.

## Problem

Desktop stores learning and companion records in renderer localStorage.
CLI and its Telegram adapter use AngelaRuntime, Memory V2, Tasks, and OpenLoops.
The separate stores prevent consistent recall and follow-up across channels.
The older integrations/telegram-bot also owns an independent Telegram implementation.

## Target

- Keep AngelaRuntime in packages/angela-cli as the authoritative companion orchestration domain.
- Keep Electron presentation, avatars, provider selection, voice interruption, attachments, and authorized desktop tools.
- Run Node-only memory and runtime operations in Electron main, never inside the browser renderer.
- Use central Eventa contracts for desktop requests, results, cancellation, and lifecycle events.
- Reuse existing generation contracts. Do not introduce a second provider protocol or duplicate tool execution.
- Preserve the stage-web browser implementation until it has a supported host boundary.
- Share personal memory only with the configured local owner and an explicitly linked Telegram user.
- Preserve isolated Telegram storage for every other allowed user and keep group chats outside personal recall.
- Keep character, workspace, channel, and session provenance explicit. A renderer cannot choose arbitrary filesystem paths or user identities.
- Use Memory V2 for durable facts, Tasks for explicit reminders, and OpenLoops for unfinished conversation subjects.
- Preserve learning review intervals and activity state through shared domain operations without a parallel desktop authority.
- Use the packages/angela-cli Telegram adapter as the supported Telegram entry point.

## Data transition

Implement an explicit, idempotent import from desktop learning and companion records.
Validate payloads before writing. Keep source localStorage until the entire import succeeds and its receipt persists.
Retain record identities, timestamps, character ownership, review progress, dismissed state, and due times.
Do not turn elapsed activities or overdue plans into completed actions.
Do not replay already presented follow-ups during import or restart.
Do not copy secrets or disabled-memory content into another store as a workaround.
Expose import failure to the user and allow a safe retry. Do not report partial import as success.
Old storage becomes an import source, never a permanent read-through or dual-write fallback.

## Telegram transition

Inspect callers and supported features before retiring integrations/telegram-bot.
Update workspace, scripts, documentation, and references when removing its active entry point.
Do not contact Telegram, send messages, or read credential values during implementation checks.
Document any feature that blocks retirement instead of silently dropping it.

## Acceptance

- A desktop preference is available through the linked Telegram scope after reopening stores.
- A linked Telegram correction becomes the current desktop preference.
- Other Telegram users, other characters, and unrelated workspaces cannot read those records.
- Existing learning schedules, companion dismissal, and activity completion survive import and restart.
- Repeated imports do not duplicate records, reminders, or delivery attempts.
- Disabled memory and protected requests reject durable writes through desktop and Telegram.
- Desktop generation, streaming, tools, voice cancellation, and application shutdown retain working lifecycles.
- Tests use real stores and mocked external IO. No paid generation or live messages are required.
- Run affected typechecks, tests, builds, root typecheck, and lint before declaring completion.

## Implementation discipline

AGENTS.md requires a separate Codex or Claude Code shell session for this data refactor.
That session implements this document and follows the repository checks and commit rules.
Commit each independently complete change in Vietnamese and push to the existing GitHub remote.
Keep caches and pre-existing LICENSE deletions unchanged.

## Implemented foundation

RuntimeSession accepts a structural RuntimeChat host instead of requiring the CLI Chat class.
The CLI Chat still satisfies this contract without behavior changes.
An external host can retain generation and presentation while the runtime owns privacy, context, tools, and lifecycle.
This contract alone does not connect Electron or migrate memory.

## Outstanding work

Electron main and renderer adapters, import receipts, learning review transfer, and Telegram integration retirement remain unimplemented.
The separate shell refactor session stopped because its workspace exhausted credits.
The parent session completed validation of the host boundary. No personal data was migrated.

## Foundation validation

- CLI test suite: 75 files and 893 tests passed with two workers, without concurrent heavyweight checks.
- CLI typecheck and build passed.
- Root typecheck passed all 53 tasks with one-task concurrency and a 4 GB heap.
- Root lint passed with zero errors and 603 existing warnings.
- An earlier concurrent test run timed out in a CLI subprocess hook. The sequential rerun passed without timeout changes.
- No live Telegram message or paid generation request ran during these checks.
