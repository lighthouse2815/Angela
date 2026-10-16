import process from 'node:process'

import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it } from 'vitest'

import { LocalConfigFile, resolveLocalConfigPath } from './node'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-config-'))
  directories.push(directory)
  return { directory, store: new LocalConfigFile(join(directory, 'config.json')) }
}

it('resolves explicit paths before environment configuration', () => {
  expect(resolveLocalConfigPath('/explicit/config.json', { ANGELA_CONFIG: '/other/config.json' })).toBe('/explicit/config.json')
  expect(resolveLocalConfigPath(undefined, { XDG_CONFIG_HOME: '/config' })).toBe('/config/angela/config.json')
})

it('returns an absent snapshot without creating files', async () => {
  const { directory, store } = await setup()
  expect(await store.read()).toMatchObject({ config: null, revision: 'missing' })
  expect(await readdir(directory)).toEqual([])
})

it('shares UTF-8 settings and keys between independent readers using private permissions', async () => {
  const { store } = await setup()
  const result = await store.update({
    providers: { local: { definitionId: 'openai-compatible', status: 'configured', config: { apiKey: 'test-only-secret', label: 'Tiếng Việt' } } },
    chat: { provider: 'local', model: 'test-model' },
  })
  expect(await new LocalConfigFile(store.path).read()).toEqual(result)
  if (process.platform !== 'win32')
    expect((await stat(store.path)).mode & 0o777).toBe(0o600)
})

it('merges simultaneous writers without losing unrelated providers', async () => {
  const { store } = await setup()
  await Promise.all([
    store.update({ providers: { first: { definitionId: 'openai-compatible', config: { apiKey: 'first' }, status: 'configured' } } }),
    new LocalConfigFile(store.path).update({ providers: { second: { definitionId: 'ollama', config: { baseUrl: 'http://localhost:11434/' }, status: 'configured' } } }),
  ])
  expect(Object.keys((await store.read()).config!.providers).sort()).toEqual(['first', 'second'])
  await store.update({ providers: { first: null } })
  expect(Object.keys((await store.read()).config!.providers)).toEqual(['second'])
})

it('preserves malformed files and hides their contents from errors', async () => {
  const { store } = await setup()
  const source = '{"private":"test-secret-must-not-appear"'
  await writeFile(store.path, source)
  await expect(store.read()).rejects.toThrow(`Invalid local configuration: ${store.path}`)
  await expect(store.update({ chat: { provider: '', model: '' } })).rejects.toThrow('Invalid local configuration')
  expect(await readFile(store.path, 'utf8')).toBe(source)
  expect(await readdir(join(store.path, '..'))).toEqual(['config.json'])
})
