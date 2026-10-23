# @angela/voice-client

Local voice capture and playback.

## Use

Import the package subpath owned by the feature. Applications retain startup and shutdown ownership.
Run `pnpm -F @angela/voice-client build`, `typecheck`, or `test` from the repository root.

## Boundary

This package does not start an application when imported. Personal data stays outside the repository.

## Cancellation and device recovery

Capture and playback wait for their owned PipeWire processes to exit before releasing devices or temporary audio.
If an audio process ignores its stop signal for two seconds, cancellation sends SIGKILL to that child.
Each capture starts a new recorder. A failed capture does not retain a connection to a removed device.
Explicit source and sink names remain user configuration. Select the new device after replacing an explicitly named device.

`voice-process.test.ts` uses real child processes and local HTTP/WebSocket fixtures.
Its audio executables ignore stop signals to exercise forced cleanup and a subsequent capture.
The fixtures never open a physical microphone or speaker.

## Live service check

Start the local speech service before this check. It uses the configured STT and TTS models.

```sh
ANGELA_TEST_PIPEWIRE=1 pnpm -F @angela/voice-client exec vitest run --config vitest.config.ts src/voice-pipewire.test.ts --disableConsoleIntercept
```

The check creates a private virtual sink and source without changing default devices.
Synthesized Vietnamese passes through PipeWire, VAD, interruption and STT. No physical microphone or speaker opens.
The check removes its virtual devices and reports speech onset and transcript times.
The standard suite skips this live check. Physical device replacement and acoustic echo still require a hardware session.
