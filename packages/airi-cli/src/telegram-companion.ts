import type { cliMessages } from '@proj-airi/i18n/cli'
import type { Tool } from '@xsai/shared-chat'

import { Memory } from './memory'
import { Recall } from './recall'
import { ReminderNotifications } from './reminder-notifications'
import { ReminderScheduler } from './reminder-scheduler'
import { taskCommand } from './task-commands'
import { taskContext, taskTools } from './task-tools'
import { Tasks } from './tasks'

/** Owns one private Telegram user's memory, recall and reminder lifecycle. Each instance has a distinct storage root. */
export class TelegramCompanion {
  private readonly tasks: Tasks
  private readonly memory: Memory
  private readonly recall: Recall
  private readonly notifications: ReminderNotifications
  private readonly scheduler: ReminderScheduler
  private recallReady = false

  constructor(dataDir: string, workspace: string, sessionId: string, private readonly messages: typeof cliMessages.en, private readonly locale: string, env: NodeJS.ProcessEnv, defaults: { baseUrl?: string, apiKey: string }, present: (text: string, signal?: AbortSignal) => Promise<void>) {
    this.tasks = new Tasks(dataDir, messages.tasks)
    this.memory = new Memory(dataDir, messages)
    this.recall = new Recall(dataDir, workspace, sessionId, messages, env, defaults)
    this.notifications = new ReminderNotifications(messages.tasks, locale, (text, _tasks, signal) => present(text, signal))
    this.scheduler = new ReminderScheduler(this.tasks, this.notifications, () => {
      // A transient Telegram outage must not turn into an unhandled rejection or acknowledge the occurrence.
      void present(messages.tasks.failed).catch(() => {})
    })
  }

  async start() {
    try {
      await this.recall.start()
      this.recallReady = true
    }
    catch {
      await this.recall.close()
    }
    await this.scheduler.start()
  }

  /** Commands only access this user's stores. Remote skill commands cannot import arbitrary files from the host. */
  async command(text: string) {
    if (/^\/skills (?:import|edit)(?:\s|$)/u.test(text))
      return this.messages.telegramLocalSkills
    const response = await taskCommand(text, this.tasks, this.messages.tasks, this.locale)
      ?? (this.recallReady ? await this.recall.command(text) ?? await this.recall.skills.command(text) : undefined)
      ?? await this.memory.command(text)
    if (response !== undefined && this.recallReady && /^\/(?:remember |forget |memory (?:edit |pin |unpin |auto |on$|off$)|skills (?:forget |on|off))/u.test(text))
      await this.recall.changed()
    return response
  }

  /** Builds request-local context and validated tools. Notifications wait until the generation and its approvals finish. */
  async prepare(text: string, sessionId: string, signal: AbortSignal) {
    this.notifications.pause()
    const tools: Tool[] = [...taskTools(this.tasks, this.messages.tasks)]
    const context = [taskContext(this.tasks, 'telegram')]
    try {
      tools.push(...await this.memory.tools(text, sessionId))
      if (this.recallReady) {
        const prepared = await this.recall.prepare(text, signal)
        context.push(prepared.context)
        if (prepared.warning)
          context.push(prepared.warning)
        tools.push(...this.recall.tools(), ...this.recall.skills.tools(text, [], sessionId, () => this.recall.changed(false)))
      }
      else {
        const state = await this.memory.read()
        context.push(await this.memory.context(state.entries.filter(entry => entry.core).map(entry => entry.id)))
      }
    }
    catch {
      signal.throwIfAborted()
      context.push(this.messages.memoryUnavailable)
    }
    return { tools, context: context.join('\n\n') }
  }

  /** Resumes delivery even when indexing fails after a generation. Source files remain authoritative. */
  async finish() {
    this.notifications.resume()
    if (this.recallReady)
      await this.recall.changed(false).catch(() => {})
  }

  async close() {
    await this.scheduler.close()
    await this.recall.close()
  }
}
