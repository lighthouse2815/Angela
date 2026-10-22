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

## Language and bounded query expansion

Name, nickname and preferred form of address share a narrow relation. Query expansion uses existing FTS tokens and existing projections.
Subject qualifiers still need evidence. A question about Lan cannot accept another person's preferred name based on the relation alone.
Recent-session page joins use the existing primary-key index. SQLite query-plan inspection confirmed an indexed lookup instead of a page scan.
No new index or schema change was required.

No synonym table maps learning goals to dataset answers. Existing optional vectors remain the route for broader semantic paraphrases.

Grammar removal now precedes accent folding at the context gate.
This preserves Vietnamese `ăn` and `bản` instead of erasing them as English `an` or Vietnamese `bạn`.
Stored source text stays unchanged. Existing indexed pages need no migration or rebuild.
A procedural tier plus a topical token also supplies two independent signals for an explicit workflow question.

The original 21 failures now have a dedicated regression suite using unchanged cases and baseline IDs.
Sixteen corrected cases must pass every label. Five unresolved semantic paraphrases retain all contamination and safety checks.
A complete-corpus test enforces the requested recall and contamination targets, alongside baseline context and pass-rate floors.
No test asserts that an unresolved quality failure is correct behavior.

Current lexical checkpoint: 101/106 recall hits, 98/106 context hits, 120/128 complete passes.
Wrong-memory, supersession, false-shared-memory and irrelevant injection counts are zero.
Eight semantic paraphrases remain excluded from automatic context. Three previously passed through incidental lexical matches.
This conservative policy does not infer a semantic relationship that lexical retrieval cannot establish.

## Before and after

The original [baseline](./baseline.json) remains unchanged. The final raw results are in [after.json](./after.json).
Both runs use the same 128 cases, 16 categories, expectations and offline lexical mode.
False shared-memory measures forbidden context evidence, not generated claims from a model.

| Metric | Before | After |
| --- | ---: | ---: |
| Recall hit rate | 93/106 (87.74%) | 101/106 (95.28%) |
| Wrong-memory rate | 0/6 (0.00%) | 0/6 (0.00%) |
| Superseded-memory error rate | 0/16 (0.00%) | 0/16 (0.00%) |
| False shared-memory rate | 0/8 (0.00%) | 0/8 (0.00%) |
| Irrelevant-memory injection rate | 8/32 (25.00%) | 0/32 (0.00%) |
| Context hit rate | 93/106 (87.74%) | 98/106 (92.45%) |
| Forbidden-content rate | 0/32 (0.00%) | 0/32 (0.00%) |
| Case pass rate | 107/128 (83.59%) | 120/128 (93.75%) |

Sixteen original failures now pass. Five original recall misses remain.
Three formerly passing paraphrases now fail automatic context selection because their only overlap was incidental vocabulary.
All eight remaining failures belong to `semantic_paraphrase`.

| Remaining case | Explicit recall | Automatic context |
| --- | --- | --- |
| `semantic_paraphrase_001` | Miss | Excluded by relevance gate |
| `semantic_paraphrase_002` | Hit | Excluded by relevance gate |
| `semantic_paraphrase_003` | Hit | Excluded by relevance gate |
| `semantic_paraphrase_004` | Miss | Excluded by relevance gate |
| `semantic_paraphrase_005` | Hit | Excluded by relevance gate |
| `semantic_paraphrase_006` | Miss | Excluded by relevance gate |
| `semantic_paraphrase_007` | Miss | Excluded by relevance gate |
| `semantic_paraphrase_008` | Miss | Excluded by relevance gate |

The five recall misses have no usable lexical overlap. No embedding provider is configured in this evaluation mode.
The three additional context failures previously matched words such as `khi` or `ngày` without establishing the requested relationship.
No blanket preference injection or answer-specific synonym expansion was added to recover those points.
Real embeddings need a separate model-specific evaluation before stronger semantic quality claims.
The existing vector route is covered with deterministic vectors, not a paid service.

## Production scope

- `recall.ts`: separate automatic context filtering from explicit search and route general conversation recaps.
- `recall-index.ts`: apply the relevance gate after ranking and select bounded evidence from an eligible prior session.
- `recall-query.ts`: normalize query language, detect recap intent and expand narrow name relations.

Memory storage, capture architecture, authority, purge, supersession and provider configuration remain unchanged.
No dependency, vector database, background generation or paid API was added.
No dataset expectation, original baseline result or existing regression assertion was removed.

## New regression coverage

The CLI gains 29 tests across `recall-index.test.ts`, `recall.test.ts` and `recall-query.test.ts`.
They test the actual index and Recall source boundaries, not a replacement memory implementation.
Coverage includes ranking-independent rejection, exact diagnostics, semantic vector evidence, workspace isolation, supersession and context budgets.
Recent-session tests cover dates, alternate phrasings, missing history, suppressed sources, expired sources and topical past references.
Language tests cover composed accents, spelling variants, nickname wording and qualified third-person name queries.

Companion eval gains 22 tests: one for each original failure and one complete-corpus target check.
Unresolved paraphrases keep their original expectations and safety checks. They are still reported as quality failures.
The full runner with `--strict` therefore remains a nonzero quality gate until every case passes.

## Final validation

Final runtime source commit: `1989b0e09da7b17e460e7c4778712a3ed823d252`.
The artifact records this source commit and the unchanged dataset hash.
Two final runs produced byte-identical reports after source identity and temporary-path normalization.

Checks ran sequentially with one Vitest worker and file parallelism disabled.

| Command | Result |
| --- | --- |
| `pnpm -F @angela/cli test --maxWorkers 1 --no-file-parallelism --testTimeout 30000 --hookTimeout 30000` | 50 files, 413 tests passed |
| Related CLI tests after the final indexed-join refinement | 16 files, 154 tests passed |
| `pnpm -F @angela/evals-companion test` | 2 files, 45 tests passed |
| `pnpm -F @angela/cli typecheck` | Passed after the final code change |
| `pnpm -F @angela/evals-companion typecheck` | Passed after the final code change |
| Targeted ESLint for changed CLI and eval files | Passed |
| `pnpm -F @angela/cli build` | Passed after the final code change |
| `node packages/angela-cli/dist/bin/run.mjs --help` | Passed |
| `pnpm lint` | Passed, ESLint 0 errors and 603 existing warnings. Oxlint 12 warnings |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm typecheck --concurrency=1` | 53 tasks passed before the final SQL join refinement |
| Final complete companion runner, twice | 120/128 passed, reports byte-identical |
| `git diff --check` | Passed |

The related CLI command after the final join refinement was:

```bash
pnpm -F @angela/cli exec vitest run --config vitest.config.ts \
  src/memory-v2 src/recall-index.test.ts src/recall-query.test.ts src/recall.test.ts \
  src/memory.test.ts src/project-memory.test.ts src/context.test.ts \
  src/runtime src/cli.test.ts --maxWorkers 1 --no-file-parallelism \
  --testTimeout 30000 --hookTimeout 30000
```

The first full CLI run used the default five-second timeout.
It passed 389 tests and timed out in an unchanged task-retention stress test, followed by cleanup failure.
The final complete run uses the repository CI timeout of 30 seconds and passes all 413 tests.
No test timeout configuration or production task code was changed.

The first root typecheck exhausted the default Node heap in `stage-ui` after 46 successful tasks.
A single sequential retry with a four-gigabyte heap passed all 53 tasks.
No project TypeScript configuration was changed to suppress errors.

Build output retains the existing `task-commands.ts` dynamic/static import warning.
The full companion runner remains nonzero with `--strict` because eight quality cases remain unresolved.
These are documented quality failures, not hidden or changed expectations.

## Reproduce

```bash
pnpm -F @angela/evals-companion eval --output /tmp/recall-after.json
pnpm -F @angela/evals-companion test
pnpm -F @angela/cli exec vitest run --config vitest.config.ts \
  src/recall-index.test.ts src/recall-query.test.ts src/recall.test.ts \
  --maxWorkers 1 --no-file-parallelism
```

Use `pnpm_config_verify_deps_before_run=false` if local pnpm attempts an unrelated automatic dependency install.
The native pnpm binary was placed first on PATH for root Turbo typechecking to avoid the known local launcher problem.
No credentials, real user history or paid API calls enter these reports.
