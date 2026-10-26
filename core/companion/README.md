# @angela/companion

Shared companion runtime, memory, tasks, and records.

## Use

Import the package subpath owned by the feature. Applications retain startup and shutdown ownership.
Run `pnpm -F @angela/companion build`, `typecheck`, or `test` from the repository root.

## Boundary

This package does not start an application when imported. Personal data stays outside the repository.

## Companion identity

`@angela/companion/identity` supplies the system instructions for the CLI and character cards in desktop and web.
The companion keeps its name when the model changes, a session resumes, or personal memory is disabled.
Custom cards use their own names. Model details require runtime evidence, and missing memories remain unknown.
Angela is the daughter of Tiến sĩ Đăng in her character background.
She loves introspective literature, including *Nhân gian thất cách* by Dazai Osamu and *Hóa thân* by Franz Kafka.
Other characters retain their own backgrounds and interests.

## Internet and timestamped lessons

`@angela/companion/internet` owns transcript retrieval, bounded playback windows, search, and batched video summaries.
`internet/youtube` derives public extraction policy from the audited MIT reference.
`internet/transcription` accepts one explicitly selected compatible provider with timestamped JSON output.
`internet/local-transcription` executes whisper.cpp with timestamped JSON and private chunk cleanup.
`internet/transcription-routing` prepares a local-first or explicit cloud source. Cloud upload always requires consent.
`internet/cache` stores complete transcripts privately for 1–90 days, with a 30-day default, 100 files and 8 MiB per file.

Media executables are optional host boundaries. No Python repository is installed, imported, or fetched.
Browser access and summary generation are injected by the host. Transcript evidence stays outside personal memory.
See [the source audit](../../docs/third-party-audit.md) and [third-party notices](../../THIRD_PARTY_NOTICES.md).

Audio chunks use explicit 600-second source intervals, so AAC padding cannot create a spurious final upload.
Run `ANGELA_TEST_FFMPEG=/path/to/ffmpeg pnpm exec vitest run core/companion/src/internet/youtube.test.ts` for real encoder coverage.
The default suite mocks external media and HTTP providers.

Caller cancellation preserves other coalesced questions. The last caller stops extraction. Hosts await `whenIdle()` before shutdown.
