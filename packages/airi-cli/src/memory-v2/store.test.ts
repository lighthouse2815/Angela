import type { Observation, PageInput } from './types'

import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, expect, it } from 'vitest'

import { RecallIndex } from '../recall-index'
import { compact, retention } from './policy'
import { sanitize } from './sanitize'

const stores: { index: RecallIndex, directory: string }[] = []
afterEach(async () => {
  for (const { index, directory } of stores.splice(0)) {
    index.close()
    await rm(directory, { recursive: true, force: true })
  }
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-pages-'))
  const index = await RecallIndex.open(directory)
  stores.push({ index, directory })
  return { index, store: index.memory, directory }
}

const input: PageInput = { tier: 'semantic', scope: 'workspace', kind: 'preference', key: 'framework', title: 'Preferred framework', body: 'The user prefers React', authority: 'user' }
const observation: Observation = { id: 'event-1', type: 'user.message', correlationId: 'request-1', sessionId: 'session-1', scope: 'workspace', channel: 'cli', timestamp: '2026-01-01T00:00:00.000Z', text: 'Please use SQLite', verified: false }

it('indexes an accepted page in the same commit and reopens its authoritative record', async () => {
  const { store, index, directory } = await setup()
  const page = store.write(input)
  expect(index.search('React', 'workspace')[0]?.id).toBe(`memory:${page.id}`)
  const reader = await RecallIndex.open(directory)
  try {
    expect(reader.memory.read(page.id, 'workspace')).toEqual(page)
  }
  finally {
    reader.close()
  }
})

it('supersedes old knowledge atomically and keeps it out of default retrieval', async () => {
  const { store, index } = await setup()
  const old = store.write(input)
  const current = store.write({ ...input, body: 'The user now prefers Vue' })
  expect(store.read(old.id, 'workspace')).toBeUndefined()
  expect(store.read(old.id, 'workspace', true)?.supersededBy).toBe(current.id)
  expect(store.edges(current.id, 'workspace')).toContainEqual({ fromId: current.id, toId: old.id, relation: 'supersedes' })
  expect(index.search('React', 'workspace')).toEqual([])
  expect(index.search('Vue', 'workspace')[0]?.id).toBe(`memory:${current.id}`)
})

it('rejects weaker inference without losing the current claim or index', async () => {
  const { store, index } = await setup()
  const original = store.write(input)
  expect(() => store.write({ ...input, authority: 'inference', body: 'Actually Angular' })).toThrow('authority')
  expect(store.current('workspace', 'semantic', 'framework')?.id).toBe(original.id)
  expect(index.search('React', 'workspace')).toHaveLength(1)
})

it('does not overwrite pinned explicit memory through automatic consolidation', async () => {
  const { store } = await setup()
  store.write({ ...input, pinned: true })
  expect(() => store.write({ ...input, authority: 'consolidated', body: 'Angular' })).toThrow('authority')
  expect(store.write({ ...input, body: 'Vue' }).body).toBe('Vue')
})

it('records contradictions without deleting either claim and rejects cross-scope edges', async () => {
  const { store } = await setup()
  const a = store.write(input)
  const b = store.write({ ...input, key: 'claim-b', body: 'The user prefers Vue' })
  store.link(a.id, b.id, 'contradicts', 'workspace')
  expect(store.edges(a.id, 'workspace')).toHaveLength(1)
  expect(store.read(a.id, 'workspace')).toBeDefined()
  expect(store.read(b.id, 'workspace')).toBeDefined()
  const c = store.write({ ...input, scope: 'other' })
  expect(() => store.link(a.id, c.id, 'related_to', 'workspace')).toThrow('scope')
  expect(store.read(a.id, 'other')).toBeUndefined()
})

it('reinforces once per minute in SQL without invalidating vectors or content versions', async () => {
  const { store, index } = await setup()
  const page = store.write(input)
  index.vectors('test:model:2', [{ id: `memory:${page.id}`, version: page.version, vector: new Float32Array([1, 0]) }])
  const now = Date.now()
  store.reinforce([page.id, page.id, 'missing'], 'workspace', now)
  store.reinforce([page.id], 'other', now + 60_000)
  store.reinforce([page.id], 'workspace', now + 59_999)
  expect(store.read(page.id, 'workspace')?.accessCount).toBe(1)
  store.reinforce([page.id], 'workspace', now + 60_000)
  expect(store.read(page.id, 'workspace')?.accessCount).toBe(2)
  expect(store.read(page.id, 'workspace')?.version).toBe(page.version)
  expect(index.stats('test:model:2', 2).vectors).toBe(1)
})

it('carries reinforcement through revisions of the same session checkpoint', async () => {
  const { store } = await setup()
  const first = store.write({ ...input, tier: 'episodic', kind: 'session', sourceSessionId: 'session' })
  const now = Date.now()
  store.reinforce([first.id], 'workspace', now)
  const second = store.write({ ...input, tier: 'episodic', kind: 'session', sourceSessionId: 'session', body: 'The session made further progress' })
  store.reinforce([second.id], 'workspace', now + 1000)
  expect(store.read(second.id, 'workspace')?.accessCount).toBe(1)
  expect(store.read(second.id, 'workspace')?.lastAccessedAt).toBe(new Date(now).toISOString())
})

it('retains unchanged vectors and rejects stale embedding writes after content invalidation', async () => {
  const { index } = await setup()
  const hit = { id: 'history:fixture', kind: 'history' as const, scope: 'workspace', text: 'Same source text', updatedAt: '' }
  index.replace('history:fixture', 'v1', [hit])
  index.vectors('fixture:2', [{ id: hit.id, version: 'v1', vector: new Float32Array([1, 0]) }])
  index.replace('history:fixture', 'v2', [hit])
  expect(index.stats('fixture:2', 2).vectors).toBe(1)
  index.replace('history:fixture', 'v3', [{ ...hit, text: 'Changed source text' }])
  index.vectors('fixture:2', [{ id: hit.id, version: 'v2', vector: new Float32Array([1, 0]) }])
  expect(index.stats('fixture:2', 2).vectors).toBe(0)
})

it('bounds salience and rejects invalid values before mutation', async () => {
  const { store } = await setup()
  expect(store.write({ ...input, salience: 99 }).salience).toBe(2)
  expect(store.write({ ...input, salience: -2 }).salience).toBe(0.25)
  expect(() => store.write({ ...input, salience: Number.NaN })).toThrow()
})

it('does not duplicate replayed writes or observations and bounds the working capture window', async () => {
  const { store } = await setup()
  const first = store.write(input)
  expect(store.write(input).id).toBe(first.id)
  for (let i = 0; i < 300; i++)
    store.observe({ ...observation, id: `event-${i}` })
  store.observe({ ...observation, id: 'event-299' })
  expect(store.observations('workspace', 'session-1')).toHaveLength(256)
  expect(store.observations('other', 'session-1')).toEqual([])
})

it('sanitizes observations and pages before durable writes, including secrets beyond the clipping boundary', async () => {
  const { store, directory } = await setup()
  const credential = 'ghp_abcdefghijklmnopqrstuvwxyz123456'
  store.observe({ ...observation, text: `password="do not save this" ${credential}\n${'a'.repeat(5000)}` })
  const page = store.write({ ...input, body: `API_KEY="neverstorethis" ${credential}` })
  expect(page.body).not.toContain(credential)
  expect(store.observations('workspace', 'session-1')[0]?.text.length).toBeLessThanOrEqual(4000)
  const bytes = await readFile(join(directory, 'memory', 'recall.sqlite'))
  expect(bytes.includes(Buffer.from(credential))).toBe(false)
  expect(bytes.includes(Buffer.from('do not save this'))).toBe(false)
})

it('purges all claim versions, derived pages, vectors and edges without touching unrelated knowledge', async () => {
  const { store, index } = await setup()
  const a = store.write(input)
  const b = store.write({ ...input, body: 'The user prefers Vue' })
  const derived = store.write({ ...input, key: 'derived', body: 'Workflow using Vue', tier: 'procedural', authority: 'consolidated' })
  store.link(derived.id, b.id, 'derived_from', 'workspace')
  const unrelated = store.write({ ...input, key: 'other', body: 'The user uses Linux' })
  store.purge(a.id, 'workspace')
  expect(store.read(b.id, 'workspace', true)).toBeUndefined()
  expect(store.read(derived.id, 'workspace')).toBeUndefined()
  expect(index.search('Vue React', 'workspace')).toEqual([])
  expect(store.read(unrelated.id, 'workspace')).toBeDefined()
})

it('purges later versions of derived knowledge and prevents replay of every contributing session', async () => {
  const { store, index } = await setup()
  const root = store.write({ ...input, sourceSessionId: 'root-session' })
  const old = store.write({ ...input, key: 'derived', body: 'Derived old knowledge', authority: 'consolidated', sourceSessionId: 'derived-old' })
  store.link(old.id, root.id, 'derived_from', 'workspace')
  const current = store.write({ ...input, key: 'derived', body: 'Derived current knowledge', authority: 'consolidated', sourceSessionId: 'derived-current' })
  for (const sessionId of ['derived-old', 'derived-current'])
    store.observe({ ...observation, id: sessionId, sessionId, text: 'The original claim supports this inference' })
  store.purge(root.id, 'workspace')
  expect(store.read(current.id, 'workspace', true)).toBeUndefined()
  expect(index.search('Derived', 'workspace')).toEqual([])
  for (const sessionId of ['derived-old', 'derived-current']) {
    expect(store.observations('workspace', sessionId)).toEqual([])
    expect(store.suppressed('workspace', sessionId)).toBe(true)
  }
})

it('forgets captured copies and prevents late session replay from restoring them', async () => {
  const { store, index } = await setup()
  store.observe({ ...observation, text: input.body })
  store.write({ ...input, sourceSessionId: observation.sessionId })
  store.forgetText(input.body)
  store.observe({ ...observation, id: 'late-event', text: input.body })
  expect(store.observations('workspace', observation.sessionId)).toEqual([])
  expect(index.search('React', 'workspace')).toEqual([])
})

it('allows fresh requests after forgetting while rejecting late results from an older correlation', async () => {
  const { store } = await setup()
  store.observe(observation)
  store.forgetText(observation.text)
  const later = new Date(Date.now() + 1000).toISOString()
  store.observe({ ...observation, id: 'late-result', timestamp: later })
  expect(store.observations('workspace', 'session-1')).toEqual([])
  store.observe({ ...observation, id: 'fresh-message', correlationId: 'new-request', timestamp: later, text: 'Build the next project' })
  expect(store.observations('workspace', 'session-1')).toHaveLength(1)
  expect(store.suppressed('workspace', 'session-1')).toBe(true)
})

it('keeps later independent explicit knowledge when deleting its former source session', async () => {
  const { store } = await setup()
  const root = store.write({ ...input, key: 'episode', tier: 'episodic', sourceSessionId: 'removed-session' })
  const old = store.write({ ...input, key: 'derived', authority: 'consolidated', sourceSessionId: 'removed-session' })
  store.link(old.id, root.id, 'derived_from', 'workspace')
  const manual = store.write({ ...input, key: 'derived', body: 'A later explicit correction prefers Vue', authority: 'user', sourceSessionId: 'independent-session' })
  store.purgeSession('removed-session')
  expect(store.read(manual.id, 'workspace')?.body).toContain('Vue')
  expect(store.read(old.id, 'workspace', true)).toBeUndefined()
  expect(store.suppressed('workspace', 'independent-session')).toBe(false)
})

it('compacts only cold unpinned episodes and keeps literal facts searchable', async () => {
  const { store, index } = await setup()
  const then = '2020-01-01T00:00:00.000Z'
  const episode = store.write({ ...input, tier: 'episodic', body: 'We fixed a problem.\n\nMore prose with src/runtime.ts and E0433 at https://example.com/issue/42', abstract: 'Fixed the runtime.' }, then)
  const durable = store.write({ ...input, key: 'durable' }, then)
  const pinned = store.write({ ...input, key: 'pinned', tier: 'episodic', pinned: true }, then)
  expect(store.age('workspace')).toBe(1)
  expect(store.age('workspace')).toBe(0)
  expect(store.read(episode.id, 'workspace')?.status).toBe('compacted')
  expect(store.read(episode.id, 'workspace')?.body).toContain('src/runtime.ts')
  expect(index.search('E0433', 'workspace')[0]?.id).toBe(`memory:${episode.id}`)
  expect(store.read(durable.id, 'workspace')?.status).toBe('active')
  expect(store.read(pinned.id, 'workspace')?.status).toBe('active')
})

it('advances aging past hot old episodes across reopened connections', async () => {
  const { store, directory } = await setup()
  for (let n = 0; n < 5; n++) {
    const page = store.write({ ...input, tier: 'episodic', key: `hot-${n}` }, '2010-01-01T00:00:00.000Z')
    store.reinforce([page.id], 'workspace')
  }
  const cold = store.write({ ...input, tier: 'episodic', key: 'cold' }, '2020-01-01T00:00:00.000Z')
  expect(store.age('workspace', Date.now(), 2)).toBe(0)
  const another = await RecallIndex.open(directory)
  try {
    expect(another.memory.age('workspace', Date.now(), 2)).toBe(0)
    expect(another.memory.age('workspace', Date.now(), 2)).toBe(1)
    expect(another.memory.read(cold.id, 'workspace')?.status).toBe('compacted')
  }
  finally {
    another.close()
  }
})

it('keeps ai-memory retention invariants without aging durable or core knowledge', () => {
  const page = { tier: 'episodic' as const, pinned: false, updatedAt: '2020-01-01T00:00:00.000Z', lastAccessedAt: null, accessCount: 0, salience: 1 }
  const fresh = Date.parse(page.updatedAt)
  expect(retention(page, fresh)).toBe(1)
  expect(retention(page, fresh + 90 * 86_400_000)).toBeCloseTo(0.5)
  expect(retention(page)).toBeLessThan(0.2)
  expect(retention({ ...page, accessCount: 50, lastAccessedAt: new Date().toISOString() })).toBeGreaterThan(0.2)
  expect(retention({ ...page, tier: 'semantic' })).toBe(Number.POSITIVE_INFINITY)
  expect(retention({ ...page, tier: 'procedural' })).toBe(Number.POSITIVE_INFINITY)
  expect(retention({ ...page, pinned: true })).toBe(Number.POSITIVE_INFINITY)
  expect(compact({ body: '# Heading\r\nA summary.\r\n\r\nLong prose.', abstract: '' })).toBe('A summary.')
})

it('redacts private keys, JSON credentials, URL credentials, control sequences and bot tokens', () => {
  expect(sanitize('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----')).toBe('[REDACTED]')
  expect(sanitize('{"password":"a secret with spaces"}')).not.toContain('a secret')
  expect(sanitize('postgres://user:pass@host/db')).toBe('[REDACTED]')
  expect(sanitize('123456789:AAabcdefghijklmnopqrstuvwxyz12345678')).toBe('[REDACTED]')
  expect(sanitize('\u001B[31mhello\u001B[0m')).toBe('hello')
  expect(sanitize('max_tokens=2048 token_count=100')).toBe('max_tokens=2048 token_count=100')
  expect(sanitize('password="unfinished secret')).not.toContain('unfinished secret')
  expect(compact({ body: 'Summary\n\nUse captureObservation and session_id for correlation.', abstract: '' })).toContain('captureObservation')
  expect(compact({ body: 'Summary\n\nUse captureObservation and session_id for correlation.', abstract: '' })).toContain('session_id')
})

it('removes forgotten bytes from the main database and WAL while another connection remains open', async () => {
  const { store, directory } = await setup()
  const phrase = 'forgotten-unique-secret-memory-5c67171cf7e2'
  const page = store.write({ ...input, body: phrase })
  const other = await RecallIndex.open(directory)
  const files = async () => {
    const paths = await readdir(join(directory, 'memory'))
    return await Promise.all(paths.map(path => readFile(join(directory, 'memory', path))))
  }
  try {
    expect((await files()).some(bytes => bytes.includes(Buffer.from(phrase)))).toBe(true)
    store.purge(page.id, 'workspace')
    expect(other.memory.read(page.id, 'workspace', true)).toBeUndefined()
    expect((await files()).some(bytes => bytes.includes(Buffer.from(phrase)))).toBe(false)
  }
  finally {
    other.close()
  }
})

it('migrates the original identity-only tombstone schema without permitting deleted-session replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-upgrade-'))
  await mkdir(join(directory, 'memory'))
  const previous = new DatabaseSync(join(directory, 'memory', 'recall.sqlite'))
  previous.exec('CREATE TABLE memory_suppression(scope TEXT NOT NULL,sessionId TEXT NOT NULL,PRIMARY KEY(scope,sessionId)); INSERT INTO memory_suppression VALUES(\'workspace\',\'deleted\')')
  previous.close()
  const index = await RecallIndex.open(directory)
  stores.push({ index, directory })
  index.memory.observe({ ...observation, sessionId: 'deleted' })
  expect(index.memory.observations('workspace', 'deleted')).toEqual([])
  index.memory.observe({ ...observation, sessionId: 'new' })
  expect(index.memory.observations('workspace', 'new')).toHaveLength(1)
})
