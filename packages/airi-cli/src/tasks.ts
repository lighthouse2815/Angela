import type { cliMessages } from '@proj-airi/i18n/cli'

import type { Task, TaskInput, TaskPatch } from './task-schema'

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import * as v from 'valibot'

import { MemoryFile } from './memory-file'
import { taskCreate, taskId, taskSchema, taskState, taskTime, taskUpdate } from './task-schema'
import { localDate, nextOccurrence, taskDue } from './task-time'

/** Delivery owners renew every ten seconds. Thirty seconds bounds recovery after a crashed process. */
export const deliveryLeaseMs = 30_000

/** Owns task invariants and atomic mutations across sessions. Subscribers observe successful local commits only. */
export class Tasks {
  private readonly file: MemoryFile<v.InferOutput<typeof taskState>>
  private readonly listeners = new Set<() => void>()

  constructor(dataDir: string, private readonly messages: typeof cliMessages.en.tasks, private readonly clock: () => number = Date.now, readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    this.file = new MemoryFile(join(dataDir, 'tasks'), 'tasks', taskState, () => ({ version: 1 as const, tasks: [] }), { invalid: messages.invalid, locked: messages.locked })
  }

  /** Reads a fresh snapshot. Filters use this service's local calendar and stable due-time/ID ordering. */
  async list(filter: { status?: Task['status'] | 'all', type?: Task['type'], date?: string } = {}) {
    const state = await this.file.read()
    return state.tasks.filter(task => (filter.status === 'all' || task.status === (filter.status ?? 'pending')) && (!filter.type || task.type === filter.type) && (!filter.date || (!taskDue(task) && task.dueDate === filter.date) || Boolean(taskDue(task) && localDate(Date.parse(taskDue(task)!), this.timezone) === filter.date)))
      .sort((a, b) => (taskDue(a) ?? a.dueDate ?? '9999').localeCompare(taskDue(b) ?? b.dueDate ?? '9999') || a.id.localeCompare(b.id))
  }

  async find(id: string) {
    v.parse(taskId, id)
    const task = (await this.file.read()).tasks.find(task => task.id === id)
    if (!task)
      throw new Error(this.messages.missing)
    return task
  }

  async create(input: TaskInput): Promise<Task> {
    const parsed = v.parse(taskCreate, input)
    const now = new Date(this.clock()).toISOString()
    const task = v.parse(taskSchema, { ...parsed, id: randomUUID(), status: 'pending', timezone: parsed.timezone ?? this.timezone, createdAt: now, updatedAt: now, recurrenceAnchor: parsed.recurrence ? parsed.dueAt : undefined })
    await this.file.edit((state) => {
      state.tasks.push(task)
      this.retain(state)
    })
    this.changed()
    return task
  }

  async update(id: string, input: TaskPatch) {
    const patch = v.parse(taskUpdate, input)
    return await this.edit(id, (task) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === null)
          Reflect.deleteProperty(task, key)
        else if (value !== undefined)
          Reflect.set(task, key, value)
      }
      if ('dueAt' in patch || 'recurrence' in patch || 'timezone' in patch) {
        task.recurrenceAnchor = task.recurrence ? task.dueAt : undefined
        task.snoozedUntil = undefined
        task.notifiedFor = undefined
        task.delivery = undefined
      }
    })
  }

  async complete(id: string) {
    return await this.edit(id, (task) => {
      this.pending(task)
      const delivered = task.lastNotifiedAt && (!task.completedAt || task.completedAt < task.lastNotifiedAt)
      task.completedAt = new Date(this.clock()).toISOString()
      task.snoozedUntil = undefined
      task.delivery = undefined
      if (task.recurrence) {
        // Check-ins acknowledge the delivered occurrence. Early completion consumes the next undelivered occurrence.
        if (!delivered || Date.parse(task.dueAt!) <= this.clock())
          task.dueAt = nextOccurrence(task, Math.max(this.clock(), Date.parse(task.dueAt!)))
        task.notifiedFor = undefined
      }
      else {
        task.status = 'completed'
      }
    })
  }

  async cancel(id: string) {
    return await this.edit(id, (task) => {
      this.pending(task)
      task.status = 'cancelled'
      task.snoozedUntil = undefined
      task.delivery = undefined
    })
  }

  async snooze(id: string, until: string) {
    const target = v.parse(taskTime, until)
    if (Date.parse(target) <= this.clock())
      throw new Error(this.messages.future)
    return await this.edit(id, (task) => {
      this.pending(task)
      task.snoozedUntil = target
      task.notifiedFor = undefined
      task.delivery = undefined
    })
  }

  /** Claims expire without changing notification history or recurrence. The token fences acknowledgments from stale owners. */
  async claim(id: string, occurrence: string): Promise<Task | undefined> {
    let claimed: Task | undefined
    await this.file.edit((state) => {
      const task = state.tasks.find(task => task.id === id)
      if (!task || task.status !== 'pending' || taskDue(task) !== occurrence || task.notifiedFor === occurrence || Date.parse(occurrence) > this.clock())
        return
      if (task.delivery?.occurrence === occurrence) {
        if (task.delivery.status === 'claimed' && Date.parse(task.delivery.leaseUntil) > this.clock())
          return
        if (task.delivery.status === 'pending' && Date.parse(task.delivery.retryAt) > this.clock())
          return
      }
      task.delivery = { status: 'claimed', occurrence, token: randomUUID(), claimedAt: new Date(this.clock()).toISOString(), leaseUntil: new Date(this.clock() + deliveryLeaseMs).toISOString() }
      task.updatedAt = task.delivery.claimedAt
      claimed = structuredClone(task)
    })
    return claimed
  }

  /** A live owner must renew before expiry. An expired owner cannot reclaim its token, even without a competing writer. */
  async renew(id: string, token: string) {
    let renewed = false
    await this.file.edit((state) => {
      const task = state.tasks.find(task => task.id === id)
      if (!task || !this.owns(task, token) || task.delivery?.status !== 'claimed')
        return
      task.delivery.leaseUntil = new Date(this.clock() + deliveryLeaseMs).toISOString()
      renewed = true
    })
    return renewed
  }

  /** Only successful text delivery updates history and advances a routine. A lost acknowledgment can cause a retry, never silent loss. */
  async delivered(id: string, token: string) {
    let delivered = false
    await this.file.edit((state) => {
      const task = state.tasks.find(task => task.id === id)
      if (!task || !this.owns(task, token) || task.delivery?.status !== 'claimed')
        return
      const occurrence = task.delivery.occurrence
      task.notifiedFor = occurrence
      task.lastNotifiedAt = new Date(this.clock()).toISOString()
      task.updatedAt = task.lastNotifiedAt
      task.delivery = { status: 'delivered', occurrence, deliveredAt: task.lastNotifiedAt }
      if (task.recurrence) {
        // A snooze after delivery retains the already advanced next regular occurrence.
        if (!task.snoozedUntil || Date.parse(task.dueAt!) <= this.clock())
          task.dueAt = nextOccurrence(task, Math.max(this.clock(), Date.parse(task.dueAt!)))
        task.snoozedUntil = undefined
      }
      delivered = true
    })
    return delivered
  }

  /** Failed or cancelled delivery releases only this owner's claim. A retry waits thirty seconds unless shutdown requests immediate recovery. */
  async retry(id: string, token: string, immediate = false) {
    await this.file.edit((state) => {
      const task = state.tasks.find(task => task.id === id)
      if (task?.delivery?.status !== 'claimed' || task.delivery.token !== token)
        return
      task.delivery = { status: 'pending', occurrence: task.delivery.occurrence, retryAt: new Date(this.clock() + (immediate ? 0 : deliveryLeaseMs)).toISOString() }
    })
  }

  private owns(task: Task, token: string) {
    return task.status === 'pending' && task.delivery?.status === 'claimed' && task.delivery.token === token
      && taskDue(task) === task.delivery.occurrence && Date.parse(task.delivery.leaseUntil) > this.clock()
  }

  /** The scheduler owns its subscription lifetime. Cross-process changes are discovered by its bounded timer. */
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  now() {
    return this.clock()
  }

  private pending(task: Task) {
    if (task.status !== 'pending')
      throw new Error(this.messages.inactive)
  }

  private async edit(id: string, change: (task: Task) => void) {
    v.parse(taskId, id)
    let updated: Task | undefined
    await this.file.edit((state) => {
      const index = state.tasks.findIndex(task => task.id === id)
      if (index < 0)
        throw new Error(this.messages.missing)
      const task = state.tasks[index]!
      change(task)
      task.updatedAt = new Date(this.clock()).toISOString()
      updated = v.parse(taskSchema, task)
      state.tasks[index] = updated
      this.retain(state)
    })
    this.changed()
    return updated!
  }

  /** Retention runs inside the storage lock. History cannot block active work, and pending tasks are never pruning candidates. */
  private retain(state: v.InferOutput<typeof taskState>) {
    const inactive = state.tasks.filter(task => task.status !== 'pending')
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
    if (state.tasks.length - inactive.length > 100)
      throw new Error(this.messages.invalid)
    let remaining = inactive.length
    for (const oldest of inactive) {
      if (remaining <= 50 && state.tasks.length <= 100 && JSON.stringify(state).length <= 128_000)
        break
      state.tasks.splice(state.tasks.findIndex(task => task.id === oldest.id), 1)
      remaining--
    }
  }

  private changed() {
    for (const listener of this.listeners)
      listener()
  }
}
