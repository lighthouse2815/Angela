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
