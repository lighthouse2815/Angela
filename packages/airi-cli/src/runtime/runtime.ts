import type { StreamOptions } from '@proj-airi/core-agent'
import type { cliMessages } from '@proj-airi/i18n/cli'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { Chat } from '../chat'
import type { McpTools } from '../mcp'
import type { Memory } from '../memory'
import type { ProjectMemory } from '../project-memory'
import type { Recall } from '../recall'
import type { ReminderNotifier, ReminderScheduler } from '../reminder-scheduler'
import type { Skills } from '../skills'
import type { Tasks } from '../tasks'
import type { ContextSources } from './context-builder'
import type { BaseAngelaEvent } from './events'

import { randomUUID } from 'node:crypto'

import { buildContext } from './context-builder'
import { EventBus } from './event-bus'
import { buildTools } from './tool-registry'

/** Adapters share this host and retain only active logical contexts. Construction performs no IO or capability initialization. */
export class AngelaRuntime {
  readonly events = new EventBus()
  private readonly states = new Map<string, RuntimeSession>()
  private closing?: Promise<void>
  private readonly remindersByStore = new Map<string, { tasks: Promise<Tasks>, ready: Promise<ReminderScheduler>, notifier: ReminderNotifier & { pause?: () => void, resume?: () => void }, dueAt: number }>()
  private reminderTimer?: ReturnType<typeof setTimeout>
  private delivering?: Promise<void>

  constructor(readonly model: string, readonly provider: GenerationProvider, readonly messages: typeof cliMessages.en, readonly env: NodeJS.ProcessEnv = {}, readonly defaults: { baseUrl?: string, apiKey: string } = { apiKey: '' }) {}

  /** At most eight contexts can run concurrently. Callers release each acquisition in a finally block. */
  open(options: SessionOptions) {
    if (this.closing)
      throw new Error('Runtime is closed')
    const key = JSON.stringify([options.dataDir, options.workspace, options.sessionId, options.channel])
    let state = this.states.get(key)
    if (!state) {
      if (this.states.size >= 8)
        throw new Error('Runtime active context limit reached')
      state = new RuntimeSession(this, options, () => this.states.delete(key))
      this.states.set(key, state)
    }
    state.retain()
    return state
  }

  get activeStateCount() {
    return this.states.size
  }

  /** Registers a disk-backed reminder route. A store has one scheduler, and all stores share one reconciliation timer. */
  reminders(dataDir: string, notifier: ReminderNotifier & { pause?: () => void, resume?: () => void }, onError: (error: unknown) => void) {
    if (this.closing)
      return Promise.reject(new Error('Runtime is closed'))
    const existing = this.remindersByStore.get(dataDir)
    if (existing)
      return existing.ready
    // Personal hosts retain small routes for allowed users, never their conversations, recall, or tool clients.
    if (this.remindersByStore.size >= 128)
      return Promise.reject(new Error('Runtime reminder route limit reached'))
    const tasks = import('../tasks').then(({ Tasks }) => new Tasks(dataDir, this.messages.tasks))
    const ready = (async () => {
      const { ReminderScheduler } = await import('../reminder-scheduler')
      const scheduler = new ReminderScheduler(await tasks, notifier, onError, (delay) => {
        const route = this.remindersByStore.get(dataDir)
        if (route) {
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
    this.remindersByStore.set(dataDir, { tasks, ready, notifier, dueAt: Number.POSITIVE_INFINITY })
    return ready
  }

  /** Returns the shared task store when a reminder route already owns it. Other contexts own their store until release. */
  async tasks(dataDir: string) {
    const route = this.remindersByStore.get(dataDir)
    if (route)
      return await route.tasks
    const { Tasks } = await import('../tasks')
    return new Tasks(dataDir, this.messages.tasks)
  }

  pauseReminders(dataDir: string) {
    this.remindersByStore.get(dataDir)?.notifier.pause?.()
  }

  resumeReminders(dataDir: string) {
    this.remindersByStore.get(dataDir)?.notifier.resume?.()
  }

  get reminderRouteCount() {
    return this.remindersByStore.size
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
        await Promise.allSettled([...this.states.values()].map(state => state.dispose()))
        await Promise.allSettled([...this.remindersByStore.values()].map(async route => (await route.ready).close()))
        await this.delivering?.catch(() => {})
      }
      finally {
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
  channel: 'cli' | 'telegram' | 'discord'
  locale?: string
  connectMcp?: (signal: AbortSignal) => Promise<McpTools | undefined>
  warn?: (message: string) => void
}

/** Owns lazy infrastructure, never conversation history or request prompts. Zero references trigger immediate eviction without an idle timer. */
export class RuntimeSession {
  private references = 0
  private readonly lifetime = new AbortController()
  private personal?: Promise<Memory>
  private taskStore?: Promise<Tasks>
  private workflows?: Promise<Skills>
  private checkpoint?: Promise<ProjectMemory>
  private retrieval?: Promise<Recall | undefined>
  private client?: Promise<McpTools | undefined>
  private request?: Promise<void>
  private closing?: Promise<void>

  constructor(private readonly runtime: AngelaRuntime, readonly options: SessionOptions, private readonly removed: () => void) {}

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
      const workspace = this.options.channel === 'cli' ? (await this.project()).workspace : this.options.workspace
      const recall = new Recall(this.options.dataDir, workspace, this.options.sessionId, this.runtime.messages, this.runtime.env, this.runtime.defaults, memory, skills)
      try {
        await recall.start()
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
      this.client = (this.options.connectMcp?.(AbortSignal.any([signal, this.lifetime.signal])) ?? Promise.resolve(undefined)).catch((error: unknown) => {
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
    if (/^\/(?:tasks|today|done|cancel|snooze)(?:\s|$)/u.test(text)) {
      const { taskCommand } = await import('../task-commands')
      return await taskCommand(text, await this.tasks(), this.runtime.messages.tasks, this.options.locale ?? 'en')
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
      const recallCommand = /^\/memory (?:used|status|search|search-all|read|budget|reindex|recall|history|semantic)(?:\s|$)/u.test(text)
      const response = recallCommand ? await (await this.recall())?.command(text, signal) : await (await this.memory()).command(text)
      if (!recallCommand && response !== undefined && this.retrieval)
        await (await this.retrieval)?.changed()
      return response
    }
    return undefined
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
    const envelope: Omit<BaseAngelaEvent, 'timestamp'> = { correlationId: randomUUID(), sessionId: this.options.sessionId, channel: this.options.channel }
    const emit = (event: Parameters<EventBus['emit']>[0]) => this.runtime.events.emit(event)
    this.request = (async () => {
      signal.throwIfAborted()
      emit({ ...envelope, type: 'user.message', timestamp: new Date().toISOString() })
      let registry: Awaited<ReturnType<typeof buildTools>> | undefined
      try {
        const warnings: string[] = []
        const sources: ContextSources = { channel: this.options.channel, messages: this.runtime.messages, warn: message => this.options.warn ? this.options.warn(message) : warnings.push(message) }
        if (this.options.channel !== 'discord') {
          sources.memory = await this.memory()
          sources.tasks = await this.tasks()
          if (this.options.channel === 'cli')
            sources.project = await this.project()
          sources.recall = await this.recall()
        }
        const context = await buildContext(sources, text, signal, extra)
        registry = await buildTools(sources, text, this.options.sessionId, await this.mcp(signal))
        signal.throwIfAborted()
        await chat.send(text, {
          ...options,
          abortSignal: signal,
          tools: registry.tools,
          resolveStep: options.resolveStep ? async () => ({ ...await options.resolveStep!(), tools: registry!.tools }) : undefined,
          onStreamEvent: async (event) => {
            registry!.observe(event)
            if (event.type === 'tool-call')
              emit({ ...envelope, type: 'tool.call', timestamp: new Date().toISOString(), toolCallId: event.toolCallId, toolName: event.toolName })
            else if (event.type === 'tool-result' || event.type === 'tool-error')
              emit({ ...envelope, type: event.type === 'tool-result' ? 'tool.result' : 'tool.error', timestamp: new Date().toISOString(), toolCallId: event.toolCallId })
            await options.onStreamEvent?.(event)
          },
        }, warnings.length ? [context, ...warnings].filter(Boolean).join('\n\n') : context)
        emit({ ...envelope, type: 'assistant.message', timestamp: new Date().toISOString() })
      }
      finally {
        registry?.close()
        await this.retrieval?.then(recall => recall?.finishRequest()).catch(() => {})
        if (signal.aborted) {
          await this.client?.then(client => client?.close()).catch(() => {})
          this.client = undefined
        }
      }
    })().finally(() => { this.request = undefined })
    return this.request
  }

  async close() {
    if (this.references > 0)
      this.references--
    if (!this.references)
      await this.dispose()
  }

  /** Host shutdown ignores outstanding acquisitions and cancels the active generation before closing its resources. */
  dispose() {
    this.closing ??= (async () => {
      this.lifetime.abort()
      try {
        await this.request?.catch(() => {})
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
        this.client = undefined
        this.removed()
      }
    })()
    return this.closing
  }
}
