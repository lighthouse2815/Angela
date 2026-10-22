import type { AngelaEvent } from '../runtime/events'
import type { MemoryStore } from './store'
import type { MemoryPage, Observation } from './types'

import { createHash } from 'node:crypto'

import { keepTokens } from './policy'
import { sanitize } from './sanitize'

/** Zero-provider session compiler. Replays produce the same page, with bounded evidence and explicit source labels. */
export class MemoryConsolidator {
  constructor(private readonly store: MemoryStore) {}

  consolidate(scope: string, sessionId: string) {
    const observations = this.store.observations(scope, sessionId)
    const substantive = observations.filter(item => item.text && item.type !== 'session.started' && item.type !== 'session.ended')
    if (!substantive.length)
      return undefined
    const previous = this.store.current(scope, 'episodic', `session:${sessionId}`)
    const goal = previous?.abstract || substantive.find(item => item.type === 'user.message')?.text.slice(0, 500) || 'Session activity'
    const groups = new Map<string, string[]>()
    const append = (label: string, text: string) => {
      let values = groups.get(label)
      if (!values) {
        values = []
        groups.set(label, values)
      }
      if (!values.includes(text))
        values.push(text)
      if (values.length > (label === 'Artifact' ? 48 : 6))
        values.shift()
    }
    if (previous) {
      for (const line of previous.body.split('\n')) {
        const match = /^(User|Decision|Completed|Task|Failed|Fact|Workflow|Next step|Tool|Commitment|Artifact): (.+)$/u.exec(line)
        if (match)
          append(match[1]!, match[2]!)
      }
    }
    for (const item of substantive) {
      for (const fact of keepTokens(item.text))
        append('Artifact', fact)
      const text = `${item.timestamp.slice(0, 10)} ${item.text.replace(/\s+/gu, ' ').slice(0, 650)}`
      if (item.type === 'user.message')
        append(/\b(?:decid|chọn|quyết định|ưu tiên)/iu.test(item.text) ? 'Decision' : 'User', text)
      else if (item.type === 'tool.error' || item.type === 'request.failed')
        append('Failed', text)
      else if (item.type === 'tool.result' && item.verified)
        append('Tool', text)
      else if (item.type === 'task.completed')
        append('Completed', text)
      else if (item.type === 'task.created' || item.type === 'task.updated')
        append('Task', text)
      else if (item.type === 'project.changed')
        append('Decision', text)
      else if (item.type === 'memory.changed')
        append('Fact', text)
      else if (item.type === 'assistant.message')
        append('Commitment', `Assistant report, unverified: ${text}`)
    }
    const labels = ['Decision', 'Completed', 'Failed', 'Fact', 'Workflow', 'Task', 'Next step', 'Artifact', 'User', 'Tool', 'Commitment']
    const body = [`Goal: ${goal}`, ...labels.flatMap(label => groups.get(label)?.map(text => `${label}: ${text}`) ?? [])].join('\n').slice(0, 24_000)
    return this.store.write({ tier: 'episodic', kind: 'session', scope, key: `session:${sessionId}`, title: goal.slice(0, 160), body, abstract: goal, authority: 'episode', salience: groups.has('Decision') || groups.has('Completed') ? 1.5 : 0.75, sourceSessionId: sessionId, expectedVersion: previous?.version ?? null })
  }

  /** Explicit workflow statements can become procedures without inferring a lasting preference from casual behavior. */
  learn(scope: string, sessionId: string, userText: string, episode: MemoryPage) {
    const workflow = /^(?:workflow|procedure|quy trình)\s*:\s*(.{10,1000})$/iu.exec(userText.trim())?.[1]
    if (!workflow)
      return undefined
    const text = sanitize(workflow, 1000)
    const key = createHash('sha256').update(text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ')).digest('hex')
    const page = this.store.write({ tier: 'procedural', kind: 'workflow', scope, key: `workflow:${key}`, title: text.slice(0, 160), body: text, authority: 'user', salience: 1.5, sourceSessionId: sessionId })
    this.store.link(page.id, episode.id, 'derived_from', scope)
    return page
  }
}

/** A request owns its capture handle. No global listeners can route one user's text into another user's database. */
export class MemoryCapture {
  constructor(private readonly store: MemoryStore, private readonly scope: string, private readonly sessionId: string) {}

  record(event: AngelaEvent, text = '', verified = false) {
    if (event.sessionId !== this.sessionId || event.workspace !== this.scope)
      throw new Error('Observation scope mismatch')
    if (event.type === 'tool.call' || event.type === 'request.completed' || (event.type === 'tool.result' && !verified && event.outcome !== 'failed'))
      return
    if (event.type === 'user.message' && /^(?:hi|hello|hey|chào|xin chào|thanks|ok|ừ|cảm ơn)[!.,\s]*$/iu.test(text.trim()))
      return
    if (event.type === 'assistant.message' && !/\b(?:I will|I'll)\b|tôi sẽ|mình sẽ/iu.test(text))
      return
    const observation: Observation = { id: event.id, type: event.type === 'tool.result' && event.outcome === 'failed' ? 'tool.error' : event.type, correlationId: event.correlationId, sessionId: this.sessionId, scope: this.scope, channel: event.channel ?? 'system', timestamp: event.timestamp, text: sanitize(text), verified }
    this.store.observe(observation)
  }

  finish(userText: string) {
    const consolidator = new MemoryConsolidator(this.store)
    const episode = consolidator.consolidate(this.scope, this.sessionId)
    if (episode)
      consolidator.learn(this.scope, this.sessionId, userText, episode)
    return episode
  }
}
