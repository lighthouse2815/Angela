import type { Task } from './task-schema'
import type { Tasks } from './tasks'

import { ProactivePolicy } from './proactive-policy'
import { taskDue } from './task-time'
import { deliveryLeaseMs } from './tasks'

/** Resolution confirms text presentation. Implementations must honor cancellation and run verify immediately before the external side effect. */
export interface ReminderNotifier {
  notify: (tasks: readonly Task[], overdue: boolean, signal: AbortSignal, verify?: () => Promise<void>) => Promise<void>
}

/** Owns one timer and serial delivery with renewable leases. Close cancels presentation and releases unacknowledged claims for restart. */
export class ReminderScheduler {
  private readonly lifetime = new AbortController()
  private timer?: ReturnType<typeof setTimeout>
  private unsubscribe?: () => void
  private refreshing?: Promise<void>
  private dirty = false
  private started = false
  private startup = true
  private reportedError = false

  constructor(private readonly tasks: Tasks, private readonly notifier: ReminderNotifier, private readonly onError: (error: unknown) => void, private readonly scheduleShared?: (delay: number) => void, private readonly policy = new ProactivePolicy()) {}

  async start() {
    if (this.started || this.lifetime.signal.aborted)
      return
    this.started = true
    this.unsubscribe = this.tasks.subscribe(() => {
      void this.refresh()
    })
    await this.refresh()
  }

  /** Coalesces local mutations during delivery. External writers and clock changes reconcile within one minute. */
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
    })().finally(() => {
      this.refreshing = undefined
      if (this.dirty && !this.lifetime.signal.aborted)
        void this.refresh()
    })
    await this.refreshing
  }

  async close() {
    this.lifetime.abort()
    this.unsubscribe?.()
    this.unsubscribe = undefined
    clearTimeout(this.timer)
    this.timer = undefined
    await this.refreshing
  }

  private async run() {
    const claimed: Task[] = []
    try {
      const candidates = (await this.tasks.list()).map(task => ({ task, decision: this.policy.evaluate(task, this.tasks.now()) })).sort((a, b) => b.decision.priority - a.decision.priority)
      for (const { task, decision } of candidates) {
        if (this.lifetime.signal.aborted)
          return
        if (!decision.notify)
          continue
        const current = await this.tasks.claim(task.id, taskDue(task)!)
        if (current)
          claimed.push(current)
      }
      const overdue = this.startup
      this.startup = false
      if (claimed.length)
        await this.deliver(claimed, overdue)
    }
    finally {
      // Tokens make this cleanup harmless after acknowledgment, cancellation, edits, or a newer owner's claim.
      for (const task of claimed) {
        if (task.delivery?.status === 'claimed')
          await this.tasks.retry(task.id, task.delivery.token, this.lifetime.signal.aborted)
      }
    }
    const next = (await this.tasks.list()).map(task => this.policy.evaluate(task, this.tasks.now()).nextAt).filter(value => value !== undefined).sort((a, b) => a - b)[0]
    this.schedule(next === undefined ? 60_000 : Math.min(60_000, Math.max(0, next - this.tasks.now())))
  }

  private async deliver(claimed: Task[], overdue: boolean) {
    const lease = new AbortController()
    const signal = AbortSignal.any([this.lifetime.signal, lease.signal])
    let heartbeat: ReturnType<typeof setTimeout> | undefined
    let expiry: ReturnType<typeof setTimeout> | undefined
    let renewing: Promise<void> = Promise.resolve()
    const verify = async () => {
      signal.throwIfAborted()
      for (const task of claimed) {
        if (task.delivery?.status !== 'claimed' || !await this.tasks.renew(task.id, task.delivery.token))
          throw new Error('Reminder claim expired or changed')
      }
      signal.throwIfAborted()
      clearTimeout(expiry)
      expiry = setTimeout(() => lease.abort(new Error('Reminder lease expired')), deliveryLeaseMs)
      expiry.unref()
    }
    const renew = () => {
      renewing = renewing.then(verify).then(() => {
        if (!signal.aborted)
          heartbeat = setTimeout(renew, deliveryLeaseMs / 3)
        heartbeat?.unref()
      }).catch((error: unknown) => lease.abort(error))
    }
    try {
      await verify()
      heartbeat = setTimeout(renew, deliveryLeaseMs / 3)
      heartbeat.unref()
      await this.notifier.notify(claimed, overdue, signal, async () => {
        await renewing
        await verify()
      })
      await renewing
      // Cancellation wins over a notifier that settles while stopping. Uncertain presentation remains retryable.
      signal.throwIfAborted()
      for (const task of claimed) {
        if (task.delivery?.status === 'claimed')
          await this.tasks.delivered(task.id, task.delivery.token)
      }
    }
    finally {
      lease.abort()
      clearTimeout(heartbeat)
      clearTimeout(expiry)
      await renewing
    }
  }

  private schedule(delay: number) {
    if (this.lifetime.signal.aborted)
      return
    if (this.scheduleShared) {
      this.scheduleShared(delay)
      return
    }
    this.timer = setTimeout(() => this.refresh(), delay)
    this.timer.unref()
  }
}
