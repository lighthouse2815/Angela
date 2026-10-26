import type { OpenLoop, RuntimeChat, RuntimeSession, Task } from '@angela/companion/runtime'
import type { TaskCommand, TaskResponse } from '@angela/companion/task-contracts'
import type { StreamEvent, StreamOptions } from '@angela/core-agent'
import type { Tool } from '@xsai/shared-chat'

import type { CompanionBegin, CompanionReady } from '../../../../shared/eventa/companion-runtime'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { characterDataDir, CompanionRecords } from '@angela/companion/companion'
import { AngelaRuntime, ReminderNotifications, requestPrivacy } from '@angela/companion/runtime'
import { taskCommandSchema } from '@angela/companion/task-contracts'
import { chatMessagesToTurns } from '@angela/core-agent'
import { cliMessages } from '@angela/i18n/cli'

import * as v from 'valibot'

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(200))
const beginSchema = v.object({
  requestId: id,
  sessionId: id,
  characterId: id,
  text: v.pipe(v.string(), v.maxLength(32000)),
  protectedHistory: v.optional(v.boolean()),
  history: v.pipe(v.array(v.object({ id, type: v.picklist(['user', 'assistant']), text: v.pipe(v.string(), v.maxLength(32000)) })), v.maxLength(100)),
})
interface Request {
  owner: number
  abort: AbortController
  scope: RuntimeSession
  ready: PromiseWithResolvers<CompanionReady>
  release: PromiseWithResolvers<void>
  options?: StreamOptions
  tools: Tool[]
  done: Promise<void>
  timer: ReturnType<typeof setTimeout>
}

interface NotificationRoute {
  owner: number
  characterId: string
  sessionId: string
  availableUntil: number
  scheduler: Promise<{ refresh: () => Promise<void> }>
  pending?: {
    token: string
    text: string
    signal: AbortSignal
    tasks: readonly Task[]
    loop?: OpenLoop
    presented: boolean
    finish: (shown: boolean) => void
  }
}

/** Main owns user roots and request leases. Renderers keep provider transport, media, and authorized device tools. */
export class DesktopCompanionRuntime {
  private readonly runtime = new AngelaRuntime('external-desktop', { generation: () => {
    throw new Error('Desktop generation belongs to its renderer host')
  } }, cliMessages.en)

  private readonly requests = new Map<string, Request>()
  private readonly notifications = new Map<string, NotificationRoute>()
  readonly workspace: string
  readonly dataDir: string

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.workspace = realpathSync(resolve(env.ANGELA_WORKSPACE ?? process.cwd()))
    this.dataDir = resolve(env.ANGELA_DATA_DIR ?? join(homedir(), '.angela', 'sessions'))
  }

  root(characterId: string) {
    return characterDataDir(this.dataDir, characterId)
  }

  async records(characterId: string, command: Parameters<CompanionRecords['execute']>[0]) {
    v.parse(id, characterId)
    const records = await CompanionRecords.open(this.root(characterId), this.workspace, characterId)
    try {
      return await records.execute(command)
    }
    finally { records.close() }
  }

  /** Explicit UI actions use the same atomic task store as chat, without invoking a model. */
  async tasks(characterId: string, command: TaskCommand): Promise<TaskResponse> {
    v.parse(id, characterId)
    const parsed = v.parse(taskCommandSchema, command)
    const root = this.root(characterId)
    const tasks = await this.runtime.tasks(root)
    let task: Task | undefined
    switch (parsed.type) {
      case 'list': break
      case 'create':
        task = await tasks.create(parsed.input)
        break
      case 'update':
        task = await tasks.update(parsed.id, parsed.changes)
        break
      case 'complete':
        task = await tasks.complete(parsed.id)
        break
      case 'cancel':
        task = await tasks.cancel(parsed.id)
        break
      case 'snooze':
        task = await tasks.snooze(parsed.id, parsed.until)
        break
    }
    const route = this.notifications.get(root)
    if (task && route)
      void route.scheduler.then(scheduler => scheduler.refresh()).catch(error => console.error('Task scheduler refresh failed', error))
    return { task, tasks: await tasks.list({ status: 'all' }), timezone: tasks.timezone }
  }

  async begin(owner: number, input: CompanionBegin) {
    const data = v.parse(beginSchema, input)
    const key = JSON.stringify([owner, data.requestId])
    if (this.requests.has(key) || this.requests.size >= 8)
      throw new Error('A companion request is already running or the host is busy')
    const scope = this.runtime.open({ dataDir: this.root(data.characterId), workspace: this.workspace, sessionId: data.sessionId, characterId: data.characterId, channel: 'desktop' })
    const notification = this.notifications.get(this.root(data.characterId))
    if (notification) {
      notification.availableUntil = 0
      notification.pending?.finish(false)
    }
    const ready = Promise.withResolvers<CompanionReady>()
    const release = Promise.withResolvers<void>()
    // Both promises have immediate rejection consumers because cancellation can race with begin IPC delivery.
    void ready.promise.catch(() => {})
    void release.promise.catch(() => {})
    const abort = new AbortController()
    const request: Request = { owner, abort, scope, ready, release, tools: [], done: Promise.resolve(), timer: setTimeout(() => {
      abort.abort(new Error('Companion request expired'))
      release.reject(abort.signal.reason)
      ready.reject(abort.signal.reason)
    }, 10 * 60000) }
    this.requests.set(key, request)
    let privacy = data.protectedHistory ? requestPrivacy('don\'t save this') : undefined
    for (const turn of data.history) {
      if (turn.type === 'user')
        privacy = requestPrivacy(turn.text, true, privacy)
    }
    const chat: RuntimeChat = {
      conversation: { turns: chatMessagesToTurns(data.history.map(turn => ({ id: turn.id, role: turn.type, content: turn.text }))) },
      get privacy() { return privacy },
      applyPrivacy: (value) => { privacy = value },
      send: async (_text, options, context) => {
        request.options = options
        const tools = typeof options.tools === 'function' ? await options.tools() : options.tools
        request.tools = tools ?? []
        ready.resolve({ kind: 'generate', context: context ?? '', tools: request.tools.map(tool => ({ type: tool.type, function: tool.function })) })
        await release.promise
      },
      respond: async (_text, text) => {
        ready.resolve({ kind: 'reply', text })
        await release.promise
      },
    }
    request.done = scope.send(chat, data.text, { abortSignal: abort.signal }).catch((error) => {
      ready.reject(error)
      throw error
    }).finally(async () => {
      clearTimeout(request.timer)
      this.requests.delete(key)
      await scope.close()
    })
    void request.done.catch(() => {})
    return ready.promise
  }

  private request(owner: number, requestId: string) {
    const request = this.requests.get(JSON.stringify([owner, requestId]))
    if (!request)
      throw new Error('The companion request is absent or belongs to another window')
    request.abort.signal.throwIfAborted()
    return request
  }

  async executeTool(owner: number, requestId: string, name: string, input: unknown) {
    const request = this.request(owner, requestId)
    const tool = request.tools.find(tool => tool.function.name === name)
    if (!tool?.execute)
      throw new Error('The tool is not available to this request')
    const validated = await tool.validate?.(input)
    if (validated?.issues)
      throw new Error('The companion tool arguments are invalid')
    return tool.execute(validated && 'value' in validated ? validated.value : input, { messages: [], toolCallId: requestId, abortSignal: request.abort.signal })
  }

  async observe(owner: number, requestId: string, event: StreamEvent) {
    const request = this.request(owner, requestId)
    // Only lifecycle evidence used by RuntimeSession crosses the boundary. Audio and image payloads stay in the renderer.
    if (event.type === 'text-delta' || event.type === 'tool-call' || event.type === 'tool-result' || event.type === 'tool-error')
      await request.options?.onStreamEvent?.(event)
  }

  async finish(owner: number, requestId: string, cancelled: boolean, failed: boolean) {
    const request = this.requests.get(JSON.stringify([owner, requestId]))
    if (!request)
      return
    if (cancelled || failed) {
      const error = new Error(cancelled ? 'Companion request cancelled' : 'Companion generation failed')
      if (cancelled)
        request.abort.abort(error)
      request.ready.reject(error)
      request.release.reject(error)
    }
    else { request.release.resolve() }
    await request.done.catch((error) => {
      if (!cancelled && !failed)
        throw error
    })
  }

  async reminders(owner: number, input: { characterId: string, sessionId: string, available: boolean, receipt?: { token: string, shown: boolean } }) {
    v.parse(v.object({ characterId: id, sessionId: id, available: v.boolean(), receipt: v.optional(v.object({ token: id, shown: v.boolean() })) }), input)
    const root = this.root(input.characterId)
    let route = this.notifications.get(root)
    if (route && route.owner !== owner) {
      if (route.availableUntil > Date.now())
        return null
      route.pending?.finish(false)
      this.notifications.delete(root)
      await this.runtime.releaseReminders(root, route)
      route = undefined
    }
    if (route?.pending && input.receipt?.token === route.pending.token)
      route.pending.finish(input.receipt.shown)
    if (!route && !input.available)
      return null
    if (!route) {
      if (this.notifications.size >= 32)
        throw new Error('Companion notification route limit reached')
      route = { owner, characterId: input.characterId, sessionId: input.sessionId, availableUntil: 0, scheduler: Promise.resolve({ refresh: async () => {} }) }
      const selected = route
      this.notifications.set(root, selected)
      const notifier = new ReminderNotifications(cliMessages.en.tasks, 'vi', (text, tasks, signal, loop) => {
        if (!signal || selected.availableUntil < Date.now() || selected.pending)
          return Promise.reject(new Error('The desktop is not available for a reminder'))
        return new Promise<void>((resolve, reject) => {
          const abort = () => selected.pending?.finish(false)
          let timer: ReturnType<typeof setTimeout>
          const finish = (shown: boolean) => {
            clearTimeout(timer)
            signal.removeEventListener('abort', abort)
            selected.pending = undefined
            if (shown)
              resolve()
            else
              reject(new Error('The reminder was not presented'))
          }
          timer = setTimeout(finish, 20000, false)
          signal.addEventListener('abort', abort, { once: true })
          selected.pending = { token: randomUUID(), text, signal, tasks, loop, presented: false, finish }
        })
      })
      // Start asynchronously: the scheduler can wait for a later renderer receipt during its initial reconciliation.
      selected.availableUntil = Date.now() + 20000
      selected.scheduler = this.runtime.reminders(root, {
        notify: async (...args) => {
          if (selected.availableUntil < Date.now())
            throw new Error('The desktop is not available for a reminder')
          await notifier.notify(...args)
        },
        notifyOpenLoop: async (...args) => {
          const { snapshot } = await this.records(selected.characterId, { type: 'read' })
          if (selected.availableUntil < Date.now() || !snapshot.enabled || !snapshot.companion.enabled || args[0].workspace !== this.workspace)
            throw new Error('Companion follow-ups are paused')
          await notifier.notifyOpenLoop(...args)
        },
      }, () => {}, selected)
      void selected.scheduler.catch(() => {})
    }
    route.sessionId = input.sessionId
    route.availableUntil = input.available ? Date.now() + 20000 : 0
    const pending = route.pending
    if (!pending || pending.presented)
      return null
    if (pending.loop) {
      const current = await this.records(input.characterId, { type: 'read' })
      if (!current.snapshot.enabled || !current.snapshot.companion.enabled) {
        pending.finish(false)
        return null
      }
    }
    if (!route.availableUntil || [...this.requests.values()].some(request => request.owner === owner)) {
      pending.finish(false)
      return null
    }
    pending.signal.throwIfAborted()
    const options = { dataDir: root, workspace: this.workspace, sessionId: route.sessionId, characterId: route.characterId, channel: 'desktop' as const }
    if (pending.loop)
      await this.runtime.mentionOpenLoop(options, pending.loop)
    else
      await this.runtime.mentionCommitments(options, pending.tasks)
    pending.presented = true
    return { token: pending.token, text: pending.text }
  }

  async disconnect(owner: number) {
    for (const [root, route] of this.notifications) {
      if (route.owner !== owner)
        continue
      route.pending?.finish(false)
      this.notifications.delete(root)
      await this.runtime.releaseReminders(root, route)
    }
    await Promise.all([...this.requests.entries()].filter(([, request]) => request.owner === owner).map(async ([key, request]) => {
      request.abort.abort(new Error('Companion window closed'))
      request.ready.reject(request.abort.signal.reason)
      request.release.reject(request.abort.signal.reason)
      await request.done.catch(() => {})
      this.requests.delete(key)
    }))
  }

  async close() {
    await Promise.all([...new Set([...this.requests.values(), ...this.notifications.values()].map(entry => entry.owner))].map(owner => this.disconnect(owner)))
    await this.runtime.close()
  }
}
