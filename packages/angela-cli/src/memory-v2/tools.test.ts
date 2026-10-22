import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { Memory } from '../memory'
import { Recall } from '../recall'
import { RecallIndex, sourceVersion } from '../recall-index'
import { Sessions } from '../sessions'
import { MemoryStore } from './store'
import { pageTools } from './tools'

const resources: { index: RecallIndex, directory: string }[] = []
afterEach(async () => {
  vi.restoreAllMocks()
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

it('rechecks automatic-write policy before executing a previously offered page tool', async () => {
  const { directory, store } = await setup()
  const recall = new Recall(directory, 'workspace', 'session', cliMessages.en, {}, { apiKey: '' })
  try {
    await recall.start()
    const tools = await recall.pageTools('Use SQLite', [])
    expect(tools).toHaveLength(1)
    await new Memory(directory, cliMessages.en).setAutomatic(false)
    expect(await tools[0]!.execute?.(call, { messages: [], toolCallId: 'test-call' })).toMatchObject({ status: 'rejected', reason: 'automatic-memory-disabled' })
    expect(await recall.pageTools('Use SQLite', [])).toEqual([])
    expect(store.current('workspace', 'semantic', 'database')).toBeUndefined()
  }
  finally { await recall.close() }
})

it('retains the authoritative fact when derived cleanup fails so forgetting can be retried', async () => {
  const { directory } = await setup()
  const memory = new Memory(directory, cliMessages.en)
  const id = await memory.remember('I prefer copper releases')
  const cleanup = vi.spyOn(MemoryStore.prototype, 'forgetText').mockImplementation(() => {
    throw new Error('storage cleanup failed')
  })
  await expect(memory.forget(id)).rejects.toThrow(cliMessages.en.recallCleanup)
  expect((await memory.read()).entries).toContainEqual(expect.objectContaining({ id, text: 'I prefer copper releases' }))
  await expect(memory.remember('I prefer silver releases', id)).rejects.toThrow(cliMessages.en.recallCleanup)
  expect((await memory.read()).entries[0]?.text).toBe('I prefer copper releases')
  cleanup.mockRestore()
  await memory.forget(id)
  expect((await memory.read()).entries).toEqual([])
})

it('rejects a stale personal projection after forgetting without blocking later explicit facts', async () => {
  const { directory, index } = await setup()
  const memory = new Memory(directory, cliMessages.en)
  const id = await memory.remember('I prefer copper releases')
  const previous = await memory.read()
  const oldVersion = sourceVersion(JSON.stringify(previous))
  const oldHit = { id: `personal:${id}`, kind: 'personal' as const, scope: '', text: previous.entries[0]!.text, updatedAt: previous.entries[0]!.updatedAt }
  index.replace('personal', oldVersion, [oldHit])
  await memory.forget(id)
  index.replace('personal', oldVersion, [oldHit])
  expect(index.read(oldHit.id)).toBeUndefined()
  expect(index.search('copper', 'workspace')).toEqual([])
  const freshId = await memory.remember('I prefer silver releases')
  const fresh = await memory.read()
  index.replace('personal', sourceVersion(JSON.stringify(fresh)), [{ ...oldHit, id: `personal:${freshId}`, text: fresh.entries[0]!.text }])
  expect(index.search('silver', 'workspace')).toHaveLength(1)
})

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
