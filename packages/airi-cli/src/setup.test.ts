import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { LocalConfigFile } from '@proj-airi/local-config/node'
import { afterEach, expect, it } from 'vitest'

const execute = promisify(execFile)
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-setup-'))
  directories.push(directory)
  const path = join(directory, 'config.json')
  const run = async (args: string[], key = '') => await execute(process.execPath, [
    '--import',
    fileURLToPath(import.meta.resolve('tsx')),
    fileURLToPath(new URL('./bin/run.ts', import.meta.url)),
    'setup',
    '--config',
    path,
    ...args,
  ], { env: { ...process.env, ANGELA_CONFIG: path, ANGELA_API_KEY: key, ANGELA_MODEL: '', ANGELA_BASE_URL: '', ANGELA_API: '' }, timeout: 15_000 })
  return { run, path, file: new LocalConfigFile(path) }
}

it('configures a chat provider privately, preserves other entries and never prints the credential', async () => {
  const { run, file, path } = await setup()
  await file.update({ providers: { existing: { definitionId: 'openai-compatible', status: 'configured', config: { apiKey: 'other-private-key' } } } })
  const result = await run(['--provider', 'local', '--model', 'study-model', '--base-url', 'http://127.0.0.1:1234/v1/', '--api', 'responses'], 'test-setup-private-key')
  expect(result.stdout).toContain('angela doctor')
  expect(result.stdout + result.stderr).not.toContain('test-setup-private-key')
  expect((await file.read()).config).toMatchObject({
    chat: { provider: 'local', model: 'study-model' },
    providers: {
      existing: { config: { apiKey: 'other-private-key' } },
      local: { definitionId: 'openai-compatible', config: { apiKey: 'test-setup-private-key', api: 'responses' } },
    },
  })
  expect((await stat(path)).mode & 0o777).toBe(0o600)
  const next = await run(['--provider', 'local', '--model', 'next-model'], 'replacement-private-key')
  expect(next.stdout + next.stderr).not.toContain('replacement-private-key')
  expect((await file.read()).config?.providers.local.config).toMatchObject({ apiKey: 'replacement-private-key', api: 'responses' })
}, 15_000)

it('rejects invalid providers, protocols and credential-bearing URLs without changing existing settings', async () => {
  const { run, file, path } = await setup()
  await file.update({ chat: { provider: '', model: '' } })
  const previous = await readFile(path, 'utf8')
  for (const args of [
    ['--model', 'm', '--definition', 'missing-provider'],
    ['--model', 'm', '--api', 'invalid'],
    ['--model', 'm', '--base-url', 'file:///private'],
    ['--model', 'm', '--base-url', 'https://user:private@provider.example/v1/'],
  ]) {
    await expect(run(args)).rejects.toMatchObject({ code: 1 })
    expect(await readFile(path, 'utf8')).toBe(previous)
  }
}, 20_000)

it('lists provider IDs without requiring a model or writing configuration and preserves invalid files', async () => {
  const { run, path } = await setup()
  expect((await run(['--list-providers'])).stdout).toContain('openai-compatible')
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  await writeFile(path, 'corrupt-private-config')
  await expect(run(['--model', 'm'])).rejects.toMatchObject({ code: 1 })
  expect(await readFile(path, 'utf8')).toBe('corrupt-private-config')
}, 15_000)
