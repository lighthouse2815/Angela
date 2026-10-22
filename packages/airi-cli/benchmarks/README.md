# Angela runtime memory measurements

Memory V2 latency measurements and limitations are in [the Memory V2 report](../../../docs/ai/audits/angela-memory-v2.md).

Run each scenario in a fresh Node process with explicit garbage collection:

```sh
node --expose-gc --import tsx packages/airi-cli/scripts/benchmark-memory.ts cli
node --expose-gc --import tsx packages/airi-cli/scripts/benchmark-memory.ts telegram
ANGELA_BENCHMARK_CYCLES=2560 node --expose-gc --import tsx packages/airi-cli/scripts/benchmark-memory.ts release
node --import tsx packages/airi-cli/scripts/benchmark-entry.ts
```

The benchmark uses temporary storage, actual Chat generation, Recall, task stores, sessions, and Telegram update handlers.
The model and Telegram network boundaries return deterministic responses. The orchestration benchmark uses no paid API, device, or connected MCP transport.
Each Telegram scenario completes a request and releases its session lock before the next user.
Measurements include `rss`, `heapUsed`, `heapTotal`, `external`, and active referenced resource types after GC.
Node does not report unreferenced timers through `getActiveResourcesInfo`. Runtime lifecycle tests check owned resources separately.
The entry benchmark launches the actual CLI with default built-in MCP and piped input. A preload observes idle input and process completion.
Its measurements include the CLI process, but exclude the MCP child process. Neither benchmark measures GPU memory or live-model response sizes.
The orchestration benchmark also records Telegram memory while its first model request is active.
The release benchmark uses finalization counters without retaining session or Recall objects.

## Initial audit

| Module | Retained state and lifetime |
| --- | --- |
| `bin/run.ts` | Eager Memory, ProjectMemory, Recall, Camera, Tasks, scheduler, provider, and Chat for the CLI lifetime. MCP connects before input. |
| `chat.ts` | Full conversation remains live. Context compaction only reduces outgoing requests. A memory request copies turn references. |
| `memory.ts` | Disk-backed facts, capped at 50 entries. Request tool closures retain a snapshot until generation completes. |
| `project-memory.ts` | One bounded disk checkpoint. Git root discovery starts a short-lived child process. |
| `recall.ts` | SQLite index, one watcher, one interval, optional remote embedding client, workspace cache, and selected excerpts per instance. |
| `tasks.ts`, `task-tools.ts` | Disk-backed tasks. Scheduler subscriptions need cleanup. Definitions and clock context can be request-local. |
| `reminder-scheduler.ts` | One reconciliation timer per store, temporary lease timers during delivery, and a task subscription. |
| `telegram.ts` | Jobs disappear after completion. Chat permissions, MCP clients, and companion promises survive until host shutdown. |
| `telegram-companion.ts` | Eager Memory, Tasks, Recall, notifications, and scheduler per allowed user, including inactive users. |
| `discord.ts` | Conversations and locks are request-local. Each channel queue has four slots, but concurrent channel count has no explicit cap. |
| `mcp.ts` | Discovery schemas, name set, client, and serial approval promise remain until the adapter closes. |
| `sessions.ts` | A writer mirrors full portable messages while Chat also owns the converted conversation. Listing reads all sessions concurrently. |
| `skills.ts` | File-stamp cache retains full instructions for every listed skill without eviction. |

Voice devices start on demand. Static CLI imports still load voice, camera, evaluation, and Telegram modules for text-only startup.
Embeddings require `ANGELA_EMBEDDING_MODEL`. No local model loads automatically.

## Results

Baseline source: `d430e76`, before runtime migration. The initial audit describes `d48991f`.
The baseline source was extracted into a separate temporary directory and used the same installed workspace dependencies.
The baseline measurement hook gained the same in-flight Telegram sample as the final script. Application behavior was unchanged.
All JSON files record bytes on the same machine with Node 26.11.1 and explicit GC.
The final measurement snapshot contains runtime changes through `ba21572`.
It excludes concurrent `memory-v2` changes and restores `recall-index.ts` from `836a68c` for this comparison.
The CLI scenarios include startup, one message, and twenty messages in one working conversation.

| Scenario | RSS before → after, MiB | Heap used before → after, MiB |
| --- | --- | --- |
| `entry.idle` | 202.82 → 169.37 | 40.95 → 31.54 |
| `entry.message.1` | 205.24 → 179.28 | 43.06 → 39.19 |
| `cli.idle` | 179.26 → 164.73 | 39.16 → 35.70 |
| `cli.message.1` | 180.94 → 170.49 | 41.02 → 39.01 |
| `cli.message.20` | 181.07 → 170.99 | 41.85 → 39.92 |
| `telegram.idle` | 173.06 → 156.82 | 39.21 → 35.61 |
| `telegram.user.1.active` | 175.62 → 163.51 | 41.09 → 38.56 |
| `telegram.user.1` | 176.00 → 164.14 | 41.41 → 39.01 |
| `telegram.users.24` | 177.00 → 164.29 | 43.07 → 40.27 |

The raw files also contain `heapTotal` and `external`. RSS varies with V8 heap reservation, JIT activity, and the native allocator.
The two CLI measurements use different harnesses. Compare each scenario only with its corresponding baseline.
These deterministic runs establish an orchestration baseline, not a statistical performance guarantee.

After 2,560 create/send/release cycles, runtime states, listeners, reminder routes, and owned reminder timers remained at zero.
Heap use was 39.36 MiB after twenty cycles and 38.27 MiB after 2,560 cycles.
RSS peaked at 189.49 MiB at 1,280 cycles and returned to 133.00 MiB at 2,560 cycles.
Finalization callbacks observed 2,559 released scopes and Recall objects at that sample. Finalization timing remains controlled by V8.
Focused tests also verify closed Recall indexes/watchers/timers, MCP clients, Telegram eviction, Discord queue bounds, and shared reminder scheduling.

## Remaining hotspots

- Session JSON parsing and atomic replacement temporarily materialize the full disk history. Working state does not retain that portable snapshot.
- The latest assistant turn and native provider continuation remain until context compaction. A single large tool result can still consume substantial request memory.
- Recall still performs its existing SQLite synchronization and optional remote embedding requests. Each active logical context owns one lifecycle.
- The provider registry and imported module code remain in Node's module cache. Voice code remains cached after its first explicit use.
- Discord keeps gateway guild and channel metadata that its SDK requires. Message history is uncached, and user/member caches have limits.
- Reminder delivery retains small routes for authorized users to preserve background notifications. It does not evict reminders with conversation state.

No EventStore, event history, worker pool, dependency, or local model was added.
