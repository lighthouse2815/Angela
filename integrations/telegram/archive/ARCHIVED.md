# Archived Telegram prototype

This directory preserves the upstream PostgreSQL and media bot for historical reference.
It is excluded from the default pnpm workspace and has no role in the supported Angela companion runtime.
No database or existing chat archive is deleted by this change.

Start the supported local companion with `pnpm telegram` from the repository root.
Its implementation is `apps/cli/src/telegram.ts`.
Read [the shared runtime guide](../../../apps/cli/src/companion/README.md) for desktop linkage and privacy boundaries.

The archived prototype supports media handling and a separate PostgreSQL history.
The supported private companion does not import that database or provide those prototype media flows.
Keep existing prototype data until a separate, validated migration addresses those formats.
Do not run both implementations with the same bot token.
