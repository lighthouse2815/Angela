# Camera perception domain

`observation.ts` defines the strict provider-neutral protocol and the local Eventa contract.
Raw media, identity, and full landmarks are rejected at this boundary.
Python JSONL enters the provider only after Valibot validation.

`AffectEngine` consumes observations and owns a bounded rolling window.
Its clock is an explicit millisecond argument on `observe` and `getState`. Production defaults to `Date.now()`.
Tests pass timestamps directly and need no timers, sleeps, webcam, or model runtime.

The engine emits `facePresent`, expression, attention, tracker confidence, stable duration, and observation time.
Expression values are `neutral`, `smile`, and `unknown`. Attention values are `screen`, `away`, and `unknown`.
Neutral means no clear smile-like mouth geometry. Screen means approximate head direction, not measured eye gaze.

Default behavior:

| Rule | Value |
| --- | --- |
| Rolling window | 1000 ms, at most 300 observations |
| Freshness limit | 2000 ms |
| Face evidence | Confidence at least 0.65 in 80% of window samples |
| Face debounce | 400 ms and at least three samples |
| Expression debounce | 700 ms and at least three samples |
| Screen debounce | 600 ms and at least three samples |
| Away debounce | 1800 ms and at least three samples |
| Smile | Mean score at least 0.65, mouth opening at most 0.45 |
| Neutral | Mean score at most 0.25, mouth opening at most 0.25 |
| Screen | Mean absolute yaw at most 18°, pitch at most 15° |
| Away | Mean absolute yaw at least 30° or pitch at least 25° |

The remaining ranges produce unknown. Missing features or pose also produce unknown.
Absolute pose offsets prevent left and right head turns from averaging into a screen cue.
A break in sample continuity resets the debouncers. Stale state expires even when no new frame arrives.
Durations measure confirmed output stability, not the length of one frame.

This domain provides advisory conversational cues. It does not classify inner feelings, identity, health, or understanding.
The heuristic thresholds need real-camera evaluation across users and lighting conditions.

## Request context and conversational reactions

`CameraContextProvider` supplies the current compact state on every relevant request while camera perception is ON.
Freshness and evidence gates still apply. Reading the same state again does not hide it.
The CLI's existing `resolveStep` hook refreshes the outgoing system prompt before each model call, including tool continuations.
Task and memory context remain available through their existing system turns.
Camera observations and injected cues never enter durable conversation, session, or memory storage.
Camera updates do not initiate model requests.

The provider tracks conversational reaction opportunities separately.
An unchanged cue allows another commentary opportunity after sixty seconds. A changed cue requires at least ten seconds.
These intervals affect the prompt's commentary guidance only. Every eligible request still receives the current state.
During a quiet interval, Angela can adapt its tone or pace and cautiously answer explicit questions about cues.
The policy does not detect whether a previous reply used an opportunity.
