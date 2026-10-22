# Angela runtime memory measurements

Run each scenario in a fresh Node process with explicit garbage collection:

```sh
node --expose-gc --import tsx packages/airi-cli/scripts/benchmark-memory.ts cli
node --expose-gc --import tsx packages/airi-cli/scripts/benchmark-memory.ts telegram
```

The benchmark uses temporary storage, actual Chat generation, Recall, task stores, sessions, and Telegram update handlers.
The model and Telegram network boundaries return deterministic responses. No paid API, device, or external MCP server is used.
Each Telegram scenario completes a request and releases its session lock before the next user.
Measurements include `rss`, `heapUsed`, `heapTotal`, `external`, and active referenced resource types after GC.
Node does not report unreferenced timers through `getActiveResourcesInfo`. Runtime lifecycle tests check owned resources separately.
These measurements cover orchestration within a process, not GPU memory, child processes, or a live model's response size.

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

Baseline source: `d48991f`. JSON files record bytes on the same machine and Node version.
