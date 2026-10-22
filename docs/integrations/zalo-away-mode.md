# Zalo Personal Away Mode

## Runtime boundary

Zalo messages come from external people. They never represent statements or commitments from Angela's owner.

`AwayRuntimeResponder` uses the production `AngelaRuntime` and `RuntimeSession.send()` path.
Each request creates a fresh conversation with channel `zalo` and an explicit external speaker.
The model receives the current external text and the public channel policy.

The `zalo` channel does not load owner memory, recall, projects, tasks, skills, or MCP clients.
It supplies no tools and captures no long-term memory.
External slash commands cannot reach owner command handlers.
Runtime observers receive `external.message` instead of `user.message`.
Events contain metadata without external message text.

The model selects one public response category through a strict schema.
Only fixed, localized response text can leave this boundary.
Invalid JSON, additional fields, free text, provider errors, and unknown categories fail closed.
The Away service supplies a notification fallback after model failure.
The model cannot transmit owner facts or promise owner actions through arbitrary output.

## Core integration changes

`runtime.ts` adds the Zalo channel, skips private sources and capture, blocks commands, and excludes MCP discovery.
`context-builder.ts` accepts the channel in its type union. Its behavior does not change.
`events.ts` adds the channel and an external message event.
`chat.ts`, companion prompts, companion evaluation data, and the memory architecture stay unchanged.

These integration points exist because the production runtime otherwise loads owner capabilities for most channels.

## Validation scope

Tests exercise the real runtime with a mocked model provider.
They inspect provider requests, event attribution, tool absence, schema rejection, and unchanged owner storage.
These checks do not establish live Zalo authentication or delivery.
