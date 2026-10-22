# Generation evidence fixes

## Baseline decision

The baseline is committed before production edits in `d83a744`.
The [baseline report](./REPORT.md) records two automated failures and several reviewed false passes.
No dataset expectation, original answer, or original judge result changed after that commit.

Two small context changes address established evidence-delivery failures.
The original system prompt remains unchanged. No new companion-policy subsystem is introduced.

## Production changes

| File | Change | Evidence |
| --- | --- | --- |
| `packages/angela-cli/src/runtime/runtime.ts` | Always retain warnings for the model, even when an adapter also presents them. Deduplicate and cap them at eight per request. | `recall_unavailable_001` showed callback warnings absent from actual provider requests. |
| `packages/angela-cli/src/runtime/context-builder.ts` | When personal memory is disabled, include that state and prohibit substitute personal saves through other memory stores. | `memory_disabled_001` saved a personal learning goal through a project checkpoint. |

The disabled-memory guidance is conditional and contains 48 words.
It preserves independent project and task controls. It does not globally disable project tools.
Warnings use existing localized messages. They do not include raw exceptions or source-file contents.
Normal enabled-memory requests receive no new disabled-memory guidance.

## Regression evidence

Two new full-runtime tests fail on the baseline source and pass after the fixes.
They use a controlled provider transport to inspect actual outgoing conversations.
They do not mock RuntimeSession, Chat, context construction, or memory storage.

- An unreadable personal-memory file produces host warnings and the same warning evidence in generation.
- Disabled personal memory produces explicit context guidance while independent project storage remains enabled.

The first reproduction run had two expected failures and three existing passes.
After implementation, all five tests in that file pass.
The tests establish evidence delivery. They do not prove that every model follows the delivered guidance.

## Unresolved behavior

The natural-language no-store request still enters automatic episodic capture.
The runtime records user evidence before model generation. A prompt change cannot prevent that earlier write.
Fixing only the final answer or hiding the phrase from this dataset does not repair the privacy boundary.
Request privacy needs consistent enforcement across observations, page tools, project checkpoints, skills, summaries, and later relearning.
That work remains explicit follow-up. This task does not add a phrase matcher or a new memory architecture.

The disabled-memory fix is guidance, not a storage-level permission rule.
A model can still choose an inappropriate independent store. Live results must be read before declaring this failure resolved.
The judge also has known false passes and strict quotation failures, documented in [REVIEW.md](./REVIEW.md).

## Reproduce

```bash
pnpm -F @angela/evals-companion-generation exec tsx run.ts --live \
  --provider google-generative-ai --model gemini-3.5-flash-lite \
  --timeout-ms 90000 --concurrency 2 --output /tmp/generation-after-new.json
pnpm -F @angela/evals-companion-generation test
pnpm -F @angela/evals-companion-generation typecheck
pnpm -F @angela/evals-companion eval --output /tmp/recall-after-new.json
pnpm -F @angela/evals-companion test
pnpm -F @angela/cli test --maxWorkers 1 --no-file-parallelism --testTimeout 30000 --hookTimeout 30000
pnpm -F @angela/cli typecheck
pnpm -F @angela/cli build
pnpm lint
```

The saved Google config supplies the credential for `exec tsx`.
The default package eval command loads the root CLI environment and prepares requests without network generation.
Existing report files are immutable. Use a new output path for each run.
