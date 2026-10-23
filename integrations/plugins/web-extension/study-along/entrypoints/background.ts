import type { BrowserMediaPayload, BrowserPairing } from '../contracts'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/websocket/native'

import { createRuntimeEventaContext } from '../../src/shared/eventa-runtime'
import { extensionHeartbeat, extensionReadMedia, studyExtensionConnect, studyExtensionShare, studyExtensionStatus } from '../contracts'

/** Owns one consented tab and a capability-scoped connection. No browsing observations are pushed into chat. */
export default defineBackground(() => {
  const { context } = createRuntimeEventaContext()
  let socket: WebSocket | undefined
  let pairing: BrowserPairing | undefined
  let allowedTabId: number | undefined
  let needsPairing = false
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let reconnect: ReturnType<typeof setTimeout> | undefined

  async function readMedia(): Promise<BrowserMediaPayload | null> {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true })
    if (tab?.id === undefined || tab.id !== allowedTabId)
      return null
    try {
      const [result] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (!['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(location.hostname))
            return null
          const videos = [...document.querySelectorAll('video')].filter((video) => {
            const rect = video.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          const video = videos.find(video => !video.paused && !video.ended) || videos[0]
          if (!video || document.querySelector('.ad-showing'))
            return null
          return { url: location.href, title: document.title.slice(0, 1000), currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null, duration: Number.isFinite(video.duration) ? video.duration : null, paused: video.paused }
        },
      })
      return result?.result ?? null
    }
    catch {
      // activeTab permission expires on navigation to another origin. A new user gesture must grant it again.
      return null
    }
  }

  async function connect() {
    clearInterval(heartbeat)
    clearTimeout(reconnect)
    socket?.close()
    if (!pairing)
      return
    const ws = new WebSocket(pairing.url, ['angela.study-along', `token.${pairing.token}`])
    socket = ws
    const connected = Promise.withResolvers<void>()
    const timeout = setTimeout(() => {
      connected.reject(new Error('Browser bridge connection timed out.'))
      ws.close()
    }, 5000)
    const channel = createContext(ws).context
    defineInvokeHandler(channel, extensionReadMedia, () => readMedia())
    ws.addEventListener('open', () => {
      if (socket !== ws) {
        clearTimeout(timeout)
        connected.reject(new Error('Connection replaced.'))
        ws.close()
        return
      }
      needsPairing = false
      clearTimeout(timeout)
      connected.resolve()
      heartbeat = setInterval(() => {
        void channel.emit(extensionHeartbeat, undefined).catch(() => ws.close())
      }, 20000)
    })
    ws.addEventListener('error', () => {
      if (socket === ws)
        needsPairing = true
      clearTimeout(timeout)
      connected.reject(new Error('Browser bridge connection failed.'))
    })
    ws.addEventListener('close', () => {
      if (socket !== ws)
        return
      clearInterval(heartbeat)
      clearTimeout(timeout)
      connected.reject(new Error('Browser bridge disconnected.'))
      reconnect = setTimeout(() => {
        void connect().catch(() => {
          needsPairing = true
        })
      }, 5000)
    })
    return connected.promise
  }

  defineInvokeHandler(context, studyExtensionStatus, () => ({ connected: socket?.readyState === WebSocket.OPEN, sharing: allowedTabId !== undefined, needsPairing }))
  async function connectPairing(input: string, persist: boolean) {
    const candidate: unknown = JSON.parse(input)
    if (!candidate || typeof candidate !== 'object' || !('url' in candidate) || typeof candidate.url !== 'string'
      || !('token' in candidate) || typeof candidate.token !== 'string' || !/^[a-f0-9]{64}$/u.test(candidate.token)
      || !('extensionId' in candidate) || candidate.extensionId !== browser.runtime.id) {
      throw new Error('Invalid pairing. Copy a new pairing from Angela Settings.')
    }
    const url = new URL(candidate.url)
    if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.pathname !== '/study-along' || !url.port || url.search || url.hash || url.username || url.password)
      throw new Error('The pairing address must point to the local Angela bridge.')
    pairing = { url: url.href, token: candidate.token, extensionId: browser.runtime.id }
    if (persist)
      await browser.storage.local.set({ studyAlongPairing: pairing })
    await connect()
  }
  defineInvokeHandler(context, studyExtensionConnect, input => connectPairing(input.pairing, true))
  defineInvokeHandler(context, studyExtensionShare, async ({ enabled }) => {
    if (!enabled) {
      allowedTabId = undefined
      return
    }
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true })
    if (tab?.id === undefined)
      throw new Error('No current tab is available.')
    allowedTabId = tab.id
    if (!await readMedia()) {
      allowedTabId = undefined
      throw new Error('Open a YouTube lesson and grant tab access through the extension button.')
    }
  })
  browser.tabs.onRemoved.addListener((id) => {
    if (id === allowedTabId)
      allowedTabId = undefined
  })
  void browser.storage.local.get('studyAlongPairing').then((stored) => {
    const input = stored.studyAlongPairing
    // Restored pairings use the same validation and loopback restriction as explicit popup input.
    if (input)
      return connectPairing(JSON.stringify(input), false)
  }).catch(() => {
    if (socket?.readyState !== WebSocket.OPEN)
      needsPairing = true
  })
})
