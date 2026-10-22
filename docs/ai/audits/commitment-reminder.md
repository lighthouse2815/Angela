# Reminder, commitment, and proactive companion audit

Source baseline: GitHub `origin/main` at `dc2e7f3`, fetched before implementation on 2026-10-23.
Target branch: `main`. This report describes the resulting code, not the earlier implementation report.

## 1. Before

`Tasks` already owned atomic JSON persistence, task transitions, recurrence, deduplication, and notification leases.
`ReminderScheduler` already renewed leases, retried failures, and recovered overdue reminders.
`ProactivePolicy` already checked quiet hours, per-task cooldown, and priority.
`follow_up` already existed in the task schema and task tools.
`RuntimeSession.send` coordinated privacy, extraction, context, model tools, and memory capture.
`MemoryCapture` wrote current commitment pages. `buildContext` reconciled every retained task on each request.
Conversational controls searched the last assistant turn. CLI notifications entered history. Telegram delivery lacked an equivalent durable reference.

## 2. Problems found in main

- Local extraction and model tools used different regex guards. Meta discussion and code quotations remained vulnerable.
- Model context serialized all pending, completed, and cancelled tasks on every request.
- Every normal request compared every task against commitment memory records.
- An unrelated assistant answer discarded the active task reference.
- The follow-up type had no local explicit extractor, explainable candidate model, or persisted prompt lifecycle.
- Offline follow-up eligibility lacked expiry, burst suppression, and recent-activity policy.
- The delivered reminder event used wall time despite an injected clock.
- `8h tối nay` overlapped the calendar and hour matches and incorrectly required clarification.

## 3. Architecture after

```text
Conversation
  -> request privacy
  -> shared CommitmentIntent guard
  -> CommitmentConversation / guarded task tools
  -> Tasks -> locked atomic JSON
       -> typed task events
       -> Recall -> CommitmentMemoryProjection -> commitment:<taskId>
       -> ReminderScheduler
            -> ProactiveCandidate (task + occurrence identity)
            -> ProactivePolicy
            -> fenced renewable claim
            -> deterministic notification
            -> atomic delivery acknowledgment and follow-up state
            -> ActiveCommitments (workspace + session + channel)
            -> unrelated conversation
            -> complete / snooze / cancel
            -> task events -> current memory projection
            -> next explicitly scheduled occurrence
```

Task storage remains authoritative. Candidates derive from tasks and require no second database.
The existing task subscription and runtime event bus remain in use.
No dependency, backend, broker, new event bus, model abstraction, or agent subsystem was added.

## 4. Exact changed files

Paths are relative to the repository root. The list covers all commits from the inspected baseline and this final implementation.

- `docs/ai/adr/2026-10-22-commitment-follow-up.md`
- `docs/ai/audits/commitment-reminder.md`
- `packages/angela-cli/README.md`
- `packages/angela-cli/src/active-commitments.test.ts`
- `packages/angela-cli/src/active-commitments.ts`
- `packages/angela-cli/src/bin/run.ts`
- `packages/angela-cli/src/commitment-context.ts`
- `packages/angela-cli/src/commitment-conversation.test.ts`
- `packages/angela-cli/src/commitment-conversation.ts`
- `packages/angela-cli/src/commitment-extraction.test.ts`
- `packages/angela-cli/src/commitment-extraction.ts`
- `packages/angela-cli/src/commitment-intent.ts`
- `packages/angela-cli/src/commitment-scenario.test.ts`
- `packages/angela-cli/src/evaluation.ts`
- `packages/angela-cli/src/memory-v2/commitment-projection.test.ts`
- `packages/angela-cli/src/memory-v2/commitment-projection.ts`
- `packages/angela-cli/src/memory-v2/consolidator.ts`
- `packages/angela-cli/src/privacy-policy.ts`
- `packages/angela-cli/src/proactive-candidate.ts`
- `packages/angela-cli/src/proactive-policy.test.ts`
- `packages/angela-cli/src/proactive-policy.ts`
- `packages/angela-cli/src/recall.ts`
- `packages/angela-cli/src/reminder-notifications.ts`
- `packages/angela-cli/src/reminder-scheduler.ts`
- `packages/angela-cli/src/reminder-time.ts`
- `packages/angela-cli/src/reminders.ts`
- `packages/angela-cli/src/runtime/context-builder.test.ts`
- `packages/angela-cli/src/runtime/context-builder.ts`
- `packages/angela-cli/src/runtime/events.ts`
- `packages/angela-cli/src/runtime/privacy-boundary.test.ts`
- `packages/angela-cli/src/runtime/runtime.ts`
- `packages/angela-cli/src/runtime/tool-registry.ts`
- `packages/angela-cli/src/task-cli.ts`
- `packages/angela-cli/src/task-commands.ts`
- `packages/angela-cli/src/task-process.test.ts`
- `packages/angela-cli/src/task-schema.ts`
- `packages/angela-cli/src/task-time.ts`
- `packages/angela-cli/src/task-tools.test.ts`
- `packages/angela-cli/src/task-tools.ts`
- `packages/angela-cli/src/tasks.ts`
- `packages/angela-cli/src/telegram.ts`
- `packages/i18n/src/cli.ts`

## 5. Intent protection

`classifyCommitmentIntent` distinguishes create, follow-up, meta, hypothetical, quoted, negative, uncertain, and absent intent.
Local extraction and `task_create` use the same result. Tool authorization reads the host-owned user request, never model arguments.
Missing provenance, parser discussion, examples, quotations, code, predictions, hypothetical statements, and multiple actions reject automatic creation.
Meta, hypothetical, quoted, and uncertain requests also cannot mutate an existing task through another task tool.
Explicit negative cancellation remains available. A request to avoid cancellation cannot authorize cancellation.
Technical subjects containing `test`, `parser`, or `hệ thống` remain valid after a direct imperative.
Separate direct task clauses can use model tools without consuming unrelated user statements locally.

## 6. Context optimization

Before: every retained pending, completed, and cancelled task entered every model request.
After: `commitmentContext` selects deterministic, bounded groups.

| Group | Maximum | Selection |
| --- | ---: | --- |
| Overdue | 8 | Pending and past due |
| Due today | 8 | Pending and not already overdue |
| Upcoming | 6 | Earliest future local dates |
| Unscheduled | 5 | Pending without a date or alarm |
| Recently completed | 3 | Latest completion within seven days |
| Cancelled | 0 | Explicit tools or retrieval only |

The prompt states that omitted tasks are not absent.
`task_list` still queries retained history. Existing storage retention remains unchanged, including the inactive-history limit.
The context regression supplies 10 pending, 50 completed, and 30 cancelled records at the storage boundary.
It checks six relevant upcoming records, queryable omitted history, and zero request-path commitment repair calls.

## 7. Memory projection

Successful task writes publish typed created, updated, completed, cancelled, snoozed, and delivered events.
Recall reloads the affected authoritative task and projects only its `commitment:<taskId>` key.
The existing SQL uniqueness constraint permits one current page for each scope, tier, and key.
Repeated identical events preserve the current version. Transitions supersede the current page instead of duplicating active pages.
MemoryCapture retains dated observations and episodes. It no longer owns current commitment pages.

Startup, five-minute reconciliation, and `repairCommitments(true)` repair external writes and projection failures.
Host-owned task scope and source-session metadata authorize recovery of a missing initial page.
Model arguments cannot supply this provenance. Memory-disabled task creation does not grant it.
Suppression prevents recovery from recreating forgotten content.
Projection errors leave the authoritative task intact. A later repair updates its current page.
Projection follows actual task state even after the injected clock moves backward.

## 8. Active commitment context

`ActiveCommitments` retains at most eight task IDs, source labels, timestamps, and bounded request counts.
Its private file identity includes data directory, workspace, session ID, and channel.
CLI and Telegram record the destination session after successful presentation, including cold runtime contexts.
Verified task mutations and current assistant mentions also update that conversation's reference state.
No protected task title or conversation text enters the reference file.

References expire after eight requests or six hours. Oversized batches require clarification.
An unrelated answer does not discard a recent reference.
`Xong rồi`, `2 tiếng nữa nhắc lại`, and `Không cần nhắc cái đó nữa` resolve the recent pending reference.
Several candidates, expired references, and absent references produce the existing clarification response.
An explicit title must match the selection clause. Generic control words cannot accidentally select a task with the same title.
Persistent runtime references use their own timestamps. Another channel's task-delivery timestamp cannot revive an expired reference.
Session reset clears only that session's references.

## 9. Proactive companion

Explicit Vietnamese follow-up requests use the existing `follow_up` task type.
Supported requests include all four requested examples, plus an unfinished activity followed by an explicit request to ask tomorrow.
A contextual subject uses the preceding user topic. Missing context requires clarification.
Casual conversation never becomes a follow-up candidate automatically.

Coarse follow-ups use 09:00 locally. Afternoon uses 15:00. Evening uses 19:00.
The saved confirmation exposes the selected time. Explicit hours take precedence.
Reminder alarms without an hour still require clarification.

Candidates carry a stable task/occurrence identity, traceable reason, subject, source ID, priority, confidence, relevance, earliest time, and expiry.
Policy checks relevance, completion, confidence, duplicate suppression, expiry, quiet hours, cooldown, and recent activity.
The default recent-activity delay is two minutes. The default shared-store follow-up interval is thirty minutes.
Each batch contains at most one follow-up. Atomic claims also fence distinct follow-ups across concurrent hosts.
Active leases defer competing follow-ups without busy polling.

Task state persists `promptCount`, `lastPromptedAt`, `nextEligibleAt`, `expiresAt`, and `resolvedAt`.
A successful prompt acknowledges its occurrence. It never repeats at each startup.
Unprompted follow-ups expire after forty-eight hours and persist a skipped occurrence.
Expired recurring follow-ups advance to their next future calendar occurrence.
Snooze opens a new occurrence while preserving identity. Completion and cancellation resolve the follow-up.
Text, voice, and desktop wording use deterministic localized templates. Delivery requires no model.
`proactive.prompted` exposes candidate identity and reason through metadata-only events.

## 10. Restart guarantees

Task creation, occurrence claims, acknowledgment, snooze, and resolution survive normal restart.
A due follow-up recovers once while relevant. Repeated restart does not repeat an acknowledged prompt.
Expired work is skipped. Several missed follow-ups cannot produce a startup burst.
Notification failure does not increment prompt count. The existing backoff and lease expiry retain retryability.
Renewal and token fencing prevent stale owners from acknowledging changed occurrences.
Reference state also survives restart under the exact conversation identity.

A crash after external presentation and before acknowledgment can repeat the external notification.
Exactly-once external presentation requires an idempotent notification destination. The local engine retains at-least-once recovery.

## 11. Tests

New files:

- `active-commitments.test.ts`: restart, workspace/session/channel isolation, TTL, external-channel timestamp revival, and oversized batches.
- `memory-v2/commitment-projection.test.ts`: one current identity, snooze, completion, memory failure, repair, external writers, clock rollback, and suppression.
- `runtime/context-builder.test.ts`: 90-record history, bounded prompt, on-demand history, and absence of request-path repair.

Expanded suites:

- `commitment-extraction.test.ts`: requested adversarial categories, positive reminders, explicit follow-ups, day parts, and direct technical subjects.
- `task-tools.test.ts`: model bypass protection with absent memory capability and rejected meta mutations.
- `runtime/privacy-boundary.test.ts`: hostile model calls and protected follow-up requests.
- `commitment-conversation.test.ts`: unrelated replies, stale and ambiguous references, contextual subjects, and explicit memory-disabled tasks.
- `commitment-scenario.test.ts`: scenarios A, C, D, and E with real storage, injected clocks, unrelated model turns, and three follow-up restarts.
- `proactive-policy.test.ts`: confidence, relevance, expiry, activity, cooldown, burst suppression, notifier failure, leases, concurrent hosts, and recurring expiry.
- `task-process.test.ts`: real OS-process claim fencing for both reminders and follow-ups.

Scenario B rejects the meta request both locally and through a malicious model call.
Scenario F rejects protected durable storage before tasks, memory projection, or candidates can exist.
Existing busy-storage, corrupt-file, recall-unavailable, crash-during-write, notifier-failure, timezone, quiet-hours, and lease regressions remain active.

## 12. Validation

| Exact command | Result |
| --- | --- |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli test --maxWorkers=2` | Passed: 67 files, 629 tests |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli typecheck` | Passed |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli build` | Passed |
| `pnpm --config.verify-deps-before-run=false -F @angela/i18n typecheck` | Passed |
| `pnpm --config.verify-deps-before-run=false -F @angela/i18n build` | Passed |
| `pnpm --config.verify-deps-before-run=false lint` | Passed: zero errors, 603 existing ESLint warnings |
| `pnpm_config_verify_deps_before_run=false <installed-pnpm> typecheck --concurrency=2` | 46 successful workspaces, then unrelated stage-ui heap exhaustion, exit 129 |
| `git diff --check` | Passed |

`<installed-pnpm>` is the existing executable at:

```text
/home/lighthouse2815/.local/share/pnpm/package-manager-store/v11/links/@pnpm/exe/11.24.0/06ccdf6de568f896aaf7e8cb1d131c7165bddd978d4494af0cf8affbb14c0c5b/node_modules/@pnpm/exe/pnpm
```

Its directory was prepended to PATH for the root typecheck.
`stage-ui` failed at the default heap limit near 2 GB. That package has no changes and does not import the CLI.
Current CLI and i18n package checks passed independently.
Focused ESLint and the repository pre-commit check also run on the changed code.

Builds and consuming tests run sequentially to preserve package export artifacts.
One intermediate run overlapped i18n artifact cleanup and test imports. The final run follows completed builds.
Root typecheck uses the installed pnpm executable because the global launcher cannot be spawned reliably by Turbo.
No live model service, physical audio device, or desktop notification daemon is required by these tests.

## 13. Remaining limitations

The local grammar is intentionally conservative. Unsupported direct requests can use the existing guarded structured tools.
Automatic companion follow-up comes from explicit authoritative tasks. Unrequested episodic inference remains outside this foundation.
The existing inactive task retention limit still applies to direct task-history queries.
Terminal delivery needs a running host. The optional Linux service retains its existing desktop notification behavior.
Discord and Zalo retain their existing capability and privacy boundaries. Separate web and Electron task interfaces are unchanged.
Exactly-once presentation across an external side-effect crash boundary remains unavailable without destination idempotency.
The root workspace typecheck remains blocked by unrelated stage-ui heap exhaustion.

Reminder milestone: DONE. Proactive companion foundation: DONE.

## 14. Next recommended milestone

Voice Interaction Reliability: improve interruption handling and turn-taking in the existing voice conversation flow.
