import type { ProactiveCandidate } from './proactive-candidate'
import type { Task } from './task-schema'

import { proactiveCandidate } from './proactive-candidate'
import { localDate, localInstant } from './task-time'

/** Deferral preserves the pending occurrence. Priority affects ordering without changing its scheduled time. */
export interface ProactiveDecision {
  notify: boolean
  nextAt?: number
  priority: number
  reason?: 'irrelevant' | 'already_prompted' | 'low_confidence' | 'expired' | 'deferred' | 'ready'
  candidate?: ProactiveCandidate
}

/** Quiet hours use local whole hours. The same start and end disables the quiet interval. */
export interface ProactiveOptions {
  quietHours?: { start: number, end: number }
  /** Per-task cooldown in milliseconds. Explicit snoozes remain pending until the cooldown expires. @default 0 */
  cooldownMs?: number
  /** Follow-ups wait for a quiet conversation boundary. Explicit alarms retain their due time. @default 120000 */
  recentActivityMs?: number
  /** Bounds follow-up bursts per task store, including offline recovery. @default 1800000 */
  followUpCooldownMs?: number
}

/** Activity belongs to one scheduler's task store, never a shared policy singleton. */
export interface ProactiveActivity {
  lastActivityAt?: number
  lastFollowUpAt?: number
  followUpClaimUntil?: number
}

/** Pure notification policy. The scheduler owns persistence and claims, while presentation adapters own message output. */
export class ProactivePolicy {
  constructor(private readonly options: ProactiveOptions = {}) {
    const quiet = options.quietHours
    if (quiet && (![quiet.start, quiet.end].every(hour => Number.isInteger(hour) && hour >= 0 && hour <= 23)))
      throw new RangeError('Quiet hours must use whole hours from 0 to 23')
    if (options.cooldownMs !== undefined && (!Number.isSafeInteger(options.cooldownMs) || options.cooldownMs < 0))
      throw new RangeError('Cooldown must use non-negative milliseconds')
    for (const value of [options.recentActivityMs, options.followUpCooldownMs]) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
        throw new RangeError('Activity and follow-up intervals must use non-negative milliseconds')
    }
  }

  get followUpCooldownMs() {
    return this.options.followUpCooldownMs ?? 1_800_000
  }

  evaluate(task: Task, now: number, activity: ProactiveActivity = {}): ProactiveDecision {
    const candidate = proactiveCandidate(task, now)
    return candidate ? this.evaluateCandidate(candidate, now, task.timezone, activity) : { notify: false, priority: 0, reason: 'irrelevant' }
  }

  /** The scheduler revalidates the authoritative task under a lease before presentation. Policy remains deterministic and explainable. */
  evaluateCandidate(candidate: ProactiveCandidate, now: number, timezone: string, activity: ProactiveActivity = {}): ProactiveDecision {
    const { priority } = candidate
    if (!candidate.relevant)
      return { notify: false, priority, candidate, reason: 'irrelevant' }
    if (candidate.alreadyPrompted)
      return { notify: false, priority, candidate, reason: 'already_prompted' }
    if (!Number.isFinite(candidate.confidence) || candidate.confidence < 0.95)
      return { notify: false, priority, candidate, reason: 'low_confidence' }
    if (candidate.expiresAt !== undefined && candidate.expiresAt <= now)
      return { notify: false, priority, candidate, reason: 'expired' }
    if (candidate.earliestAt === undefined || !Number.isFinite(candidate.earliestAt))
      return { notify: false, priority, candidate, reason: 'irrelevant' }
    let nextAt = candidate.earliestAt
    if (candidate.lastPromptedAt !== undefined)
      nextAt = Math.max(nextAt, candidate.lastPromptedAt + (this.options.cooldownMs ?? 0))
    if (candidate.reason === 'explicit_follow_up') {
      if (activity.lastActivityAt !== undefined)
        nextAt = Math.max(nextAt, activity.lastActivityAt + (this.options.recentActivityMs ?? 120_000))
      if (activity.lastFollowUpAt !== undefined)
        nextAt = Math.max(nextAt, activity.lastFollowUpAt + this.followUpCooldownMs)
      if (activity.followUpClaimUntil !== undefined)
        nextAt = Math.max(nextAt, activity.followUpClaimUntil)
    }
    const quiet = this.options.quietHours
    if (quiet && quiet.start !== quiet.end) {
      const hour = Number(new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(now))
      const overnight = quiet.start > quiet.end
      if (overnight ? hour >= quiet.start || hour < quiet.end : hour >= quiet.start && hour < quiet.end) {
        const day = Date.parse(`${localDate(now, timezone)}T00:00:00Z`) + (overnight && hour >= quiet.start ? 86_400_000 : 0)
        nextAt = Math.max(nextAt, localInstant(day + quiet.end * 3_600_000, timezone))
      }
    }
    if (candidate.expiresAt !== undefined)
      nextAt = Math.min(nextAt, candidate.expiresAt)
    return { notify: nextAt <= now, nextAt, priority, candidate, reason: nextAt <= now ? 'ready' : 'deferred' }
  }
}
