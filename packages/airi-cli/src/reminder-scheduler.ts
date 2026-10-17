import type { Task } from './task-schema'
import type { Tasks } from './tasks'

import { deliveryDue, taskDue } from './task-time'
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
    clearTimeout(this.timer)
    await this.refreshing
  }

  private async run() {
    const claimed: Task[] = []
    try {
      for (const task of await this.tasks.list()) {
        if (this.lifetime.signal.aborted)
          return
        const due = deliveryDue(task)
        if (due === undefined || due > this.tasks.now())
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
    const next = (await this.tasks.list()).map(deliveryDue).filter(value => value !== undefined).sort((a, b) => a - b)[0]
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
    }
    const renew = () => {
      renewing = renewing.then(verify).then(() => {
        if (!signal.aborted)
          heartbeat = setTimeout(renew, deliveryLeaseMs / 3)
      }).catch((error: unknown) => lease.abort(error))
    }
    try {
      await verify()
      heartbeat = setTimeout(renew, deliveryLeaseMs / 3)
      await this.notifier.notify(claimed, overdue, signal, async () => {
        await renewing
        await verify()
      })
      await renewing
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
    this.timer = setTimeout(() => this.refresh(), delay)
    this.timer.unref()
  }
}
