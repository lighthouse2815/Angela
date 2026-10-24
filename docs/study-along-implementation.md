# Study Along desktop implementation report

This work continues the native implementation at `9e5e094`. Existing actions, subtitle recovery, browser timestamps, attribution, and cache remain supported.

## Files added

- [apps/desktop/scripts/media-artifacts.test.ts](../apps/desktop/scripts/media-artifacts.test.ts)
- [apps/desktop/scripts/media-artifacts.ts](../apps/desktop/scripts/media-artifacts.ts)
- [apps/desktop/scripts/study-extension-artifact.test.ts](../apps/desktop/scripts/study-extension-artifact.test.ts)
- [apps/desktop/scripts/study-extension-artifact.ts](../apps/desktop/scripts/study-extension-artifact.ts)
- [apps/desktop/src/main/services/angela/internet/browser/extension.test.ts](../apps/desktop/src/main/services/angela/internet/browser/extension.test.ts)
- [apps/desktop/src/main/services/angela/internet/browser/extension.ts](../apps/desktop/src/main/services/angela/internet/browser/extension.ts)
- [apps/desktop/src/main/services/angela/internet/browser/provider.ts](../apps/desktop/src/main/services/angela/internet/browser/provider.ts)
- [apps/desktop/src/main/services/angela/internet/media/resolver.test.ts](../apps/desktop/src/main/services/angela/internet/media/resolver.test.ts)
- [apps/desktop/src/main/services/angela/internet/media/resolver.ts](../apps/desktop/src/main/services/angela/internet/media/resolver.ts)
- [apps/desktop/src/main/services/angela/internet/settings/config.test.ts](../apps/desktop/src/main/services/angela/internet/settings/config.test.ts)
- [apps/desktop/src/main/services/angela/internet/settings/config.ts](../apps/desktop/src/main/services/angela/internet/settings/config.ts)
- [apps/desktop/src/main/services/angela/internet/settings/models.test.ts](../apps/desktop/src/main/services/angela/internet/settings/models.test.ts)
- [apps/desktop/src/main/services/angela/internet/settings/models.ts](../apps/desktop/src/main/services/angela/internet/settings/models.ts)
- [apps/desktop/src/renderer/pages/settings/study-along/components/browser-pairing.vue](../apps/desktop/src/renderer/pages/settings/study-along/components/browser-pairing.vue)
- [apps/desktop/src/renderer/pages/settings/study-along/components/local-model.vue](../apps/desktop/src/renderer/pages/settings/study-along/components/local-model.vue)
- [apps/desktop/src/renderer/pages/settings/study-along/index.browser.test.ts](../apps/desktop/src/renderer/pages/settings/study-along/index.browser.test.ts)
- [apps/desktop/src/renderer/pages/settings/study-along/index.vue](../apps/desktop/src/renderer/pages/settings/study-along/index.vue)
- [apps/desktop/src/shared/eventa/browser-media.ts](../apps/desktop/src/shared/eventa/browser-media.ts)
- [apps/desktop/src/shared/eventa/study-along.ts](../apps/desktop/src/shared/eventa/study-along.ts)
- [apps/desktop/src/shared/study-along.ts](../apps/desktop/src/shared/study-along.ts)
- [core/companion/src/internet/local-transcription.test.ts](../core/companion/src/internet/local-transcription.test.ts)
- [core/companion/src/internet/local-transcription.ts](../core/companion/src/internet/local-transcription.ts)
- [core/companion/src/internet/transcription-routing.test.ts](../core/companion/src/internet/transcription-routing.test.ts)
- [core/companion/src/internet/transcription-routing.ts](../core/companion/src/internet/transcription-routing.ts)
- [docs/study-along-media-artifacts.md](../docs/study-along-media-artifacts.md)
- [integrations/plugins/web-extension/.gitignore](../integrations/plugins/web-extension/.gitignore)
- [integrations/plugins/web-extension/study-along/README.md](../integrations/plugins/web-extension/study-along/README.md)
- [integrations/plugins/web-extension/study-along/contracts.ts](../integrations/plugins/web-extension/study-along/contracts.ts)
- [integrations/plugins/web-extension/study-along/entrypoints/background.ts](../integrations/plugins/web-extension/study-along/entrypoints/background.ts)
- [integrations/plugins/web-extension/study-along/entrypoints/popup/app.vue](../integrations/plugins/web-extension/study-along/entrypoints/popup/app.vue)
- [integrations/plugins/web-extension/study-along/entrypoints/popup/index.html](../integrations/plugins/web-extension/study-along/entrypoints/popup/index.html)
- [integrations/plugins/web-extension/study-along/entrypoints/popup/main.ts](../integrations/plugins/web-extension/study-along/entrypoints/popup/main.ts)
- [integrations/plugins/web-extension/wxt.study-along.config.ts](../integrations/plugins/web-extension/wxt.study-along.config.ts)
- [shared/i18n/src/locales/en/study-along-extension.json](../shared/i18n/src/locales/en/study-along-extension.json)
- [shared/i18n/src/locales/vi/study-along-extension.json](../shared/i18n/src/locales/vi/study-along-extension.json)
- [third_party/whisper.cpp/LICENSE](../third_party/whisper.cpp/LICENSE)
- [third_party/whisper/LICENSE](../third_party/whisper/LICENSE)

## Files modified

- [.github/workflows/desktop-runtime.yml](../.github/workflows/desktop-runtime.yml)
- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
- [apps/desktop/README.md](../apps/desktop/README.md)
- [apps/desktop/electron-builder.config.ts](../apps/desktop/electron-builder.config.ts)
- [apps/desktop/package.json](../apps/desktop/package.json)
- [apps/desktop/src/main/services/angela/internet/index.test.ts](../apps/desktop/src/main/services/angela/internet/index.test.ts)
- [apps/desktop/src/main/services/angela/internet/index.ts](../apps/desktop/src/main/services/angela/internet/index.ts)
- [apps/desktop/src/main/services/angela/internet/runtime.test.ts](../apps/desktop/src/main/services/angela/internet/runtime.test.ts)
- [apps/desktop/src/main/services/angela/internet/runtime.ts](../apps/desktop/src/main/services/angela/internet/runtime.ts)
- [apps/desktop/src/renderer/components/InteractiveArea.browser.test.ts](../apps/desktop/src/renderer/components/InteractiveArea.browser.test.ts)
- [apps/desktop/src/renderer/components/InteractiveArea.vue](../apps/desktop/src/renderer/components/InteractiveArea.vue)
- [apps/desktop/src/renderer/stores/tools/built-in.test.ts](../apps/desktop/src/renderer/stores/tools/built-in.test.ts)
- [apps/desktop/src/renderer/stores/tools/built-in.ts](../apps/desktop/src/renderer/stores/tools/built-in.ts)
- [apps/desktop/src/renderer/stores/tools/builtin/internet.ts](../apps/desktop/src/renderer/stores/tools/builtin/internet.ts)
- [apps/desktop/src/renderer/stores/tools/index.ts](../apps/desktop/src/renderer/stores/tools/index.ts)
- [apps/desktop/src/shared/eventa/internet.ts](../apps/desktop/src/shared/eventa/internet.ts)
- [core/companion/README.md](../core/companion/README.md)
- [core/companion/src/internet.test.ts](../core/companion/src/internet.test.ts)
- [core/companion/src/internet.ts](../core/companion/src/internet.ts)
- [core/companion/src/internet/cache.ts](../core/companion/src/internet/cache.ts)
- [core/companion/src/internet/contracts.ts](../core/companion/src/internet/contracts.ts)
- [core/companion/src/internet/process.ts](../core/companion/src/internet/process.ts)
- [core/companion/src/internet/youtube.test.ts](../core/companion/src/internet/youtube.test.ts)
- [core/companion/src/internet/youtube.ts](../core/companion/src/internet/youtube.ts)
- [docs/study-along-implementation.md](../docs/study-along-implementation.md)
- [docs/study-along.md](../docs/study-along.md)
- [docs/third-party-audit.md](../docs/third-party-audit.md)
- [eslint.config.ts](../eslint.config.ts)
- [integrations/plugins/web-extension/README.md](../integrations/plugins/web-extension/README.md)
- [integrations/plugins/web-extension/package.json](../integrations/plugins/web-extension/package.json)
- [shared/i18n/src/locales/en/tamagotchi/settings.yaml](../shared/i18n/src/locales/en/tamagotchi/settings.yaml)
- [shared/i18n/src/locales/vi/tamagotchi/settings.yaml](../shared/i18n/src/locales/vi/tamagotchi/settings.yaml)

## Architecture decisions

The existing Injeca internet module assembles providers. Companion owns transcript policy, bounded evidence, caching, and summaries.
Eventa owns renderer IPC and extension RPC. The browser bridge implements the existing local server lifecycle interface.
Feature settings and verified model metadata reuse private `MemoryFile` persistence. Provider credentials stay in existing `LocalConfigFile` storage.
No new package, browser automation engine, Python runtime, or parallel provider registry is introduced.

`StudyAlongRuntime` keeps one service for nearby questions and summaries, so both share extraction.
Caller cancellation releases one waiter. The last waiter or host shutdown cancels extraction, and shutdown waits for cleanup.
Only complete validated evidence reaches the transcript cache. The TTL defaults to 30 days and Settings accepts 1–90 days.

## Browser context flow

1. A user shares the active YouTube tab through the restricted Chrome extension.
2. The extension connects to IPv4 loopback using a private pairing token and its exact registered extension origin.
3. Desktop requests a fresh media snapshot through Eventa. Only URL, title, position, duration, and paused state are accepted.
4. Without an authorized extension response, desktop falls back to the existing Playwright MCP current tab.
5. An explicit URL and timestamp remain authoritative. Unknown current positions never become zero.
6. The cached transcript supplies the requested timestamp window to the existing chat model as untrusted evidence.

Study Along tools are included in desktop text and voice requests independently of mouse/keyboard tools.
Their main-process enabled setting, trusted IPC boundary, and browser consent remain authoritative.
Normal users no longer need the Computer use toggle for read-only lesson questions.

The extension uses `activeTab`, `scripting`, `storage`, and loopback access only. No cookie, password, history, or profile access exists.
A fixed script reads visible video metadata only. Sharing clears on stop, tab closure, or extension restart.
Pairing persists across desktop restarts and can be revoked in Settings.

## Managed executables and packaging

Resolution is absolute environment override → bundled artifact → development-only PATH → typed setup failure.
A packaged app never silently selects PATH. Diagnostics show `OVERRIDE`, `BUNDLED`, `SYSTEM`, or `MISSING`.

The release pipeline stages reviewed binaries, versions, SHA-256 digests, and their actual notices under `resources/media/<target>`.
Required tools are yt-dlp and FFmpeg. The optional local runtime is `whisper-cli`.
Packaging fails before shipping missing artifacts, checksum mismatches, or absent notices. No runtime download or binary updater exists.

Installer scripts build and bundle the restricted extension. A release manifest check rejects broader permissions and implicit content scripts.
Settings opens the fixed bundled extension folder for Chrome's manual installation flow.
Source-only `electron-vite build` does not package an installer or supply executable artifacts.

## Local and cloud selection

Manual subtitles → automatic captions → extractor subtitle recovery → configured audio source → helpful error.

Audio defaults to disabled. Local-only and explicit cloud modes honor that source directly.
Automatic mode prefers configured local inference. Missing local setup can select cloud only with explicit upload permission.
Local inference failure never silently switches to a network recipient.
The selected source is prepared before audio download, stays fixed per video, and checks cloud consent again before each upload.
Saved providers are reused. Renderer receives redacted provider/model choices, never API keys or endpoints.
Advanced environment overrides remain optional and are shown when they change the effective cloud selection.

Local inference decodes bounded chunks to PCM WAV, invokes whisper.cpp, and accepts timestamped JSON only.
Milliseconds become fractional seconds, then the source chunk offset is added once.
Raw audio, encoded chunks, and decoded WAV files are request-owned and removed on success, failure, or cancellation.

Settings imports a manually obtained model through a native picker and trusted SHA-256 field.
The manager verifies SHA-256 and the GGML header, publishes atomically, reports progress/errors, supports cancellation, and bounds storage.
A failed import preserves the previous selected model. No background download blocks startup.
The first inference after restart rechecks the installed model hash. No arbitrary renderer-supplied path enters inference.

## Security and licensing

Existing URL validation, argument arrays, yt-dlp config isolation, process timeouts, duration/size limits, HTTPS-only cloud upload, and redirect rejection remain.
Transcript/video text never becomes a system instruction or automatic personal memory.
Summary prompts continue to identify transcript content as untrusted evidence.
The bridge rejects unauthenticated upgrades, wrong origins/tokens, unknown payload fields, stale connections, and unauthorized current tabs.

Agent-Reach attribution remains in the existing derived files and original MIT license. No new upstream source is ported in this continuation.
whisper.cpp is executed through its public protocol. Its implementation source is not copied.
Original whisper.cpp and OpenAI Whisper notices are separate from binary build dependencies and model publisher terms.
No executable or model weights are committed. See [the third-party audit](./third-party-audit.md).

## Remaining limitations

- Release jobs must stage audited yt-dlp/FFmpeg artifacts. Local inference also requires the managed whisper.cpp runtime.
- Models use explicit manual import. No built-in model downloader or automatic update service is implemented.
- Chrome installation uses Load unpacked. No browser store publication or silent installation is included.
- The first captionless video request transcribes the complete bounded video before caching. Later questions reuse that result.
- Public YouTube restrictions can prevent extraction. Private/DRM/login-cookie flows and live transcript refresh remain excluded.
- The general extension workspace has existing compile errors outside the restricted target. Its restricted build succeeds.

## Verification

Installer packaging requires external release artifacts and is distinct from the source build.

| Command or check | Actual result |
| --- | --- |
| `pnpm -F @angela/companion test` | Earlier default run: 692 passed, 2 optional encoder tests skipped. |
| `pnpm -F @angela/companion test --maxWorkers=1 --no-file-parallelism --testTimeout=30000 --hookTimeout=30000` | Final complete suite: 48 files, 692 passed, 3 optional native/encoder tests skipped. |
| `pnpm -F @angela/companion typecheck` | Passed. |
| `pnpm -F @angela/companion build` | Passed. |
| `ANGELA_TEST_FFMPEG=/usr/bin/ffmpeg pnpm exec vitest run core/companion/src/internet.test.ts core/companion/src/internet --testTimeout=30000` | 65 passed, including real FFmpeg encoding and decode checks. |
| Local native smoke test with all `ANGELA_TEST_WHISPER*` variables and FFmpeg | 5 passed, including real CPU whisper.cpp inference on the JFK speech fixture. |
| `pnpm exec vitest run --config apps/desktop/vitest.node.config.ts --testTimeout=30000 --hookTimeout=30000` | 101 files, 739 passed, 2 unrelated optional tests skipped. |
| Focused desktop internet, built-in tool, and release artifact checks | 10 files, 57 passed after the final source changes. |
| Desktop Study Along Settings Chromium tests | 4 passed, covering source selection, opt-in upload, native model setup, and save errors. |
| Desktop Settings and existing InteractiveArea Chromium suites | 44 passed. Existing layout tests logged ResizeObserver notifications. No error suppression was added. |
| Focused desktop reply regression and Study Along with input control disabled | Both passed. The new regression confirms read-only lesson tools remain selected without computer input tools. |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck --concurrency=1` | 60/60 workspace tasks passed. |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm -F @angela/desktop typecheck` | Passed again for the final desktop source. |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm -F @angela/desktop build` | Passed again for the final source build. |
| `pnpm -F @angela/i18n build` | Passed with the English and Vietnamese Settings text. |
| `pnpm -F @angela/plugin-web-extension build:study-along` | Passed. Restricted extension output is approximately 356 kB. |
| Restricted built artifact manifest check | Passed against the generated artifact. |
| `pnpm -F @angela/plugin-web-extension compile` | Fails on existing general-extension code and shared strictness issues listed below. |
| `pnpm lint` | Passed with 0 errors and 603 existing warnings. Generated restricted extension output is excluded, like other build output. |
| `git diff --check` | Passed. |

The native smoke used whisper.cpp revision `231638a0717b7822784297e5980965ffcec05810` outside the repository.
The multilingual tiny model was verified against the publisher's LFS SHA-256: `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21`.
A partial download and an incorrect transport ETag were rejected before using the verified bytes.
These artifacts are development verification only. Angela does not fetch them at runtime.

During verification, overlapping heavy builds caused swap pressure and unrelated test timeouts.
A concurrent i18n rebuild also briefly removed its generated CLI entry during a test import.
After serial execution with the dependency build complete, the full companion suite passed.
No test, validation, or timeout in repository code was disabled to obtain that result.

The general extension compile errors are in its existing popup Button variant, module identity field,
shared combobox/select/file input strictness, and root UnoCSS optional values.
They are outside the restricted extension source. The restricted build and desktop typecheck succeed.
No tsconfig relaxation or unrelated repair was added.

## Repository independence audit

Application-source searches found no Agent-Reach imports, upstream runtime URL, CLI invocation, installer, or checkout.
Git has no submodule entries. The original Agent-Reach MIT license remains present and packaged.
New whisper.cpp and original Whisper model notices remain distinct from actual release artifact obligations.
No executable, model weights, provider keys, environment credentials, or raw lesson audio are committed.

## Acceptance verification: 24 October 2026

Desktop checks now cover the complete authenticated loopback bridge → fresh playback → bounded transcript → recent summary path.
Revoking pairing prevents implicit lesson reads even when the transcript is already cached.
Cancelled requests stop before browser observation and recheck cancellation before model selection.

Run the controlled Chromium acceptance case:

```sh
ANGELA_TEST_CHROME=1 pnpm exec vitest run --config apps/desktop/vitest.node.config.ts src/main/services/angela/internet/browser.chromium.test.ts
```

This case runs the production observation script in real Chromium against an intercepted YouTube-shaped video page.
It checks a changed playback position, recent-only evidence, cache reuse, and a tab with no video.
The MCP transport, public video response, extraction provider, and model are controlled boundaries.
It does not certify toolbar sharing in a manually installed Chrome extension or public YouTube subtitle availability.
The separate bridge acceptance case uses real authenticated loopback WebSockets and Eventa RPC.

Verification passed: desktop typecheck, desktop build, and the controlled Chromium acceptance case.
The internet suite passed 54 tests across eight files with `ANGELA_TEST_CHROME=1`.

## Post-lesson reviews

The desktop `review` action uses the saved chat model with a dedicated quiz system prompt.
It sends only a complete bounded recent excerpt, a question count from one to five, and a language code.
Valibot checks the result shape, exact count, bounded strings, distinct questions, and citations matching supplied segment starts.
Output from cancelled requests is discarded. Quiz generation never changes personal memory.
Existing companion learning tools own explicit topic saves, review schedules, and user-confirmed completion.
A persistence test exercises those tools across independent stores and rejects completion evidence from a model answer.
No new dependency, memory format, scheduler, or automatic transcript-to-memory projection is introduced.

A public YouTube subtitle probe on 24 October 2026 returned HTTP 429 and a human-verification requirement.
No browser cookies or login sessions were extracted. Public-video extraction remains unverified from this network.
Controlled Chromium observation and authenticated bridge tests do not override that external limitation.

Full extension verification now also passes with a real restricted extension in a full Chromium instance.
It covers popup pairing, active-tab permission, fresh playback, summaries, stop sharing, tab closure, uninstall, and revocation.
See [the browser verification commands and boundaries](./study-along-browser-checks.md).

## Final verification for post-lesson reviews

| Command | Result |
| --- | --- |
| Browser-enabled desktop group in [browser checks](./study-along-browser-checks.md) | 77 tests passed across 12 files |
| `pnpm -F @angela/companion exec vitest run src/companion/records.test.ts` | 6 tests passed, including persisted review progress |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm typecheck --concurrency=1` | All 60 tasks passed |
| `pnpm -F @angela/desktop build` | Passed |
| `pnpm lint` | No errors, 603 existing warnings |
| `git diff --check` | Passed |

Voice checks and real-service measurements are in [desktop runtime checks](./desktop-runtime-checks.md).
Release preflight results and the missing release media blocker are in [media artifacts](./study-along-media-artifacts.md).
No physical acoustic test, clean-machine installer certification, or live chat-model quiz evaluation is claimed.
