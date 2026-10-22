# Recall quality improvements

## Initial investigation

Read all 21 failed cases before implementation. Dataset and expected labels remain unchanged.

| Initial failures | Count | Root cause |
| --- | ---: | --- |
| `no_shared_memory_004`, `no_shared_memory_005` | 2 | One folded syllable matched unrelated study text |
| `irrelevant_memory_001`, `002`, `003`, `004`, `006`, `007` | 6 | OR matching admitted weak or ambiguous words |
| `last_conversation_001`, `002`, `003`, `004`, `006`, `007`, `008` | 7 | General recap had no topic tokens and no temporal source selection |
| `semantic_paraphrase_001`, `004`, `006`, `007`, `008` | 5 | No lexical overlap and no configured embedding provider |
| `vietnamese_variants_005` | 1 | Name and nickname use different words, beyond accent folding |

Accent folding already removes Vietnamese combining marks and maps `đ` to `d`.
RRF uses candidate position, not an absolute relevance score. A sole weak result still ranked first.
Authority weights made explicit facts rank well but did not establish topic relevance.
Automatic context accepted every validated result that fit its character budget.
Increasing top K or budget cannot resolve these causes.

## Relevance gate

Automatic context now requires two distinct query content tokens, or the full query when only one content token remains.
Two tokens provide corroboration beyond a single ambiguous word. This is a conservative lexical rule, not a probability estimate.
Query scaffolding is removed before the gate. Document matching reads the full bounded excerpt, not its last 32 tokens.
The existing vector similarity floor remains an independent route to semantic relevance.
Rank fusion and authority cannot override the gate. Explicit memory search retains broad results for further inspection.

Candidate limits remain 80 per retrieval channel. Recall still returns at most 12 validated results and two per ordinary origin.
Context budget remains unchanged. Sources are validated after retrieval and reinforced only after selection.
Core personal facts retain their existing explicit profile policy.

Positive and negative tests cover a sole weak result, twenty weak results, exact diagnostics, strong phrases and vector evidence.
Context tests check omission, reinforcement and budget behavior through the real Recall API.

The gate deliberately exposes weak lexical matches that the baseline previously counted as useful.
Later checkpoints report context hit rate and newly failing cases alongside the requested recall metrics.

## Recent conversation intent

General recaps require three signals: past time, conversation language and no remaining topic.
Accented and unaccented Vietnamese share normalization. English conversation questions use the same policy.
Topical questions keep their FTS/vector path. Mentioning “lần trước” alone never selects a session.

The index selects one latest eligible session, excluding the current session, other scopes and suppressed sessions.
Only history or episodic session pages qualify. Semantic preferences cannot substitute for missing conversations.
Expiry and supersession remain enforced. Recall still validates archive versions and page authority before returning evidence.
An archived overview and bounded source excerpts cover the session without injecting every archived message.

Tests cover five recap phrasings, two historical dates, a newer foreign workspace, current-session exclusion and episodic-only stores.
Negative tests cover topical past references, an empty eligible history, expiry, suppression and supersession.
This checkpoint recalls all eight general-recap cases. The full lexical recall metric becomes 100/106.
