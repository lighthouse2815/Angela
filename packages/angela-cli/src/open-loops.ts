import type { cliMessages } from '@angela/i18n/cli'

import type { Clock } from './clock'
import type { OpenLoopExtraction } from './open-loop-extraction'
import type { RequestPrivacy } from './privacy-policy'
import type { ProactiveCandidate } from './proactive-candidate'
import type { Task } from './task-schema'

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import * as v from 'valibot'

import { MemoryFile } from './memory-file'
import { openLoopKey } from './open-loop-extraction'
import { durableWriteRejection } from './privacy-policy'
import { taskId, taskTime } from './task-schema'

const loopSchema = v.object({
  id: taskId,
  workspace: v.pipe(v.string(), v.maxLength(4000)),
  sourceSessionId: v.pipe(v.string(), v.maxLength(200)),
  subject: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  key: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  kind: v.picklist(['work_in_progress', 'problem', 'waiting', 'upcoming_event', 'goal']),
  state: v.picklist(['open', 'resolved', 'expired', 'dismissed']),
  confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  salience: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  createdAt: taskTime,
  updatedAt: taskTime,
  earliestFollowUpAt: v.optional(taskTime),
  expiresAt: taskTime,
  lastPromptedAt: v.optional(taskTime),
  promptCount: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1)),
  supersededByTaskId: v.optional(taskId),
  claim: v.optional(v.object({ token: taskId, until: taskTime })),
  retryAt: v.optional(taskTime),
})
const stateSchema = v.object({
  version: v.literal(1),
  loops: v.pipe(v.array(loopSchema), v.maxLength(80)),
  lastPromptedAt: v.optional(taskTime),
  activity: v.pipe(v.array(taskTime), v.maxLength(8)),
})
export type OpenLoop = v.InferOutput<typeof loopSchema>
type State = v.InferOutput<typeof stateSchema>
type ChangeType = 'open_loop.created' | 'open_loop.updated' | 'open_loop.resolved' | 'open_loop.dismissed' | 'open_loop.expired' | 'proactive.prompted'
export type OpenLoopChange = { [Type in ChangeType]: { type: Type, loopId: string } }[ChangeType]

/** Only host-owned matching scope and subject prove equivalence. Global tasks without provenance cannot dismiss project-local work. */
export function taskSuppressesOpenLoop(task: Task, workspace: string, key: string) {
  return task.status === 'pending' && task.memoryProjection?.scope === workspace && openLoopKey(task.title) === key
}

/** Owns bounded private state independently of tasks and semantic memory. All claims, caps, and transitions use the same atomic file lock. */
export class OpenLoops {
  private readonly file: MemoryFile<State>

  constructor(dataDir: string, messages: typeof cliMessages.en.tasks, private readonly clock: Clock, private readonly observe: (change: OpenLoopChange) => void = () => {}) {
    this.file = new MemoryFile(join(dataDir, 'open-loops'), 'state', stateSchema, () => ({ version: 1, loops: [], activity: [] }), { invalid: messages.invalid, locked: messages.locked })
  }

  async list() { return (await this.file.read()).loops }

  async activity() {
    const state = await this.file.read()
    const recent = state.activity.filter(at => Date.parse(at) + 3_600_000 > this.clock.now())
    const last = recent.at(-1)
    return { lastActivityAt: last ? Date.parse(last) + (recent.length >= 6 ? 3_600_000 : 0) : undefined, lastFollowUpAt: state.lastPromptedAt ? Date.parse(state.lastPromptedAt) : undefined }
  }

  async noteActivity() {
    await this.edit((state) => {
      state.activity = [...state.activity.filter(at => Date.parse(at) + 3_600_000 > this.clock.now()), this.now()].slice(-8)
      this.retain(state)
    })
  }

  /** Repeated active mentions merge without resetting the cap or extending the original lifetime. Reopening creates a fresh identity. */
  async notice(input: OpenLoopExtraction, workspace: string, sourceSessionId: string, privacy: RequestPrivacy) {
    if (durableWriteRejection(privacy, 'personal', input) || input.confidence < 0.95 || input.salience < 0.7)
      return undefined
    let saved: OpenLoop | undefined
    let created = false
    await this.edit((state) => {
      this.retain(state)
      const existing = state.loops.find(loop => loop.workspace === workspace && loop.key === input.key && loop.state === 'open')
      if (existing) {
        existing.updatedAt = this.now()
        existing.salience = Math.max(existing.salience, input.salience)
        if (input.subject.includes('refresh token'))
          existing.subject = input.subject
        saved = structuredClone(existing)
        return
      }
      if (state.loops.filter(loop => loop.state === 'open').length >= 50)
        return
      saved = { ...input, id: randomUUID(), workspace, sourceSessionId, state: 'open', createdAt: this.now(), updatedAt: this.now(), promptCount: 0 }
      state.loops.push(saved)
      created = true
      this.retain(state)
    })
    if (saved)
      this.emit({ type: created ? 'open_loop.created' : 'open_loop.updated', loopId: saved.id })
    return saved
  }

  async finish(id: string, workspace: string, target: 'resolved' | 'dismissed', privacy: RequestPrivacy) {
    // Like personal-memory forgetting, an explicit opt-out can remove tracking without granting consent to create durable content.
    if (target !== 'dismissed' && durableWriteRejection(privacy, 'personal', id))
      return false
    let changed = false
    await this.edit((state) => {
      const loop = state.loops.find(loop => loop.id === id && loop.workspace === workspace && loop.state === 'open')
      if (!loop)
        return
      loop.state = target
      loop.updatedAt = this.now()
      loop.claim = undefined
      changed = true
      this.retain(state)
    })
    if (changed)
      this.emit({ type: target === 'resolved' ? 'open_loop.resolved' : 'open_loop.dismissed', loopId: id })
    return changed
  }

  /** Explicit pending commitments suppress equivalent loops even if an earlier observer failed or the host restarted. */
  async reconcile(tasks: readonly Task[]) {
    const dismissed: string[] = []
    await this.edit((state) => {
      this.retain(state)
      for (const loop of state.loops) {
        if (loop.state !== 'open')
          continue
        const task = tasks.find(task => taskSuppressesOpenLoop(task, loop.workspace, loop.key))
        if (task) {
          loop.supersededByTaskId = task.id
          loop.state = 'dismissed'
          loop.updatedAt = this.now()
          loop.claim = undefined
          dismissed.push(loop.id)
        }
      }
    })
    for (const loopId of dismissed)
      this.emit({ type: 'open_loop.dismissed', loopId })
  }

  candidate(loop: OpenLoop): ProactiveCandidate {
    return { id: `open_loop:${loop.id}`, sourceId: loop.id, subject: loop.subject, reason: 'implicit_open_loop', createdAt: loop.createdAt, earliestAt: loop.earliestFollowUpAt ? Math.max(Date.parse(loop.earliestFollowUpAt), Date.parse(loop.updatedAt) + 4 * 3_600_000, loop.retryAt ? Date.parse(loop.retryAt) : 0, loop.claim ? Date.parse(loop.claim.until) : 0) : undefined, expiresAt: Date.parse(loop.expiresAt), confidence: loop.confidence, priority: -1, relevant: loop.state === 'open' && loop.salience >= 0.7 && !loop.supersededByTaskId, alreadyPrompted: loop.promptCount >= 1, lastPromptedAt: loop.lastPromptedAt ? Date.parse(loop.lastPromptedAt) : undefined }
  }

  /** A crashed pre-presentation owner loses its lease after thirty seconds. Shared-store cooldown prevents concurrent implicit bursts. */
  async claim(id: string) {
    let claimed: OpenLoop | undefined
    await this.edit((state) => {
      this.retain(state)
      const loop = state.loops.find(loop => loop.id === id)
      if (!loop || !this.ready(loop) || (state.lastPromptedAt && Date.parse(state.lastPromptedAt) + 8 * 3_600_000 > this.clock.now())
        || state.loops.some(item => item.claim && Date.parse(item.claim.until) > this.clock.now())) {
        return
      }
      loop.claim = { token: randomUUID(), until: new Date(this.clock.now() + 30_000).toISOString() }
      claimed = structuredClone(loop)
    })
    return claimed
  }

  /** Reserves the at-most-once presentation attempt before calling the adapter. Any subsequent failure can lose the follow-up. */
  async reservePresentation(id: string, token: string) {
    let valid = false
    await this.edit((state) => {
      const loop = state.loops.find(loop => loop.id === id)
      if (!loop || !this.ready(loop, true) || loop.claim?.token !== token || Date.parse(loop.claim.until) <= this.clock.now())
        return
      loop.promptCount = 1
      loop.lastPromptedAt = this.now()
      state.lastPromptedAt = loop.lastPromptedAt
      loop.claim = undefined
      valid = true
    })
    if (valid)
      this.emit({ type: 'proactive.prompted', loopId: id })
    return valid
  }

  async retry(id: string, token: string) {
    await this.edit((state) => {
      const loop = state.loops.find(loop => loop.id === id)
      if (loop?.claim?.token === token) {
        loop.claim = undefined
        loop.retryAt = new Date(this.clock.now() + 60_000).toISOString()
      }
    })
  }

  private ready(loop: OpenLoop, owned = false) {
    const candidate = this.candidate(loop)
    const earliest = owned && loop.claim ? { ...loop, claim: undefined } : loop
    return candidate.relevant && candidate.confidence >= 0.95 && !candidate.alreadyPrompted && (this.candidate(earliest).earliestAt ?? Infinity) <= this.clock.now() && Date.parse(loop.expiresAt) > this.clock.now()
  }

  private async edit(change: (state: State) => void) {
    const expired: string[] = []
    await this.file.edit((state) => {
      expired.push(...state.loops.filter(loop => loop.state === 'open' && Date.parse(loop.expiresAt) <= this.clock.now()).map(loop => loop.id))
      this.retain(state)
      change(state)
      this.retain(state)
    })
    for (const loopId of expired)
      this.emit({ type: 'open_loop.expired', loopId })
  }

  private retain(state: State) {
    for (const loop of state.loops) {
      if (loop.state === 'open' && Date.parse(loop.expiresAt) <= this.clock.now()) {
        loop.state = 'expired'
        loop.updatedAt = this.now()
        loop.claim = undefined
      }
    }
    const inactive = state.loops.filter(loop => loop.state !== 'open' && Date.parse(loop.updatedAt) + 7 * 86_400_000 > this.clock.now()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30)
    state.loops = [...state.loops.filter(loop => loop.state === 'open'), ...inactive]
  }

  private now() { return new Date(this.clock.now()).toISOString() }
  private emit(change: OpenLoopChange) {
    try {
      this.observe(change)
    }
    catch { /* Metadata observers cannot change authoritative state or delivery. */ }
  }
}
