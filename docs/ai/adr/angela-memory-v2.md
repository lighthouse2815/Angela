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
