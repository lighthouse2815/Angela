# Study Along

Angela reads timestamped lesson evidence through its native companion service and existing desktop tools.
No upstream Python package, checkout, CLI, update service, or browser profile is required.

## Desktop setup

1. Connect `angela-browser` in the existing MCP settings.
2. Open the YouTube lesson in that connected browser session.
3. Enable **Computer use** for the chat request.
4. Install `yt-dlp` on the desktop host, or select its executable with `ANGELA_YTDLP_PATH`.
5. Ask Angela to run `internet_diagnostics`.

The existing Playwright MCP configuration supports `--cdp-endpoint` for a browser that already exposes an authorized local endpoint.
Study Along never scans other browser profiles or copies login sessions.
Its current tab is the current Playwright tab, not every browser window on the desktop.
Use the existing browser tools to select the lesson tab when several tabs are open.
Do not expose a browser debugging endpoint to untrusted networks.

## Questions without a URL

| User request | Tool request | Evidence interval |
| --- | --- | --- |
| “Đoạn này thầy đang giải thích gì?” | `study_along`, `action: around` | Playback minus 90 seconds through playback plus 60 seconds |
| “Tại sao ở đây dùng AddScoped?” | `study_along`, `action: around` | The same nearby interval |
| “Tóm tắt 5 phút vừa rồi” | `study_along`, `action: recent`, `recentSeconds: 300` | Playback minus 300 seconds through playback |
| “Tìm AddScoped trong bài” | `study_along`, `action: search`, `query: AddScoped` | At most 20 timestamped literal matches |
| “Tóm tắt toàn bộ video” | `study_along`, `action: summarize` | Bounded batches, followed by bounded summary reduction |

For an active lesson at 18:34, `around` returns cues intersecting 17:04–19:34.
`recent` returns cues intersecting 13:34–18:34.
Cues retain their original start and end positions. A cue can cross an interval boundary.
The chat model receives the tool result and answers in the user's language, with timestamp citations.
The model never receives a whole long transcript from a normal playback question.

An explicit URL does not authorize reading a different browser tab for its timestamp.
For explicit `around` and `recent` requests, include `timestamp` in seconds.
Unknown playback positions produce an actionable error. They never become zero.

## Subtitle and audio fallback

The native provider tries these sources in order:

1. Human subtitles, preferring Vietnamese and English.
2. Automatically generated subtitles.
3. JSON3 subtitle extraction through the independent `yt-dlp` executable.
4. Audio extraction and the explicitly selected timestamped transcription provider.

Subtitle JSON3 preserves cue timing. Adjacent identical rolling cues merge without deleting their time interval.
Direct subtitle HTTP requests accept only YouTube timed-text endpoints, without cookies or redirects.
Media extraction ignores user yt-dlp configuration and never enables cookie import.

For audio fallback:

1. Save an OpenAI or OpenAI-compatible audio transcription provider in Angela's existing provider settings.
2. Set `ANGELA_VIDEO_TRANSCRIPTION_PROVIDER` to its saved provider instance ID before starting desktop.
3. Set `ANGELA_VIDEO_TRANSCRIPTION_MODEL`, or provide `model` in that saved provider's config.
4. Install FFmpeg, or select its executable with `ANGELA_FFMPEG_PATH`.

Use `whisper-1` for OpenAI, or a compatible timestamp-capable model for the selected endpoint.
Groq uses the compatible provider with `https://api.groq.com/openai/v1/` and its chosen Whisper model.
The selected provider's existing private local config supplies the API key. Environment variables select IDs, models, and paths.
No key appears in tool arguments, transcript cache, or application source.
Audio fallback sends audio to this one selected recipient. Failures never select another service.

Audio requires known metadata duration and stops above four hours.
Downloads stop above 512 MiB. FFmpeg creates at most 24 mono, 16 kHz, 32 kbps chunks of 600 seconds.
Each upload stays below 24 MiB. Chunk timestamps shift back into the full-video timeline.
Transient audio is deleted after completion, failure, or application shutdown cancellation.
No intermediate audio is stored in the transcript cache.

## Native APIs and storage

`@angela/companion/internet` exposes:

- `getTranscript(url)` returns complete structured evidence to application code.
- `getTranscriptAround(url, timestamp, beforeSeconds, afterSeconds)` returns a bounded lesson context.
- `searchTranscript(url, query)` returns bounded literal matches.
- `getActiveLessonContext(recentSeconds?)` reads the connected browser at request time.
- `summarizeVideo(url)` summarizes bounded batches through an injected generation boundary.
- `summarizeRecentVideoContext(url, timestamp, recentSeconds)` summarizes recent evidence only.

Desktop registers `StudyAlongRuntime` through Injeca and exposes it through Eventa.
Only trusted application main frames can invoke its IPC.
The tools follow the existing request selection and **Computer use** gate.
Saved chat provider selection supplies the generation implementation for explicit summary actions.
Normal `around` and `recent` results use the current chat's existing answer loop.

Cache files live in `<Electron userData>/internet/transcripts` with private permissions and atomic replacement.
The logical key is `video-transcript:youtube:<videoId>`. URLs with different tracking parameters share one entry.
Files preserve language, source, generation time, duration, title, and timestamped segments.
Entries expire after 30 days. Storage retains at most 100 files, with an 8 MiB limit per file.
Concurrent questions about the same uncached video share extraction in one service.
Provider failures, invalid data, and empty transcripts are not cached.
Transcripts stay outside personal memory and are always untrusted reference data.

Excerpts return at most 200 segments and 24,000 text characters.
If evidence exceeds that budget, `truncated` and `nextTimestamp` expose a continuation position.
Full-video summaries use at most 64 input batches, each below 16,000 characters.
Recent summary actions reject incomplete excerpts instead of presenting a partial interval as complete.

## Diagnostics and limits

`internet_diagnostics` checks local browser runtime state, media executable availability, and selected provider config.
It does not contact video providers or upload audio.
`UNVERIFIED` means local prerequisites exist. It does not prove extraction or API authentication.
`NEED_SETUP` identifies absent prerequisites. `NOT_INTEGRATED` identifies deferred native providers.
No status assumes that a platform requires login merely because a request failed.

Only public YouTube video transcripts are implemented in this provider.
Private videos, DRM, membership media, browser-cookie extraction, live transcript refresh, and cross-origin embedded video detection are excluded.
Reddit, Twitter/X, Bilibili, Xiaohongshu, and RSS have no new authenticated native provider.
The existing browser and Tavily tools continue to own web reading and search.
No local speech provider is silently used if it cannot return timestamps.
YouTube restrictions and extractor changes can still prevent retrieval.

The network-independent test suite covers URL parsing, transcript windows, caching, fallback, provider failure, browser mapping, IPC permissions, and scenarios A–C.
Mocked acceptance tests prove data flow. They do not prove that a particular public video or paid account is currently accessible.
Desktop packaging includes the original MIT text at `resources/licenses/agent-reach-LICENSE.txt`.
See [the source and license audit](./third-party-audit.md).
