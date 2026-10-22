import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createContext, defineInvoke } from '@moeru/eventa'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { localConfigRead, localConfigUpdate } from '../../../shared/eventa/local-config'
import { setupLocalProviderConfig } from './local-config'

const electron = vi.hoisted(() => ({ BrowserWindow: { fromWebContents: vi.fn(() => ({})) } }))
vi.mock('electron', () => electron)
let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-config-ipc-'))
  vi.stubEnv('ANGELA_CONFIG', join(directory, 'config.json'))
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('shares validated settings through trusted renderer IPC and rejects remote frames', async () => {
  const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
  setupLocalProviderConfig(context)
  const read = defineInvoke(context, localConfigRead)
  const update = defineInvoke(context, localConfigUpdate)
  const frame = {}
  const trusted = { raw: { ipcMainEvent: { sender: { getURL: () => 'file:///app/index.html', mainFrame: frame }, senderFrame: frame } } }
  await Reflect.apply(update, undefined, [{ chat: { provider: 'local', model: 'model' } }, trusted])
  expect(await Reflect.apply(read, undefined, [undefined, trusted])).toMatchObject({ config: { chat: { provider: 'local', model: 'model' } } })
  const saved = await readFile(join(directory, 'config.json'), 'utf8')
  await expect(read()).rejects.toThrow('application window')
  const remote = { raw: { ipcMainEvent: { sender: { getURL: () => 'https://example.com/' } } } }
  await expect(Reflect.apply(read, undefined, [undefined, remote])).rejects.toThrow('application window')
  const subframe = { raw: { ipcMainEvent: { ...trusted.raw.ipcMainEvent, senderFrame: {} } } }
  await expect(Reflect.apply(update, undefined, [{ chat: { provider: '', model: '' } }, subframe])).rejects.toThrow('main application frame')
  await expect(Reflect.apply(update, undefined, [{ chat: { model: 42 } }, trusted])).rejects.toThrow()
  expect(await readFile(join(directory, 'config.json'), 'utf8')).toBe(saved)
})
