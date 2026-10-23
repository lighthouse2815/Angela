import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import * as v from 'valibot'

const entry = v.object({ sha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)), version: v.pipe(v.string(), v.minLength(1)), license: v.pipe(v.string(), v.regex(/^licenses\/[\w.-]+$/u)) })
const manifestSchema = v.object({ 'yt-dlp': entry, 'ffmpeg': entry, 'whisper-cli': v.optional(entry) })

/** Release packaging fails before shipping missing binaries, altered bytes, or absent license artifacts. No downloads occur here. */
export async function checkMediaArtifacts(directory: string, windows: boolean) {
  const manifest = v.parse(manifestSchema, JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')))
  for (const [tool, artifact] of Object.entries(manifest)) {
    if (!artifact)
      continue
    const path = join(directory, windows ? `${tool}.exe` : tool)
    if (!(await lstat(path)).isFile())
      throw new Error(`Release media artifact must be a regular file: ${tool}`)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path))
      hash.update(chunk)
    if (hash.digest('hex') !== artifact.sha256)
      throw new Error(`Release media artifact checksum mismatch: ${tool}`)
    await access(join(directory, artifact.license))
    if (!windows)
      await access(path, 1)
  }
}
