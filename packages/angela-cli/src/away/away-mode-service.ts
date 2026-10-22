import type { cliMessages } from '@angela/i18n/cli'

import type { AwayLog, AwayModeStore, AwayResponder, ExternalMessage, ExternalMessageRecord } from './away-types'

import { createHash, randomUUID } from 'node:crypto'

import { evaluateAway } from './away-policy'

/** Owns durable idempotency, authorization, rate limits, owner commands, and summaries. No transport or filesystem access. */
export class AwayModeService {
  private readonly replies = new Map<string, number[]>()
  private active = false

  constructor(
    readonly store: AwayModeStore,
    private readonly messages: typeof cliMessages.en.away,
    private readonly log: AwayLog,
    private readonly responder?: AwayResponder,
  ) {}

  /** The adapter serializes ingestion. Durable claims prevent repeated sends after restart or uncertain delivery. */
  async receive(message: ExternalMessage, send: (text: string) => Promise<string>, signal: AbortSignal) {
    const state = await this.store.state()
    const reason = evaluateAway(state, message, Date.now())
    if (reason === 'self_message') {
      this.log('ignored', { messageId: message.messageId, reason })
      return
    }
    const id = createHash('sha256').update(JSON.stringify([message.accountId, message.conversationId, message.messageId])).digest('hex')
    const record: ExternalMessageRecord = { ...message, id, awaySessionId: state.enabled ? state.sessionId : undefined, replyStatus: 'received' }
    if (!await this.store.claim(record)) {
      this.log('ignored', { messageId: message.messageId, reason: 'duplicate' })
      return
    }
    this.log('received', { messageId: message.messageId })
    if (reason !== 'allowed') {
      const replyStatus = reason === 'whitelist_denied' ? reason : 'ignored'
      await this.store.update(id, { replyStatus, reason, processedAt: new Date().toISOString() })
      this.log(replyStatus, { messageId: message.messageId, reason })
      return
    }
    const now = Date.now()
    // Persisted attempts retain rate limits across host restarts and include uncertain sends.
    const attempts = (await this.store.records()).filter(item => item.senderId === message.senderId
      && ['sending', 'sent', 'failed'].includes(item.replyStatus) && Date.parse(item.processedAt ?? '') > now - 60_000)
    const recent = this.replies.get(message.senderId)?.filter(time => time > now - 60_000) ?? []
    if (this.active || Math.max(recent.length, attempts.length) >= 3) {
      await this.store.update(id, { replyStatus: 'rate_limited', reason: 'rate_limited', processedAt: new Date().toISOString() })
      this.log('rate_limited', { messageId: message.messageId })
      return
    }
    this.active = true
    this.replies.set(message.senderId, [...recent, now])
    try {
      // Every accepted message is a request candidate for owner review. No task or commitment is created.
      await this.store.update(id, { replyStatus: 'sending', processedAt: new Date().toISOString(), pendingRequest: { content: message.text, status: 'pending' } })
      let reply: keyof Pick<typeof this.messages, 'offline' | 'received' | 'clarify' | 'private' | 'greeting'> = 'offline'
      if (state.mode === 'assistant-reply' && this.responder) {
        this.log('runtime_started', { messageId: message.messageId })
        try {
          reply = await this.responder.reply(message, signal)
        }
        catch { this.log('runtime_failed', { messageId: message.messageId, reason: 'safe_fallback' }) }
      }
      signal.throwIfAborted()
      // An owner can disable away mode or revoke a sender while generation is in flight.
      const current = await this.store.state()
      if (!current.enabled || current.sessionId !== state.sessionId || !current.allowedUsers.includes(message.senderId)) {
        await this.store.update(id, { replyStatus: 'ignored', reason: 'authorization_changed' })
        this.log('ignored', { messageId: message.messageId, reason: 'authorization_changed' })
        return
      }
      try {
        const replyMessageId = await send(this.messages[reply])
        await this.store.update(id, { replyStatus: 'sent', replyMessageId })
        this.log('reply_sent', { messageId: message.messageId })
      }
      catch {
        await this.store.update(id, { replyStatus: 'failed', reason: 'send_failed' })
        this.log('reply_failed', { messageId: message.messageId, reason: 'send_failed' })
      }
    }
    finally { this.active = false }
  }

  /** Owner-only entry point. External messages never enter this command router. */
  async command(text: string) {
    const [command, action, value, ...rest] = text.trim().split(/\s+/u)
    if (command !== '/away' && command !== '/zalo')
      return undefined
    if (rest.length)
      return this.messages.invalid
    if (command === '/zalo') {
      if (action === 'allowed' && value === undefined)
        return JSON.stringify((await this.store.state()).allowedUsers)
      if (!['allow', 'deny'].includes(action ?? '') || !value || !/^\d{1,30}$/u.test(value))
        return this.messages.invalid
      await this.store.configure((state) => {
        state.allowedUsers = state.allowedUsers.filter(id => id !== value)
        if (action === 'allow')
          state.allowedUsers.push(value)
      })
      return JSON.stringify((await this.store.state()).allowedUsers)
    }
    if (action === 'status' && value === undefined)
      return JSON.stringify(await this.store.state())
    if (action === 'mode' && (value === 'notify-only' || value === 'assistant-reply')) {
      await this.store.configure((state) => {
        state.mode = value
      })
      return JSON.stringify(await this.store.state())
    }
    if (value !== undefined || !['on', 'off'].includes(action ?? ''))
      return this.messages.invalid
    let ended: string | undefined
    await this.store.configure((state) => {
      if (action === 'on' && !state.enabled) {
        state.enabled = true
        state.startedAt = new Date().toISOString()
        state.sessionId = randomUUID()
      }
      if (action === 'off') {
        ended = state.sessionId
        state.enabled = false
      }
    })
    const state = await this.store.state()
    if (action === 'off' && state.summarizeOnReturn && ended)
      return await this.summary(ended)
    return JSON.stringify(state)
  }

  private async summary(sessionId: string) {
    const records = await this.store.records(sessionId)
    if (!records.length)
      return this.messages.empty
    const grouped = new Map<string, ExternalMessageRecord[]>()
    for (const record of records) {
      const group = grouped.get(record.senderId) ?? []
      group.push(record)
      grouped.set(record.senderId, group)
    }
    const lines = [this.messages.summary]
    for (const [sender, group] of grouped) {
      // JSON encoding keeps untrusted display names and control characters inert in terminal summaries.
      lines.push(`- ${JSON.stringify(sender)}: ${group.length} ${this.messages.count}, ${group.filter(item => item.replyStatus === 'sent').length} ${this.messages.replies}.`)
      for (const record of group.slice(-20))
        lines.push(`  ${this.messages.pending}: ${JSON.stringify(record.text.slice(0, 500))}`)
    }
    return lines.join('\n')
  }
}
