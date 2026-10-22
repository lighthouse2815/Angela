# Angela CLI Task & Reminder Engine — Implementation Plan

## Purpose

Implement the first proactive everyday-assistant capability for Angela CLI: persistent tasks, reminders, deadlines, routines, follow-ups, snoozing, and natural-language task management.

This feature is intentionally **not** a coding-agent task system. Angela's current product direction is an AI friend / study companion / conversational assistant that can also handle small everyday errands. Coding-specific autonomous workflows are deferred.

The feature must feel conversational. Users should be able to say things like:

- "10h tối nhắc tao học tiếng Trung"
- "Mai tao phải nộp bài nghiên cứu"
- "15 phút nữa nhắc lại"
- "Cái vụ gọi Minh xong rồi"
- "Tối nay tao còn việc gì?"
- "Dời cái nhắc học sang 9h đi"
- "Hủy cái nhắc gọi Minh"
- "Mỗi tối 10h nhắc tao ôn từ"

Do not require slash commands for normal use. Slash commands are a management/debug surface, not the primary UX.

---

## Repository Rules

Before coding:

1. Read the root `AGENTS.md` completely and follow it.
2. Inspect `packages/angela-cli` and reuse existing persistence, chat/tool, config, logging, prompt, voice, Telegram, and test patterns where applicable.
3. Search before creating utilities. Do not introduce one-off storage, validation, time, or error-handling patterns if equivalents already exist.
4. Keep the feature inside `packages/angela-cli` unless existing architecture clearly requires a shared package.
5. Do not add a new dependency without first checking whether the repository already has a suitable dependency or utility.
6. Use kebab-case file names.
7. Use Valibot for persisted-data/tool-input schemas where validation is required, consistent with root rules.
8. Do not use `any`.

The implementation should adapt to the actual current CLI architecture rather than blindly copying the example paths below.

---

## Product Requirements

### Task types

V1 must support:

- `todo`
- `reminder`
- `deadline`
- `routine`
- `follow_up`

### Task statuses

Support at minimum:

- `pending`
- `completed`
- `cancelled`

### Required task fields

Use a validated persisted model equivalent to:

```ts
interface AngelaTask {
  id: string
  title: string
  type: 'todo' | 'reminder' | 'deadline' | 'routine' | 'follow_up'
  status: 'pending' | 'completed' | 'cancelled'

  dueAt?: string
  timezone?: string

  recurrence?: {
    type: 'daily' | 'weekly'
    interval?: number
    daysOfWeek?: number[]
  }

  context?: string

  createdAt: string
  updatedAt: string
  completedAt?: string

  lastNotifiedAt?: string
  snoozedUntil?: string
}
```

The exact TypeScript shape may differ if the current repository already has suitable shared types or timestamp conventions.

### Persistence guarantees

Tasks must survive CLI restart.

Persistence must not silently destroy all tasks on malformed data or interrupted writes. Reuse existing atomic/persistence patterns if present. At minimum:

- validate loaded data;
- avoid partial writes;
- report recoverable persistence errors clearly;
- do not duplicate a reminder merely because the CLI restarted.

Do not build an unnecessary database for V1 if the CLI currently uses file-based local persistence and that pattern remains sufficient.

---

## Architecture

Implement the feature in layers so each layer can be tested independently.

Conceptual flow:

```text
User message
    ↓
Chat / LLM
    ↓
Task tools
    ↓
Task service
   ↙       ↘
Task store  Scheduler
               ↓
            Notifier
               ↓
       CLI / Voice / later channels
```

Recommended domain split, adjusted to the actual repo structure:

```text
packages/angela-cli/src/
  tasks/
    types.ts
    schema.ts
    store.ts
    service.ts
    scheduler.ts
    notifier.ts
    *.test.ts
```

Do not force this directory layout if the package already organizes domain modules differently.

---

## Phase 1 — Persistent Task Domain

Implement and test the task model, validation, storage, and service layer first.

Required service operations:

- create task;
- list/filter tasks;
- find task by id;
- update task;
- complete task;
- cancel task;
- snooze task.

Behavior requirements:

- completing a task records completion time;
- cancelling does not delete history by default;
- snoozing temporarily changes the next notification time without losing the original task identity;
- all mutations update `updatedAt`;
- IDs must be stable across restarts;
- task queries should be deterministic and sorted sensibly by effective due time.

Tests must cover persistence round-trip and corrupted/invalid persisted data behavior.

---

## Phase 2 — CLI Management Surface

Add a minimal management surface. Integrate it with the CLI's existing command handling instead of creating a parallel parser.

Required user-facing capabilities:

```text
/tasks
/today
/done <task>
/cancel <task>
/snooze <task> <duration>
```

The exact command syntax may follow existing CLI conventions.

Expected output should be compact and human-readable. Example:

```text
Hôm nay

1. 20:00  Học tiếng Trung
2. 22:00  Làm quiz chương 3

Ngày mai

3. 09:00  Nộp bài PPLNCKH
```

Task selection should not rely only on fragile array indexes internally. If numeric display indexes are supported, resolve them to stable task IDs within the current view.

Add command tests using the CLI's existing testing approach.

---

## Phase 3 — Natural-Language Task Tools

Expose task operations to Angela through the existing LLM/tool mechanism.

Required model-facing tools, names adjusted to existing repository conventions:

- `task_create`
- `task_list`
- `task_update`
- `task_complete`
- `task_cancel`
- `task_snooze`

Tool inputs must be schema-validated.

Do **not** implement reminder understanding through keyword/regex detection such as checking for "nhắc tao". Let the model choose task tools from conversational context.

The assistant should answer naturally after tool success, for example:

```text
User: 10h tối nhắc tao học tiếng Trung
Angela: Ừ, 10 giờ tối tao nhắc.
```

For ambiguous dates/times, preserve a conversational UX. Do not invent a precise time when the user gave only a date unless the current product already defines a policy for that case.

Relative time interpretation must use the user's/local CLI timezone and current clock, not UTC assumptions.

Add tests for tool validation and task service integration. Mock the clock where appropriate.

---

## Phase 4 — Reminder Scheduler

Implement an in-process scheduler for V1.

The scheduler should:

1. load pending scheduled tasks on startup;
2. determine the nearest effective notification time (`snoozedUntil` when present, otherwise `dueAt`);
3. schedule the nearest event efficiently;
4. notify when due;
5. record `lastNotifiedAt` before/after notification using a design that prevents accidental duplicate delivery on normal restart;
6. recalculate the next event after every task mutation;
7. handle system clock changes/restarts reasonably;
8. support clean shutdown/cancellation.

Prefer a nearest-deadline timer design over polling every second.

The scheduler must use an injectable/testable clock boundary if the existing architecture supports dependency injection for clocks (root `AGENTS.md` explicitly permits DI for clocks).

### Overdue recovery

When Angela starts after being offline, surface overdue tasks instead of silently dropping them.

Example:

```text
Lúc bạn không ở đây có 2 việc đã tới hạn:

• 22:00 hôm qua — Học tiếng Trung
• 08:00 hôm nay — Gửi bài cho nhóm
```

Do not spam repeated overdue notifications every startup. Persist enough state to know whether an occurrence was already surfaced.

---

## Phase 5 — Recurrence and Snooze

After one-shot reminders are stable, support:

- daily recurrence;
- weekly recurrence;
- selected weekdays;
- snooze by conversational duration such as 10m, 30m, 2h where the existing time parsing layer supports it.

Do not expose cron syntax to ordinary users.

For recurring tasks, clearly define occurrence semantics:

- notifying an occurrence must not permanently complete the routine;
- compute the next occurrence deterministically;
- avoid duplicate occurrences after restart;
- cancellation stops future occurrences;
- allow explicit completion/check-in if useful, without destroying recurrence configuration.

Add recurrence tests around day/week boundaries and timezone handling.

---

## Phase 6 — Notification Abstraction

Create/reuse a notification boundary so reminder delivery is not hard-coded to terminal printing.

Conceptually:

```ts
interface ReminderNotifier {
  notify: (task: AngelaTask) => Promise<void>
}
```

V1 must implement CLI notification.

Design the boundary so these can be added later without rewriting scheduler logic:

- voice notifier;
- desktop notifier;
- Telegram notifier.

The CLI notifier must not corrupt the interactive prompt. If a reminder fires while the user is typing, redraw/preserve input using the CLI's existing terminal UI capabilities.

Example presentation:

```text
────────────────────────────
⏰ Angela

10 giờ rồi.
Mày bảo tao nhắc học tiếng Trung đấy.
────────────────────────────
```

Keep generated wording consistent with Angela's current persona system instead of hard-coding only one tone if persona helpers already exist.

---

## Phase 7 — Voice Integration

Only after text reminders are reliable, connect notification output to existing voice/TTS behavior.

Requirements:

- if voice mode is active, reminders may be spoken;
- do not interrupt Angela mid-sentence unless the current voice architecture explicitly supports safe interruption for reminders;
- queue the reminder and speak it after the current utterance where appropriate;
- text notification must still exist as the source of truth/fallback.

Voice integration must not become a prerequisite for the core task engine tests.

---

## Phase 8 — Background Service (Separate Milestone)

Do **not** block the first usable implementation on a daemon/background service.

V1 behavior:

- reminders fire while the CLI process is running;
- reminders persist while the CLI is closed;
- reopening the CLI performs overdue recovery.

After V1 is stable, implement a lightweight background-service milestone, e.g. commands equivalent to:

```text
angela service start
angela service status
angela service stop
```

The service should own scheduling while sharing the same task store/domain layer with the interactive CLI.

Do not duplicate task logic in the service.

Linux/systemd-user support can be the first platform if that matches the current CLI platform strategy. Do not prematurely implement every OS service manager in the first change.

---

## Follow-up Behavior

`follow_up` is important to Angela's friend/companion identity.

Example:

```text
User: Tối nay tao định làm xong slide.
Angela: [creates follow-up]

Later:
Angela: Slide xong chưa?
User: Chưa, còn 2 slide.
Angela: Ừ. Muốn 30 phút nữa tao hỏi lại không?
```

For the first implementation, a follow-up can reuse the same scheduling domain as reminders. Do not build a separate scheduler.

The distinction is semantic and can later guide Angela's conversational behavior.

---

## Study Companion Compatibility

Design Task & Reminder Engine as infrastructure for the future Study Companion.

Future study features should be able to create tasks such as:

```text
18/10 20:00  Ôn Chapter 3
18/10 21:00  Quiz Chapter 3
19/10 19:30  Ôn Chapter 4
19/10 21:00  Mock test
```

Therefore:

- do not couple task creation only to direct user text;
- expose a clean internal service API;
- retain optional context/source metadata if the existing architecture has a suitable concept;
- keep scheduling independent from chat rendering.

Do not implement the Study Engine in this task.

---

## Non-Goals

Do not expand this task into:

- autonomous coding-agent planning;
- GitHub issue/project management;
- multi-agent orchestration;
- email/calendar integrations;
- a full desktop task UI;
- cloud synchronization;
- marketplace/plugins;
- complex natural-language regex parser;
- cron-expression UX;
- full proactive life-planning engine.

Those are later milestones.

---

## Required Acceptance Scenarios

The completed V1 should support these end-to-end scenarios through normal conversation where applicable:

1. `10h tối nhắc tao học tiếng Trung`
2. `Mai nhắc tao nộp bài`
3. `Hôm nay tao có việc gì?`
4. `Cái nhắc học lúc 10h đổi sang 9h đi`
5. `15 phút nữa nhắc lại`
6. `Cái đó tao làm xong rồi`
7. `Hủy việc gọi Minh`
8. `Tối nay còn việc gì?`
9. `Mai có deadline gì không?`
10. Restart Angela and verify tasks are still present.
11. Restart after a reminder became overdue and verify overdue recovery.
12. Verify an already-delivered reminder is not duplicated on normal restart.
13. Verify a recurring routine advances to its next occurrence correctly.
14. Verify `/tasks`, `/today`, complete, cancel, and snooze management paths.

Where a phrase such as `Cái đó` depends on conversational context, reuse the existing chat/session context rather than inventing a global last-task hack unless the current tool architecture already models tool-result references that way.

---

## Test Requirements

At minimum add automated tests for:

### Store/service

- create/list/update/complete/cancel;
- persistence round trip;
- validation of persisted data;
- deterministic ordering;
- snooze semantics.

### Scheduler

- next due task selection;
- notification fires once;
- task changes reschedule timer;
- overdue startup behavior;
- restart duplicate prevention;
- cancellation;
- fake/test clock behavior.

### Recurrence

- daily;
- weekly;
- selected weekdays;
- next occurrence calculation;
- restart around an occurrence;
- timezone/day boundary.

### Tools/CLI

- tool input validation;
- tool-to-service integration;
- task management commands;
- useful failure messages for missing/invalid task selection.

Avoid flaky tests based on real waiting/sleeping. Use a fake clock/timers.

---

## Implementation Order

Follow this order unless repository architecture provides a strong reason not to:

1. Inspect current CLI architecture and write a short implementation note in the final Codex response.
2. Task types + validation schema.
3. Persistent TaskStore.
4. TaskService + unit tests.
5. `/tasks`, `/today`, completion/cancel/snooze management commands.
6. LLM task tools.
7. In-process scheduler + fake-clock tests.
8. Overdue recovery + duplicate prevention.
9. Recurrence.
10. CLI notifier.
11. Voice integration if it can be done cleanly without expanding scope.
12. Update `packages/angela-cli/README.md` with the actual user-facing behavior that was implemented.
13. Run checks required by `AGENTS.md`.

Do not start the background daemon milestone until the in-process V1 is correct and tested.

---

## Suggested Commit Breakdown

Codex may use a different breakdown if necessary, but keep changes reviewable:

1. `feat(cli): add persistent task domain`
2. `feat(cli): add task management commands`
3. `feat(cli): add conversational task tools`
4. `feat(cli): add reminder scheduler and overdue recovery`
5. `feat(cli): add snooze and recurring reminders`
6. `feat(cli): integrate reminder notifications`

Do not mix unrelated refactors into these commits.

---

## Definition of Done

This milestone is done when:

- tasks persist across CLI restart;
- Angela can create/manage tasks through normal conversation using model tools;
- `/tasks` and basic task management commands work;
- one-shot reminders fire while CLI is running;
- overdue reminders are surfaced after restart;
- normal restart does not cause duplicate notification spam;
- snooze works;
- daily/weekly routines work;
- scheduler logic has deterministic fake-clock tests;
- CLI prompt remains usable when a reminder appears;
- relevant `packages/angela-cli` tests pass;
- relevant typecheck passes;
- `pnpm lint` passes or any unrelated pre-existing failures are clearly reported;
- `packages/angela-cli/README.md` documents the implemented functionality;
- no unrelated coding-agent features are added.

---

## Instruction to Codex

Implement this plan completely for `packages/angela-cli`, following the actual current architecture of the repository and all applicable `AGENTS.md` instructions.

Do not stop after only scaffolding the domain types. Continue through the usable V1 described above, including tests and documentation. If the repository already contains an equivalent mechanism, integrate or refactor toward it instead of duplicating it.

When you finish, report:

1. what changed;
2. important architectural decisions;
3. files/modules added or changed;
4. commands/tests/typechecks/lint actually run and their results;
5. any part of this plan that could not be completed and the exact reason.
