# Commitment and proactive follow-up

## Existing architecture

The repository includes terminal, Telegram, Discord, Zalo, web, and Electron entry points.
This change targets the existing CLI runtime and its private chat adapters.
Web and Electron use separate Pinia chat stores and retain their current behavior.

- `bin/run.ts` owns terminal input, output, signals, sessions, and provider configuration.
- `AngelaRuntime` owns lazy services, reminder destinations, lifecycle events, and resource limits.
- `RuntimeSession.send` builds context and executable tools before `Chat.send` calls `core-agent.streamFrom`.
- `provider-inference` adapts providers and generation protocols.
- `Context` compacts working conversations. `Sessions` saves their portable history.
- `Tasks` owns task state, recurrence, notification leases, completion, cancellation, and snooze.
- `MemoryFile` writes private JSON through exclusive locks and atomic rename.
- `ReminderScheduler` batches overdue tasks and renews delivery leases before presentation.
- `ReminderNotifications` buffers presentation during generation and queues optional voice output.
- `RecallIndex` and memory-v2 store searchable episodes, semantic facts, and procedures in local SQLite.
- The CLI event bus carries bounded lifecycle metadata. Electron uses Eventa and injeca at process boundaries.
- `local-config` stores shared provider configuration. Environment variables and CLI flags override it.

## Gaps confirmed on main at dc2e7f3

Local extraction and task tools used separate intent regexes.
The prompt included every retained task, including old completed and cancelled records.
Every request reconciled task records against memory.
Contextual control inspected only the latest assistant turn.
The existing follow-up task type had no local extractor, explainable candidate model, or persisted follow-up lifecycle.
One reminder-delivery event used wall time despite the injected runtime clock.

## Decisions

Keep `Tasks`, `MemoryFile`, the existing scheduler, and executable model tools.
Do not introduce another task database, model abstraction, or event bus.

Vietnamese time parsing uses the existing Intl calendar conversion with an injected clock.
Relative durations use elapsed time. Calendar expressions use the configured IANA timezone.
Date-only requests and ambiguous local times require clarification before an alarm is created.
A weekday means its next calendar occurrence. A monthless day means the next eligible month.
A yearless date means its next eligible year. Invalid calendar dates remain errors.

Identical pending tasks reuse their saved ID inside the storage lock.
Completed and cancelled tasks do not prevent a later commitment with the same title and schedule.
The clock accepts the existing function boundary and the explicit `Clock` contract.

## Delivery guarantees

Persisted occurrence acknowledgments prevent duplicate delivery after a normal restart.
Claims and renewable leases prevent two live owners from presenting the same occurrence concurrently.
Offline reminders collapse into one recovery batch. Follow-ups recover individually under a shared-store cooldown and expiry policy.
A crash after external presentation but before acknowledgment can repeat that presentation.
Exactly-once delivery across that boundary requires an idempotent external notification destination.

## Integrated flow

`RuntimeSession.send` first applies request privacy and initializes the existing task and memory services.
`CommitmentConversation` handles supported explicit requests before model generation.
Its result enters `Chat` through the same stream presentation and session persistence boundary.
Unsupported phrases continue through validated model tools and the existing provider abstraction.

The scheduler evaluates `ProactivePolicy`, claims eligible occurrences, and invokes its notification boundary.
Runtime metadata events expose due and delivered task IDs without storing message content in the event bus.
Presentation records announced IDs under the destination's exact workspace, session, and channel identity.
References contain IDs only and survive restart. Eight requests and six hours bound their relevance.
Local snooze, completion, and cancellation retain recent references through unrelated conversation.
Several pending references require clarification. Session reset clears only its own references.

Tasks emits typed mutation events after its atomic write.
Recall subscribes to these events and projects the affected authoritative task into one current episodic commitment key.
MemoryCapture retains dated session observations. It no longer owns current commitment pages.
Startup and five-minute reconciliation repair external mutations and failed projections.
Host-owned task provenance authorizes recovery of a missing initial projection.
Memory-disabled requests receive no projection provenance. Suppression prevents forgotten content from returning through recovery.
Projection observers cannot roll back successful task writes.
Bounded task snapshots override historical memory during generation. Older history remains accessible through tools.

Standalone task commands use the same service and capture path without constructing a model provider.
The system remains local-first. No server, broker, or new dependency is required.

## Writer crash recovery

The session writer already identified abandoned locks through hostname and process ID.
That implementation now lives in `file-lock.ts`, shared by sessions and `MemoryFile`.
An atomic hard link publishes complete owner metadata before another process can observe the lock.
Only ESRCH from a same-host process check permits recovery.
Live owners, permission failures, unknown owner data, and foreign hosts remain locked.
CLI resume enables this check. Task mutations always enable it.
Unknown locks and abandoned recovery markers require manual inspection.
The target filesystem must support local hard links and atomic rename.

A process test kills a writer while `MemoryFile.edit` holds its lock.
The restarted scheduler recovers that lock and delivers the previously saved reminder once.

## Proactive foundation

Reuse `follow_up` tasks, notification leases, and the existing runtime event bus.
Candidates derive from explicit authoritative task occurrences. They introduce no new persistence subsystem.
Candidate IDs combine task and occurrence IDs. Reasons and policy decisions remain inspectable.
The policy checks relevance, confidence, completion, expiry, duplicate delivery, quiet hours, cooldown, and recent activity.
Follow-ups use deterministic local-time windows when the user gives a date or day part.
The confirmation exposes the selected time. Exact reminder alarms still require an hour.

Persist prompt count, last prompt, next eligibility, expiry, and resolution with the task.
Successful presentation acknowledges one occurrence. Restart does not repeat it.
The default follow-up cooldown is thirty minutes. A batch includes at most one follow-up.
Atomic claims fence distinct follow-ups across hosts, and live leases defer competing candidates.
Unprompted follow-ups expire after forty-eight hours. Recurring expired occurrences advance to the next future schedule.
Explicit snooze re-arms the same task with a new occurrence.

Natural-language grammar remains conservative. Uncertain requests cannot create tasks through model tools.
The scheduler and all notification wording remain independent of model availability.
No dependency, database, broker, backend, event bus, or agent subsystem was added.
