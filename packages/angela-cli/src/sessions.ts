import type { Conversation } from '@angela/core-agent'
import type { cliMessages } from '@angela/i18n/cli'
import type { Message } from '@xsai/shared-chat'

import type { Chat } from './chat'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'

import { chatMessagesToTurns, conversationToChatMessages } from '@angela/core-agent'

import * as v from 'valibot'

import { durableConversation, requestPrivacy } from './privacy-policy'

// CLI sessions use portable text messages. Provider-native continuation stays in memory for the current process.
const messagesSchema: v.GenericSchema<Message[]> = v.array(v.variant('role', [
  v.object({ role: v.literal('system'), content: v.string() }),
  v.object({ role: v.literal('developer'), content: v.string() }),
  v.object({ role: v.literal('user'), content: v.string() }),
  v.object({
    role: v.literal('assistant'),
    content: v.optional(v.string()),
    refusal: v.optional(v.string()),
    tool_calls: v.optional(v.array(v.object({
      id: v.string(),
      type: v.literal('function'),
      function: v.object({ name: v.string(), arguments: v.string() }),
    }))),
  }),
  v.object({ role: v.literal('tool'), tool_call_id: v.string(), content: v.string() }),
]))
const requestSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  text: v.string(),
  status: v.picklist(['running', 'awaiting_approval', 'interrupted', 'cancelled', 'failed', 'answered', 'delivery_failed', 'delivered']),
  startedAt: v.pipe(v.string(), v.isoTimestamp()),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
  progress: v.pipe(v.string(), v.maxLength(3000)),
  answer: v.optional(v.string()),
  failure: v.optional(v.string()),
})

/** The latest Telegram request shares its session's atomic snapshot and exclusive writer lock. */
export type SavedRequest = v.InferOutput<typeof requestSchema>

const sessionSchema = v.pipe(v.object({
  version: v.literal(1),
  id: v.pipe(v.string(), v.uuid()),
  workspace: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  interrupted: v.boolean(),
  messages: messagesSchema,
  request: v.optional(requestSchema),
  working: v.optional(v.object({ offset: v.pipe(v.number(), v.integer(), v.minValue(0)), summary: v.pipe(v.string(), v.maxLength(3000)) })),
}), v.check(record => !record.working || record.working.offset <= record.messages.length))
type Record = v.InferOutput<typeof sessionSchema>
const lockOwnerSchema = v.object({ pid: v.pipe(v.number(), v.integer(), v.minValue(1)), hostname: v.string() })

/** Owns the local session directory. Credentials and provider configuration never enter its records. */
export class Sessions {
  constructor(readonly directory: string, private readonly messages: typeof cliMessages.en) {}

  /** Lists validated metadata only. This operation creates no files and contacts no provider. */
  async list() {
    let files: string[]
    try {
      files = await readdir(this.directory)
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return []
      throw error
    }
    const records: { id: string, workspace: string, updatedAt: string, interrupted: boolean }[] = []
    for (const file of files) {
      if (!/^[\da-f-]{36}\.json$/i.test(file))
        continue
      const { id, workspace, updatedAt, interrupted } = await this.read(file.slice(0, -5))
      records.push({ id, workspace, updatedAt, interrupted })
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /** Reports CLI history bytes only. Tool audit files and Telegram sessions have separate lifetimes. */
  async usage() {
    const records = await this.list()
    let bytes = 0
    for (const record of records)
      bytes += (await stat(join(this.directory, `${record.id}.json`))).size
    return { directory: this.directory, sessions: records.length, bytes }
  }

  /** Deletes one validated history under the same exclusive lock used by chat writers. */
  async remove(id: string) {
    const record = await this.read(id)
    const session = await this.open(record.workspace, id)
    try {
      await unlink(join(this.directory, `${id}.json`))
      try {
        const { RecallIndex } = await import('./recall-index')
        await RecallIndex.invalidate(this.directory, `history:${id}`)
      }
      catch {
        throw new Error(this.messages.recallCleanup)
      }
    }
    finally {
      await session.close()
    }
  }

  /** Validates the complete stored message contract before any record reaches the generation runtime. */
  async read(id: string): Promise<Record> {
    this.validateId(id)
    const source = await readFile(join(this.directory, `${id}.json`), 'utf8')
    const parsed = v.safeParse(sessionSchema, JSON.parse(source))
    if (!parsed.success || parsed.output.id !== id)
      throw new Error(this.messages.invalidSession)
    return parsed.output
  }

  /** Acquires an exclusive writer lock. The caller must close the returned session in a finally block. */
  async open(workspace: string, id: string = randomUUID(), options: { recoverAbandoned?: boolean } = {}) {
    this.validateId(id)
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const lockPath = join(this.directory, `${id}.lock`)
    const lock = await this.acquireLock(lockPath, options.recoverAbandoned ?? false)
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, hostname: hostname() }))
      let record: Record
      try {
        record = await this.read(id)
        if (record.workspace !== workspace)
          throw new Error(this.messages.invalidWorkspace)
      }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
          throw error
        const now = new Date().toISOString()
        record = { version: 1, id, workspace, createdAt: now, updatedAt: now, interrupted: false, messages: [] }
      }
      return new Session(this.directory, record, async () => {
        await lock.close()
        await unlink(lockPath)
      })
    }
    catch (error) {
      await lock.close()
      await unlink(lockPath)
      throw error
    }
  }

  private validateId(id: string) {
    v.parse(v.pipe(v.string(), v.uuid(this.messages.invalidId)), id)
  }

  private async acquireLock(path: string, recoverAbandoned: boolean) {
    const busy = () => new Error(`${this.messages.sessionLocked} ${path}`)
    try {
      return await open(path, 'wx', 0o600)
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST')
        throw error
      if (!recoverAbandoned)
        throw busy()
    }
    // One recovery owner checks and replaces the old lock. Unknown owners and recovery collisions stay locked.
    const recoveryPath = `${path}.recovery`
    const recovery = await open(recoveryPath, 'wx', 0o600).catch(() => {
      throw busy()
    })
    try {
      const owner = await readFile(path, 'utf8').then(source => v.parse(lockOwnerSchema, JSON.parse(source))).catch(() => {
        throw busy()
      })
      if (owner.hostname !== hostname())
        throw busy()
      try {
        process.kill(owner.pid, 0)
        throw busy()
      }
      catch (error) {
        // Only ESRCH proves that the same-host owner exited. Permission errors cannot authorize recovery.
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH')
          throw busy()
      }
      await unlink(path)
      return await open(path, 'wx', 0o600).catch(() => {
        throw busy()
      })
    }
    finally {
      await recovery.close()
      await unlink(recoveryPath)
    }
  }
}

/** One exclusive session writer. Atomic replacement keeps readers on the last complete JSON snapshot. */
export class Session {
  constructor(private readonly directory: string, readonly record: Record, private readonly release: () => Promise<void>) {}

  /** Consumes the startup snapshot. Portable messages are released after conversion into working turns. */
  restore(): Conversation {
    const turns = chatMessagesToTurns(this.record.working ? this.record.messages.slice(this.record.working.offset) : this.record.messages)
    if (this.record.working)
      turns.unshift({ type: 'system', authority: 'context', id: 'cli-context-summary', content: [{ type: 'text', text: this.record.working.summary }] })
    this.record.messages = []
    return { turns }
  }

  /** Saves full history on disk, then releases compacted turns and the portable snapshot from RAM. */
  async saveChat(chat: Chat, interrupted: boolean, request: SavedRequest | null | undefined = this.record.request) {
    // Telegram checkpoints can precede runtime capture and include the full recovery request.
    if (request)
      chat.applyPrivacy(requestPrivacy(request.text, true, chat.privacy))
    const durable = durableConversation(chat.conversation)
    if (durable !== chat.conversation) {
      let messages = conversationToChatMessages(durable, false)
      const priorOffset = this.record.working?.offset ?? 0
      if (priorOffset) {
        const previous = await readFile(join(this.directory, `${this.record.id}.json`), 'utf8')
        const archived = v.parse(sessionSchema, JSON.parse(previous)).messages.slice(0, priorOffset)
        messages = [...archived, ...messages.filter(message => message.role !== 'system')]
      }
      await this.write(v.parse(sessionSchema, {
        ...this.record,
        messages,
        interrupted,
        updatedAt: new Date().toISOString(),
        request: undefined,
      }))
      this.record.messages = []
      return
    }
    // Tool checkpoints cannot retire history while the current generation still owns its prepared turn projection.
    const generationActive = chat.isSending
    const checkpoint = generationActive ? { summary: this.record.working?.summary ?? '', turns: 0 } : chat.context.checkpoint(chat.conversation)
    const priorOffset = this.record.working?.offset ?? 0
    const current = conversationToChatMessages(chat.conversation, false)
    let messages = current
    if (priorOffset) {
      const previous = v.parse(sessionSchema, JSON.parse(await readFile(join(this.directory, `${this.record.id}.json`), 'utf8')))
      messages = previous.messages.slice(0, priorOffset)
      // The archived prefix already owns the original persona. The current working persona is regenerated by Chat.
      messages.push(...current.filter(message => message.role !== 'system'))
    }
    const archived = conversationToChatMessages({ turns: chat.conversation.turns.slice(1, checkpoint.turns + 1) }, false).length
    const offset = priorOffset + archived + (!priorOffset && archived ? current.filter(message => message.role === 'system').length : 0)
    const record = v.parse(sessionSchema, {
      ...this.record,
      messages,
      interrupted,
      updatedAt: new Date().toISOString(),
      request: request ?? undefined,
      working: checkpoint.summary ? { offset, summary: checkpoint.summary } : undefined,
    })
    await this.write(record)
    if (!generationActive)
      chat.context.release(chat.conversation)
    this.record.messages = []
  }

  /** Saves the portable conversation with private file permissions. Incomplete turns carry no fabricated assistant response. */
  async save(conversation: Conversation, interrupted: boolean, request: SavedRequest | null | undefined = this.record.request) {
    const record = v.parse(sessionSchema, {
      ...this.record,
      updatedAt: new Date().toISOString(),
      messages: v.parse(messagesSchema, conversationToChatMessages(durableConversation(conversation), false)),
      interrupted,
      request: durableConversation(conversation) === conversation && (!request || requestPrivacy(request.text).durableMemoryAllowed) ? request ?? undefined : undefined,
      working: undefined,
    })
    await this.write(record)
  }

  private async write(record: Record) {
    const temporary = join(this.directory, `${record.id}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flag: 'wx' })
      await rename(temporary, join(this.directory, `${record.id}.json`))
      Object.assign(this.record, record)
      this.record.working = record.working
    }
    finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
          throw error
      })
    }
  }

  async close() {
    await this.release()
  }
}
