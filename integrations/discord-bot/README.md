# Angela Discord bot

Angela can chat through mentions and direct messages, and join a server voice channel for spoken conversation.
This adapter uses the existing AIRI server channel. Keep an Angela desktop or web client connected with a working chat provider.
Use this package for voice conversation. The CLI Telegram task, permission, status, and recovery commands are separate features.

## Setup

Use the workspace Node.js and pnpm versions. Install dependencies from the repository root.
Install FFmpeg and put it on PATH. The existing Discord voice and Opus packages handle transport and audio decoding.

Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications).
Enable Message Content Intent for mention-based text chat.
Invite the bot with the `bot` and `applications.commands` scopes.
Grant View Channel, Connect, Speak, and Send Messages in the call channel and its text chat.

From the repository root, copy the configuration template:

```sh
cp integrations/discord-bot/.env.example integrations/discord-bot/.env.local
```

Set `DISCORD_TOKEN` in the local file. Set `AIRI_URL` and `AIRI_TOKEN` to match Angela's server-channel settings.
Keep credentials in the ignored local file or environment. Never commit them.
The authenticated Discord bot ID registers commands automatically. `DISCORD_BOT_CLIENT_ID` is not required.

The template uses the existing [voice service](../../services/voice-local/README.md) on port 8000.
Start that service separately. Its default models are `small` for transcription and `edge-tts` for speech.
The default voice is `vi-VN-HoaiMyNeural`. Edge speech uses an external service.
For another compatible provider, set both endpoint URLs, model names, API keys, and the speech voice.
Use HTTP or HTTPS endpoint URLs with a trailing slash. The speech endpoint must support WAV responses.
STT and TTS keys remain separate. Local endpoints can use empty keys.

Start Angela's desktop or local web client, then start the adapter:

```sh
pnpm -F @proj-airi/discord-bot start
```

Use `ANGELA_LOCALE=en` for English command descriptions and notices. Vietnamese is the default.

## Call controls

Join a normal server voice channel, then use `/summon`.
Angela starts listening after the connection reaches Ready and the join notice succeeds.
The notice states that speech goes to the configured transcription service.

| Command | Behavior |
| --- | --- |
| `/summon` | Join your voice channel and start listening. |
| `/listen enabled:false` | Stop capture, queued speech, pending voice requests, and playback. Remain in the channel. |
| `/listen enabled:true` | Resume listening explicitly. |
| `/leave` | Stop the call and disconnect. |
| `/ping` | Check whether the bot responds. |

Call controls require membership in the same voice channel as Angela.
One bot can own one voice connection per server. A summon from another channel does not move an active call.
Direct calls, group DMs, and Stage channels are outside this implementation.

## Conversation behavior

Each room owns its capture streams, speaker buffers, request queue, playback, and cancellation state.
Discord user IDs identify speakers. This is not voiceprint recognition.
The shared conversation session belongs to that server and voice channel. The speaker prefix identifies each person's input.
Text chat retains its existing routing and sessions.

The receiver ends a speech capture after 800 ms of silence through Discord's AfterSilence policy.
Quiet captures remain local and do not trigger transcription. Confirmed speech can interrupt Angela's pending or audible reply.
A room keeps at most four queued utterances. Overlapping speakers retain separate buffers.
A capture can last at most 30 seconds. Longer captures are discarded with a notice instead of a partial transcript.
Each reply has a 90-second deadline covering transcription, the AI response, speech generation, and playback.

Only `output:gen-ai:chat:complete` triggers speech. Intermediate assistant messages never play in the call.
The room, speaker, and random request ID must match the active turn before playback.
Interrupted, duplicate, disconnected, or previous-call responses are ignored.
Interruption stops playback and cancels pending speech synthesis. An active transcription can finish to preserve the speaker's words.
An interrupted turn's reply remains silent. Pausing or leaving also cancels pending transcription requests.
These controls do not cancel remote AI generation in the desktop client.
Voice pauses and disconnects discard pending audio. They do not automatically reactivate after restart.

Audio stays in bounded memory inside the adapter. The adapter writes no recordings to disk.
The configured STT provider receives captured audio. The AI receives transcripts, and the TTS provider receives reply text.
Angela's existing chat history and the providers' own retention settings remain in effect.

## Checks

```sh
pnpm -F @proj-airi/discord-bot typecheck
pnpm -F @proj-airi/discord-bot test
ANGELA_DISCORD_AUDIO_TEST=1 pnpm -F @proj-airi/discord-bot test
pnpm -F @proj-airi/i18n typecheck
pnpm -F @proj-airi/i18n test
pnpm -F @proj-airi/i18n build
pnpm lint
```

Tests use local speech HTTP fixtures, real Discord-format Opus encoding/decoding, and mocked Discord transport boundaries.
`ANGELA_DISCORD_AUDIO_TEST=1` also runs the real WAV-to-Opus playback pipeline through FFmpeg. This optional check requires FFmpeg on PATH.
They cover response routing, speaker separation, interruption, pause/resume, timeout, connection failure, and cleanup.
A live acceptance check still needs a bot token, a Discord server, two participants, and working speech providers.
Check audible playback, interruption, concurrent speakers, `/listen`, `/leave`, and reconnect behavior in that server.

## Other similar projects

- [pladisdev/Discord-AI-With-STT](https://github.com/pladisdev/Discord-AI-With-STT)

## Acknowledgements

- Implementation of Audio handling and processing https://github.com/TheTrueSCP/CharacterAIVoice/blob/54d6a41b4e0eba9ad996c5f9ddcc6230277af2f8/src/VoiceHandler.js
- Example of usage https://github.com/discordjs/voice-examples/blob/da0c3b419107d41053501a4dddf3826ad53c03f7/radio-bot/src/bot.ts
- Excellent library https://github.com/discordjs/discord.js
