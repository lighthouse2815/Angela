# Companion generation evaluation

## Scope and sequence

1. Audit the behavior spec, ADRs, runtime, memory, tasks, and existing tests.
2. Add 50 generation cases, a schema, a production-path runner, and runner tests.
3. Record an immutable baseline before production edits.
4. Use baseline evidence to select small fixes, or document unresolved failures.
5. Run generation and recall evaluations, CLI tests, typechecks, lint, and the CLI build.
6. Record results, limitations, and reproduction commands. Commit and push each completed part.

No Memory V3, Recall rewrite, vector database, or multi-agent system enters this task.

## Source audit

Initial source: `8ca4fea`. The repository lives in `airi/` under the supplied working directory.

| Layer | Existing implementation | Evaluation implication |
| --- | --- | --- |
| Retrieval | Recall validates source versions, scopes, expiry, and supersession. Optional embeddings supplement lexical retrieval. | Record source identities independently from generated claims. |
| Context | `buildContext` combines bounded Recall, project, and task guidance. Current episodes stay outside automatic Recall context. | Capture the actual conversation at the provider boundary. |
| Generation | `Chat` uses a short companion prompt, current history, and core-agent. Recall guidance gives current corrections precedence. | Generate through `RuntimeSession.send`, with real memory and tools. |
| Tool outcome | `buildTools.observe` distinguishes verified, unverified, and failed outcomes. Task mutations require saved results. | Retain tool results and runtime events separately from model prose. |
| Capture | Memory V2 labels user text, verified tools, failures, and unverified assistant commitments separately. | Inspect post-request durable state for forbidden writes. |
| Reminders | Tasks separate pending, claim, delivery, and completion. Scheduler acknowledgment proves presentation, not reading. | Seed delivery through real task state transitions, without external notifications. |

The existing companion evaluation measures retrieval and context. Its abstention labels do not evaluate generated answers.
Its latest report records 120/128 complete passes, 101/106 recall hits, and 98/106 context hits.
Wrong memory, supersession errors, and irrelevant injection are zero in that report.

The current system prompt does not enumerate every spec distinction. This observation alone does not prove a generation failure.
No production fix is authorized by a static prompt comparison alone.

## Measurement contract

Fixtures create state through production storage and tool APIs. Fixtures never read expected answers during context construction.
Generation receives only current messages, historical sources, production guidance, and actual tool results.
Semantic judging receives frozen expectations after generation. It cannot edit them.
Deterministic checks cover source selection, forbidden writes, and required action transitions.
Model judging covers claims, uncertainty, attribution, and conversational behavior.
Infrastructure failures and unjudged cases never count as behavior passes.
The default command prepares contexts without network requests. Live generation requires `--live`.

## Read set

- `docs/ai/companion-behavior-spec.md` and the companion, learning-memory, and Memory V2 ADRs.
- Other ADRs establish UI, voice, camera, and integration boundaries outside this CLI generation task.
- `evals/companion/`, including schema, fixtures, scoring, reports, and regressions.
- CLI `chat.ts`, `context.ts`, `runtime/`, `recall.ts`, `memory.ts`, and `memory-v2/`.
- CLI tasks, task tools, scheduler, notifications, delivery, sessions, and their related tests.
- core-agent conversation, tool invocation, stream, and provider contracts.

CLI/private-channel results do not certify desktop Pinia learning-memory behavior or real notification transport.
