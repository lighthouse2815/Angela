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

it('checks exact source and notice bytes, rejects missing sources and traversal paths', async () => {
  const bytes = 'Release fixture'
  const digest = createHash('sha256').update(bytes).digest('hex')
  await mkdir(join(directory, 'licenses'))
  await mkdir(join(directory, 'sources'))
  await writeFile(join(directory, 'licenses', 'tool.txt'), bytes)
  await writeFile(join(directory, 'sources', 'ffmpeg.tar.xz'), bytes)
  for (const name of ['yt-dlp', 'ffmpeg'])
    await writeFile(join(directory, name), bytes, { mode: 0o700 })
  const artifact = { version: 'fixture', sha256: digest, license: 'licenses/tool.txt' }
  const manifest = { 'yt-dlp': artifact, 'ffmpeg': artifact, 'supportingFiles': [{ path: 'sources/ffmpeg.tar.xz', sha256: digest }] }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
  await expect(checkMediaArtifacts(directory, false)).resolves.toBeUndefined()
  await writeFile(join(directory, 'sources', 'ffmpeg.tar.xz'), 'Altered source')
  await expect(checkMediaArtifacts(directory, false)).rejects.toThrow('supporting artifact checksum mismatch')
  await rm(join(directory, 'sources', 'ffmpeg.tar.xz'))
  await expect(checkMediaArtifacts(directory, false)).rejects.toThrow()
  manifest.supportingFiles[0].path = '../outside.txt'
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
  await expect(checkMediaArtifacts(directory, false)).rejects.toThrow()
})
