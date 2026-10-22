# Implicit companion follow-up implementation audit

Date: 2026-10-23

## 1. Inspected main

GitHub `main`: `46212a2a54d5951a30a2893f5402589bac9e4c27`.
The clean checkout was `airi/` under the supplied workspace directory.
A fetch through the existing GitHub credential helper confirmed the baseline before implementation.

## 2. Problems found

- Generic `create`, `add`, and `save` authorized task tools for technical objects.
- Meta framing after the action escaped the classifier.
- Recent references collapsed separate events and preferred pending tasks over the latest conversational focus.
- There was no independent persisted domain for meaningful unresolved conversation threads.
- Review found additional technical-noun phrases, a domain turn-boundary mismatch, and event timing across daylight saving changes.

The initial regression run reproduced seven failures before the first fix.
Review tests separately reproduced four technical-object failures and one daylight saving failure before correction.

## 3. Architecture before

```text
Explicit user request -> commitment classifier -> local extraction or task tools
                      -> Tasks / MemoryFile -> task-derived ProactiveCandidate
                      -> ProactivePolicy -> ReminderScheduler -> ReminderNotifier
Task events -> CommitmentMemoryProjection -> historical memory and bounded current task context
Recent task references -> pending-first contextual resolver
```

Task persistence, leases, recurrence, recovery, explicit follow-ups, and memory projection already existed.

## 4. Architecture after

```text
Explicit task request -> existing Task path -----------------------+
                                                                 |
Unresolved current statement -> OpenLoopConversation -> OpenLoops -+-> existing ReminderScheduler
                                             OpenLoopSource ------+   -> shared ProactivePolicy
                                                                      -> CLI / Telegram text
                                                                      -> scoped focus group
                                                                      -> exact resolution or dismissal
```

The scheduler accepts optional `ProactiveSource` instances after its existing task-delivery path.
There is no second scheduler, semantic-memory scan, new dependency, or backend.
Task schemas, Task persistence, task leases, restart recovery, and CommitmentMemoryProjection remain intact.

## 5. Intent guard

`classifyCommitmentIntent` remains the shared authorization boundary for extraction and task tools.
English task authority requires semantic task phrases. Generic verbs cannot grant it.
Meta framing is checked before and after the action.
Technical constructions such as `Create a task parser` and `Add a reminder timestamp validator` are also rejected.
Direct reminders about running parser tests remain valid.

## 6. Focus resolution

One event creates one group. Only the latest group exists in current focus state.
A group with multiple identities stays ambiguous even when only one member remains pending.
Completed, missing, expired, or oversized latest focus never selects an older Task.
Unrelated replies preserve focus. Verified IDs or complete task-title phrases can establish a new group.
Task and OpenLoop handlers advance focus at the same request boundary.
IDs are scoped by workspace, session, and channel, with eight identities, eight requests, and six hours as limits.

## 7. OpenLoop domain

`OpenLoops` owns identities, subjects, kinds, provenance, lifecycle, confidence, salience, timing, prompt counts, suppression, and claims.
Kinds are problem, work in progress, waiting, upcoming event, and goal.
States are open, resolved, expired, and dismissed.
OpenLoops remain separate from Tasks and historical memory.
Fresh unresolved statements can reopen dismissed or expired work with a new identity.

## 8. Extraction rules

Deterministic Vietnamese rules accept current unresolved work and the supplied concrete examples.
They reject quotations, examples, hypotheticals, uncertain statements, historical incidents, feelings alone, preferences, and casual observations.
Unsupported wording produces no persisted loop.
Subjects use normalized equality within a workspace. Authentication aliases share one logical key.
Repeated mentions preserve the cap and original expiry while refreshing activity and salience.
Named outcomes use subject normalization. Generic completion and dismissal require exact focus.

## 9. Proactive eligibility

- Confidence is at least 0.95 and salience is at least 0.7.
- The loop is open, unexpired, unsuppressed, and unprompted.
- Problems and unfinished work wait four hours and expire after 48 hours.
- Waiting threads wait 12 hours and expire after seven days. Goals wait 12 hours and expire after 48 hours.
- Tomorrow's events wait until 09:00 after their full local event date. Calendar conversion handles daylight saving changes.
- Each update adds four hours of inactivity. Conversation activity adds at least 15 minutes of deferral.
- Frequent conversation adds a one-hour activity deferral. Active runtime requests block implicit delivery.
- Implicit quiet hours default to 22:00–08:00. Existing configuration can replace that interval.
- One loop permits one attempt. One user store permits one implicit attempt per eight hours.

## 10. Task suppression

A pending equivalent Task dismisses the implicit loop and records its Task ID.
Task observers apply suppression after persistence. Source reconciliation repairs observer failures and external Task writes.
The source rechecks fresh Task state immediately before presentation.
Later implicit mentions do not create another loop while the equivalent Task remains pending.

## 11. Persistence and restart guarantees

Private `open-loops/state.json` uses existing MemoryFile validation, cross-process locks, and atomic rename.
Pre-presentation claims expire after 30 seconds and use fencing tokens.
Failures before reservation retry after 60 seconds.
The one-shot prompt count and global cooldown commit immediately before external presentation.
Repeated restart cannot reset them or duplicate that implicit attempt.
A crash after reservation can lose a question. This is at-most-once delivery, not exactly-once network receipt.
Task reminders retain their existing at-least-once acknowledgment contract.
Corrupted loop storage remains untouched and cannot stop Task delivery.

## 12. Privacy

Request provenance and existing personal, automatic, and recall controls gate implicit writes and delivery.
Unavailable controls fail closed. Model output cannot grant consent.
Protected requests create no loop, Task projection, or proactive candidate.
The privacy integration test also checks zero memory pages and zero observations.
Global events contain only IDs, reasons, and lifecycle metadata.
Focus never crosses another session or channel. Same-user notification routing can establish its exact destination focus.

## 13. Exact changed files

Paths are relative to the repository root.

```text
docs/ai/adr/2026-10-22-commitment-follow-up.md
docs/ai/adr/2026-10-23-implicit-companion-follow-up.md
docs/ai/audits/implicit-companion-follow-up.md
packages/angela-cli/README.md
packages/angela-cli/src/active-commitments.test.ts
packages/angela-cli/src/active-commitments.ts
packages/angela-cli/src/bin/run.ts
packages/angela-cli/src/commitment-conversation.test.ts
packages/angela-cli/src/commitment-conversation.ts
packages/angela-cli/src/commitment-extraction.test.ts
packages/angela-cli/src/commitment-intent.ts
packages/angela-cli/src/open-loop-conversation.ts
packages/angela-cli/src/open-loop-extraction.test.ts
packages/angela-cli/src/open-loop-extraction.ts
packages/angela-cli/src/open-loop-scenario.test.ts
packages/angela-cli/src/open-loop-source.test.ts
packages/angela-cli/src/open-loop-source.ts
packages/angela-cli/src/open-loops.test.ts
packages/angela-cli/src/open-loops.ts
packages/angela-cli/src/proactive-candidate.ts
packages/angela-cli/src/proactive-policy.ts
packages/angela-cli/src/reminder-notifications.ts
packages/angela-cli/src/reminder-scheduler.ts
packages/angela-cli/src/runtime/context-builder.ts
packages/angela-cli/src/runtime/events.ts
packages/angela-cli/src/runtime/runtime.ts
packages/angela-cli/src/task-tools.test.ts
packages/angela-cli/src/telegram.ts
packages/i18n/src/cli.ts
```

## 14. Tests

Added:

- `open-loop-extraction.test.ts`: accepted statements, false positives, outcomes, timing, and daylight saving.
- `open-loops.test.ts`: durable caps, dedupe, reopening, claim fencing, retention, privacy, observer failure, and corrupted storage.
- `open-loop-source.test.ts`: retries, uncertain presentation, fresh privacy and Task checks, paused output, quiet hours, and burst caps.
- `open-loop-scenario.test.ts`: complete runtime flow, three restarts, unavailable model, exact focus, dismissal, suppression, privacy, and Task isolation.

Updated:

- `active-commitments.test.ts`: latest group, inactive focus, removed IDs, title mentions, and batch ambiguity.
- `commitment-conversation.test.ts`: latest-event semantics and clarification after inactive focus.
- `commitment-extraction.test.ts`: semantic English task phrases and suffix meta framing.
- `task-tools.test.ts`: direct model-bypass regressions for technical and meta requests.

The existing commitment scenario, scheduler, recurrence, process, memory, and integration suites also passed in the complete CLI run.

## 15. Exact validation results

| Command | Result |
| --- | --- |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli test --maxWorkers=2` | PASS. 71 files, 716 tests, 75.58 seconds. |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli typecheck` | PASS. Exit 0. |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli build` | PASS. Exit 0. |
| `pnpm --config.verify-deps-before-run=false -F @angela/i18n typecheck` | PASS. Exit 0. |
| `pnpm --config.verify-deps-before-run=false -F @angela/i18n build` | PASS. Exit 0. |
| `pnpm --config.verify-deps-before-run=false lint` | PASS. Exit 0. Zero errors, 603 existing warnings outside changed files. |
| `git diff --check` | PASS. |
| `pnpm --config.verify-deps-before-run=false typecheck --concurrency=2` | BLOCKED by the installed pnpm shim, then OOM in unchanged `@angela/stage-ui` after retry. |

The first root run stopped with `Exec format error (os error 8)` because the installed pnpm launcher has no shebang.
A temporary shell wrapper outside the repository made Turbo start package checks.
That retry completed 46 tasks before `@angela/stage-ui` exhausted its roughly 2 GB JavaScript heap and exited 129.
No workspace configuration or unrelated source was changed to hide this failure.

The first Git hook also triggered dependency verification and hit the same launcher failure.
Targeted lint and checks ran manually before the first commit.
Later commits ran the normal staged-file hook through the temporary wrapper.
No dependencies or lockfiles changed.

## Adversarial review

| Check | Evidence |
| --- | --- |
| Generic verbs and technical noun phrases | Task-tool regressions reject direct bypass attempts. |
| Meta discussion before or after the action | Extraction and tool tests reject examples and code discussions. |
| Older pending fallback after latest focus becomes inactive | Resolver and runtime snooze tests clarify without editing older work. |
| Spam after restart | Repeated restart tests retain the one-shot cap. |
| Task plus OpenLoop duplicates | Runtime suppression and fresh pre-presentation Task tests pass. |
| Cross-session focus leakage | Exact session/channel tests and unrelated-session runtime resolution pass. |
| Privacy bypass | Store guards and zero-capture integration test pass. |
| Unbounded stores or context | 50 open, 30 inactive, eight focus IDs, eight activity timestamps, and six context summaries. |
| State inferred from stale memory | Only OpenLoops owns lifecycle and candidate state. |
| Model required for delivery | Generation throws after creation. Fallback delivery and resolution still pass. |
| Observer failure affecting authoritative state | Throwing metadata observer cannot reject persisted domain transitions. |
| Presentation crash and lease expiry | Reservation cap prevents replay. Expired claim tokens cannot present. |

## 16. Remaining limitations

The grammar is conservative and mainly Vietnamese. It does not cover arbitrary topics or arbitrary event dates.
Authentication aliases can over-merge distinct problems. Other subjects require normalized equality.
Implicit prompts require a running CLI or private Telegram companion host. Standalone desktop service and implicit voice are outside this change.
At-most-once delivery accepts possible loss after reservation.
OpenLoop history is separate from semantic-memory purge commands. Resolve or dismiss the focused thread to stop prompting.
Root workspace typecheck remains incomplete because of the unrelated stage-ui OOM.

## 17. One next milestone

Evaluate extraction and dedupe against a consented Vietnamese conversation corpus before expanding the grammar.

## Commits

- `95531c2`: intent and latest-focus corrections. Pushed to `origin/main`.
- `488bf93`: implicit OpenLoop foundation. Pushed to `origin/main`.
- This audit accompanies the final review-fix commit, which includes technical-object guards, shared turn boundaries, and calendar timing.
