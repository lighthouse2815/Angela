# Angela Runtime and Memory V2

## Storage decision

Memory V2 extends `memory/recall.sqlite`. There is one native SQLite backend, one FTS5 index, and one optional vector projection.
Personal Memory JSON, project checkpoints, tasks, session JSON, and skills keep their existing owners.
The `dataDir` remains the private user boundary. Page scope is the canonical workspace inside that boundary.

Pages carry an explicit tier, claim key, authority, salience, expiry, and version.
SQLite triggers update page projections inside the page transaction.
Access reinforcement has a SQL cooldown and never rewrites FTS or vectors.
Supersession removes the old projection and retains its explicit history.
Contradiction edges record disagreement without an automatic winner.
Only episodic pages decay. Pinned, semantic, procedural, and core Personal Memory never decay automatically.

## Reference implementation

The reference checkout lives outside Angela at `../ai-memory-reference`. It is neither a dependency nor a service.
The source revision is recorded in the final validation report.

| Angela behavior | Reference production code | Reference tests and invariant |
| --- | --- | --- |
| Four tiers and page versions | `ai-memory-core/src/page.rs` | Current versions alone enter default retrieval |
| Retention | `ai-memory-store/src/decay.rs` | Salience affects only the time term. Recent repeated access preserves old episodes |
| Reinforcement | `ai-memory-store/src/ops.rs`, `bump_access_for_pages_for_actor` | Unknown IDs are harmless. Access updates bypass FTS |
| Extractive compaction | `ai-memory-consolidate/src/compaction.rs`, `keep_tokens.rs` | Preserve abstract, paths, URLs, error codes. Never compact twice |
| Capture privacy | `ai-memory-core/src/sanitize.rs` | Sanitize before truncation and persistence |
| Authority | `ai-memory-store/src/belief.rs`, `reader.rs` | Weaker inferred evidence cannot replace explicit facts |
| Retrieval evaluation | `ai-memory-consolidate/tests/suite/recall_eval.rs` | Fixed corpus and probes measure recall positions and pollution |

Angela uses a 90-day episodic half-life. The reference default scalar decay differs.
Angela uses SQL reinforcement throttling instead of an unbounded process map.
Compaction replaces the cold body locally. It does not create Git-backed copies of personal data.
Forget operations remove page projections, vectors, edges, and derived copies.

Team servers, Rust crates, memory sidecars, Git-backed personal memory, admin infrastructure, and cross-machine sync are excluded.

## Runtime capture

CLI and private Telegram requests use `RuntimeSession.send` for context, tools, model execution, events, and memory capture.
Discord keeps its current text-only policy and does not initialize companion stores.
The runtime accepts a desktop adapter without importing a desktop API.
Transport adapters continue to own approval UI, delivery, voice, perception, and cancellation.

Each event has a unique ID and request correlation ID, plus its session, channel, and workspace.
The synchronous typed event bus retains listeners only. It never retains messages or tool results.
Each request owns a private capture handle. It validates the exact session and workspace before writing an observation.
Capture honors Personal Memory enable and automatic switches, and the recall enable switch.
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
The affected session's automatic captures stop. This favors privacy over retention of its other captured details.
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
The compiler preserves literal diagnostics beyond its prose excerpt, then prioritizes decisions and failures within the summary budget.
Cold aging runs in bounded idle indexing passes. `/memory age` also runs one explicit pass.
Foreground context preparation pauses new background embedding batches and compaction passes.
If an optional memory file is invalid, the runtime omits its tools and continues the conversation with a warning.
