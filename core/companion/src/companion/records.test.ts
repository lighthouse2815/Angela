import type { RecordsSnapshot } from './contracts'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { Memory } from '../memory'
import { requestPrivacy } from '../privacy-policy'
import { RecallIndex } from '../recall-index'
import { CompanionRecords } from './records'

const directories: string[] = []
const stores: CompanionRecords[] = []
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-shared-records-'))
  directories.push(directory)
  const open = async (character = 'default', workspace = '/workspace') => {
    const store = await CompanionRecords.open(directory, workspace, character)
    stores.push(store)
    return store
  }
  return { directory, open }
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const store of stores.splice(0))
    store.close()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it('shares corrections across independently opened desktop and Telegram stores while isolating scopes', async () => {
  const { open } = await setup()
  const desktop = await open()
  const saved = await desktop.execute({ type: 'learning.save', category: 'preference', text: 'Listen before giving advice' })
  const telegram = await open()
  expect(await telegram.context()).toContain('Listen before giving advice')
  await telegram.execute({ type: 'learning.save', category: 'preference', text: 'Ask before giving advice', id: saved.entryId })
  expect(await desktop.context()).toContain('Ask before giving advice')
  expect(await desktop.context()).not.toContain('Listen before giving advice')
  expect(await (await open('other')).context()).not.toContain('Ask before giving advice')
  expect(await (await open('default', '/other')).context()).not.toContain('Ask before giving advice')
})

it('imports atomically once, preserving review progress, ids, cancellation and prior presentation', async () => {
  const { open } = await setup()
  const store = await open()
  const now = Date.now()
  const snapshot: RecordsSnapshot = { characterId: 'default', enabled: true, reviewRemindersEnabled: true, memories: [{ id: 'old-learning', characterId: 'default', text: 'Python', category: 'topic', createdAt: 10, updatedAt: 20, review: { intervalDays: 3, count: 2, lastReviewedAt: 15, nextReviewAt: now - 1, notifiedFor: now - 1 } }], companion: { enabled: true, lastPromptAt: 40, entries: [
    { id: 'old-activity', characterId: 'default', text: 'Study Python', kind: 'activity', createdAt: 10, updatedAt: 20, status: 'open', dueAt: 30, promptedAt: 40 },
    { id: 'dismissed', characterId: 'default', text: 'Interview', kind: 'thread', createdAt: 10, updatedAt: 20, status: 'dismissed', dueAt: 30 },
  ] } }
  const imported = await store.execute({ type: 'import', snapshot })
  expect(imported.snapshot).toEqual(snapshot)
  expect((await store.execute({ type: 'learning.notified', id: 'old-learning', dueAt: now - 1 })).value).toBe(false)
  await store.execute({ type: 'learning.forget', id: 'old-learning' })
  const repeated = await (await open()).execute({ type: 'import', snapshot })
  expect(repeated.snapshot.memories).toEqual([])
  expect(repeated.snapshot.companion.entries).toHaveLength(2)
  expect(repeated.snapshot.companion.entries[0].status).toBe('open')
  vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 23, 12).getTime())
  expect((await store.execute({ type: 'companion.reserve' })).prompt).toBeNull()
})

it('rejects a bad import without partial writes or receipts, then allows retry', async () => {
  const { open } = await setup()
  const store = await open()
  const snapshot: RecordsSnapshot = { characterId: 'default', enabled: true, reviewRemindersEnabled: false, memories: [
    { id: 'valid', characterId: 'default', text: 'Python', category: 'topic', createdAt: 1, updatedAt: 1 },
    { id: 'invalid', characterId: 'other', text: 'Private', category: 'topic', createdAt: 1, updatedAt: 1 },
  ], companion: { enabled: false, entries: [], lastPromptAt: 0 } }
  await expect(store.execute({ type: 'import', snapshot })).rejects.toThrow('invalid-import')
  expect((await store.execute({ type: 'read' })).snapshot.memories).toEqual([])
  snapshot.memories.pop()
  expect((await store.execute({ type: 'import', snapshot })).snapshot.memories).toHaveLength(1)
})

it('respects shared opt-outs and rejects protected model writes without deleting existing data', async () => {
  const { directory, open } = await setup()
  const store = await open()
  await store.execute({ type: 'learning.save', category: 'topic', text: 'Python' })
  expect(await store.tools('Don\'t store this', requestPrivacy('Don\'t store this'))).toEqual([])
  await new Memory(directory, cliMessages.en).setEnabled(false)
  expect(await store.context()).toBe('')
  await expect(store.execute({ type: 'learning.save', category: 'topic', text: 'Other' })).rejects.toThrow('disabled')
  expect((await store.execute({ type: 'read' })).snapshot.memories).toHaveLength(1)
})

it('rolls back nested Memory V2 writes and search projections on failure', async () => {
  const { directory } = await setup()
  const index = await RecallIndex.open(directory)
  try {
    expect(() => index.memory.atomic(() => {
      index.memory.write({ tier: 'semantic', scope: 'scope', key: 'first', kind: 'learning_record', title: 'First', body: 'Copper', authority: 'user' })
      throw new Error('Import failed')
    })).toThrow('Import failed')
    expect(index.memory.list('scope', 'learning_record')).toEqual([])
    expect(index.memory.current('scope', 'semantic', 'first')).toBeUndefined()
  }
  finally { index.close() }
})

it('persists a confirmed lesson review through existing learning tools without storing model answers', async () => {
  const { open } = await setup()
  const store = await open()
  const userText = 'Mình học AddScoped. Nhắc mình ôn mỗi 3 ngày.'
  const [memory] = await store.tools(userText, requestPrivacy(userText))
  const options = {} as Parameters<typeof memory.execute>[1]
  const input = { action: 'learning.save', id: null, text: 'AddScoped', category: 'topic', kind: 'activity', status: 'completed', interval: 3, due_at: null, source_quote: 'Mình học AddScoped' }
  const saved = await memory.execute(input, options)
  expect(saved).toMatchObject({ status: 'saved', entry: { text: 'AddScoped' } })
  const { snapshot } = await store.execute({ type: 'read' })
  expect(snapshot.memories[0].review).toBeUndefined()
  const id = snapshot.memories[0].id
  expect(await memory.execute({ ...input, action: 'learning.schedule', id, source_quote: 'Nhắc mình ôn mỗi 3 ngày' }, options)).toMatchObject({ status: 'saved', entry: { review: { count: 0, intervalDays: 3 } } })
  const restored = await open()
  expect((await restored.execute({ type: 'read' })).snapshot.memories[0].review?.count).toBe(0)
  const finished = 'Mình đã ôn xong AddScoped.'
  const [review] = await restored.tools(finished, requestPrivacy(finished))
  expect(await review.execute({ ...input, action: 'learning.review', id, source_quote: 'The model generated an answer' }, options)).toMatchObject({ status: 'rejected' })
  expect(await review.execute({ ...input, action: 'learning.review', id, source_quote: finished }, options)).toMatchObject({ status: 'saved', entry: { review: { count: 1 } } })
  const reloaded = (await (await open()).execute({ type: 'read' })).snapshot
  expect(reloaded.memories).toHaveLength(1)
  expect(reloaded.memories[0]).toMatchObject({ text: 'AddScoped', review: { count: 1, intervalDays: 3 } })
  expect((await (await open('other')).execute({ type: 'read' })).snapshot.memories).toEqual([])
})
