import type { Conversation } from '@angela/core-agent'
import type { cliMessages } from '@angela/i18n/cli'

import type { Task } from './task-schema'

import { createHash } from 'node:crypto'
import { join } from 'node:path'

import * as v from 'valibot'

import { MemoryFile } from './memory-file'
import { taskId, taskTime } from './task-schema'

const stateSchema = v.object({ version: v.literal(1), overflowAt: v.optional(taskTime), references: v.pipe(v.array(v.object({
  taskId,
  source: v.picklist(['notification', 'conversation', 'command']),
  timestamp: taskTime,
  remainingTurns: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(8)),
})), v.maxLength(8)) })
type State = v.InferOutput<typeof stateSchema>

/** Stores IDs only under an exact conversation identity. References expire after eight requests or six hours, including restarts. */
export class ActiveCommitments {
  private state: State = { version: 1, references: [] }
  private readonly file?: MemoryFile<State>

  constructor(scope?: { dataDir: string, workspace: string, sessionId: string, channel: string, messages: typeof cliMessages.en.tasks }, private readonly onError: () => void = () => {}) {
    if (scope) {
      const key = createHash('sha256').update(JSON.stringify([scope.workspace, scope.sessionId, scope.channel])).digest('hex')
      this.file = new MemoryFile(join(scope.dataDir, 'tasks', 'references'), key, stateSchema, () => ({ version: 1, references: [] }), { invalid: scope.messages.invalid, locked: scope.messages.locked })
    }
  }

  async advance(now: number) {
    await this.change((state) => {
      state.references = state.references.filter(reference => reference.remainingTurns > 1 && now - Date.parse(reference.timestamp) <= 6 * 3_600_000)
        .map(reference => ({ ...reference, remainingTurns: reference.remainingTurns - 1 }))
      if (!state.references.length)
        state.overflowAt = undefined
    }, true)
  }

  async clear() {
    await this.change((state) => {
      state.references = []
      state.overflowAt = undefined
    })
  }

  /** Notification adapters call this only after successful presentation. Commands and local replies use verified saved tasks. */
  async mention(tasks: readonly Task[], source: State['references'][number]['source'], now: number) {
    await this.change((state) => {
      const ids = new Set(tasks.map(task => task.id))
      const references = [...state.references.filter(reference => !ids.has(reference.taskId) && now - Date.parse(reference.timestamp) <= 6 * 3_600_000), ...tasks.map(task => ({ taskId: task.id, source, timestamp: new Date(now).toISOString(), remainingTurns: 8 }))]
      if (references.length > 8)
        state.overflowAt = new Date(now).toISOString()
      state.references = references.slice(-8)
    })
  }

  async resolve(history: Conversation, tasks: readonly Task[], now: number) {
    await this.load()
    if (this.state.overflowAt && now - Date.parse(this.state.overflowAt) <= 6 * 3_600_000)
      return []
    const ids = new Set(this.state.references.filter(reference => now >= Date.parse(reference.timestamp) && now - Date.parse(reference.timestamp) <= 6 * 3_600_000).map(reference => reference.taskId))
    // Standalone handlers can use their supplied history. Durable runtime scopes use their own reference timestamps, independent of other channels' task clocks.
    let userTurns = 0
    for (const turn of this.file ? [] : history.turns.slice(-24).reverse()) {
      if (turn.type === 'user' && ++userTurns > 8)
        break
      if (turn.type !== 'assistant')
        continue
      const content = JSON.stringify(turn)
      for (const task of tasks) {
        const timestamp = Date.parse(task.lastNotifiedAt ?? task.updatedAt)
        if (content.includes(task.id) && now >= timestamp && now - timestamp <= 6 * 3_600_000)
          ids.add(task.id)
      }
    }
    const referenced = tasks.filter(task => ids.has(task.id))
    const pending = referenced.filter(task => task.status === 'pending')
    return pending.length ? pending : referenced
  }

  private async load() {
    try {
      if (this.file)
        this.state = await this.file.read()
    }
    catch {
      this.state = { version: 1, references: [] }
      this.onError()
    }
  }

  private async change(change: (state: State) => void, skipEmpty = false) {
    try {
      await this.load()
      if (skipEmpty && !this.state.references.length)
        return
      if (this.file) {
        await this.file.edit(change)
        this.state = await this.file.read()
      }
      else { change(this.state) }
    }
    catch {
      this.state = { version: 1, references: [] }
      this.onError()
    }
  }
}
