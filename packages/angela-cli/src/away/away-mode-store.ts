import type { AwayModeState, AwayModeStore, ExternalMessageRecord } from './away-types'

import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import * as v from 'valibot'

import { MemoryFile } from '../memory-file'

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

/** Reuses private atomic MemoryFile writes. Each message has its own bounded file and persistent deduplication key. */
export class LocalAwayModeStore implements AwayModeStore {
  private readonly settings: MemoryFile<AwayModeState>
  private readonly directory: string

  constructor(root: string, accountId: string) {
    this.directory = join(root, createHash('sha256').update(accountId).digest('hex'))
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
    let claimed = false
    await this.record(record.id).edit((state) => {
      if (!state.record) {
        state.record = record
        claimed = true
      }
    })
    return claimed
  }

  async update(id: string, change: Partial<ExternalMessageRecord>) {
    await this.record(id).edit((state) => {
      if (!state.record)
        throw new Error('External message missing')
      Object.assign(state.record, change)
    })
  }

  async records(sessionId?: string) {
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
}
