# Study Along

Ask Angela about the YouTube lesson you are watching. The native tool reads timestamped evidence, then the chat model explains it.
No Agent-Reach installation, checkout, Python package, CLI, or update service is required.

## Desktop setup

A complete Angela release supplies yt-dlp and FFmpeg. You do not install them separately.
Source-only development builds require [staged media artifacts or development tools](./study-along-media-artifacts.md).

1. Open **Settings → Study Along**. Leave **Enable Study Along** on.
2. Under **Chrome and Chromium**, click **Open extension files**.
3. [Install and pair the restricted extension](../integrations/plugins/web-extension/study-along/README.md).
4. Open the lesson and click **Share this video tab** in the extension popup.
5. Ask “đoạn này thầy nói gì?” without sending the URL.

The extension needs one explicit tab-sharing action. Restarting the extension clears tab sharing, while desktop pairing persists.
**Computer use** does not need to be enabled. Study Along does not grant desktop input control.
The existing `angela-browser` Playwright MCP provider remains available through MCP settings.
When Chrome has no fresh authorized context, Angela uses the current Playwright tab.
It never scans browser profiles, copies login sessions, or guesses which unrelated window contains your lesson.

## Questions without a URL

| User request | Tool request | Evidence interval |
| --- | --- | --- |
| “Đoạn này thầy đang giải thích gì?” | `study_along`, `action: around` | Playback minus 90 seconds through playback plus 60 seconds |
| “Tại sao ở đây dùng AddScoped?” | `study_along`, `action: around` | The same nearby interval |
| “Giải thích đoạn vừa rồi” | `study_along`, `action: recent` | Previous five minutes |
| “Tóm tắt 5 phút vừa rồi” | `study_along`, `action: recent`, `recentSeconds: 300` | Playback minus 300 seconds through playback |
| “Tìm chỗ thầy nhắc dependency injection” | `study_along`, `action: search`, `query: dependency injection` | At most 20 literal matches with timestamps |
| “Tóm tắt video này” | `study_along`, `action: summarize` | Bounded batches, then summary reduction |

At 18:34, `around` selects 17:04–19:34. `recent` selects 13:34–18:34.
Cues keep their original boundaries and can intersect the requested interval.
The chat model receives a bounded tool result and answers with timestamp citations.
An explicit URL remains authoritative. `around`, `recent`, and `summarize-recent` also require an explicit timestamp for that URL.
An unreadable current position produces an error, never an assumed zero.
`transcript` intentionally starts a bounded continuation window at the supplied position, or the beginning when none is supplied.

## Subtitle and audio selection

The native provider tries manual subtitles, automatic captions, then yt-dlp JSON3 subtitle recovery.
If subtitles remain unavailable, Settings controls audio fallback:

| Setting | Behavior |
| --- | --- |
| Disabled | Return a helpful missing-subtitles error. No audio is downloaded for transcription. |
| Local transcription only | Require the managed whisper.cpp runtime and an imported verified model. Never upload audio. |
| Saved cloud provider | Require a saved compatible audio provider, a timestamp-capable model, and upload consent. |
| Local first, then permitted cloud fallback | Prefer configured local inference. Missing local setup can select the permitted cloud source. |

The source is selected before downloading audio and remains fixed for that video request.
Local inference failure never silently changes the audio recipient.
Cloud upload permission defaults to off and is checked again before every chunk.
Saving settings cancels active requests so the new policy applies. Already delivered uploads cannot be recalled.

For cloud fallback, save an audio transcription provider in existing provider settings.
Choose that saved instance and its model under Study Along. Check **Allow audio upload** only when you want that fallback.
OpenAI uses `whisper-1`. Compatible endpoints need `verbose_json` with timestamped segments.
Compatible model IDs can be entered directly because those APIs do not reliably list transcription models.
Keys and endpoint configuration stay in the existing private main-process configuration. This UI receives redacted choices only.
Advanced environment overrides select provider IDs or models. They never grant upload consent or enable a disabled fallback.

For local inference, obtain a trusted whisper.cpp GGML model, such as multilingual `tiny`.
Use the publisher's SHA-256 artifact details and import the file through the native picker in Settings.
The publisher table also contains SHA-1 values. Those 40-character values are not SHA-256 checksums.
Angela verifies SHA-256 and the GGML header before publishing an app-owned model under `<userData>/internet/models`.
Import shows progress, supports cancellation, and preserves the previous model on verification failure.
Files larger than 2 GiB are rejected. Replacement retains one installed model and at most one bounded staging copy.
No model is downloaded automatically. The release needs the optional managed `whisper-cli` binary to use local inference.

Audio extraction requires a known duration of at most four hours and a download below 512 MiB.
FFmpeg produces at most 24 mono 16 kHz chunks, each covering a 600-second source interval.
Cloud chunks remain below 24 MiB. Local chunks decode to bounded PCM WAV before whisper.cpp inference.
Only timestamped JSON becomes evidence. Chunk offsets are added exactly once.
Raw audio and decoded chunks are removed on success, failure, or cancellation.

## Storage, cancellation, and model context

Complete transcripts live privately under `<userData>/internet/transcripts` with atomic writes.
The logical key is `video-transcript:youtube:<videoId>`. Tracking parameters never create duplicate video entries.
Settings controls expiry from 1–90 days, with a 30-day default. Capacity is 100 files, each at most 8 MiB.
Concurrent nearby questions and summaries share one extraction. Cancelling one caller preserves other callers.
When the last caller leaves, extraction stops. Shutdown waits for owned temporary-file cleanup.
Failures, invalid evidence, empty results, and partial chunk pipelines never enter the complete-transcript cache.

Excerpts contain at most 200 segments and 24,000 text characters.
`truncated` and `nextTimestamp` identify incomplete evidence and continuation.
Full summaries use at most 64 bounded input batches. Recent summaries reject incomplete excerpts.
Transcripts remain untrusted evidence, outside personal memory. Summary instructions explicitly reject instructions inside transcripts.

The companion API retains `getTranscript`, `getTranscriptAround`, `searchTranscript`, `getActiveLessonContext`,
`summarizeVideo`, and `summarizeRecentVideoContext`. Transcript operations accept caller cancellation.
Desktop reuses Injeca, Eventa, saved provider definitions, private configuration, MCP, and existing chat generation.
Only trusted application main frames can invoke settings, pairing, model import, and research IPC.

## Diagnostics and limitations

**Check local setup** and `internet_diagnostics` report local readiness without contacting video or transcription APIs.
Media diagnostics distinguish `BUNDLED`, `SYSTEM`, `OVERRIDE`, and `MISSING`.
Local model state and cloud upload permission are reported separately.
`UNVERIFIED` means prerequisites exist. It does not prove a provider account or public video is currently accessible.

The restricted extension needs manual installation until a browser store distribution exists.
Source builds contain no binary artifacts or model weights. Installer packaging rejects missing required release artifacts.
The first audio-only request can take time because it transcribes the whole bounded video before publishing a complete cache entry.
Private videos, DRM, membership media, cookie extraction, live transcript refresh, and cross-origin embedded media are excluded.
YouTube restrictions can still prevent extraction. No fallback invents missing evidence.
Other social platforms remain outside this native provider. Existing browser research and Tavily retain their settings.

See [the implementation report](./study-along-implementation.md), [dependency audit](./third-party-audit.md), and [notices](../THIRD_PARTY_NOTICES.md).
