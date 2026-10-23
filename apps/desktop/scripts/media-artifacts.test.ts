import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, it } from 'vitest'

import { checkMediaArtifacts } from './media-artifacts'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-artifacts-'))
})
afterEach(async () => rm(directory, { recursive: true, force: true }))

it('checks release bytes and license artifacts before packaging', async () => {
  const bytes = 'release fixture bytes'
  const artifact = { version: 'test', sha256: createHash('sha256').update(bytes).digest('hex'), license: 'licenses/tool.txt' }
  await mkdir(join(directory, 'licenses'))
  await writeFile(join(directory, 'licenses', 'tool.txt'), 'Fixture license')
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ 'yt-dlp': artifact, 'ffmpeg': artifact }))
  for (const name of ['yt-dlp', 'ffmpeg']) {
    await writeFile(join(directory, name), bytes)
    await chmod(join(directory, name), 0o700)
  }
  await expect(checkMediaArtifacts(directory, false)).resolves.toBeUndefined()
  await writeFile(join(directory, 'ffmpeg'), 'altered bytes')
  await expect(checkMediaArtifacts(directory, false)).rejects.toThrow('checksum mismatch')
})

it('refuses a release without its manifest', async () => {
  await expect(checkMediaArtifacts(directory, false)).rejects.toThrow()
})
