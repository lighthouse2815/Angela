import process from 'node:process'

import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { Voice } from '@angela/voice-client/voice'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Doctor, runDoctor } from './doctor'

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('node:child_process', () => ({
  execFile: Object.assign(() => {}, { [Symbol.for('nodejs.util.promisify.custom')]: execute }),
}))

let directory: string
let env: NodeJS.ProcessEnv
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-doctor-'))
  env = { ANGELA_CONFIG: join(directory, 'config.json'), ANGELA_DATA_DIR: join(directory, 'data'), ANGELA_MODEL: 'test-model', ANGELA_BASE_URL: 'http://localhost:1234/v1/', ANGELA_API_KEY: 'private-key', ANGELA_LOCALE: 'en' }
  execute.mockReset().mockImplementation(async (command: string) => {
    if (command === 'git')
      throw new Error('Not a repository')
    return { stdout: 'available\n' }
  })
  vi.spyOn(Voice, 'load').mockResolvedValue(new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost:1234/v1/' }, cliMessages.en))
  vi.spyOn(Voice.prototype, 'healthy').mockResolvedValue(true)
  fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'test-model' }] })))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await rm(directory, { recursive: true, force: true })
})

it('checks a missing data directory without creating files, recording, playback or echo modules', async () => {
  const checks = await new Doctor([`--cwd=${directory}`], env, cliMessages.en).inspect()
  expect(checks.filter(check => check.status === 'error')).toEqual([])
  expect(checks.find(check => check.id === 'project-memory')?.status).toBe('ok')
  expect(checks.find(check => check.id === 'echo-cancellation')?.status).toBe('warning')
  expect(await readdir(directory)).toEqual([])
  expect(fetchMock).toHaveBeenCalledWith(new URL('http://localhost:1234/v1/models'), expect.objectContaining({ headers: { Authorization: 'Bearer private-key' }, redirect: 'error' }))
  expect(JSON.stringify(checks)).not.toContain('private-key')
  for (const [command, args] of execute.mock.calls) {
    expect(['git', 'pw-record', 'pw-play', 'pactl']).toContain(command)
    if (command === 'pw-record' || command === 'pw-play')
      expect(args).toEqual(['--version'])
    if (command === 'pactl')
      expect(args.slice(0, 2)).toEqual(['list', 'short'])
  }
})

it('redacts provider bodies and keeps local diagnostics available on authentication failure', async () => {
  fetchMock.mockResolvedValue(new Response('secret provider diagnostic', { status: 401 }))
  const checks = await new Doctor([], env, cliMessages.en).inspect()
  expect(checks.find(check => check.id === 'api')).toMatchObject({ status: 'error', message: expect.stringContaining('401') })
  expect(checks.find(check => check.id === 'personal-memory')?.status).toBe('ok')
  expect(JSON.stringify(checks)).not.toContain('secret provider diagnostic')
})

it('rejects malformed and oversized model lists and warns about unlisted models', async () => {
  for (const body of ['{"data":null}', 'x'.repeat(2_000_001)]) {
    fetchMock.mockResolvedValue(new Response(body))
    expect((await new Doctor([], env, cliMessages.en).inspect()).find(check => check.id === 'api')?.status).toBe('error')
  }
  fetchMock.mockResolvedValue(new Response('{"data":[]}'))
  expect((await new Doctor([], env, cliMessages.en).inspect()).find(check => check.id === 'model')?.status).toBe('warning')
})

it('reports invalid configuration and context independently without making API requests', async () => {
  env.ANGELA_MODEL = ''
  env.ANGELA_CONTEXT_TOKENS = 'bad'
  const checks = await new Doctor([], env, cliMessages.en).inspect()
  expect(checks.find(check => check.id === 'context')?.status).toBe('error')
  expect(checks.find(check => check.id === 'config')?.status).toBe('error')
  expect(checks.find(check => check.id === 'history')?.status).toBe('ok')
  expect(fetchMock).not.toHaveBeenCalled()
})

it('preserves corrupt sessions and locks while reporting both', async () => {
  env.ANGELA_DATA_DIR = directory
  const session = join(directory, '00000000-0000-4000-8000-000000000000.json')
  const lock = join(directory, 'active.lock')
  await writeFile(session, '{broken')
  await writeFile(lock, 'active writer')
  const checks = await new Doctor([], env, cliMessages.en).inspect()
  expect(checks.find(check => check.id === 'history')?.status).toBe('warning')
  expect(checks.find(check => check.id === 'locks')?.status).toBe('warning')
  expect(await readFile(session, 'utf8')).toBe('{broken')
  expect(await readFile(lock, 'utf8')).toBe('active writer')
})

it('reports offline audio without failing the other checks', async () => {
  vi.mocked(Voice.prototype.healthy).mockResolvedValue(false)
  execute.mockRejectedValue(new Error('unavailable'))
  const checks = await new Doctor([], env, cliMessages.en).inspect()
  for (const id of ['voice-service', 'audio-commands', 'audio-devices'])
    expect(checks.find(check => check.id === id)?.status).toBe('warning')
  expect(checks.find(check => check.id === 'model')?.status).toBe('ok')
})

it('prints machine-readable results and exits unsuccessfully for errors; help avoids probes', async () => {
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const previousExit = process.exitCode
  try {
    env.ANGELA_MODEL = ''
    await runDoctor(['--json'], env)
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ healthy: false, checks: expect.any(Array) })
    expect(process.exitCode).toBe(1)
    output.mockClear()
    execute.mockClear()
    await runDoctor(['--help'], env)
    expect(output).toHaveBeenCalledWith(`${cliMessages.en.doctorUsage}\n`)
    expect(execute).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  }
  finally {
    process.exitCode = previousExit
  }
})

it('warns about corrupt personal and project memory without changing either file', async () => {
  env.ANGELA_DATA_DIR = directory
  const memoryDirectory = join(directory, 'memory')
  const projectDirectory = join(memoryDirectory, 'projects')
  await mkdir(projectDirectory, { recursive: true })
  const personal = join(memoryDirectory, 'personal.json')
  await writeFile(personal, '{broken')
  const projectFile = join(projectDirectory, `${createHash('sha256').update(directory).digest('hex')}.json`)
  await writeFile(projectFile, '{broken')
  const checks = await new Doctor(['--cwd', directory], env, cliMessages.en).inspect()
  expect(checks.find(check => check.id === 'personal-memory')?.status).toBe('warning')
  expect(checks.find(check => check.id === 'project-memory')?.status).toBe('warning')
  expect(await readFile(personal, 'utf8')).toBe('{broken')
  expect(await readFile(projectFile, 'utf8')).toBe('{broken')
})
