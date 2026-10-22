import type { Conversation } from '@angela/core-agent'
import type { cliMessages } from '@angela/i18n/cli'

import type { Task } from './task-schema'

import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'

import * as v from 'valibot'

import { MemoryFile } from './memory-file'
import { taskId, taskTime } from './task-schema'

const referenceSchema = v.object({ kind: v.picklist(['task', 'open_loop']), id: taskId })
const focusSchema = v.object({
  id: taskId,
  source: v.picklist(['notification', 'conversation', 'command']),
  references: v.pipe(v.array(referenceSchema), v.maxLength(8)),
  ambiguous: v.boolean(),
  timestamp: taskTime,
  remainingTurns: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(8)),
})
const stateSchema = v.object({ version: v.literal(2), focus: v.optional(focusSchema) })
type State = v.InferOutput<typeof stateSchema>
export type FocusReference = v.InferOutput<typeof referenceSchema>

/** Persists only the latest focus group under the exact workspace/session/channel identity. Inactive focus never reveals older work. */
export class ActiveCommitments {
  private state: State = { version: 2 }
  private readonly file?: MemoryFile<State>

  constructor(scope?: { dataDir: string, workspace: string, sessionId: string, channel: string, messages: typeof cliMessages.en.tasks }, private readonly onError: () => void = () => {}) {
    if (scope) {
      const key = createHash('sha256').update(JSON.stringify([scope.workspace, scope.sessionId, scope.channel])).digest('hex')
      this.file = new MemoryFile(join(scope.dataDir, 'tasks', 'focus'), key, stateSchema, () => ({ version: 2 }), { invalid: scope.messages.invalid, locked: scope.messages.locked })
    }
  }

  async advance(_now: number) {
    await this.change((state) => {
      if (state.focus)
        state.focus.remainingTurns = Math.max(0, state.focus.remainingTurns - 1)
    }, true)
  }

  async clear() {
    await this.change(state => state.focus = undefined)
  }

  /** One presentation event is one group, including mixed or oversized batches. */
  async mentionReferences(references: readonly FocusReference[], source: v.InferOutput<typeof focusSchema>['source'], now: number) {
    if (!references.length)
      return
    await this.change((state) => {
      state.focus = { id: randomUUID(), references: [...references].slice(0, 8), ambiguous: references.length > 8, source, timestamp: new Date(now).toISOString(), remainingTurns: 8 }
    })
  }

  async mention(tasks: readonly Task[], source: v.InferOutput<typeof focusSchema>['source'], now: number) {
    await this.mentionReferences(tasks.map(task => ({ kind: 'task', id: task.id })), source, now)
  }

  /** Returns the whole latest group. Callers cannot filter an ambiguous group into a unique pending target. */
  async current(now: number): Promise<readonly FocusReference[]> {
    await this.load()
    const focus = this.state.focus
    if (!focus || focus.ambiguous || !focus.remainingTurns || now < Date.parse(focus.timestamp) || now - Date.parse(focus.timestamp) > 6 * 3_600_000)
      return []
    return focus.references
  }

  async resolve(history: Conversation, tasks: readonly Task[], now: number) {
    let references = await this.current(now)
    // Standalone handlers can read the latest task-bearing assistant event. Durable scopes never consult another channel's history clocks.
    if (!this.file && !this.state.focus) {
      let userTurns = 0
      for (const turn of history.turns.slice(-24).reverse()) {
        if (turn.type === 'user' && ++userTurns > 8)
          break
        if (turn.type !== 'assistant')
          continue
        const content = JSON.stringify(turn)
        const mentioned = tasks.filter(task => content.includes(task.id))
        if (!mentioned.length)
          continue
        references = mentioned.filter((task) => {
          const timestamp = Date.parse(task.lastNotifiedAt ?? task.updatedAt)
          return now >= timestamp && now - timestamp <= 6 * 3_600_000
        }).map(task => ({ kind: 'task', id: task.id }))
        break
      }
    }
    if (references.length !== 1 || references[0]!.kind !== 'task')
      return []
    return tasks.filter(task => task.id === references[0]!.id && task.status === 'pending')
  }

  private async load() {
    try {
      if (this.file)
        this.state = await this.file.read()
    }
    catch {
      this.state = { version: 2 }
      this.onError()
    }
  }

  private async change(change: (state: State) => void, skipEmpty = false) {
    try {
      await this.load()
      if (skipEmpty && !this.state.focus)
        return
      if (this.file) {
        await this.file.edit(change)
        this.state = await this.file.read()
      }
      else { change(this.state) }
    }
    catch {
      this.state = { version: 2 }
      this.onError()
    }
  }
}
