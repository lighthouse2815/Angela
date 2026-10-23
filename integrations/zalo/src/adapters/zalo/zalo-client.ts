import type { API, Message } from 'zca-js'

import type { AwayLog, ExternalMessage } from '../../away/away-types'
import type { ZaloClient, ZaloCredentialStore, ZaloLoginDisplay } from './zalo-types'

import { LoginQRCallbackEventType, ThreadType, Zalo } from 'zca-js'

/** Uses the pinned SDK transport. Each reconnect creates a fresh API and stops the previous listener first. */
export class PersonalZaloClient implements ZaloClient {
  private api?: API

  constructor(private readonly credentials: ZaloCredentialStore) {}

  private sdk(signal: AbortSignal) {
    return new Zalo({
      selfListen: false,
      logging: false,
      checkUpdate: false,
      polyfill: (input, init) => fetch(input, {
        ...init,
        signal: AbortSignal.any([signal, AbortSignal.timeout(120_000), ...(init?.signal ? [init.signal] : [])]),
      }),
    })
  }

  /** QR callbacks carry secrets. Only the image reaches the private display store. Expiry never retries automatically. */
  async login(display: ZaloLoginDisplay, log: AwayLog, signal: AbortSignal) {
    let abortQr: (() => unknown) | undefined
    let imageWrite: Promise<void> = Promise.resolve()
    const abort = () => {
      abortQr?.()
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      signal.throwIfAborted()
      const api = await this.sdk(signal).loginQR(undefined, (event) => {
        if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
          abortQr = event.actions.abort
          imageWrite = display.show(event.data.image)
          void imageWrite.catch(() => {
            event.actions.abort()
          })
          if (signal.aborted)
            event.actions.abort()
        }
        else if (event.type === LoginQRCallbackEventType.QRCodeExpired || event.type === LoginQRCallbackEventType.QRCodeDeclined) {
          event.actions.abort()
          log('qr_expired')
        }
        else if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
          log('qr_scanned')
        }
      })
      await imageWrite
      signal.throwIfAborted()
      const context = api.getContext()
      const cookies = api.getCookie().toJSON()?.cookies
      if (!cookies?.length)
        throw new Error('Zalo cookie snapshot unavailable')
      await this.credentials.save({ accountId: api.getOwnId(), session: {
        cookie: cookies,
        imei: context.imei,
        userAgent: context.userAgent,
      } })
      return api.getOwnId()
    }
    catch { throw new Error('Zalo authentication failed') }
    finally {
      signal.removeEventListener('abort', abort)
      await imageWrite.catch(() => {})
      await display.clearQr()
    }
  }

  async connect(receive: (message: ExternalMessage) => void, log: AwayLog, disconnected: () => void, signal: AbortSignal) {
    await this.disconnect()
    try {
      signal.throwIfAborted()
      const saved = await this.credentials.load()
      if (!saved)
        throw new Error('No saved Zalo session')
      const api = await this.sdk(signal).login(saved.session)
      signal.throwIfAborted()
      if (api.getOwnId() !== saved.accountId)
        throw new Error('Zalo account changed')
      this.api = api
      // Refresh rotated cookies only after an authenticated restore.
      const cookies = api.getCookie().toJSON()?.cookies
      if (!cookies?.length)
        throw new Error('Zalo cookie snapshot unavailable')
      await this.credentials.save({ accountId: saved.accountId, session: {
        ...saved.session,
        cookie: cookies,
      } })
      api.listener.on('message', (message: Message) => {
        if (this.api !== api || signal.aborted)
          return
        const content = message.data.content
        if (message.type !== ThreadType.User || typeof content !== 'string') {
          log('ignored', { reason: 'unsupported_message' })
          return
        }
        const { data } = message
        if (!data.msgId || !/^\d{1,30}$/u.test(data.uidFrom) || message.threadId !== data.uidFrom) {
          log('ignored', { reason: 'invalid_message' })
          return
        }
        const timestamp = Number(data.ts)
        if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > 8.64e15) {
          log('ignored', { reason: 'invalid_timestamp' })
          return
        }
        receive({
          channel: 'zalo',
          source: 'zalo',
          sourceType: 'external-user',
          accountId: saved.accountId,
          conversationId: message.threadId,
          senderId: data.uidFrom,
          senderName: data.dName.slice(0, 200),
          messageId: String(data.msgId),
          text: content.slice(0, 8001),
          receivedAt: new Date(timestamp).toISOString(),
          isSelf: message.isSelf || data.uidFrom === saved.accountId,
        })
      })
      // Keep error handlers attached while stop() closes the old socket. Late SDK errors cannot become unhandled events.
      let handshakeFailed: (() => void) | undefined
      api.listener.on('error', () => {
        if (this.api === api && !signal.aborted) {
          log('transport_error')
          if (handshakeFailed)
            handshakeFailed()
          else
            disconnected()
        }
      })
      api.listener.on('closed', () => {
        if (this.api === api && !signal.aborted) {
          log('disconnected')
          if (handshakeFailed)
            handshakeFailed()
          else
            disconnected()
        }
      })
      let timer: ReturnType<typeof setTimeout> | undefined
      let abortHandshake: (() => void) | undefined
      try {
        await new Promise<void>((resolve, reject) => {
          const fail = () => reject(new Error('Zalo listener unavailable'))
          timer = setTimeout(fail, 20_000)
          handshakeFailed = fail
          abortHandshake = fail
          signal.addEventListener('abort', fail, { once: true })
          api.listener.once('connected', () => {
            log('connected')
            resolve()
          })
          try {
            api.listener.start({ retryOnClose: false })
          }
          catch {
            fail()
          }
          if (signal.aborted)
            fail()
        })
      }
      finally {
        clearTimeout(timer)
        handshakeFailed = undefined
        if (abortHandshake)
          signal.removeEventListener('abort', abortHandshake)
      }
      return saved.accountId
    }
    catch {
      await this.disconnect()
      throw new Error('Zalo connection failed')
    }
  }

  async send(conversationId: string, text: string) {
    try {
      if (!this.api || !/^\d{1,30}$/u.test(conversationId) || !text || text.length > 2000)
        throw new Error('Zalo send unavailable')
      const saved = await this.credentials.load()
      if (!saved || saved.accountId !== this.api.getOwnId())
        throw new Error('Zalo session revoked locally')
      const result = await this.api.sendMessage(text, conversationId, ThreadType.User)
      if (result.message?.msgId === undefined)
        throw new Error('Zalo send receipt missing')
      return String(result.message.msgId)
    }
    catch { throw new Error('Zalo send failed') }
  }

  async disconnect() {
    const api = this.api
    this.api = undefined
    try {
      api?.listener.stop()
    }
    catch { /* A disconnected socket cannot prevent host cleanup. */ }
  }
}
