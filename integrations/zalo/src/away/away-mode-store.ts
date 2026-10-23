import type { AwayModeState, AwayModeStore, ExternalMessage, ExternalMessageRecord } from './away-types'

import { createHash } from 'node:crypto'
import { readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { MemoryFile } from '@angela/companion/memory-file'

import * as v from 'valibot'

const stateSchema = v.object({
  enabled: v.boolean(),
  startedAt: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  mode: v.picklist(['notify-only', 'assistant-reply']),
  allowedUsers: v.array(v.string()),
  summarizeOnReturn: v.boolean(),
})
const recordSchema = v.object({
  id: v.string(),
  channel: v.literal('zalo'),
  source: v.literal('zalo'),
  sourceType: v.literal('external-user'),
  accountId: v.string(),
  conversationId: v.string(),
  senderId: v.string(),
  senderName: v.optional(v.string()),
  messageId: v.string(),
  text: v.string(),
  receivedAt: v.string(),
  isSelf: v.boolean(),
  awaySessionId: v.optional(v.string()),
  processedAt: v.optional(v.string()),
  replyStatus: v.picklist(['received', 'ignored', 'whitelist_denied', 'rate_limited', 'sending', 'sent', 'failed']),
  replyMessageId: v.optional(v.string()),
  reason: v.optional(v.string()),
  pendingRequest: v.optional(v.object({ content: v.string(), status: v.literal('pending') })),
})
const errors = { invalid: 'Away storage is invalid or full', locked: 'Away storage is busy. Preserve interrupted lock files for review' }
const rateSchema = v.object({ windows: v.nullable(v.pipe(v.array(v.object({
  senderId: v.pipe(v.string(), v.maxLength(30)),
  attempts: v.pipe(v.array(v.number()), v.maxLength(3)),
})), v.maxLength(512))) })
const contactsSchema = v.object({ contacts: v.pipe(v.array(v.object({
  senderId: v.pipe(v.string(), v.maxLength(30)),
  senderName: v.optional(v.pipe(v.string(), v.maxLength(200))),
  lastSeen: v.string(),
  messageCount: v.number(),
})), v.maxLength(20)) })

interface RecordIndex {
  id: string
  timestamp: number
  active: boolean
  senderId: string
  attemptAt?: number
}

/** The single leased host owns retention and claims. Owner readers never delete records while another process handles a message. */
export class LocalAwayModeStore implements AwayModeStore {
  private readonly settings: MemoryFile<AwayModeState>
  private readonly directory: string
  private readonly rates: MemoryFile<v.InferOutput<typeof rateSchema>>
  private readonly contacts: MemoryFile<v.InferOutput<typeof contactsSchema>>
  private index?: Promise<Map<string, RecordIndex>>

  constructor(root: string, accountId: string) {
    this.directory = join(root, createHash('sha256').update(accountId).digest('hex'))
    this.rates = new MemoryFile(this.directory, 'reply-rates', rateSchema, () => ({ windows: null }), errors)
    this.contacts = new MemoryFile(this.directory, 'recent-contacts', contactsSchema, () => ({ contacts: [] }), errors)
    this.settings = new MemoryFile(this.directory, 'away', stateSchema, () => ({
      enabled: false,
      mode: 'notify-only',
      allowedUsers: [],
      summarizeOnReturn: true,
    }), errors)
  }

  state() { return this.settings.read() }
  configure(change: (state: AwayModeState) => void) { return this.settings.edit(change) }

  private record(id: string) {
    if (!/^[a-f0-9]{64}$/u.test(id))
      throw new Error('Invalid external message identity')
    return new MemoryFile(join(this.directory, 'messages'), id, v.object({ record: v.nullable(recordSchema) }), () => ({ record: null }), errors)
  }

  async claim(record: ExternalMessageRecord) {
    const index = await this.catalog()
    if (index.has(record.id))
      return false
    await this.prune(index, 499)
    // Recent deduplication and unfinished processing take precedence over accepting more messages.
    if (index.size >= 500)
      return false
    let claimed = false
    await this.record(record.id).edit((state) => {
      if (!state.record) {
        state.record = record
        claimed = true
      }
    })
    if (claimed)
      index.set(record.id, this.metadata(record))
    return claimed
  }

  async update(id: string, change: Partial<ExternalMessageRecord>) {
    const index = await this.catalog()
    await this.record(id).edit((state) => {
      if (!state.record)
        throw new Error('External message missing')
      Object.assign(state.record, change)
    })
    const { record } = await this.record(id).read()
    if (record)
      index.set(id, this.metadata(record))
  }

  /** Summaries read history explicitly. Inbound rate limiting never calls this method. */
  async records(sessionId?: string) {
    return await this.readRecords(sessionId)
  }

  private async readRecords(sessionId?: string) {
    const records: ExternalMessageRecord[] = []
    let names: string[]
    try {
      names = await readdir(join(this.directory, 'messages'))
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return records
      throw error
    }
    for (const name of names) {
      if (!/^[a-f0-9]{64}\.json$/u.test(name))
        continue
      const { record } = await this.record(name.slice(0, -5)).read()
      if (record && (sessionId === undefined || record.awaySessionId === sessionId))
        records.push(record)
    }
    return records.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  }

  private metadata(record: ExternalMessageRecord): RecordIndex {
    return {
      id: record.id,
      timestamp: Date.parse(record.receivedAt),
      senderId: record.senderId,
      active: record.replyStatus === 'received' || record.replyStatus === 'sending',
      attemptAt: ['sending', 'sent', 'failed'].includes(record.replyStatus) ? Date.parse(record.processedAt ?? '') : undefined,
    }
  }

  /** One scan at host startup recovers existing files and uncertain claims after a crash. Only bounded metadata stays in memory. */
  private catalog() {
    this.index ??= (async () => {
      const index = new Map<string, RecordIndex>()
      for (const record of await this.readRecords())
        index.set(record.id, this.metadata(record))
      return index
    })()
    return this.index
  }

  private async prune(index: Map<string, RecordIndex>, capacity: number) {
    const now = Date.now()
    const candidates = [...index.values()].filter(item => !item.active && item.timestamp < now - 6 * 60_000).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
    for (const item of candidates) {
      if (index.size <= capacity && item.timestamp >= now - 30 * 24 * 60 * 60_000)
        break
      await unlink(join(this.directory, 'messages', `${item.id}.json`)).catch((error: unknown) => {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
          throw error
      })
      index.delete(item.id)
    }
  }

  /** Run under the host lease, on startup and before claims. Active records remain until explicit owner review. */
  async maintain() {
    await this.prune(await this.catalog(), 500)
  }

  /** Atomic durable reservation reads at most 512 sender windows, each containing three timestamps. Never evicts an active window. */
  async reserveReply(senderId: string, now: number) {
    let reserved = false
    const index = await this.catalog()
    await this.rates.edit((state) => {
      if (state.windows === null) {
        // Existing attempts seed the new rate file once, retaining the previous release's restart protection.
        const seeds = new Map<string, number[]>()
        for (const record of index.values()) {
          if (record.attemptAt !== undefined && record.attemptAt > now - 60_000) {
            const attempts = seeds.get(record.senderId) ?? []
            attempts.push(record.attemptAt)
            seeds.set(record.senderId, attempts)
          }
        }
        state.windows = [...seeds].map(([senderId, attempts]) => ({ senderId, attempts: attempts.sort((a, b) => b - a).slice(0, 3) }))
      }
      for (const window of state.windows)
        window.attempts = window.attempts.filter(time => time > now - 60_000)
      state.windows = state.windows.filter(window => window.attempts.length)
      let window = state.windows.find(window => window.senderId === senderId)
      if (!window) {
        if (state.windows.length >= 512)
          return
        window = { senderId, attempts: [] }
        state.windows.push(window)
      }
      if (window.attempts.length >= 3)
        return
      window.attempts.push(now)
      reserved = true
    })
    return reserved
  }

  async observeContact(message: ExternalMessage) {
    await this.contacts.edit((state) => {
      const previous = state.contacts.find(contact => contact.senderId === message.senderId)
      state.contacts = state.contacts.filter(contact => contact.senderId !== message.senderId)
      const newer = !previous || message.receivedAt >= previous.lastSeen
      state.contacts.push({
        senderId: message.senderId,
        senderName: newer ? message.senderName?.slice(0, 200) : previous.senderName,
        lastSeen: newer ? message.receivedAt : previous.lastSeen,
        messageCount: Math.min(Number.MAX_SAFE_INTEGER, (previous?.messageCount ?? 0) + 1),
      })
      state.contacts.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.senderId.localeCompare(b.senderId))
      state.contacts = state.contacts.slice(0, 20)
    })
  }

  async recentContacts() {
    return (await this.contacts.read()).contacts
  }
}
