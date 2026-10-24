# Study Along implementation report

This change integrates native lesson awareness into Angela's existing desktop and companion architecture.
The inspected upstream source was Agent-Reach revision `beabda7486e9a666360b18cdb5c0e759c2c4d20f`.
The temporary checkout was deleted before the final tests and live extraction check.

## Files Added

- [apps/desktop/src/main/services/angela/internet/browser.test.ts](../apps/desktop/src/main/services/angela/internet/browser.test.ts)
- [apps/desktop/src/main/services/angela/internet/browser.ts](../apps/desktop/src/main/services/angela/internet/browser.ts)
- [apps/desktop/src/main/services/angela/internet/index.test.ts](../apps/desktop/src/main/services/angela/internet/index.test.ts)
- [apps/desktop/src/main/services/angela/internet/index.ts](../apps/desktop/src/main/services/angela/internet/index.ts)
- [apps/desktop/src/main/services/angela/internet/runtime.test.ts](../apps/desktop/src/main/services/angela/internet/runtime.test.ts)
- [apps/desktop/src/main/services/angela/internet/runtime.ts](../apps/desktop/src/main/services/angela/internet/runtime.ts)
- [apps/desktop/src/renderer/stores/tools/builtin/internet.ts](../apps/desktop/src/renderer/stores/tools/builtin/internet.ts)
- [apps/desktop/src/shared/eventa/internet.ts](../apps/desktop/src/shared/eventa/internet.ts)
- [core/companion/src/internet.test.ts](../core/companion/src/internet.test.ts)
- [core/companion/src/internet.ts](../core/companion/src/internet.ts)
- [core/companion/src/internet/cache.ts](../core/companion/src/internet/cache.ts)
- [core/companion/src/internet/contracts.ts](../core/companion/src/internet/contracts.ts)
- [core/companion/src/internet/http.test.ts](../core/companion/src/internet/http.test.ts)
- [core/companion/src/internet/http.ts](../core/companion/src/internet/http.ts)
- [core/companion/src/internet/process.test.ts](../core/companion/src/internet/process.test.ts)
- [core/companion/src/internet/process.ts](../core/companion/src/internet/process.ts)
- [core/companion/src/internet/transcription.test.ts](../core/companion/src/internet/transcription.test.ts)
- [core/companion/src/internet/transcription.ts](../core/companion/src/internet/transcription.ts)
- [core/companion/src/internet/youtube.test.ts](../core/companion/src/internet/youtube.test.ts)
- [core/companion/src/internet/youtube.ts](../core/companion/src/internet/youtube.ts)
- [docs/study-along-implementation.md](../docs/study-along-implementation.md)
- [docs/study-along.md](../docs/study-along.md)
- [docs/third-party-audit.md](../docs/third-party-audit.md)
- [third_party/agent-reach/LICENSE](../third_party/agent-reach/LICENSE)

## Files Modified

- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
- [apps/desktop/README.md](../apps/desktop/README.md)
- [apps/desktop/electron-builder.config.ts](../apps/desktop/electron-builder.config.ts)
- [apps/desktop/src/main/index.ts](../apps/desktop/src/main/index.ts)
- [apps/desktop/src/renderer/stores/tools/built-in.test.ts](../apps/desktop/src/renderer/stores/tools/built-in.test.ts)
- [apps/desktop/src/renderer/stores/tools/built-in.ts](../apps/desktop/src/renderer/stores/tools/built-in.ts)
- [core/companion/README.md](../core/companion/README.md)

## Code Reused From Agent-Reach

| Upstream file or concept | Native adaptation |
| --- | --- |
| `channels/youtube.py` | Video URL validation, subtitle language preference, extractor arguments, and repeated-caption handling. |
| `transcribe.py` | Explicit audio recipient, 600-second chunks, four-hour budget, 24 MiB uploads, mono 16 kHz/32 kbps encoding. |
| `runtime/manage.py` diagnostics | Local readiness remains distinct from verified extraction. The implementation is new Angela code. |

No Python module was copied into the application.
The extraction policies are rewritten in TypeScript, with conservative MIT attribution.
No code from yt-dlp, FFmpeg, OpenCLI, or another upstream tool was copied.

## Code Rewritten

The native service adds timestamped models, JSON3 cues, bounded windows, literal search, transcript caching, concurrent request coalescing, and batched summaries.
The desktop adapter adds current-tab media observation, Eventa IPC authorization, Injeca assembly, tool registration, and diagnostics.
Chat summaries use Angela's existing generation providers and runtime.
API keys come from the existing private local provider config.
Audio intervals use explicit FFmpeg seeks to avoid AAC padding creating a spurious final chunk.
HTTP error handling cancels bodies before acquiring a reader, so failure recovery does not leave locked streams.

## External Dependencies

No npm dependency or lockfile changed.
YouTube extraction executes an independent `yt-dlp` binary. Node is enabled as a supported JavaScript runtime.
Audio fallback also executes FFmpeg and calls one explicitly selected compatible transcription endpoint.
Browser observation uses the existing pinned Playwright MCP integration.
Explicit summary actions use the saved chat model. Normal lesson questions use the current chat answer loop.
GitHub, general web reading, and web search retain Angela's existing browser and Tavily implementations.
The complete dependency and license decisions are in [third-party-audit.md](./third-party-audit.md).

## License / Attribution

The original notice remains `Copyright (c) 2025 Agent Eyes`.
The full MIT text is stored in [third_party/agent-reach/LICENSE](../third_party/agent-reach/LICENSE).
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) identifies the source revision and derived modules.
Desktop packaging includes the full license as `resources/licenses/agent-reach-LICENSE.txt`.
The packaging config was loaded and its source license checked for the original copyright and complete warranty clause.

## Study Along Flow

```text
Current chat, with Computer use enabled
  -> study_along
  -> authorized Eventa IPC
  -> current tab in the connected Angela Browser
  -> canonical YouTube URL and actual playback timestamp
  -> native transcript service and private file cache
  -> human captions, automatic captions, extractor recovery, or configured audio transcription
  -> bounded timestamped evidence
  -> existing chat model and timestamp citations
```

At 18:34, normal context covers 17:04–19:34.
A preceding-five-minute request covers 13:34–18:34 and excludes future cues.
The caller does not need to supply a URL when the connected tab exposes video playback.
Full transcripts stay in application storage. Long-video summaries use bounded model batches.

## Tests

| Command or check | Result |
| --- | --- |
| `ANGELA_TEST_FFMPEG=/usr/bin/ffmpeg pnpm -F @angela/companion test --maxWorkers=2` | 677 tests passed across 46 files. Includes real FFmpeg encoding at the 600-second AAC boundary. |
| `pnpm exec vitest run apps/desktop/src/main/services/angela/internet apps/desktop/src/renderer/stores/tools/built-in.test.ts` | 18 tests passed across four files. Covers scenarios A–C, browser mapping, tools, and IPC authorization. |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm -F @angela/desktop typecheck` | Passed on the final desktop source. |
| `pnpm -F @angela/companion typecheck` | Passed after the final HTTP cleanup change. |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck --concurrency=1` | Passed. 60 workspace tasks succeeded. The first default-heap run exhausted memory. |
| `pnpm lint` | Passed with existing repository warnings. Changed HTTP and packaging files also passed targeted ESLint checks. |
| `pnpm -F @angela/companion build` | Passed. |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm -F @angela/desktop build` | Passed. Vite reported existing asset and chunk warnings. |
| Real `yt-dlp` argument check | Passed with version 2026.8.19 in a temporary verification environment. No reference package was installed. |
| Live native YouTube extraction | Passed for public video `jNQXAC9IVRw`, after the reference checkout was deleted. Returned six official English subtitle segments. |
| `git diff --check` | Passed. |

The final focused boundary run also passed 21 tests across five files.
The default tests mock external HTTP and media providers. They require no internet or paid transcription account.
The optional FFmpeg test uses a local generated audio fixture and a mocked transcription endpoint.
Live subtitle extraction does not prove that every video or paid transcription account is accessible.

## Remaining Limitations

- Study Along observes the current Playwright tab. Connect the user's lesson browser or select its tab through the existing browser tools.
- The desktop host needs an independent yt-dlp installation or `ANGELA_YTDLP_PATH`.
- Audio fallback needs FFmpeg and an explicitly selected timestamp-capable provider. No paid audio upload was run during verification.
- Private, protected, and DRM videos, browser-cookie import, live-caption refresh, and cross-origin embedded players are excluded.
- Native authenticated Reddit, Twitter/X, Bilibili, Xiaohongshu, and RSS providers were not added.
- Full desktop installer packaging was not run. The Electron application build and license resource mapping were checked.

## Verification

The repository-wide audit scanned 5,796 application/config files.
It found no forbidden upstream repository, package-import, installer, clone, or temporary-checkout references in application/config code.
Upstream URLs and package paths remain in documentation and notices. Derived code retains short attribution headers.

- No runtime dependency on the reference repository exists.
- No separate reference-package installation is required.
- No Git submodule or subtree was added.
- No `agent_reach` import, reference CLI invocation, runtime checkout, update check, or source download was added.
- The temporary reference directory is absent.
- Required MIT attribution remains in source distribution and desktop packaging config.
- Both changed runtime owners build, and the executed tests pass.

Setup details and API contracts are in [study-along.md](./study-along.md).

## Native local transcription boundary

`LocalWhisperTranscriptionProvider` decodes each bounded audio chunk with FFmpeg and executes whisper.cpp without Python. It accepts timestamped JSON only. Offsets remain fractional seconds and the extractor adds the source chunk offset once. Request-owned files are removed on success and failure.

`TranscriptFallbackRouter` prepares one source before downloading audio. Local inference failure never silently changes the audio recipient. Cloud selection requires explicit upload permission, checked again before every chunk upload. Desktop settings wiring follows this core boundary.

Concurrent questions share one extraction. Individual cancellation leaves other callers running. The last cancellation stops extraction, and `whenIdle()` waits for cleanup. Only a complete successful transcript enters the existing private cache. Its default TTL remains 30 days, with a host-configurable range of 1–90 days.
