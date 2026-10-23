# Shared desktop and Telegram companion runtime

## Status

Implemented. Desktop and the supported Telegram adapter use AngelaRuntime and the same explicitly linked companion records.

## Problem

Desktop stores learning and companion records in renderer localStorage.
CLI and its Telegram adapter use AngelaRuntime, Memory V2, Tasks, and OpenLoops.
The separate stores prevent consistent recall and follow-up across channels.
The older integrations/telegram/archive also owns an independent Telegram implementation.

## Target

- Keep AngelaRuntime in core/companion as the authoritative companion orchestration domain.
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
- Use the apps/cli Telegram adapter as the supported Telegram entry point.

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

## Implementation

RuntimeSession accepts a structural RuntimeChat host. CLI Chat and the Electron main adapter implement that boundary.
Electron main owns runtime context, durable tools, privacy, tasks, and OpenLoops.
The renderer retains generation, media projection, provider selection, streaming, avatars, and authorized device tools.
Eventa binds requests and tool calls to the local application frame and its WebContents identity.
Cancellation, window destruction, expiry, and shutdown release the main request.

CompanionRecords stores typed learning and companion pages in Memory V2 with atomic import receipts.
The imported identities, review progress, due dates, presentation markers, and dismissal states remain intact.
Import failure preserves the original source and permits retry without a receipt.
Successful import leaves localStorage as an inert recovery source. Desktop edits never write back to that source.
Browser-only stage-web remains a supported local-storage client of the same record schemas.

Desktop supplies original stored user messages rather than model prompt decorations.
An inherited protected-history flag preserves the no-store policy beyond the bounded history sent over IPC.
Runtime tool writes also recheck the shared opt-out when another channel changes it during generation.

The linked Telegram owner shares the character root with desktop.
Other Telegram users remain isolated. Typed record scopes also include the exact workspace and character.
Desktop polls shared views every five seconds, so Telegram corrections become visible without duplicate persistence.

Desktop runtime reminders require a renderer presentation receipt before task delivery completes.
OpenLoops retain their existing at-most-once reservation policy.
Learning reviews and companion activities retain desktop presentation with shared durable progress.
They do not gain a second Telegram notification path.

## Telegram retirement boundary

The root `pnpm telegram` command starts the apps/cli adapter.
The upstream integrations/telegram/archive prototype is excluded from the default workspace.
Its PostgreSQL and media source remain archived, without deleting existing data.
Those database records and media workflows need a separate migration before their source can be removed.
Read [the shared runtime guide](../../../core/companion/src/companion/README.md) for configuration and supported boundaries.

## Validation

Checks use temporary stores, local fake Telegram servers, and mocked provider and Electron IPC boundaries.
No live Telegram messages or paid generation requests run during these checks.
The companion tests cover shared corrections, scope isolation, import rollback, retained progress, opt-outs, and nested transaction rollback.
Desktop tests cover provider streaming, direct replies, original message identities, long-history privacy, cancellation, and reminder receipts.
Browser store tests cover import retry, multi-character sources, and single persistence through synced leader and follower windows.
