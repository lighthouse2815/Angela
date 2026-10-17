import type { Conversation } from '@proj-airi/core-agent'
import type { cliMessages } from '@proj-airi/i18n/cli'
import type { Message } from '@xsai/shared-chat'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'

import { chatMessagesToTurns, conversationToChatMessages } from '@proj-airi/core-agent'

import * as v from 'valibot'

import { RecallIndex } from './recall-index'

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

const sessionSchema = v.object({
  version: v.literal(1),
  id: v.pipe(v.string(), v.uuid()),
  workspace: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  interrupted: v.boolean(),
  messages: messagesSchema,
  request: v.optional(requestSchema),
})
type Record = v.InferOutput<typeof sessionSchema>
const lockOwnerSchema = v.object({ pid: v.pipe(v.number(), v.integer(), v.minValue(1)), hostname: v.string() })

/** Owns the local session directory. Credentials and provider configuration never enter its records. */
export class Sessions {
  constructor(private readonly directory: string, private readonly messages: typeof cliMessages.en) {}

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
    const records = await Promise.all(files.filter(file => /^[\da-f-]{36}\.json$/i.test(file)).map(file => this.read(file.slice(0, -5))))
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ id, workspace, updatedAt, interrupted }) => ({ id, workspace, updatedAt, interrupted }))
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

  restore(): Conversation {
    return { turns: chatMessagesToTurns(this.record.messages) }
  }

  /** Saves the portable conversation with private file permissions. Incomplete turns carry no fabricated assistant response. */
  async save(conversation: Conversation, interrupted: boolean, request: SavedRequest | null | undefined = this.record.request) {
    const record = v.parse(sessionSchema, {
      ...this.record,
      updatedAt: new Date().toISOString(),
      messages: v.parse(messagesSchema, conversationToChatMessages(conversation, false)),
      interrupted,
      request: request ?? undefined,
    })
    const temporary = join(this.directory, `${record.id}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flag: 'wx' })
      await rename(temporary, join(this.directory, `${record.id}.json`))
      Object.assign(this.record, record)
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
