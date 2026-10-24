# Study Along release media artifacts

Desktop resolves media tools in this order: explicit absolute environment override, bundled artifact, development-only PATH fallback.
Packaged applications never use ambient PATH. An invalid override is reported instead of silently selecting another executable.
Diagnostics expose `OVERRIDE`, `BUNDLED`, `SYSTEM`, or `MISSING` separately from extraction readiness.
No executable download or automatic binary update occurs at startup.

Release jobs stage audited artifacts before electron-builder packaging:

```text
apps/desktop/resources/media/linux-x64/
  yt-dlp
  ffmpeg
  manifest.json
  licenses/
    yt-dlp.txt
    ffmpeg.txt
```

Supported target directories are `linux-x64`, `linux-arm64`, `mac-x64`, `mac-arm64`, `win-x64`, and `win-arm64`.
Windows filenames include `.exe`. The current desktop CI build owner is Ubuntu x64.
The same directory can contain an optional `whisper-cli` executable with its own manifest entry and license.

Each manifest entry contains the actual binary version, SHA-256 digest, and relative license filename:

```json
{
  "yt-dlp": { "version": "audited-release-version", "sha256": "64-lowercase-hex-characters", "license": "licenses/yt-dlp.txt" },
  "ffmpeg": { "version": "audited-release-version", "sha256": "64-lowercase-hex-characters", "license": "licenses/ffmpeg.txt" }
}
```

These values describe the manifest format. They are not release artifacts or valid checksums.
The release pipeline obtains pinned artifacts from its reviewed build outputs, computes their digests, and stages their actual notices.
`beforePack` fails on missing manifests, missing binaries, non-executable files, checksum mismatch, or missing license files.
The build does not fetch replacement artifacts.

Electron-builder copies the selected target outside ASAR to `resources/media/<target>`.
Runtime version checks reject an incompatible or invalid executable.
Development can use system tools or explicit `ANGELA_YTDLP_PATH`, `ANGELA_FFMPEG_PATH`, and `ANGELA_WHISPER_PATH` overrides.
Normal users receive these tools with a complete release and do not install Python packages.

No executable artifacts are committed in this change.
Release packaging requires the staged artifacts. `electron-vite build` continues to support source-only CI builds.
A production distributor must complete the binary license audit before packaging.

The yt-dlp source license does not describe every standalone binary dependency.
FFmpeg license obligations depend on its build flags. Preserve the exact corresponding notices and any required source offers.
The original Agent-Reach MIT attribution remains separate from runtime binary licenses.


## Restricted extension artifact

Desktop `build:unpack`, `build:linux`, `build:mac`, and `build:win` first build the restricted WXT target.
Install build dependencies for `@angela/plugin-web-extension` in release jobs as well as the desktop workspace.
The installer copies `.output-study-along/chrome-mv3` to `resources/study-along-extension`.
`beforePack` rejects a missing manifest, broader permissions, or implicit content collectors.
The Settings button opens this fixed folder for Chrome's **Load unpacked** installation.
The ordinary `build` command remains a source-only electron-vite build. It does not install executables or models.

## Optional local inference

Stage a pinned whisper.cpp `whisper-cli` executable and any required runtime libraries in the target directory.
Use a self-contained CPU build or audit and ship every linked dependency. Preserve applicable platform signing and loader requirements.
Its manifest entry follows the same version, SHA-256, and license contract as the required tools.
No Python environment is required. Model files are separate from executable artifacts.

Users import a publisher-verified GGML model through the native picker and trusted SHA-256 field in Study Along Settings.
The imported file becomes an app-owned content-addressed model under `<userData>/internet/models`.
A release can supply a separately licensed model file for the same explicit import flow. No background setup runs at startup.
The recommended multilingual `tiny` model is about 75 MiB. Models above 2 GiB are rejected.
Keep the model publisher's license separate from whisper.cpp and FFmpeg notices.

## Local release preflight

After the desktop and restricted extension builds, run:

```sh
pnpm -F @angela/desktop check:release
pnpm -F @angela/desktop check:release win32 arm64
```

The optional arguments select the target platform and architecture. Defaults use the current host.
The command reports media, restricted extension, main output, preload output, and renderer output independently as JSON.
It exits with code 1 when a prerequisite fails. It never downloads binaries or reads provider credentials.

The manifest validator now rejects optional permissions, optional host access, external connections, and unknown background fields.
This prevents hidden capability expansion outside the explicit restricted manifest.

Local verification on 24 October 2026 passed 17 artifact and resolver tests.
The real preflight accepted the restricted extension and all three desktop outputs.
It rejected the missing `resources/media/linux-x64/manifest.json`, as required.
An installer for a clean machine remains blocked until reviewed media binaries and their exact notices are staged.
No substitute executable or fixture artifact counts as a release binary.

## Staging reviewed media on Linux x64

The release repository provides `pnpm -F @angela/desktop prepare:media` for the reviewed Linux x64 target.
The command downloads only the URLs and SHA-256 values in `scripts/media/linux-x64.lock.json`.
It stores downloads by digest under a private cache, writes partial files first, and reuses only a matching digest.

The command verifies the FFmpeg release signature with the pinned FFmpeg public key before Docker builds it.
Docker uses the Ubuntu image digest recorded in `scripts/media/Dockerfile`.
The build runs without network access and records the configure log, compiler, package list, linked libraries, and source archives.
The FFmpeg recipe disables network access and GPL or nonfree components.
It enables only the file and pipe protocols, bounded audio demuxers, decoders, resampling filters, and WAV or AAC output needed by Study Along.

The staged manifest includes the executable hashes, source archive hashes, license notices, build recipe, and build evidence.
The preflight checks each executable and every supporting file before packaging.
The target directory stays ignored by Git. Release jobs regenerate it from the reviewed lock file.

Local result on 24 October 2026:

- yt-dlp 2026.10.21 passed its version check.
- FFmpeg 9.0.2 passed its version check.
- FFmpeg source signature passed with fingerprint `FCF986EA15E6E293A5644F10B4322F04D67658D8`.
- `pnpm -F @angela/desktop check:release` returned `ready: true`.
- Artifact and download tests passed 23/23.
- Electron built `dist/linux-unpacked` with the staged media and restricted extension.
- `.deb` creation reached fpm but the current environment exceeded its temporary disk quota while fpm copied the payload.

The package metadata now includes the maintainer email required by electron-builder.
The remaining `.deb` failure is an environment quota limit. Run packaging on a clean runner with enough temporary space.
