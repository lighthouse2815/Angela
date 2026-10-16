# Local voice service

This service supplies the audio endpoints for Angela CLI on Linux.
Faster Whisper recognizes Vietnamese locally with a CPU model and INT8 precision.
Edge TTS reads replies through Microsoft's online service without an API key.
Reply text goes to Microsoft. Microphone audio stays on this machine.
Edge TTS depends on Internet access and service availability.
A response without audio triggers one retry within the same request timeout.

## Run

```sh
docker compose -f services/voice-local/compose.yaml up -d --build
curl http://127.0.0.1:8000/health
```

The first transcription downloads the multilingual `small` model from Hugging Face.
The Docker volume retains this model across restarts. Model downloads require Internet access.
The service binds only to localhost. Do not expose this unauthenticated endpoint to a network.
The container has a 2 GiB memory limit and uses two CPU threads for inference.

Add these values to the private `~/.config/angela/voice.env` file:

```dotenv
ANGELA_VOICE_BASE_URL=http://127.0.0.1:8000/v1/
ANGELA_STT_MODEL=small
ANGELA_TTS_MODEL=edge-tts
ANGELA_TTS_VOICE=vi-VN-HoaiMyNeural
```

Restart Angela CLI. Type `/voice` and speak without pressing Enter.
Silero VAD detects speech and ends an utterance after about 1.2 seconds of silence.
After Angela reads the answer, the CLI listens again. Type `/chat` to return to text.
Ctrl+C cancels voice mode. Start it again with `/voice`.
The microphone stays off while Angela processes or reads a reply.
Set `ANGELA_VOICE_SILENCE_MS` before starting Compose to adjust silence between 400 and 2000 ms.
The default is 1200 ms. Longer pauses reduce interruptions but increase response delay.

The `v1/audio/listen` WebSocket accepts a JSON STT model selection, then raw 16 kHz mono signed 16-bit PCM.
It emits `ready`, `speech`, `transcribing`, and `transcript` events for one utterance, then closes.
Silero comes from Faster Whisper's bundled ONNX assets. No additional model download is required for VAD.
Capture retains three seconds of idle context and at most 30 seconds per utterance in memory.
Disconnect discards capture. An STT operation already in progress can finish after the client disconnects.
No voice API key is required. The existing chat provider remains separate.
The CLI reads this file from any working directory. Environment variables override its values.
`ANGELA_VOICE_ENV` selects another file. `XDG_CONFIG_HOME` selects another configuration directory.

## Stop

```sh
docker compose -f services/voice-local/compose.yaml stop
```

## Sources

- [Faster Whisper](https://github.com/SYSTRAN/faster-whisper)
- [Edge TTS](https://github.com/rany2/edge-tts)

## Checks

```sh
docker compose -f services/voice-local/compose.yaml cp services/voice-local/test_app.py voice:/app/test_app.py
docker compose -f services/voice-local/compose.yaml exec -T voice python -m unittest test_app
```
