import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useLearningMemoryStore } from './learning-memory'

const contexts: Array<{ pinia: ReturnType<typeof createPinia>, runtime?: SyncedPiniaRuntime }> = []

function createContext(namespace?: string, leadership?: LeadershipMode) {
  const pinia = createPinia()
  const runtime = namespace ? createSyncedPiniaPlugin({ namespace, leadership, callTimeout: 1000 }) : undefined
  if (runtime)
    pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  contexts.push({ pinia, runtime })
  return { store: useLearningMemoryStore(pinia), runtime }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  for (const { pinia, runtime } of contexts.splice(0)) {
    runtime?.dispose()
    disposePinia(pinia)
  }
  localStorage.clear()
})

it('retains learning facts and the disabled setting in a new renderer', async () => {
  const { store } = createContext()
  const entry = await store.save('angela', 'topic', '  Learning Python  ')
  await store.setEnabled(false)
  const restored = createContext().store
  expect(restored.forCharacter('angela')).toEqual([{ ...entry, text: 'Learning Python' }])
  expect(restored.enabled).toBe(false)
})

it('deduplicates facts and isolates edits and deletion by character', async () => {
  const { store } = createContext()
  const first = await store.save('angela', 'topic', 'Python')
  const duplicate = await store.save('angela', 'topic', 'python')
  expect(duplicate.id).toBe(first.id)
  expect(store.forCharacter('angela')).toHaveLength(1)
  await store.save('other', 'topic', 'Math')
  await expect(store.save('other', 'goal', 'Changed', first.id)).rejects.toThrow('missing')
  expect(await store.forget('other', first.id)).toBe(false)
  expect(store.forCharacter('angela')[0].text).toBe('python')
  await store.save('angela', 'goal', 'Understand loops', first.id)
  expect(store.forCharacter('angela')[0].category).toBe('goal')
  expect(await store.forget('angela', first.id)).toBe(true)
  expect(createContext().store.forCharacter('angela')).toEqual([])
  expect(createContext().store.forCharacter('other')[0].text).toBe('Math')
})

it('rejects empty or excessive text and enforces the character storage limit', async () => {
  const { store } = createContext()
  await expect(store.save('angela', 'topic', '   ')).rejects.toThrow()
  await expect(store.save('angela', 'topic', 'x'.repeat(501))).rejects.toThrow()
  for (let i = 0; i < 50; i++)
    await store.save('angela', 'topic', `Topic ${i}`)
  await expect(store.save('angela', 'topic', 'New topic')).rejects.toThrow('limit')
  const entry = store.forCharacter('angela')[0]
  await store.save('angela', 'goal', 'Updated at the limit', entry.id)
  expect(store.forCharacter('angela')).toHaveLength(50)
  await store.save('other', 'topic', 'Another character')
  expect(store.forCharacter('other')).toHaveLength(1)
})

it('does not publish a memory or toggle when durable storage rejects the edit', async () => {
  const { store } = createContext()
  const original = await store.save('angela', 'topic', 'Python')
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage is full', 'QuotaExceededError')
  })
  await expect(store.save('angela', 'goal', 'A new goal')).rejects.toThrow('Storage is full')
  expect(store.forCharacter('angela')).toEqual([original])
  await expect(store.forget('angela', original.id)).rejects.toThrow('Storage is full')
  expect(store.forCharacter('angela')).toEqual([original])
  await expect(store.setEnabled(false)).rejects.toThrow('Storage is full')
  expect(store.enabled).toBe(true)
  writes.mockRestore()
  expect(createContext().store.forCharacter('angela')).toEqual([original])
})

it('persists follower edits through the leader without echoing snapshots or storage writes', async () => {
  const namespace = `learning-memory:${crypto.randomUUID()}`
  const leader = createContext(namespace, 'leader-only')
  await expect.poll(() => leader.runtime?.isLeader()).toBe(true)
  const follower = createContext(namespace, 'follower-only')
  await expect.poll(() => follower.runtime?.getLeaderId()).toBe(leader.runtime?.participantId)
  const actions: string[] = []
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  leader.store.$onAction(({ name }) => actions.push(name))
  await follower.store.save('angela', 'preference', 'Short explanations')
  await expect.poll(() => follower.store.forCharacter('angela').length).toBe(1)
  expect(leader.store.forCharacter('angela')[0].text).toBe('Short explanations')
  expect(actions.filter(name => name === 'save')).toHaveLength(1)
  expect(writes.mock.calls.filter(([key]) => key === 'angela/learning-memory/entries')).toHaveLength(1)
  await follower.store.setEnabled(false)
  await expect.poll(() => follower.store.enabled).toBe(false)
  expect(createContext().store.enabled).toBe(false)
  expect(createContext().store.forCharacter('angela')[0].text).toBe('Short explanations')
  expect(writes.mock.calls.filter(([key]) => key === 'angela/learning-memory/enabled')).toHaveLength(1)
  writes.mockRestore()
})

it('retains review progress after reload and edits without losing existing memories', async () => {
  const { store } = createContext()
  const entry = await store.save('angela', 'topic', 'Python loops')
  await store.scheduleReview('angela', entry.id, 3)
  expect(store.forCharacter('angela')[0].review?.count).toBe(0)
  expect(store.forCharacter('angela')[0].review?.nextReviewAt).toBeLessThanOrEqual(Date.now())
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  await store.markReviewed('angela', entry.id)
  await store.save('angela', 'topic', 'Python loops with examples', entry.id)
  const restored = createContext().store.forCharacter('angela')[0]
  expect(restored.text).toBe('Python loops with examples')
  expect(restored.review).toEqual({ intervalDays: 3, count: 1, lastReviewedAt: now, nextReviewAt: now + 259200000 })
  await store.scheduleReview('angela', entry.id, 0)
  expect(createContext().store.forCharacter('angela')[0].review).toBeUndefined()
})

it('isolates review changes and rejects absent schedules or invalid intervals', async () => {
  const { store } = createContext()
  const entry = await store.save('angela', 'topic', 'Python')
  await expect(store.markReviewed('angela', entry.id)).rejects.toThrow('unscheduled')
  await expect(store.scheduleReview('other', entry.id, 7)).rejects.toThrow('missing')
  await expect(store.markReviewed('other', entry.id)).rejects.toThrow('missing')
  await expect(store.scheduleReview('angela', entry.id, -1 as 1)).rejects.toThrow()
  expect(createContext().store.forCharacter('angela')[0].review).toBeUndefined()
})

it('does not reset completed reviews when the same schedule arrives twice', async () => {
  const { store } = createContext()
  const entry = await store.save('angela', 'topic', 'Python')
  await store.scheduleReview('angela', entry.id, 7)
  await store.markReviewed('angela', entry.id)
  const original = store.forCharacter('angela')[0]
  await store.scheduleReview('angela', entry.id, 7)
  expect(store.forCharacter('angela')[0]).toEqual(original)
  await store.scheduleReview('angela', entry.id, 1)
  expect(store.forCharacter('angela')[0].review?.count).toBe(1)
  expect(store.forCharacter('angela')[0].review?.nextReviewAt).toBe(original.review!.lastReviewedAt! + 86400000)
})

it('does not publish review progress when storage rejects the edit', async () => {
  const { store } = createContext()
  const entry = await store.save('angela', 'topic', 'Python')
  await store.scheduleReview('angela', entry.id, 1)
  const original = store.forCharacter('angela')[0]
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage is full', 'QuotaExceededError')
  })
  await expect(store.markReviewed('angela', entry.id)).rejects.toThrow('Storage is full')
  await expect(store.scheduleReview('angela', entry.id, 0)).rejects.toThrow('Storage is full')
  expect(store.forCharacter('angela')[0]).toEqual(original)
  expect(createContext().store.forCharacter('angela')[0]).toEqual(original)
})

it('routes review progress through the leader without duplicate writes', async () => {
  const namespace = `learning-reviews:${crypto.randomUUID()}`
  const leader = createContext(namespace, 'leader-only')
  await expect.poll(() => leader.runtime?.isLeader()).toBe(true)
  const follower = createContext(namespace, 'follower-only')
  await expect.poll(() => follower.runtime?.getLeaderId()).toBe(leader.runtime?.participantId)
  const entry = await follower.store.save('angela', 'topic', 'Python')
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  await follower.store.scheduleReview('angela', entry.id, 7)
  await follower.store.markReviewed('angela', entry.id)
  await expect.poll(() => follower.store.forCharacter('angela')[0].review?.count).toBe(1)
  expect(leader.store.forCharacter('angela')[0].review?.count).toBe(1)
  expect(createContext().store.forCharacter('angela')[0].review?.count).toBe(1)
  expect(writes.mock.calls.filter(([key]) => key === 'angela/learning-memory/entries')).toHaveLength(2)
})

it('routes deferred first reviews through the leader without resetting progress or duplicate storage writes', async () => {
  const namespace = `learning-chat-reviews:${crypto.randomUUID()}`
  const leader = createContext(namespace, 'leader-only')
  await expect.poll(() => leader.runtime?.isLeader()).toBe(true)
  const follower = createContext(namespace, 'follower-only')
  await expect.poll(() => follower.runtime?.getLeaderId()).toBe(leader.runtime?.participantId)
  const entry = await follower.store.save('angela', 'topic', 'Python')
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  await follower.store.scheduleReview('angela', entry.id, 3, 'after-interval')
  await expect.poll(() => follower.store.forCharacter('angela')[0].review?.nextReviewAt).toBe(now + 259200000)
  expect(leader.store.forCharacter('angela')[0].review?.count).toBe(0)
  expect(leader.store.forCharacter('angela')[0].review?.lastReviewedAt).toBeUndefined()
  vi.mocked(Date.now).mockReturnValue(now + 60000)
  await follower.store.scheduleReview('angela', entry.id, 3, 'after-interval')
  expect(createContext().store.forCharacter('angela')[0].review?.nextReviewAt).toBe(now + 259200000)
  expect(writes.mock.calls.filter(([key]) => key === 'angela/learning-memory/entries')).toHaveLength(1)
})
