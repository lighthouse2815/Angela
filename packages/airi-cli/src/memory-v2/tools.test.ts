import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { Memory } from '../memory'
import { Recall } from '../recall'
import { RecallIndex } from '../recall-index'
import { Sessions } from '../sessions'
import { pageTools } from './tools'

const resources: { index: RecallIndex, directory: string }[] = []
afterEach(async () => {
  for (const { index, directory } of resources.splice(0)) {
    index.close()
    await rm(directory, { recursive: true, force: true })
  }
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-page-tools-'))
  const index = await RecallIndex.open(directory)
  resources.push({ index, directory })
  return { index, store: index.memory, directory }
}

const call = { tier: 'semantic', kind: 'architecture', key: 'database', title: 'Database', body: 'Use SQLite', source_quote: 'Use SQLite', expected_version: null }

it('requires verbatim evidence and never lets the model select its own authority', async () => {
  const { store } = await setup()
  const tool = pageTools(store, 'workspace', 'session', 'Use SQLite', [])[0]!
  expect(await tool.execute?.({ ...call, body: 'Use Postgres' }, { messages: [], toolCallId: 'test-call' })).toMatchObject({ status: 'rejected', reason: 'missing-evidence' })
  expect(await tool.execute?.({ ...call, authority: 'inference' }, { messages: [], toolCallId: 'test-call' })).toMatchObject({ status: 'saved' })
  expect(store.current('workspace', 'semantic', 'database')?.authority).toBe('user')
})

it('uses weaker verified-tool authority and detects stale writes across independent connections', async () => {
  const { store, directory } = await setup()
  const tool = pageTools(store, 'workspace', 'session', '', ['Use SQLite'])[0]!
  expect(await tool.execute?.(call, { messages: [], toolCallId: 'test-call' })).toMatchObject({ status: 'saved' })
  const first = store.current('workspace', 'semantic', 'database')!
  expect(first.authority).toBe('verified')
  const other = await RecallIndex.open(directory)
  try {
    other.memory.write({ tier: 'semantic', kind: 'architecture', scope: 'workspace', key: 'database', title: 'Database', body: 'Use PostgreSQL', authority: 'user', expectedVersion: first.version })
    expect(() => store.write({ tier: 'semantic', kind: 'architecture', scope: 'workspace', key: 'database', title: 'Database', body: 'Use SQLite again', authority: 'user', expectedVersion: first.version })).toThrow('version')
    expect(await tool.execute?.({ ...call, expected_version: first.version }, { messages: [], toolCallId: 'test-call' })).toMatchObject({ status: 'rejected', reason: 'version-conflict' })
  }
  finally {
    other.close()
  }
})

it('purges remembered facts from observations and derived indexes on explicit forget', async () => {
  const { store, directory, index } = await setup()
  const personal = new Memory(directory, cliMessages.en)
  const text = 'My favorite framework is React'
  const id = await personal.remember(text)
  store.observe({ id: 'event', type: 'user.message', correlationId: 'request', sessionId: 'session', scope: 'workspace', channel: 'cli', timestamp: new Date().toISOString(), text, verified: false })
  store.write({ tier: 'episodic', kind: 'session', key: 'session', scope: 'workspace', title: 'Preferences', body: text, authority: 'episode', sourceSessionId: 'session' })
  await personal.forget(id)
  expect(store.observations('workspace', 'session')).toEqual([])
  expect(index.search('React', 'workspace')).toEqual([])
  expect((await personal.read()).entries).toEqual([])
})

it('removes obsolete captured facts after an explicit personal correction', async () => {
  const { store, directory, index } = await setup()
  const personal = new Memory(directory, cliMessages.en)
  const text = 'My favorite framework is React'
  const id = await personal.remember(text)
  store.write({ tier: 'semantic', kind: 'preference', key: 'old', scope: 'workspace', title: 'Framework', body: text, authority: 'consolidated' })
  await personal.remember('My favorite framework is Vue', id)
  expect(index.search('React', 'workspace')).toEqual([])
  expect((await personal.read()).entries[0]?.text).toContain('Vue')
})

it('normalizes duplicate bodies within a claim and allows replacement of an expired claim', async () => {
  const { store } = await setup()
  const input = { tier: 'semantic' as const, kind: 'architecture', key: 'db', scope: 'workspace', title: 'Database', body: 'Use SQLite', authority: 'user' as const }
  const first = store.write(input)
  expect(store.write({ ...input, body: 'use   sqlite' }).id).toBe(first.id)
  const expired = store.write({ ...input, key: 'old', expiresAt: '2020-01-01T00:00:00.000Z' })
  expect(store.read(expired.id, 'workspace')).toBeUndefined()
  expect(store.write({ ...input, key: 'old', body: 'Use WAL' }).body).toBe('Use WAL')
  store.purge(expired.id, 'workspace')
  expect(store.current('workspace', 'semantic', 'old')).toBeUndefined()
})

it('does not resurrect forgotten personal facts from a session that was never indexed', async () => {
  const { directory, store } = await setup()
  const sessionId = randomUUID()
  const text = 'My pet name is Bluebell'
  const session = await new Sessions(directory, cliMessages.en).open(directory, sessionId)
  try {
    await session.save({ turns: [{ type: 'user', id: 'turn', content: [{ type: 'text', text }] }] }, false)
  }
  finally {
    await session.close()
  }
  const personal = new Memory(directory, cliMessages.en)
  const id = await personal.remember(text, undefined, undefined, { source: { quote: text, sessionId } })
  await personal.forget(id)
  expect(store.suppressed(directory, sessionId)).toBe(true)
  const recall = new Recall(directory, directory, randomUUID(), cliMessages.en, {}, { apiKey: '' })
  try {
    await recall.start()
    expect(await recall.search('Bluebell', true)).toEqual([])
    await recall.command('/memory reindex')
    expect(await recall.search('Bluebell', true)).toEqual([])
  }
  finally {
    await recall.close()
  }
})

it('purges episodic derivatives on session deletion and rejects late capture', async () => {
  const { directory, store, index } = await setup()
  const sessionId = randomUUID()
  const sessions = new Sessions(directory, cliMessages.en)
  const session = await sessions.open(directory, sessionId)
  await session.save({ turns: [] }, false)
  await session.close()
  store.write({ tier: 'episodic', kind: 'session', scope: directory, key: 'session', title: 'Episode', body: 'Hidden marigold observation', authority: 'episode', sourceSessionId: sessionId })
  await sessions.remove(sessionId)
  expect(index.search('marigold', directory)).toEqual([])
  expect(store.suppressed(directory, sessionId)).toBe(true)
})
