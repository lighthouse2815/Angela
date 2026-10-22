import type { AwayModeService } from '../../away/away-mode-service'
import type { AwayLog, ExternalMessage } from '../../away/away-types'
import type { ZaloClient } from './zalo-types'

import { setTimeout } from 'node:timers/promises'

/** Owns one serial, bounded inbound queue. Shutdown cancels generation, stops the socket, and drains accepted work. */
export class ZaloAdapter {
  private readonly lifetime = new AbortController()
  private queue = Promise.resolve()
  private queued = 0
  private reconnect?: Promise<void>
  private reconnects = 0
  private started = false

  constructor(private readonly client: ZaloClient, private readonly away: AwayModeService, private readonly accountId: string, private readonly log: AwayLog) {}

  async start() {
    if (this.started || this.lifetime.signal.aborted)
      throw new Error('Zalo adapter already started or stopped')
    this.started = true
    await this.connect()
  }

  private async connect() {
    const account = await this.client.connect(message => this.receive(message), this.log, () => this.scheduleReconnect(), this.lifetime.signal)
    if (account !== this.accountId) {
      this.lifetime.abort()
      await this.client.disconnect()
      throw new Error('Zalo account changed')
    }
  }

  private receive(message: ExternalMessage) {
    if (this.lifetime.signal.aborted || message.accountId !== this.accountId)
      return
    if (this.queued >= 32) {
      this.log('ignored', { messageId: message.messageId, reason: 'queue_full' })
      return
    }
    this.queued++
    this.queue = this.queue.then(async () => {
      if (!this.lifetime.signal.aborted)
        await this.away.receive(message, text => this.client.send(message.conversationId, text), this.lifetime.signal)
    }).catch(() => {
      this.log('processing_failed', { messageId: message.messageId, reason: 'safe_failure' })
    }).finally(() => { this.queued-- })
  }

  private scheduleReconnect() {
    if (this.reconnect || this.lifetime.signal.aborted)
      return
    this.reconnect = (async () => {
      await this.client.disconnect()
      // The lifetime budget also bounds repeated short-lived connections. Restart requires explicit owner action.
      while (!this.lifetime.signal.aborted && this.reconnects < 3) {
        const delay = 1000 * 2 ** this.reconnects++
        this.log('reconnecting', { reason: `attempt_${this.reconnects}` })
        await setTimeout(delay, undefined, { signal: this.lifetime.signal })
        try {
          await this.connect()
          return
        }
        catch { this.log('reconnect_failed') }
      }
      if (!this.lifetime.signal.aborted)
        this.log('reconnect_exhausted')
    })().catch(() => {}).finally(() => { this.reconnect = undefined })
  }

  async close() {
    this.lifetime.abort()
    await this.client.disconnect()
    await this.queue
    await this.reconnect
  }
}
