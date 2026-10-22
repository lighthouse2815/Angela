import type { Task } from './task-schema'

import { deliveryDue, followUpExpiry, taskDue } from './task-time'

/** A traceable view of an authoritative task occurrence. It has no independent persistence or semantic-memory source. */
export interface ProactiveCandidate {
  id: string
  reason: 'due_commitment' | 'overdue_commitment' | 'explicit_follow_up' | 'implicit_open_loop'
  subject: string
  sourceId: string
  createdAt: string
  earliestAt?: number
  expiresAt?: number
  priority: number
  confidence: number
  relevant: boolean
  alreadyPrompted: boolean
  lastPromptedAt?: number
}

/** Candidate identity uses the task and occurrence. Snoozes create a new occurrence without duplicating the commitment. */
export function proactiveCandidate(task: Task, now: number): (ProactiveCandidate & { reason: 'due_commitment' | 'overdue_commitment' | 'explicit_follow_up' }) | undefined {
  const occurrence = taskDue(task)
  if (!occurrence)
    return undefined
  const due = deliveryDue(task)
  const promptedAt = task.followUp?.lastPromptedAt ?? task.lastNotifiedAt
  return {
    id: `${task.id}:${occurrence}`,
    reason: task.type === 'follow_up' ? 'explicit_follow_up' : Date.parse(occurrence) < now ? 'overdue_commitment' : 'due_commitment',
    subject: task.title,
    sourceId: task.id,
    createdAt: task.createdAt,
    earliestAt: due === undefined ? undefined : Math.max(due, Date.parse(task.followUp?.nextEligibleAt ?? occurrence)),
    expiresAt: followUpExpiry(task),
    priority: task.type === 'deadline' ? 2 : task.type === 'follow_up' ? 0 : 1,
    confidence: 1,
    relevant: task.status === 'pending' && !task.followUp?.resolvedAt,
    alreadyPrompted: task.notifiedFor === occurrence || (task.delivery?.status === 'skipped' && task.delivery.occurrence === occurrence),
    lastPromptedAt: promptedAt ? Date.parse(promptedAt) : undefined,
  }
}
