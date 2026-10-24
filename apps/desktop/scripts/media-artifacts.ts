import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import * as v from 'valibot'

import { mediaDigest } from './media-release'

const entry = v.object({ sha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)), version: v.pipe(v.string(), v.minLength(1)), license: v.pipe(v.string(), v.regex(/^licenses\/[\w.-]+$/u)) })
const supportingFile = v.object({ path: v.pipe(v.string(), v.regex(/^(?:licenses|sources)\/[\w.-]+$/u)), sha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)) })
const manifestSchema = v.object({ 'yt-dlp': entry, 'ffmpeg': entry, 'whisper-cli': v.optional(entry), 'supportingFiles': v.optional(v.pipe(v.array(supportingFile), v.maxLength(32))) })

/** Release packaging fails before shipping missing binaries, altered bytes, or absent license artifacts. No downloads occur here. */
export async function checkMediaArtifacts(directory: string, windows: boolean) {
  const manifest = v.parse(manifestSchema, JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')))
  for (const tool of ['yt-dlp', 'ffmpeg', 'whisper-cli'] as const) {
    const artifact = manifest[tool]
    if (!artifact)
      continue
    const path = join(directory, windows ? `${tool}.exe` : tool)
    if (await mediaDigest(path) !== artifact.sha256)
      throw new Error(`Release media artifact checksum mismatch: ${tool}`)
    await access(join(directory, artifact.license))
    if (!windows)
      await access(path, 1)
  }
  if (manifest.supportingFiles) {
    for (const file of manifest.supportingFiles) {
      const path = join(directory, file.path)
      if (await mediaDigest(path) !== file.sha256)
        throw new Error(`Release supporting artifact checksum mismatch: ${file.path}`)
    }
  }
}
