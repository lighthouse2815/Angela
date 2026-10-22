# Angela Runtime and Memory V2 review

Date: 2026-10-22. Runtime measurement revision: `a14ad69`.
Final core validation revision: `87f4d77`.

Scope: core review checkpoint. Electron UI integration is deferred at the user's request.
Review branch: `lighthouse2815/feat/unified-memory-v2`. The branch contains the integrated `main` changes through `f1d5a33`.

## Architecture before and after

The original companion stored explicit personal facts, project checkpoints, task state, skills, and conversation archives independently.
Recall indexed personal facts, skills, and history with FTS5 and optional vectors.
The runtime extraction already existed at baseline `836a68c`. Memory V2 builds on that extraction and integrates subsequent cleanup changes from `main`.

CLI and Telegram now use the shared runtime for context, tools, generation, lifecycle events, and private observation capture.
Discord uses the same runtime while retaining its existing text-only policy.
Transport adapters own presentation, approval UI, voice, perception, and cancellation.
The runtime has no Telegram or Discord SDK dependency.

`ContextBuilder` composes bounded memory, project, task, and perception fragments.
`ToolRegistry` aggregates existing tools and distinguishes verified success, failure, and unverified output.
Runtime events carry a request correlation ID and metadata. Private evidence flows directly to its owning capture handle.
The event bus retains listeners, with no event history.

Working memory remains in Chat, active requests, and current checkpoints.
Episodic, semantic, and procedural pages share the existing `memory/recall.sqlite` connection and retrieval index.
Personal Memory, ProjectMemory, Tasks, Sessions, and Skills retain their existing storage contracts.
SQLite triggers keep page mutations, FTS projections, and vector invalidation atomic.

The [architecture decision](../adr/angela-memory-v2.md) records scope, authority, privacy, retention, and purge invariants.

## Reference implementation

The external checkout is `../ai-memory-reference`, revision `1c86aebc14addccc7ac875913d565c681bfa4a50`.
Research covered production code and tests in core, store, consolidate, and hooks.
The zero-provider compiler was found in hooks, beyond the three requested core crates.

Borrowed behaviors include page versions, supersession, advisory contradictions, authority guards, reinforcement, tier policy, extractive compaction, and deterministic retrieval evaluation.
The retention formula uses separate age and access terms. Angela applies a 90-day episodic half-life and SQL reinforcement throttling.
Zero-provider summaries preserve verified outcomes, failures, decisions, commitments, and literal diagnostics.
Optional provider enrichment uses bounded structured candidates and source quotes. Failure preserves basic memory.

Rust crates, sidecars, team services, Git-backed personal data, admin infrastructure, and synchronization were excluded.
Similarity-based automatic merges and dream clustering remain disabled until broader quality evaluation supports them.
There is no additional runtime dependency or second memory backend.

## Measurements

All measurements ran sequentially on the same development machine with Node 26.11.1.
The corpus contains 2,000 synthetic history excerpts, 100 semantic pages, 128 observations, and 100 vectors with 64 dimensions.
The embedding fixture uses a local HTTP server. It measures batching and transport overhead, without model inference.
The corpus benchmark records one full run per revision. Startup uses three process samples.
These are local observations. Host scheduling, disk synchronization, and page faults affect the tails.
Cold means the first call in its measured phase. The benchmark does not flush the operating system's disk cache.

Two baselines serve different purposes:

- `836a68c`: runtime with legacy recall, before Memory V2 capture. Startup uses three alternating process samples.
- `2156d51`: Memory V2 before WAL and batching. This baseline permits consolidation and contention comparisons.

The [raw before data](../../../packages/airi-cli/benchmarks/memory-v2-before-tuning.json) and [raw after data](../../../packages/airi-cli/benchmarks/memory-v2-after.json) include percentile samples and query plans.

| Operation | Before tuning, ms | After, ms |
| --- | ---: | ---: |
| SQLite open and schema setup | 355.29 | 35.52 |
| SQLite write p50 / p95 | 10.13 / 16.18 | 2.90 / 5.48 |
| Observation write p50 / p95 | 9.73 / 158.99 | 2.44 / 4.70 |
| Recall cold | 5.46 | 4.02 |
| Recall warm p50 / p95 | 2.59 / 3.30 | 2.06 / 2.21 |
| Context cold, including removal of 2,000 stale origins | 36,773.84 | 741.41 |
| Context warm p50 / p95 | 2.96 / 3.68 | 2.03 / 2.57 |
| First session consolidation | 17.87 | 15.04 |
| Replayed consolidation p50 / p95 | 1.27 / 2.15 | 2.68 / 4.04 |
| Contended writer p50 / p95 | 12.23 / 17.58 | 3.28 / 6.64 |

The concurrent reader completed 1 read before tuning and 344 reads afterward. Neither final run reported a reader error.
The WAL run allowed readers to progress during writer activity.
Current-claim queries use `memory_current`. Aging uses the scoped covering index `memory_aging_cursor`.
Cold context includes artificial stale-index cleanup. It does not represent ordinary context preparation.

Legacy recall measured 5.00 ms cold and 3.37 / 5.93 ms warm p50 / p95.
The current sample improves lexical recall. Exploratory runs varied with host load, so this review does not claim universal latency improvement.
Vector-assisted recall measured 11.14 ms cold and 4.47 / 12.85 ms warm p50 / p95.
Only 100 vectors participate. Larger vector corpora need separate measurements.
The local embedding fixture processed 3,082 documents/second before tuning and 3,207 afterward. This is not an embedding-model throughput result.

| Runtime operation, median of three process samples | Legacy runtime, ms | Current, ms |
| --- | ---: | ---: |
| Runtime import | 127.63 | 20.38 |
| First request | 232.83 | 158.76 |
| First text, cold request | 227.28 | 148.49 |
| Warm request p50 | 2.68 | 9.19 |
| Warm request p95 | 4.20 | 10.72 |
| Warm first text p50 | 2.45 | 5.38 |
| Warm first text p95 | 3.75 | 6.30 |

Warm requests now persist observations and compile an episode. That adds approximately 6.5 ms to the median fixture request. The median first-text cost increases by approximately 2.9 ms.
This cost preserves crash-safe memory. Production provider latency is excluded from this fixture.
The [startup samples](../../../packages/airi-cli/benchmarks/runtime-startup-after.json) retain every process result.
The [legacy samples](../../../packages/airi-cli/benchmarks/runtime-startup-before.json) use the same request fixture.

Every startup sample ended with zero runtime states, event listeners, reminder routes, and reminder timers.
The memory benchmark ended with zero Recall indexes, watchers, timers, and embedding clients.
Resource lifecycle tests also cover repeated acquisition, release, cancellation, and enabled MCP cleanup.

## Memory quality

The deterministic evaluation uses eight meaningful pages, 100 noise episodes, and seven lexical probes.
It measures facts, session milestones, project decisions, workflows, current preferences, contradictions, and targeted historical incidents.
The same probes run after cold compaction.

Recall@5 was 7/7 before and after compaction. Expected pages ranked first, with contradiction alternatives at positions 1 and 2.
No unexpected top-five result appeared in this small corpus. Superseded React knowledge was absent after the explicit Vue correction.
These probes establish invariants, not general conversational recall accuracy.
They do not measure multilingual paraphrase performance or real embedding-model quality.

## Validation

Checks ran sequentially. Vitest used one worker.

| Check | Result |
| --- | --- |
| Complete `airi-cli` suite after the final core changes | 46 files, 369 tests passed |
| Package TypeScript check | Passed |
| Root TypeScript check | 53 tasks passed, 52 from the shared cache and the changed CLI freshly checked |
| Root lint | 0 errors, 603 warnings. Commit hooks also checked subsequent changed files |
| `airi-cli` build | Passed |
| Built executable `--help` | Passed |
| Memory quality probes | 7/7 before and after compaction |
| Recall and runtime resources after benchmark shutdown | All owned counters were zero |

The root Vitest run completed 367 files: 356 passed, 8 failed, and 3 skipped.
It reported 3,152 passed tests, 19 failed tests, and 5 skipped tests.
This run preceded the final privacy additions, which passed in the final complete CLI suite.
The failure files are unchanged from the starting revision:

- Apple IAP tests: the worktree lacks the documented root certificate fixtures.
- Core-agent spark-command tests: the worktree lacks the built self-import subpath.
- Stage-shared beat-sync: Vite denied an asset URL outside the worktree through shared dependencies.
- Stage-shared local storage: Node 26 exposes an unavailable storage API without its required backing file.
- Electron update manifest: the test expects the older AIRI artifact name while the implementation emits Angela.
- RevenueCat product change: the existing capacitor balance differs from the test expectation.

The complete monorepo test gate therefore remains red. No unrelated test, assertion, or implementation was changed to conceal these failures.
Root typecheck initially failed at pnpm's launcher. Running the installed native pnpm binary resolved that environment error.

## Reproduction

Run commands from the repository root, one at a time:

```sh
pnpm exec tsx packages/airi-cli/scripts/benchmark-memory-v2.ts WAL memory-v2-result.json
pnpm exec tsx packages/airi-cli/scripts/benchmark-runtime-startup.ts startup-result.json
pnpm -F @proj-airi/airi-cli exec vitest run --config vitest.config.ts src/memory-v2 --maxWorkers=1
```

`ANGELA_BENCH_SOURCE` selects an extracted source directory that uses the same installed workspace dependencies.
The `DELETE` argument requires the older source revision. The script checks the actual journal mode before measurement.
The raw baseline predates the additional vector-recall timing fields. Its vector persistence fixture is identical.
Temporary databases are deleted when each benchmark finishes.

## Limitations and next work

- Electron's existing renderer chat has not migrated to this Node runtime. The desktop channel contract is available, but UI migration needs an IPC adapter.
- Discord retains its existing text-only behavior and does not open companion memory stores.
- Duplicate detection covers exact and normalized replays within one claim. Similarity-based merging of independent claims is not automatic.
- Contradictions are explicit edges. The system does not infer every contradiction from arbitrary natural language.
- Optional provider enrichment is an explicit command. Dream passes and a durable background enrichment queue are not enabled.
- Credential redaction recognizes common formats and declarations. Conversation archives retain their existing explicit session-delete lifecycle.
- Forget suppresses affected archive projections to prevent resurrection. This conservative policy can exclude other history from the same archived session.
- Vector scoring scans the configured vectors. The benchmark does not establish performance for large vector collections.
- Vector persistence uses guarded per-item updates. Transaction batching for embedding writes needs a separate measured change.
- Superseded page versions remain until an explicit purge. Long-running sessions need storage-growth measurements before automatic history pruning.
- Live Telegram, Discord, voice, camera, and external-provider tests still require their normal devices and credentials.

The next integration step, after core review, is an Electron IPC adapter that preserves renderer voice, image, approval, and session behavior.
The next quality step is a larger anonymized corpus with paraphrases, overlapping distractors, and correction sequences.

## Telegram production lifecycle baseline (PR #1)

`benchmark-telegram-lifecycle.ts` drives real grammY updates through `TelegramChat`, session persistence, runtime, Memory V2, and SQLite.
The model returns deterministic SSE text. A local HTTP server replaces Telegram delivery. No paid API is used.
Each mode sends 31 messages to one session, then 20 messages across four users.
The retained comparison adds one reference per scope. It represents the previous warm benchmark, not baseline production behavior.

| Baseline mode | Request p50 / p95 | First text p50 / p95 | SQLite opens / Recall starts |
| --- | --- | --- | --- |
| Production open/send/close | 22.01 / 42.57 ms | 13.47 / 28.41 ms | 51 / 51 |
| Retained reference | 12.79 / 15.94 ms | 7.84 / 11.49 ms | 4 / 4 |

Percentiles use the 30 subsequent single-user messages. Counts cover all 51 requests.
Request latency includes Telegram adapter persistence and local HTTP delivery. First text stops at the runtime stream event.
Context preparation includes store initialization, Recall, and tool preparation.
SQLite timing includes directory creation, permissions, database open, and schema work. It does not isolate SQLite syscall time.
The first mode also pays process module warmup. Warm percentiles exclude each mode's first request.
This run supports bounded warm reuse. It does not predict real network or model latency.
Raw measurements: `packages/airi-cli/benchmarks/telegram-lifecycle-before.json`.
