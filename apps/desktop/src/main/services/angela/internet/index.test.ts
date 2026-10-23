import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import { parseYouTubeUrl } from '@angela/companion/internet'
import { createContext, defineInvoke } from '@moeru/eventa'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { internetDiagnostics, videoResearch } from '../../../../shared/eventa/internet'
import { setupInternet } from './index'

const electron = vi.hoisted(() => ({ app: {}, BrowserWindow: { fromWebContents: vi.fn(() => ({})) } }))
vi.mock('electron', () => electron)

beforeEach(() => vi.clearAllMocks())

function clients() {
  const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
  const execute = vi.fn(async () => ({ video: { ...parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'), currentTime: 1114 }, transcript: { source: 'official' as const, language: 'en', generatedAt: Date.now() }, recentSegments: [{ start: 1110, end: 1114, text: 'AddScoped' }], range: { start: 1024, end: 1174 }, truncated: false, nextTimestamp: null }))
  const diagnostics = vi.fn(async () => [])
  setupInternet(context, { execute, diagnostics, pairBrowser: vi.fn(), revokeBrowser: vi.fn(), browserStatus: () => ({ connected: false, paired: false, error: null }) })
  return { video: defineInvoke(context, videoResearch), diagnostics: defineInvoke(context, internetDiagnostics), execute, diagnose: diagnostics }
}

describe('research IPC authorization', () => {
  it('passes lesson evidence to a trusted application main frame', async () => {
    const client = clients()
    const frame = {}
    const sender = { getURL: () => 'file:///angela/index.html', mainFrame: frame }
    const result = await Reflect.apply(client.video, undefined, [{ action: 'around' }, { raw: { ipcMainEvent: { sender, senderFrame: frame } } }])
    expect(result).toMatchObject({ video: { currentTime: 1114 }, recentSegments: [{ text: 'AddScoped' }] })
    expect(client.execute).toHaveBeenCalledWith({ action: 'around' })
  })

  it('rejects missing senders, remote pages, and subframes before browser or media access', async () => {
    const client = clients()
    await expect(client.video({ action: 'around' })).rejects.toThrow('trusted application')
    const remote = { getURL: () => 'https://evil.test', mainFrame: {} }
    await expect(Reflect.apply(client.video, undefined, [{ action: 'around' }, { raw: { ipcMainEvent: { sender: remote } } }])).rejects.toThrow('trusted application')
    const local = { getURL: () => 'file:///angela/index.html', mainFrame: {} }
    await expect(Reflect.apply(client.video, undefined, [{ action: 'around' }, { raw: { ipcMainEvent: { sender: local, senderFrame: {} } } }])).rejects.toThrow('trusted application')
    expect(client.execute).not.toHaveBeenCalled()
    await expect(client.diagnostics()).rejects.toThrow('trusted application')
    expect(client.diagnose).not.toHaveBeenCalled()
  })
})
