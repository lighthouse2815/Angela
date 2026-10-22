# Implicit companion follow-up

Date: 2026-10-23

Status: Accepted

## Baseline and problems

Inspected GitHub main: `46212a2a54d5951a30a2893f5402589bac9e4c27`.

Before this change, explicit requests created tasks through local extraction or guarded model tools.
Task persistence owned status, schedules, leases, recovery, and explicit follow-up occurrences.
The scheduler derived task candidates and applied deterministic policy before notification adapters presented text.
Commitment memory projected verified task events. Bounded context distinguished current task state from historical evidence.

The intent classifier treated generic English creation verbs as task authority.
It inspected meta framing only before the action. A suffix example could become a reminder.
Active references merged recent events and selected pending tasks. This could select older work after the latest task completed.
No independent domain represented unresolved conversational work.

## Architecture

After this change:

```text
Explicit user request -> Task store -> task candidate -----------+
                                                               |
Current unresolved statement -> OpenLoops -> OpenLoopSource ----+-> ReminderScheduler
                                                                  -> ProactivePolicy
                                                                  -> notification adapter
                                                                  -> scoped focus group
                                                                  -> user resolution or dismissal

Task store -> verified task events -> CommitmentMemoryProjection
OpenLoops -> metadata events only
Historical memory never decides whether an OpenLoop is open.
```

The scheduler retains its task delivery code and accepts optional proactive sources.
Task delivery runs first. Auxiliary source failures cannot reject a task mutation or corrupt task storage.
The runtime registers one OpenLoop source per task store. It adds no second scheduler or backend.
CLI and private Telegram companion notifications support implicit text delivery.
The standalone desktop reminder service retains explicit task delivery only.

## Intent and focus

Local extraction and model task tools use `classifyCommitmentIntent` before persistence.
English authorization requires an explicit purpose, title, personal activity, or time clause after a creation object.
Examples include `create a task to study`, `add a todo: submit my report`, and `add a reminder for tomorrow`.
`save this as a task` also authorizes an explicit conversion of current context. Bare task nouns do not grant authority.
Generic `create`, `add`, and `save` do not grant authority.
The classifier checks example and implementation framing across the whole request. Technical objects such as a task parser do not grant authority. Coding subjects inside valid management requests remain supported.
Quotations, speculation, questions, and uncertain requests cannot authorize task creation.
Direct reminders about testing a parser remain valid explicit requests.

One event creates one focus group. The latest group replaces the previous group.
A group contains task or OpenLoop identities. Multiple identities require clarification.
Inactive, missing, expired, or oversized groups cannot select older pending work.
A complete task title phrase or verified task ID can establish conversational focus.
Unrelated assistant replies leave focus unchanged.
Focus retains at most eight identities for eight requests or six hours. Both domains advance focus before resolving the current request.
The persisted identity includes workspace, session, and channel. Reset clears only that identity.
Version two uses a separate focus file and discards old reference semantics without modifying task records.

## Domain and extraction

`OpenLoops` owns subject, normalized identity, kind, workspace, source session, lifecycle, confidence, salience, timing, prompt count, and delivery claim.
States are `open`, `resolved`, `expired`, and `dismissed`.
An OpenLoop never becomes a synthetic Task.

| Statement | Domain |
| --- | --- |
| `Mai 9h nhắc tao làm auth.` | Explicit reminder Task |
| `Mai hỏi tao xem auth xong chưa.` | Explicit follow-up Task |
| `Tao đang bí phần refresh token.` | Implicit problem OpenLoop |

Deterministic Vietnamese rules accept current problems, unfinished work, waiting, dated events, and concrete goals.
Examples, quoted text, hypotheticals, old incidents, preferences, feelings alone, casual remarks, and reading topics are rejected.
Unknown subjects and unsupported wording produce no implicit state. No model extracts or authorizes implicit persistence.

Normalized equal subjects merge within a workspace while open.
The initial alias rule groups `auth`, `login`, and `refresh token`. This conservative rule can merge distinct authentication problems.
A more specific refresh-token mention updates the displayed subject.
Updates postpone prompting after recent work. They never reset the cap or extend the original expiry.
A fresh unresolved statement after dismissal or expiry creates a new identity.

Named resolution recognizes outcomes such as `Fix được auth rồi`, `Xong phần slide rồi`, and `Thầy trả lời rồi`.
Subject aliases and prefix removal avoid exact-title-only matching.
`Xong rồi` and `Đừng hỏi vụ này nữa` require one exact focused OpenLoop.
Named outcomes use the current workspace. A notification focus can resolve its exact loop across workspaces in the same user store.
An ambiguous outcome never completes another Task.

## Timing and eligibility

| Kind | Initial earliest time | Expiry |
| --- | --- | --- |
| Problem or unfinished work | 4 hours | 48 hours |
| Waiting | 12 hours | 7 days |
| Concrete goal | 12 hours | 48 hours |
| Tomorrow's event | 09:00 after the event's entire local date | 48 hours after earliest time |

Event timing uses local calendar conversion across daylight saving changes. Undated or unsupported event dates create no proactive opportunity.
Eligibility also requires confidence of at least 0.95, salience of at least 0.7, open state, and an unconsumed prompt cap.
Every update adds at least four hours of inactivity before a prompt.
Implicit prompts wait at least 15 minutes after conversation activity.
Six or more recent requests add a one-hour activity deferral. The activity window retains at most eight timestamps.
Default implicit quiet hours are 22:00–08:00 in the configured timezone.
Configured quiet hours replace that default. Active runtime requests also block implicit presentation.

One loop permits one presentation attempt. Each user store permits at most one implicit attempt per eight hours.
Explicit follow-ups also defer implicit candidates through existing scheduler activity.
The scheduler reconciles implicit work within one minute. It reads no semantic-memory corpus or conversation history.

## Task suppression

A pending Task with an equivalent normalized subject and matching host-owned `memoryProjection.scope` dismisses the implicit loop and records `supersededByTaskId`.
The runtime observes task creation and updates. The source also repairs suppression on each reconciliation and before presentation.
Task observers cannot roll back a successful Task write.
If a pending equivalent Task exists, later implicit statements do not create another loop.
Cancelling the Task does not silently resurrect a dismissed loop. A fresh user statement can open another loop.
Tasks remain global per user store. Suppression requires an exact compatible workspace scope.
Existing projection provenance supplies that evidence without changing the Task schema or using historical memory.
Unknown provenance and free-form Task context do not authorize suppression.
New runtime OpenLoops use the existing canonical project scope, including nested Git directories.

## Persistence and delivery

The store uses existing `MemoryFile` validation, private file permissions, atomic rename, and cross-process locking.
Its file is `open-loops/state.json` under the user data directory.
Task schema, delivery state, recurrence, restart recovery, and memory projection keep their existing contracts.

A claim lasts 30 seconds and carries a fencing token.
Before presentation, the source checks current privacy, fresh task suppression, latest activity, current loop state, and lease ownership.
A pre-presentation failure releases the claim and waits 60 seconds before retry.
A crashed claim owner becomes recoverable after lease expiry.

Implicit delivery commits `promptCount = 1` and `lastPromptedAt` immediately before the external side effect.
This provides at-most-once attempts across crashes and repeated restarts.
A crash or transport failure after this write can lose a question. It cannot cause repeated implicit nagging.
The `proactive.prompted` event records the committed attempt, not confirmed receipt by the user.
Task reminders retain their existing at-least-once presentation and acknowledgment behavior.

No generation provider is called for delivery. English and Vietnamese templates provide the final message.
A provider failure during ordinary chat does not erase a valid user-grounded loop already persisted by the host.

## Privacy, bounds, and failures

Creation and resolution require existing durable personal-memory consent.
The source checks current personal-memory, automatic-memory, and recall switches without opening a semantic index.
Disabled, unavailable, or invalid memory controls block implicit delivery. Explicit Tasks retain independent privacy controls.
Protected requests create no loop, task projection, or implicit candidate.
Subjects never enter global events. Events contain IDs, reasons, and lifecycle metadata only.

The store admits at most 50 open loops. It rejects excess admissions without evicting active work.
Inactive history retains at most 30 records for seven days. Expiry runs under the store lock.
The storage file remains bounded by the existing 128,000-character storage contract.
Model context includes at most six workspace-local loop summaries, each with a subject of at most 120 characters.
Metadata observers run after persistence and cannot change authoritative results.
Corrupted files remain untouched. Source errors are reported without stopping Task reminders.

## Limits and next milestone

This foundation recognizes a bounded Vietnamese grammar. It does not understand arbitrary unresolved topics or arbitrary event calendars.
Authentication alias matching can over-merge related problems. Other topics require normalized equality.
Implicit delivery needs a running CLI or Telegram companion host. Voice and standalone background implicit prompts are not implemented.
At-most-once delivery deliberately accepts possible loss after reservation. It does not promise exactly-once network receipt.
OpenLoop history remains separate from semantic-memory purge commands. Resolve or dismiss the focused thread to stop follow-up.

Next milestone: evaluate extraction and dedupe against a consented Vietnamese conversation corpus before expanding the grammar.
