import type { BrowserMediaPayload, BrowserPairing } from '../../../../../shared/eventa/browser-media'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import NodeWebSocket from 'crossws/websocket'

import { InternetError } from '@angela/companion/internet'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/websocket/native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { extensionReadMedia } from '../../../../../shared/eventa/browser-media'
import { ChromeExtensionBrowserProvider } from './extension'
import { ActiveBrowserMediaProvider } from './provider'

const extensionId = 'a'.repeat(32)
const payload: BrowserMediaPayload = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'AddScoped lesson', currentTime: 1114, duration: 2000, paused: false }
let directory: string
let bridge: ChromeExtensionBrowserProvider
const clients: WebSocket[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-browser-bridge-'))
  bridge = new ChromeExtensionBrowserProvider(directory)
})
afterEach(async () => {
  for (const client of clients.splice(0))
    client.close()
  await bridge.stop()
  await rm(directory, { recursive: true, force: true })
})

async function connect(pairing: BrowserPairing, read: () => Promise<BrowserMediaPayload | null> = async () => payload, origin = `chrome-extension://${extensionId}`) {
  // crossws/websocket delegates its documented third Node argument to ws, which supplies Origin for real handshake tests.
  const client = Reflect.construct(NodeWebSocket, [pairing.url, ['angela.study-along', `token.${pairing.token}`], { headers: { Origin: origin } }]) as WebSocket
  clients.push(client)
  const { context } = createContext(client)
  defineInvokeHandler(context, extensionReadMedia, () => read())
  await new Promise<void>((resolve, reject) => {
    client.addEventListener('open', () => resolve(), { once: true })
    client.addEventListener('error', () => reject(new Error('Handshake rejected')), { once: true })
  })
  return client
}

describe('authenticated extension bridge over real loopback WebSockets', () => {
  it('scenario A: observes fresh current media at 18:34 and prefers it over Playwright', async () => {
    const pairing = await bridge.pair(extensionId)
    let currentTime = 1114
    await connect(pairing, async () => ({ ...payload, currentTime }))
    const playwright = { getActiveMediaContext: vi.fn() }
    const provider = new ActiveBrowserMediaProvider(bridge, playwright)
    expect((await provider.getActiveMediaContext()).currentTime).toBe(1114)
    currentTime = 1120
    expect((await provider.getActiveMediaContext()).currentTime).toBe(1120)
    expect(playwright.getActiveMediaContext).not.toHaveBeenCalled()
  })

  it('rejects a wrong origin and a wrong or malformed token during upgrade', async () => {
    const pairing = await bridge.pair(extensionId)
    await expect(connect(pairing, undefined, 'https://evil.test')).rejects.toThrow('Handshake rejected')
    await expect(connect({ ...pairing, token: 'f'.repeat(64) })).rejects.toThrow('Handshake rejected')
    await expect(connect({ ...pairing, token: 'z'.repeat(64) })).rejects.toThrow('Handshake rejected')
    expect(bridge.status().connected).toBe(false)
  })

  it('rejects extra page content, invalid timestamps, and invalid URLs', async () => {
    const pairing = await bridge.pair(extensionId)
    const snapshots: unknown[] = [{ ...payload, cookies: 'forbidden' }, { ...payload, currentTime: -1 }, { ...payload, url: 'https://evil.test' }]
    await connect(pairing, async () => snapshots.shift() as BrowserMediaPayload)
    await expect(bridge.getActiveMediaContext()).rejects.toThrow('invalid media')
    await expect(bridge.getActiveMediaContext()).rejects.toThrow('invalid media')
    await expect(bridge.getActiveMediaContext()).rejects.toThrow('INVALID_URL')
  })

  it('returns an unknown position without fabricating zero', async () => {
    await connect(await bridge.pair(extensionId), async () => ({ ...payload, currentTime: null }))
    expect((await bridge.getActiveMediaContext()).currentTime).toBeNull()
  })

  it('falls back to Playwright when no authorized active tab exists', async () => {
    await connect(await bridge.pair(extensionId), async () => null)
    const playwright = { getActiveMediaContext: vi.fn(async () => ({ url: payload.url, videoId: 'dQw4w9WgXcQ', title: 'MCP lesson', currentTime: 500, duration: 1000, platform: 'youtube' as const })) }
    expect((await new ActiveBrowserMediaProvider(bridge, playwright).getActiveMediaContext()).currentTime).toBe(500)
    expect(playwright.getActiveMediaContext).toHaveBeenCalledOnce()
  })

  it('persists private pairing across desktop restarts and revokes access explicitly', async () => {
    const pairing = await bridge.pair(extensionId)
    await bridge.stop()
    bridge = new ChromeExtensionBrowserProvider(directory)
    await bridge.start()
    await connect(pairing)
    expect((await bridge.getActiveMediaContext()).currentTime).toBe(1114)
    await bridge.revoke()
    expect(bridge.status()).toMatchObject({ connected: false, paired: false })
    await expect(bridge.getActiveMediaContext()).rejects.toThrow('not connected')
  })

  it('reports unavailable media when both connected sources fail', async () => {
    const missing = { getActiveMediaContext: vi.fn(async () => {
      throw new InternetError('UNAVAILABLE', 'No tab')
    }) }
    await expect(new ActiveBrowserMediaProvider(bridge, missing).getActiveMediaContext()).rejects.toThrow('No active lesson')
  })
})
