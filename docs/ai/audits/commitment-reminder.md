# Commitment and reminder implementation report

## 1. Existing architecture

The active repository is `airi/`, with CLI, messaging, Vue web, and Electron applications.
The implementation targets `packages/angela-cli` and its existing shared runtime.

Terminal input enters `bin/run.ts`, then `RuntimeSession.send`, `Chat.send`, and `core-agent.streamFrom`.
`provider-inference` owns provider adapters. `Context` owns compaction. `Sessions` owns durable portable conversation history.
`Tasks` already owns task state. `MemoryFile` owns atomic local JSON storage.
`ReminderScheduler` already owns claims, leases, retries, recurrence, and overdue recovery.
Memory-v2 uses SQLite and FTS for episodic, semantic, and procedural memory.
Runtime lifecycle events use the existing metadata event bus. Electron uses Eventa and injeca at process boundaries.
`local-config`, environment variables, and CLI flags provide configuration.

## 2. Problems found

Time interpretation depended entirely on model timestamps.
Repeated creation produced duplicate pending tasks.
Reminder eligibility lacked a separate proactive policy.
Memory retained task history without a current per-task record.
Standalone task commands were absent.
Task writer locks lacked owner metadata, which blocked automatic recovery after a crashed write.

## 3. Resulting architecture

```text
Conversation
  -> privacy boundary
  -> CommitmentConversation
     -> extractCommitment
     -> parseReminderTime
     -> Tasks -> MemoryFile -> atomic JSON
     -> verified domain event -> MemoryCapture
     -> Chat.respond -> existing output and session persistence

Unsupported wording
  -> existing context builder and validated model tools
  -> intent guard -> Tasks

ReminderScheduler
  -> ProactivePolicy
  -> persisted occurrence claim
  -> notification adapter
  -> acknowledgment and persisted delivery history
  -> conversation-local reference
  -> snooze / complete / cancel
```

No additional database, model provider, broker, service, or dependency was introduced.
The existing optional Linux reminder service remains available.

## 4. Changed files

Paths are relative to the repository root.

- `docs/ai/adr/2026-10-22-commitment-follow-up.md`
- `packages/angela-cli/README.md`
- `packages/angela-cli/src/bin/run.ts`
- `packages/angela-cli/src/chat.ts`
- `packages/angela-cli/src/cli.test.ts`
- `packages/angela-cli/src/clock.ts`
- `packages/angela-cli/src/commitment-conversation.test.ts`
- `packages/angela-cli/src/commitment-conversation.ts`
- `packages/angela-cli/src/commitment-extraction.test.ts`
- `packages/angela-cli/src/commitment-extraction.ts`
- `packages/angela-cli/src/commitment-scenario.test.ts`
- `packages/angela-cli/src/file-lock.ts`
- `packages/angela-cli/src/memory-file.ts`
- `packages/angela-cli/src/memory-v2/consolidator.ts`
- `packages/angela-cli/src/privacy-policy.ts`
- `packages/angela-cli/src/proactive-policy.test.ts`
- `packages/angela-cli/src/proactive-policy.ts`
- `packages/angela-cli/src/recall.ts`
- `packages/angela-cli/src/reminder-notifications.test.ts`
- `packages/angela-cli/src/reminder-notifications.ts`
- `packages/angela-cli/src/reminder-scheduler.ts`
- `packages/angela-cli/src/reminder-time.ts`
- `packages/angela-cli/src/reminders.ts`
- `packages/angela-cli/src/runtime/context-builder.ts`
- `packages/angela-cli/src/runtime/events.ts`
- `packages/angela-cli/src/runtime/privacy-boundary.test.ts`
- `packages/angela-cli/src/runtime/runtime.ts`
- `packages/angela-cli/src/runtime/tool-registry.ts`
- `packages/angela-cli/src/sessions.ts`
- `packages/angela-cli/src/task-cli.test.ts`
- `packages/angela-cli/src/task-cli.ts`
- `packages/angela-cli/src/task-commands.ts`
- `packages/angela-cli/src/task-conversation.test.ts`
- `packages/angela-cli/src/task-process.test.ts`
- `packages/angela-cli/src/task-retention.test.ts`
- `packages/angela-cli/src/task-schema.ts`
- `packages/angela-cli/src/task-time.ts`
- `packages/angela-cli/src/tasks.test.ts`
- `packages/angela-cli/src/tasks.ts`
- `packages/i18n/src/cli.ts`

This report is an additional documentation file.

## 5. Commitment flow

Explicit supported Vietnamese requests create tasks before model generation.
Date-only requests ask for clarification without saving an alarm.
Predictions, examples, quotations, and negations cannot authorize model-created tasks.
A short time answer completes the immediately preceding date-only reminder request.
Natural controls resolve the latest assistant task reference or an explicit task title.
Multiple candidates and stale references require clarification.

## 6. Persistence

The source of truth remains `<data-dir>/tasks/tasks.json`.
Each mutation validates the complete state, acquires a writer lock, and atomically renames a private temporary file.
New writer locks atomically publish complete PID and hostname metadata through a hard link.
A same-host dead process permits recovery. Active and unknown owners remain protected.
The existing storage and history bounds remain in force. Pending tasks are never pruned.
Identical pending creations reuse their saved ID under the storage lock.
Snooze preserves identity and increments its count.

## 7. Scheduler

The existing bounded timer selects due pending occurrences without busy polling.
Proactive policy supports optional quiet hours, per-task cooldown, and notification priority.
Deferred occurrences remain pending. Persisted timestamps preserve cooldown after restart.
The scheduler batches overdue startup reminders, claims each occurrence, renews its lease, and acknowledges successful presentation.
Completed, cancelled, and acknowledged occurrences cannot fire again during normal operation.
Local mutations trigger reconciliation. External changes reconcile within one minute.

## 8. Memory integration

Verified transitions write a versioned episodic record keyed by commitment ID.
Completion supersedes the current pending record. Dated session history remains historical evidence.
Current task snapshots override old task descriptions during generation.
Recall repairs existing commitment records after cross-channel state changes.
Task storage remains separate from semantic and vector memory.
Automatic-memory switches and protected-request policy still apply.

## 9. Commands

```sh
angela tasks
angela tasks all
angela task show ID
angela task done ID
angela task snooze ID 2h
angela task cancel ID
```

These standalone commands need no model configuration.
The existing `/tasks`, `/today`, `/done`, `/cancel`, and `/snooze` chat commands remain available.
`ANGELA_TIMEZONE` selects the reminder timezone. Each task also retains its own timezone.

## 10. Tests

New tests cover extraction, Vietnamese time parsing, ambiguous dates, timezone boundaries, and DST ambiguity.
Conversation tests cover persistence, clarification, contextual control, privacy, stale references, and inactive tasks.
Policy tests cover quiet-hour deferral, persisted cooldown, priority, and invalid configuration.
Standalone command tests run real CLI processes without a model.
The full scenario uses real task storage, saved sessions, memory, and an injected fake clock.
It runs creation, restart, 09:00 delivery, two-hour snooze, 11:00 delivery, completion, and memory update.
The supported scenario makes no model requests.
A separate process test uses SIGKILL during a locked write, then checks recovery and single delivery.
Existing scheduler, concurrent-claim, lease, retry, corruption, retention, recurrence, and privacy regressions remain active.

## 11. Validation

Commands used the local pnpm setting `--config.verify-deps-before-run=false`.
The installed pnpm launcher otherwise triggered unrelated postinstall execution and an `Exec format error`.
The repository pre-commit command ran explicitly through pnpm with that setting before each commit.

- CLI full suite: 563 tests passed across 64 files.
- CLI typecheck: passed.
- i18n typecheck: passed.
- CLI build: passed.
- i18n build: passed.
- Root lint: completed with zero errors and 603 existing warnings.
- Focused ESLint: passed for changed implementation and tests.
- Root typecheck: 46 workspaces succeeded before stage-ui exhausted the default Node heap.
- Diff checks: passed.

Commands and results:

| Command | Result |
| --- | --- |
| `pnpm -F @angela/cli exec vitest run --config vitest.config.ts --maxWorkers=2` | 64 files, 563 tests passed |
| `pnpm -F @angela/cli typecheck` | Passed |
| `pnpm -F @angela/i18n typecheck` | Passed |
| `pnpm -F @angela/cli build` | Passed |
| `pnpm -F @angela/i18n build` | Passed |
| `pnpm lint` | 0 errors, 603 warnings |
| `pnpm typecheck --concurrency=2` | 46 successful workspaces, then stage-ui heap exhaustion |
| `git diff --check` | Passed |

Each pnpm command also included `--config.verify-deps-before-run=false`.
The root typecheck used the installed native pnpm path to bypass the launcher error.
Its stage-ui heap failure remains an environment limitation. CLI and i18n checks passed independently.
No live external-model evaluation, desktop notification daemon, or real audio device was required for these checks.

## 12. Remaining limitations

Supported local extraction deliberately covers a bounded Vietnamese grammar.
Unsupported language and complex requests still depend on the existing model tools.
Weekend dates and missing alarm hours require clarification.
Quiet hours and cooldown are runtime configuration options. A user-facing configuration screen is outside this change.

Terminal reminders require a running process. The existing optional Linux service can deliver desktop notifications after chat closes.
No process can display notifications while the computer is powered off.
A restart handles overdue occurrences once after ordinary acknowledged delivery.
A crash after external presentation but before acknowledgment can repeat that notification.
Exactly-once external presentation requires an idempotent notification destination.

Unknown locks, foreign-host locks, and abandoned recovery markers require manual inspection.
Local task storage requires hard-link and atomic-rename support.
Web and Electron task interfaces remain unchanged.
The full monorepo typecheck remains incomplete because stage-ui exhausted the available Node heap.

## 13. Next development step

Expose quiet hours and notification preferences through shared configuration.
Then evaluate unsupported natural-language requests against a fixed live-model scenario set.
An actionable notification inbox can provide durable user acknowledgment across CLI and future desktop surfaces.

See [the architecture decision](../adr/2026-10-22-commitment-follow-up.md) and [the CLI guide](../../../packages/angela-cli/README.md#tasks-and-reminders).
