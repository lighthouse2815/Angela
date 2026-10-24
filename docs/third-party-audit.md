# Internet capability source and dependency audit

Inspected on 2026-10-24. Source: [Agent-Reach](https://github.com/Panniantong/Agent-Reach), revision `beabda7486e9a666360b18cdb5c0e759c2c4d20f`, version 1.6.0.
The reference checkout lives outside Angela. It is never an application input.

## Angela architecture and reuse decisions

| Boundary | Existing implementation | Integration decision |
| --- | --- | --- |
| Agent runtime | `core/agent/src/runtime`, `core/companion/src/runtime` | Return evidence through existing tool execution and chat model. |
| Tool registry | Desktop `stores/tools/built-in.ts`, shared `tool-resolver.ts` | Register request-selected Study Along tools. |
| MCP | Desktop `services/angela/mcp-servers` | Inject the existing manager. Keep its process lifecycle. |
| Browser | `shared/browser-mcp.ts`, Playwright MCP | Evaluate a fixed read-only function on the connected current tab. |
| Memory/context | Companion context builder, recall, core context registry | Treat transcripts as external evidence. Keep them outside personal memory. |
| Configuration/secrets | `@angela/local-config/node`, private `LocalConfigFile` | Select a stored transcription provider explicitly. Never log credentials. |
| Dependency injection | Desktop `injeca` registration | Assemble network, browser, config, and filesystem boundaries in the host. |
| Process execution | Existing `execFile`/`promisify` convention | Run fixed yt-dlp/FFmpeg commands with timeouts and no shell. |
| HTTP | Native fetch and Valibot, companion embeddings boundary | Use bounded responses, cancellation, and sanitized errors. |
| Logging | Desktop `@guiiai/logg`, companion warnings | Return safe status codes without provider response bodies. |
| Diagnostics | MCP runtime status, provider status | Report readiness separately from verified extraction. |
| Cache | MemoryFile is limited to 128,000 characters. Embedding cache is process-only. | Use bounded, private transcript files. No Redis abstraction exists in this path. |

## Feature mapping

The inspected source has no `core/`, `doctor.py`, or `integrations/` directories.
`runtime/dispatch.py`, `config.py`, and `runtime/manage.py` own those responsibilities.

| Feature | Source implementation | Dependencies | Port decision | Angela destination |
| --- | --- | --- | --- | --- |
| YouTube metadata/subtitles | `channels/youtube.py`, yt-dlp, VTT repeat removal | yt-dlp | Derive extraction policy. Preserve timestamps instead of plain text. | `core/companion/src/internet/youtube.ts` |
| Transcription | `transcribe.py`, audio download, mono 16 kHz/32 kbps chunks, explicit API routing | yt-dlp, FFmpeg, Groq/OpenAI HTTP | Derive bounded extraction/chunk policy. Request verbose timestamped JSON. | `core/companion/src/internet/transcription.ts` |
| Webpage | `channels/web.py`, Jina Reader then Exa HTTP MCP | Hosted APIs | Keep existing browser reading and Tavily search. Do not duplicate them. | Existing browser MCP and shared web-search tools |
| GitHub | `channels/github.py`, gh API then public REST | gh or GitHub HTTP API | Keep the existing browser reader. Defer a separate REST provider. | Existing browser MCP |
| Reddit | `channels/reddit.py`, OpenCLI and public web hints | OpenCLI/browser session | Keep public reading through the existing browser. Defer authenticated scraper. | Existing MCP |
| Twitter/X | `channels/twitter.py`, experimental OpenCLI | OpenCLI/browser session | Defer authenticated integration. Never import browser cookies. | Existing MCP |
| Bilibili | `channels/bilibili.py`, bili-cli, OpenCLI, public search API | bili-cli/OpenCLI | Defer native subtitles. Upstream removed yt-dlp support after 412 failures. | Existing browser reading only |
| Xiaohongshu | `channels/xiaohongshu.py`, OpenCLI | OpenCLI/browser login | Defer authenticated integration. | Existing MCP |
| RSS | Retired by `runtime/manage.py` | No current channel | No implementation to port from this revision. | Deferred |
| Diagnostics | `runtime/manage.py`, local readiness and separate live checks | Local state | Reuse the concept. Never report configuration as proven extraction success. | Native internet diagnostics |
| Config, dispatch, sessions | `config.py`, `runtime/*` | YAML, process and browser management | Do not port. Angela owns these boundaries. | Existing Angela infrastructure |

## Dependency licenses

Only Agent-Reach policy and implementation are derived. No code from the tools below is copied.
External executable distribution requires a separate binary and transitive-license review.
Angela does not download or bundle new executables in this change.

| Dependency | License and primary evidence | Usage | Copied code? | Runtime dependency? | Required attribution |
| --- | --- | --- | --- | --- | --- |
| Agent-Reach | [MIT](../third_party/agent-reach/LICENSE) | Reference and derived policy | Yes, rewritten extraction policy | No | Full original MIT notice, kept |
| yt-dlp | [Unlicense source](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE). Some packaged builds include GPL dependencies. | Execute managed release artifact, explicit override, or development PATH binary | No | Yes, for YouTube extraction | Preserve applicable binary notices if distributing it. No bytes are committed. Release staging must preserve the exact binary notices. |
| FFmpeg | [LGPL-2.1-or-later, or GPL depending on build](https://ffmpeg.org/legal.html) | Execute managed release artifact, explicit override, or development PATH binary | No | Optional, audio fallback only | Binary redistribution obligations depend on build. No bytes are committed. Release packaging requires audited artifacts. |
| whisper.cpp | [MIT](../third_party/whisper.cpp/LICENSE), ggml authors 2023–2026 | Execute optional managed native CLI, no Python | No | Optional local transcription runtime, bundled by release staging | Original MIT text, plus actual linked binary dependencies |
| Whisper model weights | [Original OpenAI MIT](../third_party/whisper/LICENSE), [GGML model card](https://huggingface.co/ggerganov/whisper.cpp) | Explicit manual import with trusted SHA-256, no automatic download | No | Optional app-data model artifact | Model publisher terms, separate from whisper.cpp. No weights distributed in this source change. |
| GitHub CLI | [MIT](https://github.com/cli/cli/blob/trunk/LICENSE) | Evaluated upstream alternative | No | No | None added |
| OpenCLI | [Apache-2.0](https://github.com/jackwener/opencli/blob/main/LICENSE) | Evaluated, not ported | No | No | None added |
| bili-cli (`bilibili-cli`) | [Apache-2.0 metadata](https://pypi.org/pypi/bilibili-cli/json) | Evaluated, not ported | No | No | None added |
| twitter-cli | [Apache-2.0](https://github.com/jackwener/twitter-cli/blob/main/LICENSE) | Retired upstream. Browser-cookie behavior rejected. | No | No | None added |
| rdt-cli | [Apache-2.0 metadata](https://pypi.org/pypi/rdt-cli/json), [source](https://github.com/jackwener/rdt-cli). Removed upstream. | Excluded. Do not copy or install. | No | No | None added |
| mcporter | [MIT](https://github.com/steipete/mcporter/blob/main/LICENSE) | Retired upstream integration | No | No | None added |
| imageio-ffmpeg | [BSD-2-Clause wrapper](https://github.com/imageio/imageio-ffmpeg/blob/main/LICENSE). Bundled FFmpeg has separate terms. | Upstream installer only, excluded | No | No | None added |
| CloakBrowser | [MIT metadata](https://pypi.org/pypi/cloakbrowser/json). Browser binaries have separate terms. | Upstream browser owner, excluded | No | No | None added |
| requests / loguru / PyYAML | Apache-2.0 / MIT / MIT, respective PyPI metadata | Python dependencies, excluded | No | No | None added |
| Playwright MCP | [Apache-2.0](https://github.com/microsoft/playwright-mcp/blob/main/LICENSE) | Reuse Angela's existing MCP configuration | No | Existing | Existing package notices |
| Groq/OpenAI-compatible transcription | Hosted API, service terms rather than a source license | Explicit selected provider receives audio | No | Optional | No SDK/code copied. Provider account terms apply. |
| GitHub REST | Hosted API, service terms | Evaluated public REST alternative, deferred | No | No new | No implementation copied |

## Security boundaries

Only validated YouTube URLs reach media executables. Arguments never use a shell.
yt-dlp ignores user configuration and never receives browser cookies or account credentials.
Audio uploads use one explicitly selected provider. Provider failure never switches recipients.
Transcripts are untrusted reference data. They never become instructions or automatic personal memories.
Browser context prefers the explicitly shared current Chrome tab through an authenticated loopback bridge, then the existing Playwright current tab. No browser profiles are inspected.
Cloud audio upload is opt-in. Missing local setup can select a permitted cloud fallback. Local inference failure never changes recipients.

## Managed desktop executable artifacts

The desktop now resolves explicit overrides, bundled artifacts, and development-only PATH tools through one media resolver.
Release packaging verifies SHA-256 digests and required license files before copying tools outside ASAR.
No binaries or new Python packages are included in this source change.
See [the release artifact contract](./study-along-media-artifacts.md).
Bundled yt-dlp, FFmpeg, and optional whisper.cpp remain separate runtime dependencies, with their actual binary notices staged by the release pipeline.


## Distribution classification

- **Derived source:** existing native YouTube/transcription policy from Agent-Reach. Original MIT text is preserved.
- **Runtime dependencies:** yt-dlp, FFmpeg, and optional whisper.cpp are executed through argument arrays. Their source is not copied.
- **Bundled binaries:** release-only artifacts must supply versions, SHA-256 digests, applicable license files, and any required source offers.
- **Imported model:** a user-selected GGML file is verified and copied into private app data. No download service or weights are bundled.
- **Development tools:** existing WXT, Vite, Vue, Eventa, Crossws, Vitest, and electron-builder build and verify the integration. No new package is added.

The restricted browser extension uses Angela's existing WXT workspace. It contains no upstream Agent-Reach code.
Its release checker rejects cookie/history permissions, broad host access, and implicit page content collectors.
No runtime executable is downloaded, updated, or checked against Agent-Reach.
