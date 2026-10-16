import type { Task } from './task-schema'
import type { Tasks } from './tasks'

import { taskDue } from './task-time'

/** Delivery owns presentation and channels. The scheduler supplies a batch of atomically claimed occurrences. */
export interface ReminderNotifier {
  notify: (tasks: readonly Task[], overdue: boolean, signal: AbortSignal) => Promise<void>
}

/**
 * Owns one nearest-deadline timer and a serial refresh loop. Start is idempotent. Close cancels and drains delivery.
 * Claims persist before external delivery, so normal restart and competing CLI hosts cannot replay an occurrence.
 */
export class ReminderScheduler {
  private readonly lifetime = new AbortController()
  private timer?: ReturnType<typeof setTimeout>
  private unsubscribe?: () => void
  private refreshing?: Promise<void>
  private dirty = false
  private started = false
  private startup = true
  private reportedError = false

  constructor(private readonly tasks: Tasks, private readonly notifier: ReminderNotifier, private readonly onError: (error: unknown) => void) {}

  async start() {
    if (this.started || this.lifetime.signal.aborted)
      return
    this.started = true
    this.unsubscribe = this.tasks.subscribe(() => {
      void this.refresh()
    })
    await this.refresh()
  }

  /** Coalesces mutations during disk reads or delivery. The public operation also supports explicit recovery checks. */
  async refresh(): Promise<void> {
    if (!this.started || this.lifetime.signal.aborted)
      return
    this.dirty = true
    if (this.refreshing)
      return await this.refreshing
    this.refreshing = (async () => {
      while (this.dirty && !this.lifetime.signal.aborted) {
        this.dirty = false
        clearTimeout(this.timer)
        try {
          await this.run()
          this.reportedError = false
        }
        catch (error) {
          if (!this.lifetime.signal.aborted && !this.reportedError) {
            this.reportedError = true
            this.onError(error)
          }
          this.schedule(60_000)
        }
      }
    })().finally(() => { this.refreshing = undefined })
    await this.refreshing
  }

  async close() {
    this.lifetime.abort()
    this.unsubscribe?.()
    clearTimeout(this.timer)
    await this.refreshing
  }

  private async run() {
    const pending = await this.tasks.list()
    const claimed: Task[] = []
    for (const task of pending) {
      if (this.lifetime.signal.aborted)
        return
      const occurrence = taskDue(task)
      if (!occurrence || Date.parse(occurrence) > this.tasks.now() || task.notifiedFor === occurrence)
        continue
      const current = await this.tasks.claim(task.id, occurrence)
      if (current)
        claimed.push(current)
    }
    const overdue = this.startup
    this.startup = false
    if (claimed.length && !this.lifetime.signal.aborted)
      await this.notifier.notify(claimed, overdue, this.lifetime.signal)
    if (this.lifetime.signal.aborted)
      return
    const next = (await this.tasks.list()).filter(task => taskDue(task) && task.notifiedFor !== taskDue(task)).map(task => Date.parse(taskDue(task)!)).sort((a, b) => a - b)[0]
    // Reconcile at most once a minute for wall-clock jumps and edits from other CLI processes.
    // The same bound keeps native timers below the platform overflow limit for distant deadlines.
    this.schedule(next === undefined ? 60_000 : Math.min(60_000, Math.max(0, next - this.tasks.now())))
  }

  private schedule(delay: number) {
    if (this.lifetime.signal.aborted)
      return
    this.timer = setTimeout(() => this.refresh(), delay)
    this.timer.unref()
  }
}
