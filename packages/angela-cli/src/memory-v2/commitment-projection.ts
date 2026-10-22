import type { Task } from '../task-schema'
import type { MemoryStore } from './store'

import { taskEvidence } from '../task-commands'

/** Current commitment pages are projections of verified task events. Recovery updates existing identities without resurrecting forgotten content. */
export class CommitmentMemoryProjection {
  constructor(private readonly store: MemoryStore, private readonly scope: string) {}

  /** Host-owned task provenance permits recovery after a failed initial projection without broadening memory consent. */
  apply(task: Task) {
    const key = `commitment:${task.id}`
    const previous = this.store.current(this.scope, 'episodic', key)
    const sourceSessionId = task.memoryProjection?.scope === this.scope ? task.memoryProjection.sourceSessionId : undefined
    const body = taskEvidence(task)
    const timestamp = task.updatedAt
    if ((!previous && !sourceSessionId) || previous?.body === body)
      return previous
    const sessionId = previous?.sourceSessionId ?? sourceSessionId
    if (sessionId && this.store.suppressed(this.scope, sessionId))
      return previous
    return this.store.write({ tier: 'episodic', kind: 'commitment', scope: this.scope, key, title: `Commitment ${task.id}`, body, authority: 'verified', sourceSessionId: sessionId }, timestamp)
  }
}
