# Local voice service

This service supplies the audio endpoints for Angela CLI on Linux.
Faster Whisper recognizes Vietnamese locally with a CPU model and INT8 precision.
Edge TTS reads replies through Microsoft's online service without an API key.
Reply text goes to Microsoft. Microphone audio stays on this machine.
Edge TTS depends on Internet access and service availability.

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

Restart Angela CLI. Type `/voice`, then press Enter to start capture.
Press Enter again to send. Type `/chat` to return to text.
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
