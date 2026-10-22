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

## Architecture

```text
zca-js text DM listener
  -> PersonalZaloClient normalization
  -> ZaloAdapter bounded serial queue
  -> AwayModeService authorization, replay guard, durable claim, rate limit
  -> notify-only public notification
     OR AwayRuntimeResponder -> RuntimeSession.send -> existing Chat and provider
  -> strict public response category -> localized fixed text
  -> PersonalZaloClient.sendMessage -> Zalo DM
```

The adapter owns transport lifecycle and queue limits. The Away service owns business policy.
Telegram and Discord retain their existing adapters. No shared adapter abstraction exists in the inspected CLI.
This implementation reuses their production runtime path without importing their owner permissions.

The MVP handles inbound text DMs only. It has no public arbitrary-send command or outbound automation tool.
Groups, attachments, calls, reactions, friend automation, campaigns, and bulk sends are excluded.

## Away policy

The default state disables Away Mode, selects `notify-only`, and has an empty whitelist.
Only exact numeric sender IDs receive authorization. Display names never grant access.
Settings and message records are isolated by authenticated Zalo account ID.
A different account starts with its own empty whitelist.

`notify-only` saves the external message and sends the fixed identity and offline notification.
It does not call the model or perform owner actions.

`assistant-reply` calls the production runtime to choose a greeting, notification, clarification, receipt, or privacy refusal.
It deliberately limits conversation to these public templates.
It does not offer unrestricted generated prose or persistent multi-turn conversations.
The model deadline is 30 seconds. Failure returns the fixed offline notification.

Authorization is checked again after generation and before send.
Disabling Away Mode, changing its session, or revoking a sender cancels that reply.
An already-submitted network send cannot be recalled by a later policy change.

## Provenance and pending messages

Each stored record includes `source: zalo`, `sourceType: external-user`, account, sender, conversation, message ID, text, and receipt time.
Processing adds the away-session ID, status, processing time, reason, and available reply receipt.
External claims remain attributed message text. They never enter semantic owner memory.

Every authorized message is conservatively retained as a pending external request candidate for owner review.
The candidate contains the external text and `status: pending`.
This includes ordinary conversation because the MVP does not infer owner intent from an external speaker.
No user task, deadline, financial promise, or personal decision is created.

Turning Away Mode off produces a deterministic summary for that away session.
It counts messages and successful replies by stable sender ID, including denied inbound messages.
It quotes up to 20 recent messages per sender, with 500 characters per quote.
Complete original text remains in the private audit store.
Control characters are JSON-escaped before terminal display.

## Storage and delivery

`AwayModeStore` and `ZaloCredentialStore` are the business-facing persistence boundaries.
Local implementations reuse `MemoryFile`, including validation, atomic rename, private files, and cross-process write locks.
There is no new database or memory pipeline.
Each message has a separate file. The existing 128,000-character file limit applies to individual writes.

Message identity hashes the authenticated account, conversation, and server message ID.
Claims persist across restart. Duplicate and already-claimed records never generate another reply.
Messages older than five minutes or over 30 seconds in the future are logged without reply.
Old-message listener events are not consumed.

Rate limits permit at most three reply attempts per sender in 60 seconds.
Durable attempts include successful, failed, and uncertain sends, across restarts and away sessions.
Rate checks read the private log. This favors a small local MVP over large-volume throughput.
One local host lease prevents competing listeners and rate-check races.

The inbound queue holds at most 32 messages and processes them serially.
Overflow is logged without a reply. There is no automatic resend after send failure.
An uncertain send remains claimed after a process crash. This prioritizes avoiding duplicate replies over guaranteed delivery.
The SDK provides no server delivery acknowledgement for incoming callbacks or automatic history recovery after disconnect.
Messages that never reach the process, or remain unpersisted in its queue at a crash, cannot be recovered by this adapter.

Disconnect recovery creates a fresh SDK API after stopping the old listener.
It permits three retries per host lifetime, with delays of one, two, and four seconds.
Exhaustion leaves the host alive and logs `reconnect_exhausted`. The owner must restart it or re-authenticate.
The WebSocket handshake deadline is 20 seconds. SDK HTTP requests have a 120-second ceiling.
Shutdown cancels generation and reconnect delays, stops the listener, and drains accepted jobs.

## Credential security

`zca-js` logging and its update check are disabled. Self-message delivery is disabled and independently filtered.
Only the credential implementation reads or writes session files.
The saved session contains the authenticated account ID, cookies, IMEI, and user agent.
Restore checks the authenticated account ID and refreshes cookies from the resulting cookie jar.

Local directories use mode `0700`. Credential and QR files use mode `0600` on platforms that support these permissions.
QR images are private temporary login material and are removed after success, failure, or cancellation.
SDK errors are replaced by fixed public errors. Raw errors, cookie values, QR tokens, and provider context never enter logs.
Git ignores credential files, login QR images, leases, and account message storage.
Credentials are not encrypted at rest. Filesystem access therefore remains a security boundary.

## Transport research

The implementation pins `zca-js` version `2.2.0` in the workspace catalog and lockfile.
Its API was checked against the published declarations and upstream source on 2026-10-22.
No paid Zalo API key or Zalo OA account is required.

| Reference | Pattern used |
| --- | --- |
| [zca-js](https://github.com/RFS-ADRENO/zca-js/tree/0586dc5e4981985c5f16b9b3a5f285a02feb6f9b) | `loginQR`, callback abort, `login(credentials)`, cookie snapshots, listener events, `ThreadType.User`, and `sendMessage` receipts |
| [OpenClaw zalouser](https://github.com/openclaw/openclaw/blob/main/extensions/zalouser/src/zalo-js.ts) | Fresh API on reconnect, terminal error handlers during socket retirement, explicit listener retries, and self filtering |
| [openclaw-zalo-connect](https://github.com/tuanminhhole/openclaw-zalo-connect/tree/0e5908c6ccc00cde6f539a82fd82086fc90285de) | Account-scoped duplicate identity, explicit backoff, and SDK transport separation |
| [zalo-personal-mcp](https://github.com/minhkhoa0502/zalo-personal-mcp/tree/e91ecfe0c17d29bb50fa2adc22759407604c9b92) | QR image callbacks, cookie persistence, quiet SDK options, and separate session restoration |

These references informed transport patterns. Their agent, task, memory, automation, and MCP layers are not included.

## Unofficial automation warning

Personal Zalo automation is unofficial. Zalo can change its protocol, expire sessions, disconnect clients, or suspend the account.
Whitelist checks and rate limits reduce this adapter's scope. They do not guarantee that Zalo permits automation.
No anti-bot bypass, CAPTCHA bypass, limit bypass, bulk messaging, or unsolicited outreach is implemented.
The owner must accept the account risk before authenticating a personal account.
