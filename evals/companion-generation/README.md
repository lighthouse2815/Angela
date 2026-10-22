# Companion behavior generation evaluation

This package evaluates generated answers against [the companion behavior spec](../../docs/ai/companion-behavior-spec.md).
The 57 synthetic cases cover 29 Rule IDs and 12 categories.
The existing [companion evaluation](../companion/README.md) separately measures retrieval and context.

## Run

The default command creates disposable stores and prepares real provider requests. It does not contact a model.
Preparation does not establish behavior compliance. Its behavior pass rate is `null`.

```bash
pnpm -F @angela/evals-companion-generation eval
pnpm -F @angela/evals-companion-generation eval --id plan_not_completed_001
pnpm -F @angela/evals-companion-generation eval --category correction
pnpm -F @angela/evals-companion-generation check:dataset
pnpm -F @angela/evals-companion-generation test
```

If the provider is available, use `--live` for generation and semantic judging.
The CLI config and `ANGELA_*` environment variables select the provider, model, endpoint, protocol, and credential.
The package command loads the existing root `.env.cli.local`. No credential enters report metadata.
Flags override environment values through the existing CLI config reader.

```bash
pnpm -F @angela/evals-companion-generation eval --live --output /tmp/generation-baseline.json
pnpm -F @angela/evals-companion-generation eval --live --id plan_not_completed_001 --strict
pnpm -F @angela/evals-companion-generation eval --live --category correction --strict
pnpm -F @angela/evals-companion-generation eval --live --model MODEL --config /path/to/config.json
```

`--judge-model` or `ANGELA_EVAL_JUDGE_MODEL` selects another judge model on the same configured provider.
By default, generation and judge use the same model. This creates correlated-error risk.
`--no-judge` records live answers and deterministic checks as `unjudged`. It never creates a semantic pass.
`--timeout-ms` defaults to 45000. Each case permits at most 12 generation requests and 24000 answer characters.
Judge output is limited to 32000 characters. Generation and judging each receive their own timeout.
Reports refuse an existing output path. Every completed case checkpoints the report.

| Exit | Meaning |
| --- | --- |
| 0 | Completed run without infrastructure errors. Quality failures remain report data unless strict. |
| 1 | Strict run has failures, unjudged answers, or preparation-only cases. |
| 2 | Invalid input, provider failure, empty answer, or invalid judge output. |

## Production boundary

```text
fixture state -> Memory / MemoryStore / session archive / Tasks / taskTools
  -> RuntimeSession.send -> buildContext / buildTools
    -> Chat.send -> Context.prepare -> core-agent -> configured provider
      -> deterministic checks -> separate semantic judge -> report
```

The harness accepts only `input`. It cannot read `expected`.
Fixtures set source text, authority, ownership, workspace, and current history.
Task fixtures execute real task tools. Delivery fixtures use real claim and acknowledgment methods without external notifications.
Canonical assistant tool turns retain the actual returned results.
The `live_task_create_001` case also requires a saved domain event from model-selected production tools.
Discord exercises its existing text-only path. It does not initialize private companion stores.

The harness records exact protocol request bodies at the provider fetch boundary. This includes context after production compaction.
It records text deltas, tool events, runtime outcomes, warnings, source IDs, and durable post-request state.
Temporary paths and random fixture page IDs receive aliases. Original source text remains intact.
Timestamps and generated IDs remain in raw runtime events. Repeated live runs are not byte-identical.
Headers and provider credentials are excluded. Use synthetic fixtures, because reports intentionally retain conversation and memory text.

Retrieval uses the existing lexical mode with embeddings disabled in the disposable runtime.
No paid embedding request, real user store, filesystem connector, or notification transport enters evaluation.
These results do not certify desktop learning-memory, compaction under long conversations, or real notification delivery.

## Dataset and expectations

`cases.jsonl` contains one case per line. `schema.ts` validates cases through the existing Valibot dependency.
Every case has an ID, category, fixture `input`, and structured `expected` object.

| Expectation | Check |
| --- | --- |
| `requiredClaims` | Judge checks each required meaning independently. |
| `forbiddenClaims` | Judge checks asserted meanings. Denials and attributed historical quotes remain valid. |
| `allowedUncertainty` | Judge checks the required degree and expression of uncertainty. |
| `expectedEvidenceType` | Judge checks attribution and evidence limits. |
| `expectedRuleIds` | Associates the case with fixed spec rules. |
| `expectedActionState` | Judge checks the target action status, independently from incidental valid memory writes. |
| `expectedMemoryUse` | Source must reach a generation request or an actual tool result. |
| `forbiddenMemoryUse` | Source must stay outside generation requests and tool results. |
| `forbiddenDurableText` | Deterministic substring check of post-request memory and observations. |
| `requiredEvents` | Deterministic check of successful runtime domain events. |

Source checks distinguish explicit retrieval, injected context, and tool-mediated reads.
They do not infer successful recall from plausible prose.
Durable substring checks are narrow leak probes. They cannot detect every paraphrase or incorrect semantic write.
Roleplay and temporary-preference cases therefore also need semantic review of storage decisions.

## Judge contract and metrics

`scoring.ts` owns a versioned judge prompt and a strict result schema.
Judge requests use native JSON Schema output through the existing provider SDK.
Unsupported structured output is an infrastructure failure. The runner never silently substitutes a less strict output mode.
The judge receives the frozen criterion list only after generation. It cannot add, omit, reorder, or rename criteria.
Quoted answer evidence must occur exactly in the answer. Missing required claims can use an empty quote with an explanation.
Malformed output is an infrastructure failure. The runner retains raw judge output and does not silently retry or repair it.

Semantic behavior pass rate counts only cases with valid judgments.
Complete-case pass rate also requires source, durable-state, and action-event checks to pass.
Both denominators exclude infrastructure failures, preparation, and unjudged answers. The report shows all excluded counts.
Rule statistics count associated case failures. They do not establish which individual rule caused each failure.
Failure layers separate retrieval, context, memory writes, generation, tool outcomes, and infrastructure.

Reports include the commit, production diff hash, dataset hash, judge prompt hash, model, protocol, sampling setting, and clock.
Temperature zero reduces variability. Provider changes, stochastic inference, live clocks, and model judging still limit reproducibility.
Inspect raw answers and judge decisions before selecting any production fix.
Keep the dataset and baseline unchanged when comparing later fixes.

If pnpm attempts an unrelated automatic install, set `pnpm_config_verify_deps_before_run=false` for the command.
