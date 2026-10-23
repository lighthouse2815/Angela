import process from 'node:process'

import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { MediaProcess } from '@angela/companion/internet/process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ManagedMediaProcess, mediaTarget, MediaToolResolver } from './resolver'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'angela-tools-'))
})
afterEach(async () => rm(root, { recursive: true, force: true }))

async function executable(directory: string, name = 'yt-dlp') {
  await mkdir(directory, { recursive: true })
  const path = join(directory, name)
  await writeFile(path, `#!${process.execPath}\nprocess.stdout.write('2026.08.19\\n')\n`, { mode: 0o700 })
  return path
}

function resolver(env: NodeJS.ProcessEnv = {}, packaged = false, run = vi.fn(async () => '2026.08.19')) {
  return new MediaToolResolver({ packaged, resourcesPath: root, developmentResources: root, platform: 'linux', arch: 'x64', env }, { run })
}

describe('managed media tool resolution', () => {
  it('prefers an explicit absolute override to bundled and system tools', async () => {
    const override = await executable(join(root, 'override'))
    await executable(join(root, 'media', 'linux-x64'))
    expect(await resolver({ ANGELA_YTDLP_PATH: override }).inspect('yt-dlp')).toMatchObject({ source: 'OVERRIDE', path: override })
  })

  it('prefers the bundled binary over PATH', async () => {
    const bundled = await executable(join(root, 'media', 'linux-x64'))
    await executable(join(root, 'system'))
    expect(await resolver({ PATH: join(root, 'system') }).inspect('yt-dlp')).toMatchObject({ source: 'BUNDLED', path: bundled })
  })

  it('uses system tools only during development', async () => {
    const path = await executable(join(root, 'system'))
    expect(await resolver({ PATH: `${join(root, 'absent')}${delimiter}${join(root, 'system')}` }).inspect('yt-dlp')).toMatchObject({ source: 'SYSTEM', path })
    expect(await resolver({ PATH: join(root, 'system') }, true).inspect('yt-dlp')).toMatchObject({ source: 'MISSING', path: null })
  })

  it('reports missing, relative, non-executable, and invalid executables without masking overrides', async () => {
    expect(await resolver().inspect('yt-dlp')).toMatchObject({ source: 'MISSING' })
    expect(await resolver({ ANGELA_YTDLP_PATH: 'relative' }).inspect('yt-dlp')).toMatchObject({ source: 'MISSING' })
    const path = await executable(join(root, 'override'))
    await chmod(path, 0o600)
    expect(await resolver({ ANGELA_YTDLP_PATH: path }).inspect('yt-dlp')).toMatchObject({ source: 'MISSING' })
    await chmod(path, 0o700)
    expect(await resolver({ ANGELA_YTDLP_PATH: path }, false, vi.fn(async () => 'unexpected tool')).inspect('yt-dlp')).toMatchObject({ source: 'MISSING' })
    await expect(resolver().require('yt-dlp')).rejects.toThrow('NEED_SETUP')
  })

  it.skipIf(process.platform === 'win32')('scenario D: executes the real bundled fixture when PATH contains no yt-dlp', async () => {
    await executable(join(root, 'media', 'linux-x64'))
    const paths = new MediaToolResolver({ packaged: true, resourcesPath: root, developmentResources: root, platform: 'linux', arch: 'x64', env: { PATH: '' } }, new MediaProcess())
    expect((await paths.inspect('yt-dlp')).source).toBe('BUNDLED')
    expect((await new ManagedMediaProcess(paths).run('yt-dlp', ['--version'])).trim()).toBe('2026.08.19')
  })

  it('maps release targets without platform-specific path literals', () => {
    expect(mediaTarget('linux', 'x64')).toBe('linux-x64')
    expect(mediaTarget('darwin', 'arm64')).toBe('mac-arm64')
    expect(mediaTarget('win32', 'x64')).toBe('win-x64')
    expect(() => mediaTarget('linux', 'ia32')).toThrow('UNAVAILABLE')
  })
})
