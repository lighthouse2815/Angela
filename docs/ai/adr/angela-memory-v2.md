# Angela Runtime and Memory V2

## Storage decision

Memory V2 extends `memory/recall.sqlite`. There is one native SQLite backend, one FTS5 index, and one optional vector projection.
Personal Memory JSON, project checkpoints, tasks, session JSON, and skills keep their existing owners.
The `dataDir` remains the private user boundary. Page scope is the canonical workspace inside that boundary.

Pages carry an explicit tier, claim key, authority, salience, expiry, and version.
Expiry offsets normalize to UTC before SQLite compares their timestamps.
SQLite triggers update page projections inside the page transaction.
Access reinforcement has a SQL cooldown and never rewrites FTS or vectors.
Supersession removes the old projection and retains its explicit history.
Contradiction edges record disagreement without an automatic winner.
Only episodic pages decay. Pinned, semantic, procedural, and core Personal Memory never decay automatically.

## Reference implementation

The reference checkout lives outside Angela at `../ai-memory-reference`. It is neither a dependency nor a service.
Reference revision: `1c86aebc14addccc7ac875913d565c681bfa4a50`.

| Angela behavior | Reference production code | Reference tests and invariant |
| --- | --- | --- |
| Four tiers and page versions | `ai-memory-core/src/page.rs` | Current versions alone enter default retrieval |
| Retention | `ai-memory-store/src/decay.rs` | Salience affects only the time term. Recent repeated access preserves old episodes |
| Reinforcement | `ai-memory-store/src/ops.rs`, `bump_access_for_pages_for_actor` | Unknown IDs are harmless. Access updates bypass FTS |
| Extractive compaction | `ai-memory-consolidate/src/compaction.rs`, `keep_tokens.rs` | Preserve abstract, paths, URLs, error codes. Never compact twice |
| Capture privacy | `ai-memory-core/src/sanitize.rs` | Sanitize before truncation and persistence |
| Authority | `ai-memory-store/src/belief.rs`, `reader.rs` | Weaker inferred evidence cannot replace explicit facts |
| Retrieval evaluation | `ai-memory-consolidate/tests/suite/recall_eval.rs` | Fixed corpus and probes measure recall positions and pollution |
| Zero-provider summaries | `ai-memory-hooks/src/synth.rs`, `session_end_equivalence.rs` | Provider-free evidence remains useful. Replayed session endings are equivalent |
| Optional enrichment | `ai-memory-consolidate/src/consolidator.rs`, `consolidator_oracle.rs` | Structured candidates need source evidence. Failure preserves the original episode |
| Aging passes | `ai-memory-consolidate/src/sweep.rs`, tests `compaction_sweep.rs` | Tier policy precedes compaction. Hot access protects otherwise old episodes |
| Incremental embeddings | `ai-memory-consolidate/src/embed.rs`, tests `embed_backfill.rs` | Unchanged text reuses vectors. A stale generation cannot replace a newer version |

Angela uses a 90-day episodic half-life. The reference default scalar decay differs.
Angela uses SQL reinforcement throttling instead of an unbounded process map.
Compaction replaces the cold body locally. It does not create Git-backed copies of personal data.
Forget operations remove page projections, vectors, edges, and derived copies.

Team servers, Rust crates, memory sidecars, Git-backed personal memory, admin infrastructure, and cross-machine sync are excluded.
Cold-cluster deduplication and dream passes were reviewed in `cold_cluster.rs`, `dream.rs`, and their sweep tests.
Angela initially deduplicates exact and normalized replays within a claim. It does not automatically merge similar independent facts.
Dream clustering needs a larger evaluation corpus before it can change durable knowledge safely.

## Runtime capture

CLI and private Telegram requests use `RuntimeSession.send` for context, tools, model execution, events, and memory capture.
Discord keeps its current text-only policy and does not initialize companion stores.
The runtime accepts a desktop adapter without importing a desktop API.
Transport adapters continue to own approval UI, delivery, voice, perception, and cancellation.

Each event has a unique ID and request correlation ID, plus its session, channel, and workspace.
The synchronous typed event bus retains listeners only. It never retains messages or tool results.
Each request owns a private capture handle. It validates the exact session and workspace before writing an observation.
Capture honors Personal Memory enable and automatic switches, and the recall enable switch.
The runtime rechecks those switches at observation boundaries. Previously offered page tools also recheck policy before writing.
The store sanitizes observation text again before persistence and retains 256 observations per session.

The zero-provider compiler creates an episodic page after each request, including interrupted requests.
Its original goal survives observation-window rollover. Section limits bound summaries and keep repeated consolidation idempotent.
Only host-verified results count as successful tools. Assistant commitments carry an explicit unverified label.
Explicit `Workflow: ...` and `Quy trình: ...` statements can create procedural pages with source-episode edges.

## Native knowledge and forgetting

`memory_page_save` saves technical semantic and procedural pages from verbatim current-user or verified-tool quotes.
The host assigns authority. A transactional version check rejects concurrent stale replacements.
Personal preferences continue through `personal_memory`. Inferred technical pages cannot replace stronger explicit pages.

`/memory purge memory:<id>` removes a page claim, all its versions, and downstream derived pages.
Personal corrections and forget operations also remove captured copies and matching history projections.
Identity-only session tombstones prevent late events or reindexing from restoring forgotten facts.
Forget blocks earlier request correlations while fresh requests can create new memory. Deleted session identities stay blocked.
User-visible conversation archives retain their existing explicit `angela sessions delete <id>` lifecycle.
Deleting an archive also purges its Memory V2 derivatives.

FTS and optional vectors still feed reciprocal-rank fusion. Bounded authority and tier signals resolve close ranking contests.
History remains eligible when the query specifically matches it. Semantic knowledge has no automatic recency penalty.
The deterministic evaluation measures facts, episodes, decisions, procedures, supersession, contradictions, noise, and compaction recall.

## Optional provider enrichment

`/memory consolidate` enriches the current episode with the already configured chat provider.
The zero-provider episode always exists first. Provider failures leave it searchable.
The structured tool contract permits at most six technical semantic or procedural candidates, each with a real source quote.
Enrichment has a 15-second deadline and an output ceiling. It has no filesystem or transport tools.
After generation, the host rechecks privacy switches, episode version, suppression, authority, and pinning before applying candidates.
Derived-from edges preserve provenance. Purging the source also purges downstream knowledge.
Dream clustering stays optional and is not enabled by this change.

## Lifecycle and maintenance

Session boundaries follow runtime acquisition and release. Request boundaries have separate events.
Observer failures cannot interrupt model execution or prevent other observers from receiving an event.
Successful reminder presentation emits a correlated delivery event. The existing lease and acknowledgment policy remains in the scheduler.
Project observations include the checkpoint that the host actually saved, rather than only a tool name.
Successful task commands also emit domain events and capture their saved result without a provider call. Invalid commands emit no success event.
The compiler preserves literal diagnostics beyond its prose excerpt, then prioritizes decisions and failures within the summary budget.
Cold aging runs in bounded idle indexing passes. `/memory age` also runs one explicit pass.
Foreground context preparation pauses new background embedding batches and compaction passes.
If an optional memory file is invalid, the runtime omits its tools and continues the conversation with a warning.

## SQLite performance and cleanup

The connection uses WAL, `synchronous=FULL`, a three-second busy timeout, and a 512-page automatic checkpoint.
Prepared statement caches contain at most 48 entries per owner. They cache compiled SQL, never personal text or search results.
File reconciliation prunes at most 32 origins per transaction and yields between batches.
Page projections remain outside file pruning. Unchanged source text retains vectors, and version guards reject stale embedding writes.

Reinforcement checks its SQL cooldown before acquiring the writer lock.
Automatic context excludes this session's own episode because Chat already owns its working history.
Explicit recall can still retrieve that episode. Only memory actually selected for context receives reinforcement.
Session checkpoint versions preserve their existing access history.

A scoped aging cursor advances past old reinforced episodes and survives adapter release.
Idle passes inspect four candidates. Explicit aging inspects at most 128 candidates.
The scoped aging index covers its time and ID cursor. No separate last-access index or speculative duplicate index is required.

Forget traverses derivation and supersession together. It deletes projections, vectors, source observations, and edges in one transaction.
Source-session deletion preserves later independent explicit knowledge.
Identity-only blocked correlations stop late results. Fresh requests after forgetting remain eligible for capture.
Destructive operations checkpoint obsolete WAL frames before returning success.
If an external reader prevents that checkpoint, cleanup reports an error and requires a retry after the reader releases its snapshot.
An idempotent purge retries physical cleanup even when the earlier call already deleted the page.
Credential filtering also covers English and Vietnamese declarations. Sensitive claim keys and kinds are rejected before storage.
Personal corrections purge derived data while the existing personal-file lock is held, before the atomic JSON replacement.
A cleanup failure leaves the authoritative old fact available for an explicit retry.
Identity-only source-version tombstones reject stale personal snapshots from another indexer after the purge completes.
New explicit facts have new source versions and remain eligible for indexing.
Model-driven forget also suppresses the active request's captured session, so its assistant confirmation cannot immediately relearn the forgotten fact.
Personal-memory model tools reject recognized credentials using the same sanitizer. Direct explicit local edits keep their existing storage contract.
