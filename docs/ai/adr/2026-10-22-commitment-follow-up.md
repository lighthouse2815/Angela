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

## Gaps

Natural-language time interpretation previously depended entirely on model-generated timestamps.
Repeated tool calls created duplicate pending tasks.
There was no separate proactive policy or per-commitment current memory record.
Task management required a running chat or model tools.

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
Offline occurrences collapse into a single recovery batch.
A crash after external presentation but before acknowledgment can repeat that presentation.
Exactly-once delivery across that boundary requires an idempotent external notification destination.

## Integrated flow

`RuntimeSession.send` first applies request privacy and initializes the existing task and memory services.
`CommitmentConversation` handles supported explicit requests before model generation.
Its result enters `Chat` through the same stream presentation and session persistence boundary.
Unsupported phrases continue through validated model tools and the existing provider abstraction.

The scheduler evaluates `ProactivePolicy`, claims eligible occurrences, and invokes its notification boundary.
Runtime metadata events expose due and delivered task IDs without storing message content in the event bus.
Presentation adds the announced task IDs to the existing conversation.
Local snooze, completion, and cancellation resolve those references without a global last-task cache.

MemoryCapture writes verified state to a versioned episodic commitment record.
Current snapshots from Tasks override historical memory during generation.
Recall reconciles existing commitment records after changes from another channel.
Memory policy can disable these records without disabling explicitly requested task management.

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
