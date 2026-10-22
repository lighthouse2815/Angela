import type { Task } from './task-schema'

import { deliveryDue, localDate, localInstant } from './task-time'

/** Deferral preserves the pending occurrence. Priority affects ordering without changing its scheduled time. */
export interface ProactiveDecision {
  notify: boolean
  nextAt?: number
  priority: number
}

/** Quiet hours use local whole hours. The same start and end disables the quiet interval. */
export interface ProactiveOptions {
  quietHours?: { start: number, end: number }
  /** Per-task cooldown in milliseconds. Explicit snoozes remain pending until the cooldown expires. @default 0 */
  cooldownMs?: number
}

/** Pure notification policy. The scheduler owns persistence and claims, while presentation adapters own message output. */
export class ProactivePolicy {
  constructor(private readonly options: ProactiveOptions = {}) {
    const quiet = options.quietHours
    if (quiet && (![quiet.start, quiet.end].every(hour => Number.isInteger(hour) && hour >= 0 && hour <= 23)))
      throw new RangeError('Quiet hours must use whole hours from 0 to 23')
    if (options.cooldownMs !== undefined && (!Number.isSafeInteger(options.cooldownMs) || options.cooldownMs < 0))
      throw new RangeError('Cooldown must use non-negative milliseconds')
  }

  evaluate(task: Task, now: number): ProactiveDecision {
    const priority = task.type === 'deadline' ? 2 : task.type === 'follow_up' ? 0 : 1
    const due = deliveryDue(task)
    if (due === undefined)
      return { notify: false, priority }
    let nextAt = due
    if (task.lastNotifiedAt)
      nextAt = Math.max(nextAt, Date.parse(task.lastNotifiedAt) + (this.options.cooldownMs ?? 0))
    const quiet = this.options.quietHours
    if (quiet && quiet.start !== quiet.end) {
      const hour = Number(new Intl.DateTimeFormat('en', { timeZone: task.timezone, hour: '2-digit', hourCycle: 'h23' }).format(now))
      const overnight = quiet.start > quiet.end
      if (overnight ? hour >= quiet.start || hour < quiet.end : hour >= quiet.start && hour < quiet.end) {
        const day = Date.parse(`${localDate(now, task.timezone)}T00:00:00Z`) + (overnight && hour >= quiet.start ? 86_400_000 : 0)
        nextAt = Math.max(nextAt, localInstant(day + quiet.end * 3_600_000, task.timezone))
      }
    }
    return { notify: nextAt <= now, nextAt, priority }
  }
}
