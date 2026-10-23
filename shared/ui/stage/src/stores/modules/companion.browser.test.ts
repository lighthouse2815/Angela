import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useCompanionStore } from './companion'

const contexts: { pinia: ReturnType<typeof createPinia>, runtime?: SyncedPiniaRuntime }[] = []
function context(namespace?: string, leadership?: 'leader-only' | 'follower-only') {
  const pinia = createPinia()
  const runtime = namespace ? createSyncedPiniaPlugin({ namespace, leadership, callTimeout: 1000 }) : undefined
  if (runtime)
    pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  contexts.push({ pinia, runtime })
  return { store: useCompanionStore(pinia), runtime }
}
beforeEach(() => {
  localStorage.clear()
  vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 23, 12).getTime())
})
afterEach(() => {
  vi.restoreAllMocks()
  for (const { pinia, runtime } of contexts.splice(0)) {
    runtime?.dispose()
    disposePinia(pinia)
  }
  localStorage.clear()
})

it('requires opt-in, restores records, and isolates characters', async () => {
  const { store } = context()
  await expect(store.save('a', 'preference', 'Listen first')).rejects.toThrow('disabled')
  await store.setEnabled(true)
  const entry = await store.save('a', 'preference', 'Listen first')
  expect(context().store.forCharacter('a')).toEqual([entry])
  expect(store.forCharacter('b')).toEqual([])
  await expect(store.resolve('b', entry.id, 'completed')).rejects.toThrow('missing')
  await store.forget('b', entry.id)
  expect(store.forCharacter('a')).toHaveLength(1)
})

it('reserves once across restarts, and elapsed time never completes an activity', async () => {
  const { store } = context()
  await store.setEnabled(true)
  const entry = await store.save('a', 'activity', 'Study loops', Date.now() - 1)
  expect(await store.reservePrompt('a')).toMatchObject({ id: entry.id, status: 'open' })
  expect(await context().store.reservePrompt('a')).toBeNull()
  await store.save('a', 'activity', 'Study loops', entry.dueAt)
  expect(store.forCharacter('a')[0].promptedAt).toBeDefined()
  expect(await store.reservePrompt('a')).toBeNull()
  await store.resolve('a', entry.id, 'completed')
  expect(context().store.forCharacter('a')[0].status).toBe('completed')
})

it('enforces quiet hours, global hourly caps, cancellation, and disabled delivery', async () => {
  const { store } = context()
  await store.setEnabled(true)
  const due = Date.now() - 1
  await store.save('a', 'thread', 'Interview', due)
  const other = await store.save('b', 'thread', 'Exam', due)
  vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 23, 23).getTime())
  expect(await store.reservePrompt('a')).toBeNull()
  vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 24, 12).getTime())
  expect(await store.reservePrompt('a')).not.toBeNull()
  expect(await store.reservePrompt('b')).toBeNull()
  await store.resolve('b', other.id, 'dismissed')
  vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 24, 14).getTime())
  expect(await store.reservePrompt('b')).toBeNull()
  await store.save('a', 'thread', 'New subject', due)
  await store.setEnabled(false)
  expect(await store.reservePrompt('a')).toBeNull()
})

it('does not publish a failed durable edit or reserve a failed write', async () => {
  const { store } = context()
  await store.setEnabled(true)
  await store.save('a', 'thread', 'Interview', Date.now() - 1)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('full')
  })
  await expect(store.reservePrompt('a')).rejects.toThrow('full')
  expect(store.forCharacter('a')[0].promptedAt).toBeUndefined()
  await expect(store.forget('a', store.forCharacter('a')[0].id)).rejects.toThrow('full')
  expect(store.forCharacter('a')).toHaveLength(1)
})

it('routes follower edits through the leader without echoing persistence', async () => {
  const namespace = crypto.randomUUID()
  const leader = context(namespace, 'leader-only')
  await expect.poll(() => leader.runtime?.isLeader()).toBe(true)
  const follower = context(namespace, 'follower-only')
  await expect.poll(() => follower.runtime?.getLeaderId()).toBe(leader.runtime?.participantId)
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  await follower.store.setEnabled(true)
  await follower.store.save('a', 'preference', 'Short replies')
  await expect.poll(() => leader.store.forCharacter('a').length).toBe(1)
  await expect.poll(() => follower.store.forCharacter('a').length).toBe(1)
  expect(writes).toHaveBeenCalledTimes(2)
})
