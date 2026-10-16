# Local camera cues for Angela CLI

Status: accepted

## Existing architecture

`packages/airi-cli/src/bin/run.ts` owns the terminal loop, slash commands, SIGINT/SIGTERM handling, and cleanup.
`Chat.send` already accepts request-only system context alongside persisted conversation turns.
`Context.prepare` keeps system context during compaction and summarizes historical turns only.
CLI services read environment settings, use Valibot at data boundaries, and report localized diagnostics through stderr.
The task/reminder worktree has unrelated merge conflicts. Camera changes use a separate branch from the clean CLI baseline.

## Decision

Keep camera perception inside the CLI package with no scheduler, reminder, or desktop coupling.
Use the OpenSeeFace source as a replaceable face provider.
Vendor its complete original tree through Git subtree, including licenses and models.
Record the upstream revision in `third_party/README.md` and the subtree commit metadata.

```text
Terminal /camera on
  -> Camera session owner
    -> OpenSeeFaceProvider
      -> Python worker -> latest-frame capture -> vendored Tracker
      <- validated derived JSONL
    -> provider-local Eventa observation event
    -> AffectEngine -> rolling window + independent debouncers
    -> CameraContextProvider -> request-only context -> Chat.send -> model
```

The Python sidecar uses the plan's JSONL transport because the tracker runs in Python.
Node routes validated transport observations through an Eventa context with a centralized typed contract.
Each provider owns its Eventa context. Camera instances never share observations.
No process, clock, or lifecycle framework replaces the CLI's existing ownership model.

## Runtime and lifecycle

The Python worker has a separate locked CPU environment under `python/camera-worker`.
Upstream's ONNX Runtime 1.9 binary fails on this kernel because it requests an executable stack.
Angela uses Python 3.11, NumPy 1.26.4, ONNX Runtime 1.23.2, and headless OpenCV 4.11.0.86.
The upstream source and lockfile remain unchanged. No binary patch or kernel protection change is required.

Only `/camera on` creates a provider process. Settings select runtime paths and sample rates but never activate capture.
Readiness requires one successful capture and inference. Startup has a 30-second timeout.
Capture overwrites one frame slot. Inference defaults to ten samples per second and drops queued stale frames.
Device cleanup runs in the worker's `finally` block. CLI cleanup stops the child before releasing other services.
Shutdown allows one second for SIGTERM, then sends SIGKILL.
Worker errors and five-second stream timeouts disable context. Restart requires another explicit `/camera on`.
Health notices appear between input prompts. `/camera debug` shows derived state and bounded error codes.

## Observable cues

The worker converts OpenSeeFace's coordinate system into frontal-relative pose.
Matrix-relative Euler decomposition handles equivalent frontal rotations without false attention-away cues.
Smile-like geometry uses mouth-corner lift relative to mouth width.
Failed 3D fitting omits pose and features instead of fabricating a neutral result.

`AffectEngine` is provider-neutral. It implements presence, neutral/smile/unknown expression, and screen/away/unknown attention.
The rolling window, debouncers, confidence gates, and freshness rules are documented in `src/perception/README.md`.
Clock arguments allow deterministic tests without sleeps. Runtime sampling gaps reset continuity.
Screen attention approximates head direction. It does not measure eye gaze or lesson comprehension.

## Privacy and conversation policy

Camera defaults to OFF, including after restart or session resume.
Frames remain in the Python process and are neither stored nor uploaded.
The strict process schema excludes media, raw landmarks, and identity fields.
Debug output contains derived cues and performance metrics only.

Only stable, fresh cues enter a user-initiated model request.
Changed cues have a ten-second cooldown. Unchanged cues refresh at most once per minute.
The context favors the user's words and prohibits factual claims about feelings, diagnoses, identity, sensitive traits, understanding, or deception.
The model can adjust its tone or explanation pace without commenting on each visual change.
No observation or injected context enters session history, summaries, profile memory, or project memory.
Generated replies retain normal chat persistence.

## V1 boundaries

Optional personal calibration remains deferred until real-camera baseline evaluation.
Voice timing/prosody fusion and advanced expression models remain later milestones.
There is no recognition, biometric authentication, body tracking, HSEmotion, or custom model training.
CPU utilization is not measured. Debug reports capture/processed FPS, inference latency, and dropped frames.
The worker's `--check` command provides dependency diagnostics without opening a camera.
The general `doctor` command does not initialize a camera runtime.

## Validation on 2026-10-17

- Python worker unit tests: 11 passed without webcam or inference dependencies.
- Camera TypeScript tests: 32 passed, including a real fixture subprocess and model request/persistence assertions.
- CLI and i18n typecheck/build: passed.
- i18n tests: 20 passed.
- Full CLI suite: 162 passed, one existing failure in automatic personal-memory recall.
- The same memory failure reproduces on baseline commit `2991a5b` in a separate worktree.
- Root `pnpm lint`: one existing method-signature error in `docs/ai/context/task-reminder-engine-plan.md:310`, plus existing warnings.
- Feature files pass `moeru-lint` without warnings.
- Root `pnpm typecheck`: `stage-ui` exceeded Node's default heap. A larger-heap retry stopped because of host memory pressure.
- Real OpenSeeFace model initialization and inference on a synthetic black frame passed through `worker.py --smoke`.
- Built CLI commands were exercised from `/tmp`: status, unavailable-device enable, diagnostic retention, disable, and clean exit.
- No `/dev/video*` device exists on this host. Live webcam quality, usable latency, and disconnect behavior require hardware acceptance.

The hardware-free tests cover crashes, stalls, malformed protocol, cancellation, shutdown escalation, and missing device behavior.
They do not certify facial cue accuracy across users or lighting conditions.

## Changed files

| Path | Role |
| --- | --- |
| `third_party/openseeface/**` | Complete unchanged upstream source, models, and license notices |
| `third_party/README.md` | Revision, subtree provenance, required source/model inventory |
| `.gitignore`, `eslint.config.ts` | Ignore local Python artifacts and preserve vendored formatting |
| `packages/airi-cli/package.json`, `pnpm-lock.yaml` | Reuse the existing Eventa catalog dependency and include worker source files |
| `packages/airi-cli/python/camera-worker/worker.py` | Capture, OpenSeeFace adapter, diagnostics, JSONL producer |
| `packages/airi-cli/python/camera-worker/test.py` | Hardware-free worker tests |
| `packages/airi-cli/python/camera-worker/pyproject.toml`, `uv.lock` | Independent locked CPU runtime |
| `packages/airi-cli/python/camera-worker/README.md` | Runtime setup and standalone commands |
| `packages/airi-cli/src/perception/observation.ts`, `observation.test.ts` | Protocol, neutral observations, Eventa contract and validation tests |
| `packages/airi-cli/src/perception/openseeface-provider.ts`, `openseeface-provider.test.ts` | Child lifecycle, provider and camera-command tests |
| `packages/airi-cli/src/perception/affect-engine.ts`, `affect-engine.test.ts` | Temporal smoothing and observable cue tests |
| `packages/airi-cli/src/perception/camera-context.ts`, `camera-context.test.ts` | Context budget, cooldown, freshness, and conversational policy |
| `packages/airi-cli/src/perception/camera.ts` | Session opt-in, commands, health notices and composition |
| `packages/airi-cli/src/perception/pipeline.test.ts` | Process-to-model integration and persistence checks |
| `packages/airi-cli/src/perception/fixtures/worker.py`, `smile-screen.json` | Real subprocess fixture without inference dependencies |
| `packages/airi-cli/src/perception/README.md` | Domain semantics and exact default thresholds |
| `packages/airi-cli/src/bin/run.ts` | Commands, indicator, request context and lifecycle wiring |
| `packages/i18n/src/cli.ts` | English and Vietnamese messages and command suggestions |
| `packages/airi-cli/README.md` | Actual setup, privacy behavior, commands, settings and limitations |
| This ADR | Architecture and validation record |
