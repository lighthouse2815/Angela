import type { AngelaEvent } from '../runtime/events'
import type { Observation } from './types'

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it } from 'vitest'

import { RecallIndex } from '../recall-index'
import { MemoryCapture, MemoryConsolidator } from './consolidator'

const resources: { index: RecallIndex, directory: string }[] = []
afterEach(async () => {
  for (const { index, directory } of resources.splice(0)) {
    index.close()
    await rm(directory, { recursive: true, force: true })
  }
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-consolidation-'))
  const index = await RecallIndex.open(directory)
  resources.push({ index, directory })
  return { index, store: index.memory, consolidator: new MemoryConsolidator(index.memory) }
}

const base: Observation = { id: 'one', type: 'user.message', correlationId: 'request', sessionId: 'session', scope: 'workspace', channel: 'cli', timestamp: '2026-10-22T00:00:00.000Z', text: 'Build a SQLite memory system', verified: false }

it('consolidates without a model and distinguishes verified results, failures, decisions, and commitments', async () => {
  const { store, consolidator, index } = await setup()
  const rows = [
    base,
    { ...base, id: 'two', text: 'We decided to use SQLite' },
    { ...base, id: 'three', type: 'tool.result', verified: true, text: 'Tests passed in src/memory.ts' },
    { ...base, id: 'four', type: 'tool.error', text: 'HTTP 500 during indexing' },
    { ...base, id: 'five', type: 'assistant.message', text: 'I will check the failing index' },
    { ...base, id: 'six', type: 'tool.result', text: 'All done (unverified)' },
  ]
  for (const row of rows)
    store.observe(row)
  const page = consolidator.consolidate('workspace', 'session')!
  expect(page.body).toContain('Goal: Build a SQLite memory system')
  expect(page.body).toContain('Decision:')
  expect(page.body).toContain('Failed:')
  expect(page.body).toContain('Tool:')
  expect(page.body).toContain('Assistant report, unverified')
  expect(page.body).not.toContain('All done')
  expect(index.search('HTTP 500', 'workspace')[0]?.kind).toBe('episodic')
  expect(consolidator.consolidate('workspace', 'session')?.id).toBe(page.id)
})

it('skips empty and greeting-only sessions and enforces capture scope', async () => {
  const { store, consolidator } = await setup()
  const capture = new MemoryCapture(store, 'workspace', 'session')
  const event: AngelaEvent = { id: 'greeting', type: 'user.message', sessionId: 'session', workspace: 'workspace', correlationId: 'request', timestamp: base.timestamp, channel: 'cli' }
  capture.record(event, 'Hello')
  expect(consolidator.consolidate('workspace', 'session')).toBeUndefined()
  expect(() => capture.record({ ...event, workspace: 'another' }, 'private')).toThrow('scope')
  expect(store.stats().observations).toBe(0)
})

it('keeps the original goal after the observation window rolls over and never invents completion', async () => {
  const { store, consolidator } = await setup()
  store.observe(base)
  consolidator.consolidate('workspace', 'session')
  for (let i = 0; i < 270; i++)
    store.observe({ ...base, id: `event-${i}`, text: `Investigate issue ${i}` })
  const page = consolidator.consolidate('workspace', 'session')!
  expect(page.abstract).toBe(base.text)
  expect(page.body).toContain('Investigate issue 269')
  expect(page.body).not.toContain('Completed:')
  expect(page.body.length).toBeLessThanOrEqual(24_000)
})

it('learns only explicit workflow statements and links their source episode', async () => {
  const { store, consolidator } = await setup()
  store.observe(base)
  const episode = consolidator.consolidate('workspace', 'session')!
  expect(consolidator.learn('workspace', 'session', 'I ran tests again', episode)).toBeUndefined()
  const page = consolidator.learn('workspace', 'session', 'Workflow: run targeted tests before each commit', episode)!
  expect(page.tier).toBe('procedural')
  expect(page.authority).toBe('user')
  expect(store.edges(page.id, 'workspace')).toContainEqual({ fromId: page.id, toId: episode.id, relation: 'derived_from' })
})

it('never stores ordinary assistant answers as verified facts or tool success', async () => {
  const { store } = await setup()
  const capture = new MemoryCapture(store, 'workspace', 'session')
  const event = { id: randomUUID(), sessionId: 'session', workspace: 'workspace', correlationId: 'request', timestamp: base.timestamp, channel: 'cli' as const }
  capture.record({ ...event, type: 'assistant.message' }, 'All tests passed and everything is saved')
  capture.record({ ...event, type: 'tool.result', toolCallId: 'call', toolName: 'unknown', outcome: 'unverified' }, 'Succeeded')
  expect(store.stats().observations).toBe(0)
})

it('preserves literal diagnostics outside the prose excerpt before session compaction', async () => {
  const { store, consolidator } = await setup()
  store.observe(base)
  store.observe({ ...base, id: 'long-tool', type: 'tool.result', verified: true, text: `${'routine output '.repeat(100)} HTTP 503 in src/important.ts` })
  const page = consolidator.consolidate('workspace', 'session')!
  expect(page.body).toContain('src/important.ts')
  expect(page.body).toContain('HTTP 503')
})
