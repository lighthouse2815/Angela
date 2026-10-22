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

`assistant-reply` is safe model classification followed by a fixed response template.
It calls the production runtime to choose a greeting, notification, clarification, receipt, or privacy refusal.
It deliberately limits conversation to these public templates.
It does not offer unrestricted generated prose or persistent multi-turn conversations.
The model deadline is 30 seconds. Failure returns the fixed offline notification.
Provider configuration and runtime initialization are lazy, on the first authorized `assistant-reply` request.
`notify-only` needs no generation provider, model, API credential, `AngelaRuntime` instance, or runtime responder.
The CLI entrypoint imports generation setup only after dispatching Zalo and other owner commands.
Switching from notify-only to assistant-reply in the local CLI activates lazy initialization on the next eligible message.
A missing model or unavailable provider logs `runtime_failed` and returns the offline notification without stopping the listener.
Provider initialization failure remains cached until host restart. It never turns into repeated initialization attempts for each inbound DM.
A later phase can add `assistant-conversation` with bounded multi-turn history. That mode is not part of this MVP.

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
It counts retained authorized messages and successful replies by stable sender ID. Denied contacts have metadata only.
It quotes up to 20 recent messages per sender, with 500 characters per quote.
Original authorized text remains in the private audit store until retention removes its record.
Control characters are JSON-escaped before terminal display.

## Storage and delivery

`AwayModeStore` and `ZaloCredentialStore` are the business-facing persistence boundaries.
Local implementations reuse `MemoryFile`, including validation, atomic rename, private files, and cross-process write locks.
There is no new database or memory pipeline.
Only authorized messages create full per-message files. The existing 128,000-character file limit applies to individual writes.
`away_disabled`, `replay_message`, `unsupported_message`, and `self_message` do not persist message records or contact metadata.
`whitelist_denied` stores only contact ID, bounded display name, last seen, and callback count.
The contact audit retains at most 20 contacts per account and never stores message text.
Repeated denied callbacks can increase this metadata count. It is not an exact count of unique messages.

Retention runs under the single host lease on startup and before authorized claims.
The store reads record metadata once when the host starts. It does not rescan history on every incoming message.
Terminal records expire after 30 days. Capacity pruning removes the oldest eligible records first, with message hash as the tie-breaker.
The account cap is 500 records. This deliberately fits a small local MVP and bounds future per-account file growth.
Records younger than six minutes remain protected, beyond the five-minute inbound replay window and its future-clock allowance.
`received` and `sending` records remain protected regardless of age because their side effects can be uncertain.
If all 500 slots are protected, new claims fail closed without model calls or sends.
Existing accounts with over 500 protected records accept no new claims until owner review frees capacity.
Retention never deletes an active record to satisfy the cap. Such existing overflow is preserved rather than silently discarded.
An idle host cleans age-expired files on its next claim or restart. No timer or distributed cleanup worker is added.

Deleting older terminal claims shortens audit and summary history.
Recent duplicates retain their claims. Replays of deleted records still fail the timestamp policy before persistence.
Expired pending request candidates are also removed with their records. The owner must review summaries within the retention period.

Message identity hashes the authenticated account, conversation, and server message ID.
Claims persist across restart. Duplicate and already-claimed records never generate another reply.
Messages older than five minutes or over 30 seconds in the future are logged without reply.
Old-message listener events are not consumed.

Rate limits permit at most three reply attempts per sender in 60 seconds.
Durable attempts include successful, failed, and uncertain sends, across restarts and away sessions.
`reply-rates.json` holds at most 512 sender windows with three timestamps per window.
Each reservation atomically prunes elapsed timestamps, checks the sender, and persists the attempt before generation or send.
This costs at most 512 small windows, independent of historical message count.
Active windows are never evicted to admit another sender. A full rate file fails closed.
The initial rate file seeds recent attempts from the startup record index once for existing session data.
Subsequent reservations never call `records()` or read message history.
State remains account-scoped and survives host restart, Away Mode changes, and whitelist changes.
A backward clock shift retains reservations until their windows expire under the current clock.
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

## Local setup and QR login

Use Node.js 22.13 or later and the repository's pinned pnpm version.
From the repository root, install dependencies and build the CLI dependencies:

```sh
pnpm install
pnpm build:cli
```

For model classification, configure Angela's existing provider with `angela setup`, or use the existing CLI environment configuration.
For free notify-only operation, leave generation configuration unset.
A local compatible provider can use an empty API key.
Zalo transport itself needs no paid API key.
Login, status, whitelist, and Away commands do not require a model configuration.
The foreground host loads the existing provider only when an authorized `assistant-reply` request needs it.

These examples use the built executable from the repository root:

```sh
node packages/angela-cli/dist/bin/run.mjs zalo login
```

The command prints the private QR image path. Open that image locally.
Scan it with the Zalo mobile app, then confirm authentication on the phone.
The QR flow expires after three minutes or when Zalo declines or expires the code.
It never retries QR authentication without owner action.
After success, the command saves cookies, IMEI, user agent, and authenticated account ID.
It removes the QR image before exit.

```sh
node packages/angela-cli/dist/bin/run.mjs zalo status
node packages/angela-cli/dist/bin/run.mjs zalo allow 123456789
node packages/angela-cli/dist/bin/run.mjs away mode assistant-reply
node packages/angela-cli/dist/bin/run.mjs away on
node packages/angela-cli/dist/bin/run.mjs zalo run
```

Replace `123456789` with the contact's stable Zalo sender ID.
Denied inbound DMs appear in the bounded contact audit with their sender IDs, without message text.
Use `angela zalo recent` or `/zalo recent` to inspect the 20 most recent contacts from this metadata audit.
Output includes stable sender ID, bounded display name, last-seen timestamp, and callback count. It excludes message text.
JSON encoding escapes control characters in contact names before terminal display.
Contact counts reset after eviction. Contacts observed only while Away Mode is disabled are excluded.
This owner-only command does not resolve names, scan a friend directory, or grant whitelist access.
Keep the foreground host running while the owner is away.
This can run beside the regular Angela terminal process.
Starting the regular chat alone does not start a Zalo listener.

Restart `zalo run` to restore the saved session without QR login.
`zalo status` reports saved local state. Its `connection: not-probed` field does not assert a live connection.
Successful listener restoration logs `connected` after the WebSocket handshake.
If restore fails, stop the host and run `zalo login` again.

The Zalo host accepts these owner commands through its local terminal:

```text
/away on
/away status
/away mode notify-only
/away mode assistant-reply
/zalo allow 123456789
/zalo deny 123456789
/zalo allowed
/zalo recent
/away off
```

The regular interactive Angela CLI also routes these commands locally.
External Zalo senders cannot execute them.
The owner can change state from a second terminal with `angela away ...` and `angela zalo allow|deny|allowed|recent`.
`/away off` prints the deterministic session summary to the terminal that runs the command.
Ctrl+C stops the host without disabling the persisted Away state.

Stop the host before `angela zalo login` or `angela zalo logout`.
Logout erases local credentials. It does not revoke the server-side linked device.
Revoke that session in Zalo for server-side logout.
After an unclean process exit, a host or write lock can remain.
Confirm that no corresponding process runs before manually removing its stale lock.
No command automatically deletes a lock from another process.

## Local paths and VPS migration

The default data root is `~/.angela/sessions`. `ANGELA_DATA_DIR` or `--data-dir` selects another root.
All owner commands and the listener must use the same root and authenticated account.
The local storage implementations own all paths:

```text
<data-root>/zalo/
  zalo-credentials.json
  zalo-login-qr.png              # temporary, private
  zalo-host.lock                 # active host lease
  <sha256(account-id)>/
    away.json
    messages/<sha256(message-identity)>.json
    reply-rates.json             # bounded durable rate windows
    recent-contacts.json         # at most 20 contacts, no message text
```

Local today: one Angela process with a local store and a private Zalo session.
Future VPS: one Angela process with persistent storage and a secure credential store.
Away business logic, authorization, and runtime integration do not require a rewrite.
A database implementation can replace `AwayModeStore` while retaining atomic message claims and account isolation.
A vault can replace `ZaloCredentialStore`. The host composition owns the future distributed lease choice.
This MVP deploys neither a VPS nor a distributed worker.

Before VPS deployment:

1. Complete the real-account acceptance flow below.
2. Run one listener per account and use durable storage across restarts.
3. Restrict storage permissions and protect backups of credentials and external message logs.
4. Select a secure credential implementation or an encrypted persistent volume.
5. Configure the existing model provider without source-controlled secrets.
6. Define audit retention and disk capacity monitoring before logs become large.
7. Configure supervised shutdown and visible disconnect alerts.
8. Review session revocation, protocol compatibility, and the risk of account suspension.

Use the built-in retention policy. Do not manually delete recent or unfinished claims without reviewing duplicate-delivery consequences.

## Real-account acceptance

Automated tests mock the Zalo transport boundary. They do not authenticate a real account.
Live status: **pending owner acceptance test**. The owner must complete these steps:

1. Authenticate with `zalo login` and scan the QR code.
2. Start `zalo run`, stop it, and restore the session without another QR scan.
3. Whitelist one stable contact ID and inspect `zalo recent`.
4. Enable Away Mode and select the intended reply mode.
5. Send a whitelisted text DM and confirm the public Angela identity in the reply.
6. Send a non-whitelisted DM and confirm that no reply arrives.
7. Send a privacy request and confirm that no private owner information is disclosed.
8. Request privileged tools and confirm that no action or owner commitment occurs.
9. Disable Away Mode and inspect the attributed summary and pending candidates.

Until this flow passes, this repository provides a tested implementation, not verified live Zalo delivery.

## Rebase and merge preparation

This branch is rebased onto main commit `840cb5611223a2a5c99b867e526bc9019028c8e4`.
The final fetch and rebase completed without conflicts.
The previous rebase resolved a warning callback conflict in `RuntimeSession.send()`.
That resolution keeps main's bounded warning collection and adapter notification, then excludes Zalo from private context and memory capture.
The new memory-disabled context policy remains unchanged.
The event union keeps `external.message` separate from owner `user.message`.
The final diff contains no edits to companion generation or recall evaluation data, reports, harnesses, or runners.
The workspace catalog and lockfile preserve main's evaluation importer and add only the pinned Zalo transport dependencies.
The CLI entrypoint retains its existing command routing and loads generation setup only when a command needs it.

## Automated verification on 2026-10-22

The CLI suite includes transport, retention, persistent rate windows, runtime isolation, owner commands, and existing adapter regression tests.
The Zalo transport and model network boundaries use mocks. No real account was authenticated.
Tests cover the classification boundary, not live Zalo delivery or unrestricted conversation quality.

| Command | Result |
| --- | --- |
| `pnpm -F @angela/cli exec vitest run --maxWorkers=2` | 460 tests passed across 57 files, including 45 Zalo/Away tests |
| `pnpm -F @angela/cli exec vitest run src/adapters/zalo src/away src/zalo-command.test.ts src/zalo-host.test.ts --maxWorkers=2` | 45 Zalo/Away tests passed across seven files |
| `pnpm -F @angela/evals-companion-generation test` | 71 tests passed across two files |
| `pnpm -F @angela/evals-companion test` | 45 recall evaluation and regression tests passed across two files |
| `pnpm -F @angela/evals-companion-generation check:dataset` | 57 cases, 12 categories, 29 rules passed schema checks |
| `pnpm -F @angela/evals-companion check:dataset` | 128 cases across 16 categories passed schema checks |
| `pnpm -F @angela/evals-companion-generation typecheck` | Passed |
| `pnpm -F @angela/evals-companion typecheck` | Passed |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm typecheck --concurrency=1 --force` | 53 workspace tasks passed without cached results, including CLI and i18n |
| `pnpm lint` | Passed with zero errors and 603 warnings in existing code |
| `pnpm build:cli` | Passed, including CLI dependencies |
| `git diff --check` and `git diff --check origin/main...HEAD` | Passed |

Verification adds `--config.verify-deps-before-run=false` to pnpm commands to prevent implicit dependency installation in this worktree.
The installed pnpm bootstrap lacks an executable shebang. Turbo verification uses a temporary shell wrapper outside the repository.
Neither measure changes project source, dependency versions, validation rules, or compiler configuration.
The four-gigabyte Node heap supports the repository's Vue typechecks. Two Vitest workers limit resource contention.
An initial test run overlapped dependency builds and failed while `dist` files were absent. It also reported a timeout under concurrent load.
The final test runs followed the completed build and full typecheck, with no concurrent build.
No test, timeout, validation rule, or production source changed to obtain these results.
The built CLI also returned `{"savedSession":false,"connection":"not-probed"}` from `zalo status` without a configured model.
No paid live generation ran. Real-account Zalo status remains **pending owner acceptance test**.
