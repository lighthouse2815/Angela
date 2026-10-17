# Angela Camera / Affect Engine — Implementation Plan

## Purpose

Build a local-first camera perception subsystem for Angela CLI so Angela can use visible facial / attention cues as **soft conversational context** while acting as an AI friend and study companion.

This is **not** a medical, psychological, lie-detection, or ground-truth emotion detector. The subsystem should detect observable cues such as face presence, smile-like expression, neutral state, head/attention direction, and later uncertainty/fatigue-like cues. Angela may use those cues to adapt its wording, teaching pace, or follow-up behavior.

Examples of intended UX:

- User looks confused for several seconds while Angela explains a lesson → Angela may offer a simpler example.
- User repeatedly looks away during a study session → Angela may ask whether they want a short break.
- User smiles after getting an answer right → Angela may respond more warmly.
- User says "tao hiểu rồi" but visual state remains uncertain → Angela may gently verify understanding instead of asserting that the user is confused.

Never present uncertain camera inference as a fact about the user's inner emotional state.

---

## Product Direction

Angela is currently prioritizing:

1. AI friend / conversational companion;
2. study companion / tutor;
3. small everyday errands and reminders;
4. richer multimodal interaction;
5. coding-agent features later.

Therefore this feature is a **perception/context layer**, not a standalone computer-vision demo and not a coding-agent feature.

It should be developed in parallel with the Task & Reminder Engine without tightly coupling the two systems.

Conceptually:

```text
Task & Reminder Engine
        │
        └── action / assistant layer

Camera / Affect Engine
        │
        └── perception / context layer

                    ↓
              Angela Context
                    ↓
                  LLM
```

---

## Repository Rules

Before coding:

1. Read the root `AGENTS.md` completely and follow it.
2. Inspect `packages/airi-cli` and reuse existing process, logging, config, lifecycle, cleanup, event, prompt/context, and test patterns.
3. Search before creating utilities.
4. Keep Angela-owned integration code in the normal project structure. Keep imported upstream source isolated under `third_party/`.
5. Do not rewrite unrelated CLI architecture as part of this feature.
6. Do not use `any`.
7. Use validated schemas at process boundaries.
8. Keep camera processing local by default.
9. Camera must be OFF by default.
10. Do not store raw camera frames/video by default.

The plan below is architectural guidance. Adapt paths to the actual repository instead of forcing an incompatible structure.

---

## Upstream Foundation

### Base repository

Use OpenSeeFace as the initial local face-tracking foundation:

```text
https://github.com/emilianavt/OpenSeeFace
```

OpenSeeFace provides CPU-based real-time face detection / landmark tracking using Python, ONNX Runtime, OpenCV, NumPy and bundled tracking models.

The intent is to bring the source into Angela so the implementation can later be studied, modified, simplified, or gradually replaced by Angela-owned components.

#### Important source-management rule

Do not copy files manually without provenance.

Prefer one of these approaches, in this order:

1. `git subtree` under `third_party/openseeface/`;
2. another repository-native vendoring mechanism if the existing Angela repo clearly uses one already;
3. only use a plain source copy if subtree/vendor tooling is not workable, and preserve source metadata in documentation.

Recommended command shape:

```bash
git remote add openseeface https://github.com/emilianavt/OpenSeeFace.git
git fetch openseeface
git subtree add --prefix=third_party/openseeface openseeface master
```

Do not remove upstream `LICENSE`, `Licenses/`, copyright notices, or model/license notices.

Do not immediately modify vendored upstream code unless required for integration. Build an adapter around it first.

#### Why OpenSeeFace instead of vendoring MediaPipe

Do not vendor the entire MediaPipe repository for this milestone. It is much larger and introduces unnecessary build/framework complexity for Angela's current CLI experiment.

MediaPipe can still be used later as:

- a benchmark;
- an alternate provider;
- a replacement provider;
- a comparison for blendshape / landmark quality.

The architecture must not make OpenSeeFace permanent or irreplaceable.

---

## Target Architecture

Keep upstream tracking code isolated from Angela-owned perception logic.

Conceptual layout:

```text
Angela/
├── third_party/
│   └── openseeface/
│       ├── LICENSE
│       ├── Licenses/
│       ├── models/
│       └── upstream source...
│
└── packages/airi-cli/src/
    └── perception/
        ├── camera/
        ├── face/
        ├── affect/
        └── context/
```

Suggested logical components:

```text
CameraSource
     ↓
FacePerceptionProvider
     ↓
OpenSeeFaceAdapter
     ↓
RawFaceObservation
     ↓
TemporalSmoother
     ↓
AffectEngine
     ↓
AffectState
     ↓
CameraContextProvider
     ↓
Angela Context / prompt
```

The exact directory names may change to fit the repo.

---

## Process Boundary

OpenSeeFace is Python-based while Angela CLI is TypeScript/Node-oriented. Do not mix Python internals directly into random CLI files.

For V1, use a **local sidecar process** boundary unless the current architecture already has a better subprocess/provider mechanism.

Recommended design:

```text
Angela CLI (TypeScript)
        │
        │ spawn
        ↓
Angela camera worker (Python)
        │
        ↓
OpenSeeFace vendored source
```

Communication should use a small structured protocol such as newline-delimited JSON over stdin/stdout.

Example worker event:

```json
{
  "type": "face_observation",
  "timestamp": 1792188000000,
  "faceDetected": true,
  "confidence": 0.93,
  "headPose": {
    "yaw": -5.2,
    "pitch": 2.1,
    "roll": 0.8
  },
  "features": {
    "eyeOpenLeft": 0.87,
    "eyeOpenRight": 0.85,
    "mouthOpen": 0.08,
    "smileLike": 0.62
  }
}
```

The exact feature names should follow what can be robustly derived from the upstream tracker.

Requirements for the process boundary:

- validate incoming worker events;
- handle malformed output without crashing Angela;
- detect worker exit;
- restart only with bounded retry policy;
- cleanly stop camera and child process on CLI exit;
- never print worker debug logs into the JSON protocol stream;
- send debug logs to stderr or a dedicated logging channel;
- expose clear diagnostic errors when camera dependencies are missing.

---

## Privacy and Safety Requirements

These are product requirements, not optional polish.

### Camera state

Camera must be OFF by default.

User must explicitly enable it through a command/config flow such as:

```text
/camera on
```

or equivalent existing CLI convention.

When enabled, show a persistent or clearly visible indicator, e.g.:

```text
📷 Camera perception: ON
```

Provide an obvious disable command:

```text
/camera off
```

### Raw media

By default:

- do not save screenshots;
- do not save video;
- do not persist face crops;
- do not upload raw camera frames to the LLM/provider;
- do not put image bytes into conversation/session persistence.

Process frames in memory and emit only derived observations / compact affect state.

Raw-frame capture may later be exposed only as an explicit debugging feature with clear user action, never silently.

### Language used by Angela

Do not allow camera context to produce authoritative claims like:

```text
"Mày đang buồn."
"Mày đang tức giận."
"Mày đang nói dối."
```

Prefer soft phrasing such as:

```text
"Trông có vẻ đoạn này hơi khó theo, muốn tao giải thích cách khác không?"
"Hình như mày đang mất tập trung một chút. Nghỉ 5 phút không?"
```

Camera-derived state is advisory context only.

Do not infer mental-health diagnoses, personality, deception, protected attributes, or other sensitive traits.

---

## Phase 1 — Vendor and Run OpenSeeFace Independently

Before integrating with Angela conversation logic, make the tracker work as an isolated local component.

Tasks:

1. Vendor OpenSeeFace under `third_party/openseeface/` while preserving licenses.
2. Document exact upstream revision imported.
3. Identify minimum required source/model/dependency set.
4. Verify webcam capture works on the primary development platform.
5. Verify one-face tracking works at usable latency.
6. Avoid changing upstream code unless necessary.
7. Add a small Angela-owned worker wrapper outside the upstream directory.

Suggested Angela-owned worker path:

```text
packages/airi-cli/python/camera_worker/
```

or an equivalent existing location for auxiliary runtimes.

The worker should expose only the data Angela actually needs, not the entire OpenSeeFace internal API.

### Acceptance for Phase 1

A developer command should be able to print a stream similar to:

```text
face=true yaw=-2.1 pitch=1.8 confidence=0.94
face=true yaw=-1.7 pitch=2.0 confidence=0.95
face=false
```

No LLM/context integration yet.

---

## Phase 2 — TypeScript Provider / Worker Manager

Create a TypeScript boundary for the camera worker.

Conceptual interface:

```ts
interface FacePerceptionProvider {
  start: () => Promise<void>
  stop: () => Promise<void>
  getLatestObservation: () => RawFaceObservation | undefined
  subscribe: (listener: (observation: RawFaceObservation) => void) => () => void
}
```

Implement:

```text
OpenSeeFaceProvider
```

Responsibilities:

- spawn worker;
- monitor lifecycle;
- parse JSONL;
- validate schema;
- keep latest observation;
- expose events;
- graceful shutdown;
- surface health/status;
- avoid leaking Python-specific details into higher layers.

Add unit tests using a fake worker/process abstraction where practical.

Do not require a physical webcam for normal automated unit tests.

---

## Phase 3 — Raw Observation Model

Create a provider-neutral observation model.

Example conceptual shape:

```ts
interface RawFaceObservation {
  timestamp: number
  faceDetected: boolean
  confidence?: number

  headPose?: {
    yaw?: number
    pitch?: number
    roll?: number
  }

  landmarks?: FaceLandmarkSummary
  features?: FaceFeatureSummary
}
```

Do not expose every raw landmark to the LLM/context layer.

The raw observation model may retain richer data internally if needed for affect calculations, but higher layers should receive normalized summaries.

Provider neutrality is important because later Angela may add:

```text
OpenSeeFaceProvider
MediaPipeProvider
CustomAngelaProvider
```

without rewriting `AffectEngine`.

---

## Phase 4 — Temporal Smoothing

Do not classify a cue from a single frame.

Implement a rolling observation window.

Requirements:

- configurable window length;
- discard stale observations;
- debounce face-present / face-missing state;
- reject very short expression spikes;
- smooth noisy head pose;
- expose duration for stable states;
- make time/clock injectable for deterministic tests.

Example behavior:

```text
smile-like for 80ms
→ ignore

smile-like for 1.5s
→ stable smile cue

look away for 200ms
→ ignore

look away for 6s
→ stable attention-away cue
```

Avoid sleep-based tests. Use fake timestamps/clock.

---

## Phase 5 — Angela Affect Engine V1

Build this logic as Angela-owned code, not inside vendored OpenSeeFace source.

V1 output should remain intentionally small.

Required cues:

```text
face_present
neutral
smile
attention_screen
attention_away
unknown
```

Recommended public state:

```ts
type ExpressionCue
  = | 'neutral'
    | 'smile'
    | 'unknown'

type AttentionCue
  = | 'screen'
    | 'away'
    | 'unknown'

interface AffectState {
  facePresent: boolean
  expression: ExpressionCue
  attention: AttentionCue
  confidence: number
  stableForMs: number
  observedAt: number
}
```

The exact type shape can adapt to existing code conventions.

### Rules

Use observable features only.

For example:

- face detection + head pose may inform attention direction;
- mouth/cheek/landmark geometry may contribute to smile-like cue;
- weak/noisy evidence returns `unknown` instead of forcing a class.

Do not add V1 categories such as:

```text
happy
sad
angry
fear
disgust
depressed
stressed
lying
```

Those labels create false certainty and are not needed for the companion UX.

---

## Phase 6 — Personal Calibration

After the baseline V1 works, add optional personal calibration.

Reason: each user's neutral facial geometry and natural expression differ.

Suggested flow:

```text
/camera calibrate
```

Angela asks the user to briefly provide:

1. normal/neutral face;
2. natural smile;
3. looking toward screen;
4. looking away.

Store only derived calibration parameters by default, not images.

Possible calibration data (conceptual, not executable TypeScript):

```text
interface AffectCalibration {
  neutralFeatureBaseline: ...
  smileThresholdAdjustment: number
  screenYawCenter: number
  screenPitchCenter: number
  calibratedAt: string
}
```

Persist calibration using the CLI's existing safe local persistence conventions.

Calibration must be optional. The engine needs sensible defaults.

---

## Phase 7 — Camera Commands and Diagnostics

Add a minimal user-facing management surface using existing CLI command conventions.

Suggested capabilities:

```text
/camera status
/camera on
/camera off
/camera calibrate
/camera debug
```

`/camera debug` should show derived state, not raw frames by default.

Example:

```text
Camera: ON
Worker: healthy
Face: detected
Expression cue: smile
Attention: screen
Confidence: 0.78
Stable: 2.4s
FPS/sample rate: 10
```

Add health/doctor diagnostics where appropriate:

- Python runtime missing;
- OpenCV unavailable;
- ONNX Runtime unavailable;
- model file missing;
- camera permission denied;
- camera device unavailable;
- worker crashed.

Do not make camera failure break normal Angela chat.

---

## Phase 8 — Camera Context Provider

Once perception is stable, expose only compact state to Angela's existing context/prompt pipeline.

Conceptual provider:

```ts
interface CameraContextProvider {
  getContext: () => CameraContext | undefined
}
```

Example LLM-facing representation:

```text
Visual context (camera, uncertain soft cues):
- face present
- expression cue: slight smile
- attention: screen
- confidence: medium
```

Do not inject every frame.

Provide the current stable, fresh state with every relevant user-initiated model request while the camera is ON.
Keep unchanged cues available on consecutive requests and refresh state after tool results.
Sampling and temporal smoothing update the state independently of request delivery.
Never use a cooldown to omit current camera context.
Use a separate conversational reaction policy to limit repeated unsolicited comments about cues.

Do not let camera state consume large context budgets.

Do not persist every observation into chat history.

---

## Phase 9 — Conversational Policy

Camera perception must affect **how Angela responds**, not dominate conversation.

Examples:

### Study mode

If stable uncertainty-like cues are added later and confidence is sufficient:

```text
"Đoạn này hơi khó theo à? Tao lấy ví dụ khác nhé?"
```

If attention is away for a sustained period during an active study session:

```text
"Mất tập trung rồi à? Muốn nghỉ vài phút không?"
```

If a smile cue follows a correct answer:

```text
"Ừ, đúng rồi đấy 😄"
```

### General conversation

Do not comment on every facial change.

Add a cooldown / conversational policy so Angela does not repeatedly say things like:

```text
"Mày đang cười."
"Mày nhìn đi chỗ khác."
```

The best camera feature is often invisible: Angela simply adjusts tone or decides whether to verify understanding.

---

## Phase 10 — Voice Integration

Only after camera context and current voice systems are stable.

Future multimodal signal:

```text
conversation text
+
voice timing/prosody
+
camera affect cue
+
memory
+
current study/task context
```

Do not build a large multimodal emotion classifier in this milestone.

Instead, let higher-level Angela reasoning consume several uncertain context signals.

Example:

```text
User text: "Ừ tao hiểu rồi"
Camera: uncertain/attention-away cue (future)
Voice: hesitant (future)

Angela:
"Tao kiểm tra nhanh một câu nhé?"
```

Do not say:

```text
"Tao biết mày không hiểu."
```

---

## Sampling and Performance

Do not process camera at maximum webcam FPS unless needed.

Start with a practical configurable sampling strategy, e.g. around 8–15 perception updates per second depending on tracker performance.

Goals:

- keep CLI responsive;
- do not starve TTS/STT/LLM work;
- avoid excessive CPU use;
- adapt/drop frames rather than building an unbounded queue.

Use latest-frame semantics where appropriate:

```text
camera produces frames faster than inference
→ discard stale queued frames
→ process newest available frame
```

Expose simple metrics in debug mode:

- capture FPS;
- processed FPS;
- worker latency;
- dropped frame count;
- CPU impact if practical.

---

## Error and Lifecycle Behavior

The perception subsystem is optional.

Normal chat must continue when:

- no webcam exists;
- permission is denied;
- Python worker fails;
- model loading fails;
- the camera disconnects;
- OpenSeeFace crashes.

Expected behavior:

```text
Camera perception disabled: camera device unavailable.
Angela chat remains available.
```

Never create a crash loop.

Use bounded restart/backoff if automatic worker restart is implemented.

---

## Testing Requirements

### TypeScript unit tests

At minimum:

- worker event schema validation;
- provider lifecycle;
- worker crash behavior;
- latest-observation handling;
- smoothing/debounce;
- attention state thresholds;
- smile/neutral state thresholds;
- confidence propagation;
- stale-state timeout;
- context-provider output;
- camera-disabled behavior.

### Python tests

Where practical, test Angela-owned worker code separately from a real camera.

Use recorded/mock landmark/tracker outputs instead of requiring webcam hardware in CI.

### Integration tests

Add at least one fixture-driven path:

```text
fixture observations
→ worker/provider boundary
→ smoothing
→ AffectEngine
→ CameraContextProvider
```

Expected output should be deterministic.

Do not make standard CI depend on webcam availability.

---

## Manual Acceptance Scenarios

V1 should support these developer/user scenarios:

1. Start Angela with camera disabled — no camera is accessed.
2. `/camera on` — camera worker starts and visible state indicates ON.
3. Face enters view — `facePresent=true` after debounce.
4. Face leaves view — state becomes absent after debounce.
5. Natural smile held briefly — stable smile cue appears.
6. Very short facial movement — ignored as noise.
7. Look toward screen — attention becomes screen/likely-screen.
8. Look away for sustained duration — attention becomes away.
9. Camera disconnected while running — Angela reports failure but chat continues.
10. `/camera off` — camera/process resources are released.
11. Restart Angela — camera remains OFF unless the existing product deliberately persists an explicit opt-in setting.
12. Camera-derived context does not contain images or raw frames.
13. The LLM receives only compact soft-cue context.
14. Angela does not state emotional inference as fact.

---

## Non-Goals for V1

Do not expand this task into:

- face identity recognition;
- biometric authentication;
- age estimation;
- gender estimation;
- race/ethnicity estimation;
- lie detection;
- mental-health diagnosis;
- medical inference;
- continuous video recording;
- cloud video streaming;
- body pose / hand tracking;
- full MediaPipe Holistic integration;
- HSEmotion integration;
- training a custom deep-learning model;
- multi-person social-scene understanding;
- automatic camera activation without user action.

These are not needed for the current Angela companion experience.

---

## Optional Phase — HSEmotion Benchmark

Do not implement this until the V1 rule/landmark-based AffectEngine works.

Later, an experimental provider may benchmark a pretrained expression classifier such as HSEmotion against Angela's own cue logic.

Requirements if explored:

- keep it behind a provider interface;
- do not replace soft cues with hard emotional truth labels;
- compare latency and CPU cost;
- compare stability over time, not single-frame accuracy only;
- retain the ability to disable it completely.

The experiment should answer:

```text
Does this classifier materially improve Angela's conversational behavior?
```

If not, remove it.

---

## Future Direction — Angela-Owned Perception

The long-term learning goal may be to gradually replace upstream components.

Possible evolution:

```text
V1
OpenSeeFace tracker
→ Angela AffectEngine

V2
OpenSeeFace detection / landmarks
→ Angela feature extraction
→ Angela AffectEngine

V3
alternate/custom provider
→ Angela temporal model
→ Angela AffectEngine

V4
Angela-owned perception stack where useful
```

Do not rewrite working upstream ML code just for ownership. Replace components when there is a clear learning, performance, portability, or quality reason.

---

## Parallel Development With Task & Reminder Engine

This feature should be safe to develop simultaneously with:

```text
docs/ai/context/task-reminder-engine-plan.md
```

Keep shared edits minimal.

Camera branch owns primarily:

```text
third_party/openseeface/
perception/camera
perception/face
perception/affect
camera commands/context integration
```

Task branch owns:

```text
tasks
reminders
scheduler
notifications
```

Potential overlap areas:

- main CLI command registry;
- startup/shutdown lifecycle;
- central context assembly;
- README;
- package dependencies.

When possible, isolate integrations into small commits to reduce merge conflicts.

---

## Suggested Implementation Order

Follow this order unless current architecture strongly suggests otherwise:

1. Read `AGENTS.md` and inspect `packages/airi-cli`.
2. Vendor OpenSeeFace under `third_party/openseeface/` with licenses preserved.
3. Record upstream revision/provenance.
4. Create minimal Python camera worker around vendored source.
5. Verify worker manually with webcam.
6. Define validated JSONL worker protocol.
7. Implement TypeScript `OpenSeeFaceProvider`.
8. Add provider lifecycle/unit tests.
9. Define `RawFaceObservation`.
10. Implement temporal smoothing/debounce.
11. Implement AffectEngine V1 (`neutral`, `smile`, `screen`, `away`, `unknown`).
12. Add fixture-driven tests.
13. Add `/camera status|on|off|debug`.
14. Add camera diagnostics to doctor/health flow if appropriate.
15. Implement `CameraContextProvider`.
16. Integrate compact soft cues into the existing Angela context/prompt pipeline.
17. Add optional calibration.
18. Update `packages/airi-cli/README.md` with actual implemented behavior and dependency/setup requirements.
19. Run all checks required by `AGENTS.md`.

Do not add advanced emotion models before the V1 pipeline is stable.

---

## Suggested Commit Breakdown

Keep commits reviewable. A reasonable breakdown is:

1. `chore(perception): vendor openseeface source`
2. `feat(cli): add local camera perception worker`
3. `feat(cli): add face perception provider`
4. `feat(cli): add temporal affect state engine`
5. `feat(cli): add camera controls and diagnostics`
6. `feat(cli): expose camera affect context to angela`
7. `feat(cli): add camera calibration`

Do not mix unrelated refactors into these commits.

---

## Definition of Done

The initial Camera / Affect Engine milestone is complete when:

- OpenSeeFace source is present under `third_party/` with provenance/licenses preserved;
- the tracker can run locally through an Angela-owned worker wrapper;
- the CLI controls worker lifecycle safely;
- camera is OFF by default and requires explicit enabling;
- raw camera frames are not persisted/uploaded by default;
- the system produces stable provider-neutral observations;
- the AffectEngine emits at minimum face presence, neutral/smile and screen/away/unknown attention state;
- temporal smoothing prevents obvious frame-level flicker;
- camera failure never breaks ordinary Angela conversation;
- compact camera state can be injected into Angela context without flooding token usage;
- Angela treats the cues as uncertain context rather than factual emotion labels;
- automated tests cover provider, smoothing, affect state, and context behavior without requiring a real webcam;
- manual webcam acceptance scenarios have been exercised;
- documentation describes setup, privacy behavior, commands, and limitations;
- required typecheck/test/lint checks pass.

---

## Codex Execution Instruction

When implementing this plan, Codex should not stop after generating skeleton files.

It should:

1. inspect the real repository architecture first;
2. implement the usable V1 pipeline end-to-end;
3. vendor the upstream foundation cleanly;
4. write automated tests;
5. run applicable repository checks;
6. fix failures caused by the implementation;
7. update documentation to match what actually works;
8. report any item intentionally left incomplete and why.

Keep scope focused on Angela's AI-friend / study-companion perception layer. Do not expand into a general surveillance, biometric, or emotion-scoring platform.
