import type { Conversation, StreamOptions } from '@angela/core-agent'
import type { cliMessages } from '@angela/i18n/cli'
import type { GenerationProvider } from '@angela/provider-inference'

import type { Chat } from '../chat'
import type { Clock } from '../clock'
import type { McpTools } from '../mcp'
import type { Memory } from '../memory'
import type { MemoryCapture } from '../memory-v2/consolidator'
import type { OpenLoop } from '../open-loops'
import type { ProactiveOptions } from '../proactive-policy'
import type { ProjectMemory } from '../project-memory'
import type { Recall } from '../recall'
import type { ReminderNotifier, ReminderScheduler } from '../reminder-scheduler'
import type { Skills } from '../skills'
import type { Task } from '../task-schema'
import type { Tasks } from '../tasks'
import type { ContextSources } from './context-builder'
import type { ObserverDiagnostic } from './event-bus'
import type { AngelaEvent, BaseAngelaEvent, EventPayload } from './events'

import process from 'node:process'

import { randomUUID } from 'node:crypto'

import { ActiveCommitments } from '../active-commitments'
import { SystemClock } from '../clock'
import { OpenLoopConversation } from '../open-loop-conversation'
import { OpenLoopSource } from '../open-loop-source'
import { OpenLoops } from '../open-loops'
import { requestPrivacy } from '../privacy-policy'
import { proactiveCandidate } from '../proactive-candidate'
import { ProactivePolicy } from '../proactive-policy'
import { buildContext } from './context-builder'
import { EventBus } from './event-bus'
import { buildTools } from './tool-registry'

/** Telegram retention is independent of the existing eight active-context limit. */
export interface RuntimeOptions {
  clock?: Clock
  proactive?: ProactiveOptions
  /** Receives at most 16 metadata warnings per host. The EventBus retains the latest 16 diagnostics. */
  observerError?: (diagnostic: ObserverDiagnostic) => void
  telegramSessions?: {
    /** @default 32 */
    maxIdle?: number
    /** Idle time in milliseconds. Matches Telegram's permission-state lifetime. @default 600000 */
    idleTtlMs?: number
  }
}

interface ReminderTarget { notifier: ReminderNotifier & { pause?: () => void, resume?: () => void }, onError: (error: unknown) => void }

/** Adapters share active contexts. Telegram can retain bounded idle contexts through acquire. Construction performs no IO. */
export class AngelaRuntime {
  readonly events: EventBus
  private readonly states = new Map<string, RuntimeSession>()
  private closing?: Promise<void>
  // Idle entries are ordered by last release. Retiring entries are detached before asynchronous cleanup.
  private readonly idle = new Map<RuntimeSession, number>()
  private readonly retiring = new Map<string, { state: RuntimeSession, done: Promise<void> }>()
  private idleTimer?: ReturnType<typeof setTimeout>
  private readonly maxIdle: number
  private readonly idleTtlMs: number
  private readonly remindersByStore = new Map<string, { tasks: Promise<Tasks>, ready: Promise<ReminderScheduler>, targets: Map<object, ReminderTarget>, dueAt: number }>()
  private readonly taskStores = new Map<string, Promise<Tasks>>()
  private reminderTimer?: ReturnType<typeof setTimeout>
  private delivering?: Promise<void>
  readonly clock: Clock
  private readonly proactive: ProactivePolicy

  constructor(readonly model: string, readonly provider: GenerationProvider, readonly messages: typeof cliMessages.en, readonly env: NodeJS.ProcessEnv = {}, readonly defaults: { baseUrl?: string, apiKey: string } = { apiKey: '' }, options: RuntimeOptions = {}) {
    this.clock = options.clock ?? new SystemClock()
    this.proactive = new ProactivePolicy(options.proactive)
    this.events = new EventBus(options.observerError ?? ((diagnostic) => {
      process.stderr.write(`Angela runtime observer failure: type=${diagnostic.eventType} count=${diagnostic.failures}\n`)
    }))
    this.maxIdle = options.telegramSessions?.maxIdle ?? 32
    this.idleTtlMs = options.telegramSessions?.idleTtlMs ?? 10 * 60_000
    if (!Number.isInteger(this.maxIdle) || this.maxIdle < 0 || this.maxIdle > 64)
      throw new RangeError('Telegram maxIdle must be an integer from 0 to 64')
    if (!Number.isSafeInteger(this.idleTtlMs) || this.idleTtlMs < 1 || this.idleTtlMs > 2_147_483_647)
      throw new RangeError('Telegram idleTtlMs must fit a positive timer delay')
  }

  /** Creates working conversation state with the host's single model/provider configuration. No device or tool client is loaded. */
  async createChat(workspace: string, history?: Conversation, toolsAvailable = true, contextLimit = 32_000) {
    if (this.closing)
      throw new Error('Runtime is closed')
    const { Chat } = await import('../chat')
    return new Chat(this.model, this.provider, workspace, history, toolsAvailable, contextLimit, this.messages)
  }

  /** At most eight contexts can run concurrently. Direct callers retain immediate release semantics. */
  open(options: SessionOptions) {
    if (this.closing)
      throw new Error('Runtime is closed')
    const key = this.key(options)
    let state = this.states.get(key)
    if ((!state || this.idle.has(state)) && this.activeStateCount >= 8)
      throw new Error('Runtime active context limit reached')
    if (!state) {
      if (this.states.size + this.retiring.size >= this.maxIdle + 8)
        throw new Error('Runtime context cleanup limit reached')
      state = new RuntimeSession(this, { ...options }, () => {
        if (this.states.get(key) === state)
          this.states.delete(key)
        this.idle.delete(state!)
      })
      this.states.set(key, state)
    }
    this.idle.delete(state)
    this.armIdle()
    state.retain()
    return state
  }

  /** Telegram callers await retirement and request cleanup before reusing the exact identity. Other channels stay cold. */
  async acquire(options: SessionOptions) {
    const key = this.key(options)
    for (;;) {
      await this.retiring.get(key)?.done
      const state = this.states.get(key)
      if (state?.releasePending) {
        await state.releasePending
        continue
      }
      const deadline = state && this.idle.get(state)
      if (state && deadline !== undefined && deadline <= this.clock.now()) {
        await this.evict(state)
        continue
      }
      const scope = this.open(options)
      scope.configure(options, options.channel === 'telegram')
      return scope
    }
  }

  private key(options: SessionOptions) {
    return JSON.stringify([options.dataDir, options.workspace, options.sessionId, options.channel])
  }

  /** Only zero-reference sessions with no active request enter the LRU. Overflow cleanup completes before release resolves. */
  async release(state: RuntimeSession, keepWarm: boolean) {
    if (this.closing || !keepWarm || !this.maxIdle) {
      await this.evict(state)
      return
    }
    this.idle.delete(state)
    this.idle.set(state, this.clock.now() + this.idleTtlMs)
    const evictions: Promise<void>[] = []
    while (this.idle.size > this.maxIdle)
      evictions.push(this.evict(this.idle.keys().next().value!))
    this.armIdle()
    await Promise.all(evictions)
  }

  /** Reset ends one exact logical session. Another user or channel cannot lose its state. */
  async reset(options: SessionOptions) {
    const key = this.key(options)
    await this.retiring.get(key)?.done
    const state = this.states.get(key)
    if (state) {
      await state.releasePending
      await this.evict(state)
    }
    await new ActiveCommitments({ ...options, messages: this.messages.tasks }).clear()
  }

  private evict(state: RuntimeSession) {
    const key = this.key(state.options)
    this.idle.delete(state)
    if (this.states.get(key) === state)
      this.states.delete(key)
    const previous = this.retiring.get(key)
    if (previous)
      return previous.done
    const closing = state.dispose().finally(() => {
      if (this.retiring.get(key)?.done === closing)
        this.retiring.delete(key)
    })
    this.retiring.set(key, { state, done: closing })
    this.armIdle()
    return closing
  }

  private armIdle() {
    clearTimeout(this.idleTimer)
    this.idleTimer = undefined
    if (this.closing || !this.idle.size)
      return
    const deadline = Math.min(...this.idle.values())
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined
      const expired = [...this.idle].filter(([, expires]) => expires <= this.clock.now())
      void Promise.allSettled(expired.map(([state]) => this.evict(state)))
      this.armIdle()
    }, Math.max(0, deadline - this.clock.now()))
    this.idleTimer.unref()
  }

  get activeStateCount() {
    return this.states.size - this.idle.size
  }

  /** Registers a disk-backed reminder route. A store has one scheduler, and all stores share one reconciliation timer. */
  reminders(dataDir: string, notifier: ReminderNotifier & { pause?: () => void, resume?: () => void }, onError: (error: unknown) => void, owner: object = this) {
    if (this.closing)
      return Promise.reject(new Error('Runtime is closed'))
    const existing = this.remindersByStore.get(dataDir)
    if (existing) {
      if (!existing.targets.has(owner)) {
        if (existing.targets.size >= 3)
          return Promise.reject(new Error('Runtime reminder destination limit reached'))
        existing.targets.set(owner, { notifier, onError })
      }
      return existing.ready
    }
    // Reminder routes retain notification destinations independently of the bounded conversation infrastructure cache.
    if (this.remindersByStore.size >= 128)
      return Promise.reject(new Error('Runtime reminder route limit reached'))
    const targets = new Map<object, ReminderTarget>([[owner, { notifier, onError }]])
    const tasks = this.tasks(dataDir)
    const ready = (async () => {
      const { ReminderScheduler } = await import('../reminder-scheduler')
      const target = () => {
        let selected: ReminderTarget | undefined
        for (const value of targets.values())
          selected = value
        return selected
      }
      const delivery: ReminderNotifier = {
        notifyOpenLoop: async (...args) => {
          const destination = target()
          if (!destination?.notifier.notifyOpenLoop)
            throw new Error('Open loop destination is unavailable')
          await destination.notifier.notifyOpenLoop(...args)
        },
        notify: async (...args) => {
          const destination = target()
          if (!destination)
            throw new Error('Reminder destination was released')
          const correlationId = randomUUID()
          for (const task of args[0])
            this.events.emit({ id: randomUUID(), type: 'reminder.due', timestamp: new Date(this.clock.now()).toISOString(), correlationId, channel: 'system', taskId: task.id })
          await destination.notifier.notify(...args)
          for (const task of args[0]) {
            this.events.emit({ id: randomUUID(), type: 'reminder.delivered', timestamp: new Date(this.clock.now()).toISOString(), correlationId, channel: 'system', taskId: task.id })
            const candidate = proactiveCandidate(task, this.clock.now())
            if (candidate)
              this.events.emit({ id: randomUUID(), type: 'proactive.prompted', timestamp: new Date(this.clock.now()).toISOString(), correlationId, channel: 'system', taskId: task.id, candidateId: candidate.id, reason: candidate.reason })
          }
        },
      }
      const loops = this.openLoops(dataDir)
      const source = new OpenLoopSource(loops, this.clock, (await tasks).timezone, this.proactive, delivery, async () => Boolean(target()?.notifier.notifyOpenLoop) && ![...this.states.values()].some(state => state.options.dataDir === dataDir && state.resourceCounts.requests > 0) && await this.openLoopsEnabled(dataDir), (id) => {
        this.events.emit({ id: randomUUID(), type: 'proactive.candidate', timestamp: new Date(this.clock.now()).toISOString(), correlationId: randomUUID(), channel: 'system', loopId: id.slice('open_loop:'.length), candidateId: id, reason: 'implicit_open_loop' })
      }, await tasks)
      const scheduler = new ReminderScheduler(await tasks, delivery, error => target()?.onError(error), (delay) => {
        const route = this.remindersByStore.get(dataDir)
        if (route?.ready === ready) {
          route.dueAt = this.clock.now() + delay
          this.armReminders()
        }
      }, this.proactive, [source])
      try {
        await scheduler.start()
        return scheduler
      }
      catch (error) {
        await scheduler.close()
        throw error
      }
    })()
    this.remindersByStore.set(dataDir, { tasks, ready, targets, dueAt: Number.POSITIVE_INFINITY })
    return ready
  }

  /** One store per data directory keeps scheduler and projection observers on the same local mutation stream. */
  async tasks(dataDir: string) {
    if (this.closing)
      throw new Error('Runtime is closed')
    let tasks = this.taskStores.get(dataDir)
    if (!tasks) {
      if (this.taskStores.size >= 256)
        throw new Error('Runtime task store limit reached')
      tasks = import('../tasks').then(({ Tasks }) => {
        const store = new Tasks(dataDir, this.messages.tasks, this.clock, this.env.ANGELA_TIMEZONE)
        store.subscribe(async (change) => {
          if (change.type === 'task.created' || change.type === 'task.updated') {
            await this.openLoops(dataDir).reconcile(await store.list({ status: 'all' })).catch(() => {
              this.events.emit({ id: randomUUID(), type: 'open_loop.unavailable', timestamp: new Date(this.clock.now()).toISOString(), correlationId: randomUUID(), channel: 'system' })
            })
          }
        })
        return store
      })
      this.taskStores.set(dataDir, tasks)
      void tasks.catch(() => this.taskStores.delete(dataDir))
    }
    return await tasks
  }

  /** Reads existing automatic-memory controls without opening an index, watcher, model, or embedding client. */
  async openLoopsEnabled(dataDir: string) {
    const { Recall } = await import('../recall')
    return await new Recall(dataDir, '', '', this.messages, {}, this.defaults).automaticMemoryEnabled()
  }

  openLoops(dataDir: string) {
    return new OpenLoops(dataDir, this.messages.tasks, this.clock, (change) => {
      const payload: EventPayload = change.type === 'proactive.prompted'
        ? { type: 'proactive.prompted', loopId: change.loopId, candidateId: `open_loop:${change.loopId}`, reason: 'implicit_open_loop' }
        : change
      this.events.emit({ ...payload, id: randomUUID(), timestamp: new Date(this.clock.now()).toISOString(), correlationId: randomUUID(), channel: 'system' })
    })
  }

  async mentionOpenLoop(options: SessionOptions, loop: OpenLoop) {
    await new ActiveCommitments({ ...options, messages: this.messages.tasks }, () => options.warn?.(this.messages.tasks.unavailable)).mentionReferences([{ kind: 'open_loop', id: loop.id }], 'notification', this.clock.now())
  }

  /** Notification routing supplies the destination's exact session identity, even while its runtime context is cold. */
  async mentionCommitments(options: SessionOptions, tasks: readonly Task[]) {
    await new ActiveCommitments({ ...options, messages: this.messages.tasks }, () => options.warn?.(this.messages.tasks.unavailable)).mention(tasks, 'notification', this.clock.now())
  }

  noteActivity(dataDir: string) {
    void this.remindersByStore.get(dataDir)?.ready.then(scheduler => scheduler.noteActivity()).catch(() => {})
  }

  pauseReminders(dataDir: string, owner: object = this) {
    this.remindersByStore.get(dataDir)?.targets.get(owner)?.notifier.pause?.()
  }

  resumeReminders(dataDir: string, owner: object = this) {
    this.remindersByStore.get(dataDir)?.targets.get(owner)?.notifier.resume?.()
  }

  /** Removes one adapter's notification destination without closing another channel's route for the same store. */
  async releaseReminders(dataDir: string, owner: object = this) {
    const route = this.remindersByStore.get(dataDir)
    route?.targets.delete(owner)
    if (route && !route.targets.size) {
      this.remindersByStore.delete(dataDir)
      await (await route.ready).close()
      this.armReminders()
    }
  }

  get reminderRouteCount() {
    return this.remindersByStore.size
  }

  get resourceCounts() {
    const resources = { requests: 0, controllers: 0, mcpClients: 0, indexes: 0, watchers: 0, recallTimers: 0, embeddings: 0 }
    for (const state of [...this.states.values(), ...[...this.retiring.values()].map(entry => entry.state)]) {
      const counts = state.resourceCounts
      for (const key of Object.keys(resources) as (keyof typeof resources)[])
        resources[key] += counts[key]
    }
    return { ...resources, states: this.states.size, warmSessions: this.idle.size, retiringSessions: this.retiring.size, idleTimers: Number(Boolean(this.idleTimer)), listeners: this.events.listenerCount, reminderRoutes: this.remindersByStore.size, reminderTimers: Number(Boolean(this.reminderTimer)) }
  }

  private armReminders() {
    clearTimeout(this.reminderTimer)
    this.reminderTimer = undefined
    if (this.closing || this.delivering)
      return
    let next = Number.POSITIVE_INFINITY
    for (const route of this.remindersByStore.values())
      next = Math.min(next, route.dueAt)
    if (!Number.isFinite(next))
      return
    this.reminderTimer = setTimeout(() => {
      this.reminderTimer = undefined
      this.delivering = (async () => {
        for (const route of this.remindersByStore.values()) {
          if (this.closing)
            break
          if (route.dueAt <= this.clock.now()) {
            route.dueAt = Number.POSITIVE_INFINITY
            await (await route.ready).refresh()
          }
        }
      })().finally(() => {
        this.delivering = undefined
        this.armReminders()
      })
      void this.delivering.catch(() => {})
    }, Math.max(0, next - this.clock.now()))
    this.reminderTimer.unref()
  }

  /** Cancels requests before releasing clients and indexes. Repeated close calls await the same cleanup. */
  close() {
    this.closing ??= (async () => {
      try {
        clearTimeout(this.reminderTimer)
        clearTimeout(this.idleTimer)
        await Promise.allSettled([...this.states.values()].map(state => state.dispose()))
        await Promise.allSettled([...this.retiring.values()].map(entry => entry.done))
        await Promise.allSettled([...this.remindersByStore.values()].map(async route => (await route.ready).close()))
        await this.delivering?.catch(() => {})
      }
      finally {
        this.idle.clear()
        this.retiring.clear()
        this.idleTimer = undefined
        this.remindersByStore.clear()
        this.taskStores.clear()
        this.reminderTimer = undefined
        this.states.clear()
        this.events.close()
      }
    })()
    return this.closing
  }
}

/** A logical context has isolated disk storage and optional capabilities. Discord preserves its current text-only tool policy. */
export interface SessionOptions {
  dataDir: string
  workspace: string
  sessionId: string
  channel: 'cli' | 'telegram' | 'discord' | 'desktop' | 'zalo'
  locale?: string
  connectMcp?: (signal: AbortSignal) => Promise<McpTools | undefined>
  warn?: (message: string) => void
}

/** Owns lazy infrastructure, never conversation history. Telegram releases retain Recall while MCP and request callbacks stay request-bound. */
export class RuntimeSession {
  private readonly activeCommitments: ActiveCommitments
  private references = 0
  private keepWarm = false
  private releasing?: Promise<void>
  private readonly lifetime = new AbortController()
  private personal?: Promise<Memory>
  private taskStore?: Promise<Tasks>
  private workflows?: Promise<Skills>
  private checkpoint?: Promise<ProjectMemory>
  private retrieval?: Promise<Recall | undefined>
  private resolvedRecall?: Recall
  private client?: Promise<McpTools | undefined>
  private resolvedClient?: McpTools
  private request?: Promise<void>
  private closing?: Promise<void>
  private lastRequest?: Omit<BaseAngelaEvent, 'id' | 'timestamp'>
  private lastPrivacyAllowed = true
  private sessionStarted = false
  private lastReason: 'completed' | 'aborted' | 'failed' = 'completed'

  constructor(private readonly runtime: AngelaRuntime, readonly options: SessionOptions, private readonly removed: () => void) {
    this.activeCommitments = new ActiveCommitments({ ...options, messages: runtime.messages.tasks }, () => this.options.warn?.(runtime.messages.tasks.unavailable))
  }

  async mentionCommitments(tasks: readonly Task[]) {
    await this.activeCommitments.mention(tasks, 'notification', this.runtime.clock.now())
  }

  async mentionOpenLoop(loop: OpenLoop) {
    await this.activeCommitments.mentionReferences([{ kind: 'open_loop', id: loop.id }], 'notification', this.runtime.clock.now())
  }

  /** Acquisitions refresh request-bound connectors only after the previous release completes. */
  configure(options: SessionOptions, keepWarm: boolean) {
    if (this.references !== 1)
      return
    this.keepWarm = keepWarm
    this.options.connectMcp = options.connectMcp
    this.options.warn = options.warn
    this.options.locale = options.locale
  }

  get releasePending() {
    return this.releasing
  }

  retain() {
    this.lifetime.signal.throwIfAborted()
    this.references++
  }

  memory() {
    this.lifetime.signal.throwIfAborted()
    return this.personal ??= import('../memory').then(({ Memory }) => new Memory(this.options.dataDir, this.runtime.messages))
  }

  tasks() {
    this.lifetime.signal.throwIfAborted()
    return this.taskStore ??= this.runtime.tasks(this.options.dataDir)
  }

  skills() {
    this.lifetime.signal.throwIfAborted()
    return this.workflows ??= import('../skills').then(({ Skills }) => new Skills(this.options.dataDir, this.runtime.messages))
  }

  project() {
    this.lifetime.signal.throwIfAborted()
    return this.checkpoint ??= import('../project-memory').then(({ ProjectMemory }) => ProjectMemory.open(this.options.dataDir, this.options.workspace, this.runtime.messages))
  }

  recall() {
    this.lifetime.signal.throwIfAborted()
    return this.retrieval ??= (async () => {
      const { Recall } = await import('../recall')
      const memory = await this.memory()
      const skills = await this.skills()
      const workspace = this.options.channel === 'cli' || this.options.channel === 'desktop' ? (await this.project()).workspace : this.options.workspace
      const recall = new Recall(this.options.dataDir, workspace, this.options.sessionId, this.runtime.messages, this.runtime.env, this.runtime.defaults, memory, skills, this.runtime.clock)
      try {
        await recall.start()
        await recall.bindTasks(await this.tasks())
        this.resolvedRecall = recall
        return recall
      }
      catch {
        await recall.close()
        this.options.warn?.(this.runtime.messages.recallInvalid)
        return undefined
      }
    })()
  }

  mcp(signal = this.lifetime.signal) {
    this.lifetime.signal.throwIfAborted()
    // Without an enabled connector, no import, discovery, or client allocation occurs.
    if (!this.client) {
      this.client = (this.options.connectMcp?.(AbortSignal.any([signal, this.lifetime.signal])) ?? Promise.resolve(undefined)).then((client) => {
        this.resolvedClient = client
        return client
      }).catch((error: unknown) => {
        this.client = undefined
        throw error
      })
    }
    return this.client
  }

  /** Normal text does not initialize stores through the command path. Remote skill imports remain disabled. */
  async command(text: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (this.options.channel === 'zalo')
      return undefined
    if (!text.startsWith('/'))
      return undefined
    const privacy = requestPrivacy(text)
    if (!privacy.durableMemoryAllowed)
      return JSON.stringify({ status: 'rejected', reason: privacy.reason })
    if (text === '/memory consolidate')
      return JSON.stringify(await (await this.recall())?.enrich(this.runtime.model, this.runtime.provider, signal))
    if (/^\/(?:tasks|today|done|cancel|snooze)(?:\s|$)/u.test(text)) {
      const { taskCommand, taskEvidence } = await import('../task-commands')
      return await taskCommand(text, await this.tasks(), this.runtime.messages.tasks, this.options.locale ?? 'en', async (task) => {
        await this.activeCommitments.mention([task], 'command', this.runtime.clock.now())
        await this.recordDomain({ type: text.startsWith('/done ') ? 'task.completed' : 'task.updated', taskId: task.id }, taskEvidence(task))
      })
    }
    if (/^\/project(?:\s|$)/u.test(text) && this.options.channel === 'cli')
      return await (await this.project()).command(text)
    if (/^\/skills(?:\s|$)/u.test(text)) {
      if (this.options.channel === 'telegram' && /^\/skills (?:import|edit)(?:\s|$)/u.test(text))
        return this.runtime.messages.telegramLocalSkills
      const response = await (await this.skills()).command(text)
      if (this.retrieval)
        await (await this.retrieval)?.changed()
      return response
    }
    if (/^\/(?:memory|remember|forget)(?:\s|$)/u.test(text)) {
      const recallCommand = /^\/memory (?:used|status|search|search-all|read|budget|reindex|recall|history|semantic|purge|age)(?:\s|$)/u.test(text)
      const response = recallCommand ? await (await this.recall())?.command(text, signal) : await (await this.memory()).command(text)
      if (!recallCommand && response !== undefined && this.retrieval)
        await (await this.retrieval)?.changed()
      return response
    }
    return undefined
  }

  private async recordDomain(payload: EventPayload, evidence: string) {
    let workspace = this.options.workspace
    try {
      if (this.options.channel === 'cli' || this.options.channel === 'desktop')
        workspace = (await this.project()).workspace
    }
    catch { this.options.warn?.(this.runtime.messages.projectMemoryUnavailable) }
    const event: AngelaEvent = { ...payload, id: randomUUID(), timestamp: new Date(this.runtime.clock.now()).toISOString(), correlationId: randomUUID(), sessionId: this.options.sessionId, channel: this.options.channel, workspace }
    this.runtime.events.emit(event)
    try {
      if (this.options.channel !== 'discord' && this.options.channel !== 'zalo') {
        const capture = await (await this.recall())?.capture()
        capture?.record(event, evidence, true)
        capture?.finish('')
      }
    }
    catch { this.options.warn?.(this.runtime.messages.memoryUnavailable) }
  }

  /**
   * Runs shared context, tools, model, and lifecycle delivery with bounded request-local evidence.
   *
   * Call stack:
   * adapter -> RuntimeSession.send -> buildContext / buildTools -> Chat.send -> core-agent.streamFrom
   */
  send(chat: Chat, text: string, options: StreamOptions, extra = '') {
    this.lifetime.signal.throwIfAborted()
    if (this.request)
      return Promise.reject(new Error('Context already has an active request'))
    this.runtime.noteActivity(this.options.dataDir)
    const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, this.lifetime.signal]) : this.lifetime.signal
    const envelope: Omit<BaseAngelaEvent, 'id' | 'timestamp'> = { correlationId: randomUUID(), sessionId: this.options.sessionId, channel: this.options.channel, workspace: this.options.workspace }
    this.lastRequest = envelope
    let capture: MemoryCapture | undefined
    let recall: Recall | undefined
    const emit = async (payload: EventPayload, evidence = '', verified = false) => {
      const event: AngelaEvent = { ...envelope, ...payload, id: randomUUID(), timestamp: new Date(this.runtime.clock.now()).toISOString() }
      this.runtime.events.emit(event)
      try {
        if (capture && !await recall?.automaticMemoryEnabled())
          capture = undefined
        capture?.record(event, evidence, verified)
      }
      catch {
        capture = undefined
        this.options.warn?.(this.runtime.messages.memoryUnavailable)
      }
    }
    this.request = (async () => {
      let registry: Awaited<ReturnType<typeof buildTools>> | undefined
      let completed = false
      let assistant = ''
      try {
        signal.throwIfAborted()
        const warnings: string[] = []
        const sources: ContextSources = { workspace: this.options.workspace, channel: this.options.channel, messages: this.runtime.messages, warn: (message) => {
          // Adapter presentation does not deliver evidence to the model. Keep a bounded request-local copy for both paths.
          if (warnings.length < 8 && !warnings.includes(message))
            warnings.push(message)
          this.options.warn?.(message)
        } }
        if (this.options.channel !== 'discord' && this.options.channel !== 'zalo') {
          sources.memory = await this.memory()
          let memoryEnabled = false
          try {
            memoryEnabled = (await sources.memory.read()).enabled
          }
          catch { sources.warn(this.runtime.messages.memoryUnavailable) }
          sources.privacy = requestPrivacy(text, memoryEnabled, chat.privacy)
          chat.applyPrivacy(sources.privacy)
          this.lastPrivacyAllowed = sources.privacy.durableMemoryAllowed
          sources.tasks = await this.tasks()
          if (this.options.channel === 'cli' || this.options.channel === 'desktop')
            sources.project = await this.project()
          sources.recall = await this.recall()
          recall = sources.recall
          envelope.workspace = sources.project?.workspace ?? this.options.workspace
          try {
            if (sources.privacy.durableMemoryAllowed)
              capture = await sources.recall?.capture(sources.privacy)
          }
          catch { sources.warn(this.runtime.messages.memoryUnavailable) }
        }
        if (!this.sessionStarted) {
          this.sessionStarted = true
          await emit({ type: 'session.started' })
        }
        await emit({ type: this.options.channel === 'zalo' ? 'external.message' : 'user.message' }, text)
        if (sources.tasks && sources.privacy) {
          let openLoopReply: string | undefined
          try {
            if (sources.privacy.durableMemoryAllowed && await this.runtime.openLoopsEnabled(this.options.dataDir)) {
              sources.openLoops = this.runtime.openLoops(this.options.dataDir)
              openLoopReply = await new OpenLoopConversation(sources.openLoops, this.activeCommitments, sources.tasks, this.options.workspace, this.options.sessionId, this.runtime.messages.tasks).handle(text, sources.privacy)
            }
          }
          catch { sources.warn(this.runtime.messages.tasks.openLoopUnavailable) }
          if (openLoopReply) {
            await this.activeCommitments.advance(this.runtime.clock.now())
            await chat.respond(text, openLoopReply, options)
            assistant = openLoopReply
            completed = true
            await emit({ type: 'assistant.message' }, assistant)
            return
          }
          const { CommitmentConversation } = await import('../commitment-conversation')
          const projection = capture ? await sources.recall?.commitmentSource() : undefined
          const response = await new CommitmentConversation(sources.tasks, this.runtime.messages.tasks, this.options.locale ?? 'en', projection, this.activeCommitments).handle(text, chat.conversation, sources.privacy)
          if (response) {
            if (response.task) {
              const { taskEvidence } = await import('../task-commands')
              await emit({ type: response.action === 'created' ? 'task.created' : response.action === 'completed' ? 'task.completed' : 'task.updated', taskId: response.task.id }, taskEvidence(response.task), true)
            }
            await chat.respond(text, response.text, options)
            assistant = response.text
            completed = true
            await emit({ type: 'assistant.message' }, assistant)
            return
          }
        }
        const context = await buildContext(sources, text, signal, extra)
        registry = await buildTools(sources, text, this.options.sessionId, this.options.channel === 'zalo' ? undefined : await this.mcp(signal))
        signal.throwIfAborted()
        await chat.send(text, {
          ...options,
          abortSignal: signal,
          tools: registry.tools,
          resolveStep: options.resolveStep ? async () => ({ ...await options.resolveStep!(), tools: registry!.tools }) : undefined,
          onStreamEvent: async (event) => {
            const observation = registry!.observe(event)
            if (event.type === 'text-delta' && assistant.length < 4000)
              assistant += event.text.slice(0, 4000 - assistant.length)
            if (event.type === 'tool-call')
              await emit({ type: 'tool.call', toolCallId: event.toolCallId, toolName: event.toolName })
            else if (event.type === 'tool-error')
              await emit({ type: 'tool.error', toolCallId: event.toolCallId, toolName: observation?.toolName ?? 'unknown' }, observation?.text)
            else if (event.type === 'tool-result')
              await emit({ type: 'tool.result', toolCallId: event.toolCallId, toolName: observation?.toolName ?? 'unknown', outcome: observation?.outcome ?? 'unverified' }, observation?.text, observation?.outcome === 'verified')
            if (observation?.domain) {
              await emit(observation.domain, observation.text, true)
              if ('taskId' in observation.domain && sources.tasks)
                await this.activeCommitments.mention([await sources.tasks.find(observation.domain.taskId)], 'command', this.runtime.clock.now())
            }
            await options.onStreamEvent?.(event)
          },
        }, warnings.length ? [context, ...warnings].filter(Boolean).join('\n\n') : context)
        if (sources.tasks && sources.privacy?.taskWritesAllowed) {
          try {
            await this.activeCommitments.mentionText(assistant, await sources.tasks.list({ status: 'all' }), this.runtime.clock.now())
          }
          catch { sources.warn(this.runtime.messages.tasks.unavailable) }
        }
        completed = true
        await emit({ type: 'assistant.message' }, assistant)
      }
      finally {
        if (!completed)
          await emit({ type: 'request.failed', reason: signal.aborted ? 'aborted' : 'failed' }, signal.aborted ? 'Request interrupted' : 'Request failed')
        this.lastReason = completed ? 'completed' : signal.aborted ? 'aborted' : 'failed'
        if (completed)
          await emit({ type: 'request.completed' })
        try {
          capture?.finish(text)
        }
        catch { this.options.warn?.(this.runtime.messages.memoryUnavailable) }
        capture = undefined
        registry?.close()
        await this.retrieval?.then(recall => recall?.finishRequest()).catch(() => {})
        if (signal.aborted) {
          await this.client?.then(client => client?.close()).catch(() => {})
          this.client = undefined
          this.resolvedClient = undefined
        }
      }
    })().finally(() => { this.request = undefined })
    return this.request
  }

  close() {
    if (!this.references)
      return this.releasing ?? this.closing ?? Promise.resolve()
    this.references--
    if (this.references)
      return Promise.resolve()
    this.releasing ??= (async () => {
      // A caller can release before send settles. Such a request remains active until its finally block completes.
      await this.request?.catch(() => {})
      const client = this.client
      this.client = undefined
      this.resolvedClient = undefined
      await client?.then(client => client?.close()).catch(() => {})
      this.options.connectMcp = undefined
      this.options.warn = undefined
      await this.runtime.release(this, this.keepWarm)
    })().finally(() => { this.releasing = undefined })
    return this.releasing
  }

  get resourceCounts() {
    const recall = this.resolvedRecall?.resourceCounts
    return { requests: Number(Boolean(this.request)), controllers: Number(!this.lifetime.signal.aborted), mcpClients: Number(Boolean(this.resolvedClient)), indexes: recall?.indexes ?? 0, watchers: recall?.watchers ?? 0, recallTimers: recall?.timers ?? 0, embeddings: recall?.embeddings ?? 0 }
  }

  /** Host shutdown ignores outstanding acquisitions and cancels the active generation before closing its resources. */
  dispose() {
    this.closing ??= (async () => {
      this.lifetime.abort()
      try {
        await this.request?.catch(() => {})
        if (this.sessionStarted && this.lastRequest) {
          const event: AngelaEvent = { ...this.lastRequest, id: randomUUID(), timestamp: new Date(this.runtime.clock.now()).toISOString(), type: 'session.ended', reason: this.lastReason }
          this.runtime.events.emit(event)
          try {
            const capture = this.lastPrivacyAllowed ? await (await this.retrieval)?.capture() : undefined
            capture?.record(event)
            capture?.finish('')
          }
          catch { this.options.warn?.(this.runtime.messages.memoryUnavailable) }
        }
        await Promise.allSettled([
          this.client?.then(client => client?.close()),
          this.retrieval?.then(recall => recall?.close()),
        ])
      }
      finally {
        this.personal = undefined
        this.taskStore = undefined
        this.workflows = undefined
        this.checkpoint = undefined
        this.retrieval = undefined
        this.resolvedRecall = undefined
        this.client = undefined
        this.resolvedClient = undefined
        this.lastRequest = undefined
        this.options.connectMcp = undefined
        this.options.warn = undefined
        this.removed()
      }
    })()
    return this.closing
  }
}
