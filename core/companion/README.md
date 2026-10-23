# @angela/companion

Shared companion runtime, memory, tasks, and records.

## Use

Import the package subpath owned by the feature. Applications retain startup and shutdown ownership.
Run `pnpm -F @angela/companion build`, `typecheck`, or `test` from the repository root.

## Boundary

This package does not start an application when imported. Personal data stays outside the repository.

## Internet and timestamped lessons

`@angela/companion/internet` owns transcript retrieval, bounded playback windows, search, and batched video summaries.
`internet/youtube` derives public extraction policy from the audited MIT reference.
`internet/transcription` accepts one explicitly selected compatible provider with timestamped JSON output.
`internet/cache` stores complete transcripts privately for 30 days, with 100 files and 8 MiB per file.

Media executables are optional host boundaries. No Python repository is installed, imported, or fetched.
Browser access and summary generation are injected by the host. Transcript evidence stays outside personal memory.
See [the source audit](../../docs/third-party-audit.md) and [third-party notices](../../THIRD_PARTY_NOTICES.md).
