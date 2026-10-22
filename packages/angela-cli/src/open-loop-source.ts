import type { Clock } from './clock'
import type { OpenLoops } from './open-loops'
import type { ProactiveActivity, ProactivePolicy } from './proactive-policy'
import type { ProactiveSource, ReminderNotifier } from './reminder-scheduler'
import type { Task } from './task-schema'
import type { Tasks } from './tasks'

/** Extends the existing scheduler with bounded candidates. Task delivery runs first and survives every failure in this source. */
export class OpenLoopSource implements ProactiveSource {
  constructor(private readonly loops: OpenLoops, private readonly clock: Clock, private readonly timezone: string, private readonly policy: ProactivePolicy, private readonly notifier: ReminderNotifier, private readonly allowed: () => Promise<boolean>, private readonly candidateObserved: (id: string) => void = () => {}, private readonly taskStore?: Tasks) {}

  async refresh(signal: AbortSignal, activity: ProactiveActivity, tasks: readonly Task[]) {
    if (!this.notifier.notifyOpenLoop || !await this.allowed())
      return
    await this.loops.reconcile(tasks)
    const persisted = await this.loops.activity()
    const combined = { ...activity, lastActivityAt: Math.max(activity.lastActivityAt ?? 0, persisted.lastActivityAt ?? 0), lastFollowUpAt: Math.max(activity.lastFollowUpAt ?? 0, persisted.lastFollowUpAt ?? 0) || undefined }
    for (const loop of (await this.loops.list()).slice(0, 80)) {
      signal.throwIfAborted()
      const candidate = this.loops.candidate(loop)
      if (!this.policy.evaluateCandidate(candidate, this.clock.now(), this.timezone, combined).notify)
        continue
      this.candidateObserved(candidate.id)
      const claimed = await this.loops.claim(loop.id)
      if (!claimed?.claim)
        continue
      const token = claimed.claim.token
      let presented = false
      const deliverySignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      try {
        await this.notifier.notifyOpenLoop(claimed, deliverySignal, async () => {
          deliverySignal.throwIfAborted()
          if (presented)
            throw new Error('Open loop presentation already consumed')
          if (!await this.allowed())
            throw new Error('Open loop privacy changed')
          await this.loops.reconcile(this.taskStore ? await this.taskStore.list({ status: 'all' }) : tasks)
          const latestActivity = await this.loops.activity()
          const fresh = (await this.loops.list()).find(item => item.id === loop.id)
          if (!fresh)
            throw new Error('Open loop was removed')
          const current = { ...fresh, claim: undefined }
          const decision = this.policy.evaluateCandidate(this.loops.candidate(current), this.clock.now(), this.timezone, { ...combined, lastActivityAt: Math.max(combined.lastActivityAt, latestActivity.lastActivityAt ?? 0) })
          if (!decision.notify || !await this.loops.present(loop.id, token))
            throw new Error('Open loop claim expired or changed')
          presented = true
          deliverySignal.throwIfAborted()
        })
        if (!presented)
          throw new Error('Open loop notifier did not verify presentation')
      }
      finally {
        await this.loops.retry(loop.id, token)
      }
      break
    }
  }
}
