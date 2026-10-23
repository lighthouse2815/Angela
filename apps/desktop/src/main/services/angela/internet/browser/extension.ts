import type { BrowserMediaContextProvider, VideoContext } from '@angela/companion/internet'
import type { Peer } from 'crossws'

import type { BrowserPairing } from '../../../../../shared/eventa/browser-media'
import type { ServerManager } from '../../http-server/server-manager/types'

import { Buffer } from 'node:buffer'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

import nodeAdapter from 'crossws/adapters/node'

import { InternetError, parseYouTubeUrl } from '@angela/companion/internet'
import { secondsSchema } from '@angela/companion/internet/contracts'
import { MemoryFile } from '@angela/companion/memory-file'
import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/event-target'

import * as v from 'valibot'

import { extensionReadMedia } from '../../../../../shared/eventa/browser-media'

const extensionIdSchema = v.pipe(v.string(), v.regex(/^[a-p]{32}$/u))
const pairingSchema = v.nullable(v.object({ extensionId: extensionIdSchema, token: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)), port: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535)) }))
const payloadSchema = v.strictObject({ url: v.pipe(v.string(), v.maxLength(4096)), title: v.pipe(v.string(), v.maxLength(1000)), currentTime: v.nullable(secondsSchema), duration: v.nullable(secondsSchema), paused: v.optional(v.boolean()) })

/** Keeps WebSocket peer identity inside crossws while Eventa owns framing, correlation, and cancellation through its stable EventTarget adapter. */
class PeerEvents extends EventTarget {
  constructor(private readonly peer: Peer) { super() }

  override dispatchEvent(event: Event) {
    if (event instanceof CustomEvent && event.type === 'message') {
      this.peer.send(JSON.stringify(event.detail))
      return true
    }
    return super.dispatchEvent(event)
  }

  receive(detail: unknown) {
    super.dispatchEvent(new CustomEvent('message', { detail }))
  }
}

/**
 * Owns one persisted, private pairing and one authenticated loopback connection.
 * Eventa carries only fresh media requests. Disconnect rejects pending requests and never reuses stale playback state.
 */
export class ChromeExtensionBrowserProvider implements BrowserMediaContextProvider, ServerManager {
  readonly key = 'study-along-browser'
  private readonly file: MemoryFile<{ pairing: v.InferOutput<typeof pairingSchema> }>
  private pairing: v.InferOutput<typeof pairingSchema> = null
  private server?: ReturnType<typeof createServer>
  private connection?: { peer: Peer, events: PeerEvents, adapter: ReturnType<typeof createContext>, read: (signal: AbortSignal) => Promise<unknown> }
  private adapter?: ReturnType<typeof nodeAdapter>
  private queue: Promise<unknown> = Promise.resolve()
  private error: string | null = null

  constructor(directory: string) {
    this.file = new MemoryFile(directory, 'browser-pairing', v.object({ pairing: pairingSchema }), () => ({ pairing: null }), { invalid: 'Invalid browser pairing configuration.', locked: 'Browser pairing is busy.' })
  }

  private serialize<T>(operation: () => Promise<T>) {
    const pending = this.queue.then(operation)
    this.queue = pending.then(() => undefined, () => undefined)
    return pending
  }

  async start() {
    return this.serialize(async () => {
      if (this.server)
        return
      this.pairing = (await this.file.read()).pairing
      if (this.pairing)
        await this.listen(this.pairing.port)
    })
  }

  async pair(extensionId: string): Promise<BrowserPairing> {
    if (!v.safeParse(extensionIdSchema, extensionId).success)
      throw new InternetError('NEED_SETUP', 'Enter the Chrome extension ID shown in its popup.')
    return this.serialize(async () => {
      this.connection?.adapter.dispose(new InternetError('CANCELLED', 'Browser pairing changed.'))
      this.connection?.peer.close(1000, 'Pairing changed')
      this.connection = undefined
      const token = randomBytes(32).toString('hex')
      if (!this.server)
        await this.listen(0)
      const address = this.server!.address()
      if (!address || typeof address === 'string')
        throw new InternetError('UNAVAILABLE', 'Browser bridge has no local address.')
      const record = { extensionId, token, port: address.port }
      await this.file.edit(state => state.pairing = record)
      this.pairing = record
      return { url: `ws://127.0.0.1:${address.port}/study-along`, token, extensionId }
    })
  }

  private async listen(port: number) {
    const adapter = nodeAdapter({
      serverOptions: { maxPayload: 16384, handleProtocols: () => 'angela.study-along' },
      hooks: {
        open: (peer) => {
          if (this.connection) {
            peer.close(1008, 'Already connected')
            return
          }
          const events = new PeerEvents(peer)
          const adapter = createContext(events, { errorEventName: false })
          const read = defineInvoke(adapter.context, extensionReadMedia)
          this.connection = { peer, events, adapter, read: signal => read(undefined, { signal }) }
        },
        message: (peer, message) => {
          if (this.connection?.peer.id !== peer.id)
            return
          let value: unknown
          try {
            value = JSON.parse(message.text())
          }
          catch {
            peer.close(1007, 'Invalid event')
            return
          }
          this.connection.events.receive(value)
        },
        close: (peer) => {
          if (this.connection?.peer.id !== peer.id)
            return
          this.connection.adapter.dispose(new InternetError('CANCELLED', 'Browser disconnected.'))
          this.connection = undefined
        },
        error: (peer) => {
          if (this.connection?.peer.id !== peer.id)
            return
          this.connection.adapter.dispose(new InternetError('UNAVAILABLE', 'Browser connection failed.'))
          this.connection = undefined
        },
      },
    })
    const server = createServer((_request, response) => {
      response.writeHead(404)
      response.end()
    })
    server.on('upgrade', (request, socket, head) => {
      const pairing = this.pairing
      const header = request.headers['sec-websocket-protocol']?.split(',').map(part => part.trim())
      const token = header?.find(value => value.startsWith('token.'))?.slice(6) ?? ''
      const expected = pairing?.token ?? ''
      const address = server.address()
      const host = address && typeof address !== 'string' ? `127.0.0.1:${address.port}` : ''
      if (!pairing || request.url !== '/study-along' || request.headers.host !== host
        || request.headers.origin !== `chrome-extension://${pairing.extensionId}`
        || !header?.includes('angela.study-along') || !/^[a-f0-9]{64}$/u.test(token) || token.length !== expected.length
        || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        return
      }
      void adapter.handleUpgrade(request, socket, head).catch(() => socket.destroy())
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject)
          resolve()
        })
      })
      this.server = server
      this.adapter = adapter
      this.error = null
    }
    catch {
      await adapter.close()
      this.error = 'The local browser bridge could not start. Pair the extension again after closing the conflicting listener.'
      throw new InternetError('UNAVAILABLE', this.error)
    }
  }

  status() { return { connected: Boolean(this.connection), paired: Boolean(this.pairing), error: this.error } }

  async getActiveMediaContext(): Promise<VideoContext> {
    const connection = this.connection
    if (!connection)
      throw new InternetError('UNAVAILABLE', 'The Study Along extension is not connected.')
    let input: unknown
    try {
      input = await connection.read(AbortSignal.timeout(4000))
    }
    catch { throw new InternetError('UNAVAILABLE', 'The browser did not return an authorized media tab.') }
    if (this.connection !== connection || input === null)
      throw new InternetError('UNAVAILABLE', 'No authorized active media tab is available.')
    const parsed = v.safeParse(payloadSchema, input)
    if (!parsed.success)
      throw new InternetError('UNAVAILABLE', 'The extension returned invalid media metadata.')
    const payload = parsed.output
    return { ...parseYouTubeUrl(payload.url), title: payload.title, currentTime: payload.currentTime, duration: payload.duration, ...(payload.paused === undefined ? {} : { paused: payload.paused }) }
  }

  private async disconnect() {
    this.connection?.adapter.dispose(new InternetError('CANCELLED', 'Browser bridge stopped.'))
    await this.adapter?.close(1000, 'Angela stopped')
    this.adapter = undefined
    this.connection = undefined
    if (this.server) {
      const server = this.server
      this.server = undefined
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }

  async revoke() {
    return this.serialize(async () => {
      await this.disconnect()
      await this.file.edit(state => state.pairing = null)
      this.pairing = null
      this.error = null
    })
  }

  async stop() { return this.serialize(() => this.disconnect()) }
}
