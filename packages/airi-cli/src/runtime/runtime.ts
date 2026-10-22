import type { Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { cliMessages } from '@proj-airi/i18n/cli'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { Chat } from '../chat'
import type { McpTools } from '../mcp'
import type { Memory } from '../memory'
import type { MemoryCapture } from '../memory-v2/consolidator'
import type { ProjectMemory } from '../project-memory'
import type { Recall } from '../recall'
import type { ReminderNotifier, ReminderScheduler } from '../reminder-scheduler'
import type { Skills } from '../skills'
import type { Tasks } from '../tasks'
import type { ContextSources } from './context-builder'
import type { ObserverDiagnostic } from './event-bus'
import type { AngelaEvent, BaseAngelaEvent, EventPayload } from './events'

import process from 'node:process'

import { randomUUID } from 'node:crypto'

import { buildContext } from './context-builder'
import { EventBus } from './event-bus'
import { buildTools } from './tool-registry'

/** Telegram retention is independent of the existing eight active-context limit. */
export interface RuntimeOptions {
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
  private reminderTimer?: ReturnType<typeof setTimeout>
  private delivering?: Promise<void>

  constructor(readonly model: string, readonly provider: GenerationProvider, readonly messages: typeof cliMessages.en, readonly env: NodeJS.ProcessEnv = {}, readonly defaults: { baseUrl?: string, apiKey: string } = { apiKey: '' }, options: RuntimeOptions = {}) {
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
      if (state && deadline !== undefined && deadline <= Date.now()) {
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
    this.idle.set(state, Date.now() + this.idleTtlMs)
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
      const expired = [...this.idle].filter(([, expires]) => expires <= Date.now())
      void Promise.allSettled(expired.map(([state]) => this.evict(state)))
      this.armIdle()
    }, Math.max(0, deadline - Date.now()))
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
    const tasks = import('../tasks').then(({ Tasks }) => new Tasks(dataDir, this.messages.tasks))
    const ready = (async () => {
      const { ReminderScheduler } = await import('../reminder-scheduler')
      const target = () => {
        let selected: ReminderTarget | undefined
        for (const value of targets.values())
          selected = value
        return selected
      }
      const scheduler = new ReminderScheduler(await tasks, {
        notify: async (...args) => {
          const destination = target()
          if (!destination)
            throw new Error('Reminder destination was released')
          await destination.notifier.notify(...args)
          const correlationId = randomUUID()
          for (const task of args[0])
            this.events.emit({ id: randomUUID(), type: 'reminder.delivered', timestamp: new Date().toISOString(), correlationId, channel: 'system', taskId: task.id })
        },
      }, error => target()?.onError(error), (delay) => {
        const route = this.remindersByStore.get(dataDir)
        if (route?.ready === ready) {
          route.dueAt = Date.now() + delay
          this.armReminders()
        }
      })
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

  /** Returns the shared task store when a reminder route already owns it. Other contexts own their store until release. */
  async tasks(dataDir: string) {
    if (this.closing)
      throw new Error('Runtime is closed')
    const route = this.remindersByStore.get(dataDir)
    if (route)
      return await route.tasks
    const { Tasks } = await import('../tasks')
    return new Tasks(dataDir, this.messages.tasks)
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
          if (route.dueAt <= Date.now()) {
            route.dueAt = Number.POSITIVE_INFINITY
            await (await route.ready).refresh()
          }
        }
      })().finally(() => {
        this.delivering = undefined
        this.armReminders()
      })
      void this.delivering.catch(() => {})
    }, Math.max(0, next - Date.now()))
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
  channel: 'cli' | 'telegram' | 'discord' | 'desktop'
  locale?: string
  connectMcp?: (signal: AbortSignal) => Promise<McpTools | undefined>
  warn?: (message: string) => void
}

/** Owns lazy infrastructure, never conversation history. Telegram releases retain Recall while MCP and request callbacks stay request-bound. */
export class RuntimeSession {
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
  private sessionStarted = false
  private lastReason: 'completed' | 'aborted' | 'failed' = 'completed'

  constructor(private readonly runtime: AngelaRuntime, readonly options: SessionOptions, private readonly removed: () => void) {}

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
      const recall = new Recall(this.options.dataDir, workspace, this.options.sessionId, this.runtime.messages, this.runtime.env, this.runtime.defaults, memory, skills)
      try {
        await recall.start()
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
    if (!text.startsWith('/'))
      return undefined
    if (text === '/memory consolidate')
      return JSON.stringify(await (await this.recall())?.enrich(this.runtime.model, this.runtime.provider, signal))
    if (/^\/(?:tasks|today|done|cancel|snooze)(?:\s|$)/u.test(text)) {
      const { taskCommand } = await import('../task-commands')
      return await taskCommand(text, await this.tasks(), this.runtime.messages.tasks, this.options.locale ?? 'en', task => this.recordDomain({ type: text.startsWith('/done ') ? 'task.completed' : 'task.updated', taskId: task.id }, `${task.title} [${task.status}] ${task.id}`))
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
    const event: AngelaEvent = { ...payload, id: randomUUID(), timestamp: new Date().toISOString(), correlationId: randomUUID(), sessionId: this.options.sessionId, channel: this.options.channel, workspace }
    this.runtime.events.emit(event)
    try {
      if (this.options.channel !== 'discord') {
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
    const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, this.lifetime.signal]) : this.lifetime.signal
    const envelope: Omit<BaseAngelaEvent, 'id' | 'timestamp'> = { correlationId: randomUUID(), sessionId: this.options.sessionId, channel: this.options.channel, workspace: this.options.workspace }
    this.lastRequest = envelope
    let capture: MemoryCapture | undefined
    let recall: Recall | undefined
    const emit = async (payload: EventPayload, evidence = '', verified = false) => {
      const event: AngelaEvent = { ...envelope, ...payload, id: randomUUID(), timestamp: new Date().toISOString() }
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
        const sources: ContextSources = { channel: this.options.channel, messages: this.runtime.messages, warn: message => this.options.warn ? this.options.warn(message) : warnings.push(message) }
        if (this.options.channel !== 'discord') {
          sources.memory = await this.memory()
          sources.tasks = await this.tasks()
          if (this.options.channel === 'cli' || this.options.channel === 'desktop')
            sources.project = await this.project()
          sources.recall = await this.recall()
          recall = sources.recall
          envelope.workspace = sources.project?.workspace ?? this.options.workspace
          try {
            capture = await sources.recall?.capture()
          }
          catch { sources.warn(this.runtime.messages.memoryUnavailable) }
        }
        if (!this.sessionStarted) {
          this.sessionStarted = true
          await emit({ type: 'session.started' })
        }
        await emit({ type: 'user.message' }, text)
        const context = await buildContext(sources, text, signal, extra)
        registry = await buildTools(sources, text, this.options.sessionId, await this.mcp(signal))
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
            if (observation?.domain)
              await emit(observation.domain, observation.text, true)
            await options.onStreamEvent?.(event)
          },
        }, warnings.length ? [context, ...warnings].filter(Boolean).join('\n\n') : context)
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
          const event: AngelaEvent = { ...this.lastRequest, id: randomUUID(), timestamp: new Date().toISOString(), type: 'session.ended', reason: this.lastReason }
          this.runtime.events.emit(event)
          try {
            const capture = await (await this.retrieval)?.capture()
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
