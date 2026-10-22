import en from '@angela/i18n/locales/en'

import { setupSynced, usePiniaSynced } from '@angela/stage-ui/libs/pinia'
import { useLearningMemoryStore } from '@angela/stage-ui/stores/modules/learning-memory'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import { useLearningReviewReminders } from './use-learning-review-reminders'

const ipc = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('@angela/electron-vueuse', () => ({ useElectronEventaInvoke: () => ipc.notify }))

const contexts: { dispose: () => void }[] = []

function renderer(leadership: 'leader-only' | 'follower-only') {
  const pinia = createPinia()
  const synced = setupSynced({ leadership })
  pinia.use(synced.pinia)
  let runtime: ReturnType<typeof usePiniaSynced> | undefined
  const app = createApp({
    setup() {
      runtime = usePiniaSynced()
      useLearningReviewReminders()
      return () => h('div')
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  app.use(pinia)
  app.use(synced.vue)
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
  app.mount(host)
  if (!runtime)
    throw new Error('The synchronization runtime was not installed.')
  const memory = useLearningMemoryStore(pinia)
  const context = {
    memory,
    runtime,
    dispose: () => {
      app.unmount()
      disposePinia(pinia)
      host.remove()
    },
  }
  contexts.push(context)
  return context
}

beforeEach(() => {
  localStorage.clear()
  ipc.notify.mockReset()
  ipc.notify.mockImplementation(async (input: { records: { id: string, dueAt: number }[] }) => ({ status: 'shown', shown: input.records }))
})
afterEach(() => {
  for (const context of contexts.splice(0))
    context.dispose()
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

it('requires opt-in and delivers active-character reviews from the leader only', async () => {
  const leader = renderer('leader-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  const follower = renderer('follower-only')
  await expect.poll(() => follower.runtime.getLeaderId()).toBe(leader.runtime.participantId)
  const active = await follower.memory.save('default', 'topic', 'Python loops')
  const other = await follower.memory.save('other', 'topic', 'Private lesson')
  await follower.memory.scheduleReview('default', active.id, 1)
  await follower.memory.scheduleReview('other', other.id, 1)
  await nextTick()
  expect(ipc.notify).not.toHaveBeenCalled()
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  await follower.memory.setReviewRemindersEnabled(true)
  await expect.poll(() => follower.memory.forCharacter('default')[0].review?.notifiedFor).toBe(leader.memory.forCharacter('default')[0].review?.nextReviewAt)
  expect(ipc.notify).toHaveBeenCalledOnce()
  expect(ipc.notify).toHaveBeenCalledWith({ characterId: 'default', records: [{ id: active.id, dueAt: leader.memory.forCharacter('default')[0].review!.nextReviewAt }] })
  expect(follower.memory.forCharacter('default')[0].review?.count).toBe(0)
  expect(follower.memory.forCharacter('other')[0].review?.notifiedFor).toBeUndefined()
  expect(writes.mock.calls.filter(([key]) => key === 'angela/learning-memory/entries')).toHaveLength(1)
})

it('retains successful delivery across a fresh renderer without marking the review complete', async () => {
  const leader = renderer('leader-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  const entry = await leader.memory.save('default', 'topic', 'Python')
  await leader.memory.scheduleReview('default', entry.id, 3)
  await leader.memory.setReviewRemindersEnabled(true)
  await expect.poll(() => leader.memory.forCharacter('default')[0].review?.notifiedFor).toBe(leader.memory.forCharacter('default')[0].review?.nextReviewAt)
  contexts.splice(contexts.indexOf(leader), 1)
  leader.dispose()
  ipc.notify.mockClear()
  const reopened = renderer('leader-only')
  await expect.poll(() => reopened.runtime.isLeader()).toBe(true)
  await nextTick()
  expect(ipc.notify).not.toHaveBeenCalled()
  expect(reopened.memory.reviewRemindersEnabled).toBe(true)
  expect(reopened.memory.forCharacter('default')[0].review?.count).toBe(0)
})

it('does not record failed notifications or a stale receipt after rescheduling', async () => {
  const leader = renderer('leader-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  const entry = await leader.memory.save('default', 'topic', 'Python')
  await leader.memory.scheduleReview('default', entry.id, 1)
  ipc.notify.mockResolvedValue({ status: 'failed', shown: [] })
  await leader.memory.setReviewRemindersEnabled(true)
  await expect.poll(() => ipc.notify.mock.calls.length).toBe(1)
  await nextTick()
  expect(leader.memory.forCharacter('default')[0].review?.notifiedFor).toBeUndefined()
  let finish: ((value: { status: string, shown: { id: string, dueAt: number }[] }) => void) | undefined
  ipc.notify.mockImplementation(() => new Promise((resolve) => {
    finish = resolve
  }))
  await leader.memory.save('default', 'topic', 'Python loops', entry.id)
  await expect.poll(() => ipc.notify.mock.calls.length).toBe(2)
  const dueAt = leader.memory.forCharacter('default')[0].review!.nextReviewAt
  await leader.memory.scheduleReview('default', entry.id, 3, 'after-interval')
  finish?.({ status: 'shown', shown: [{ id: entry.id, dueAt }] })
  await nextTick()
  expect(leader.memory.forCharacter('default')[0].review?.notifiedFor).toBeUndefined()
  expect(leader.memory.forCharacter('default')[0].review?.count).toBe(0)
})

it('stops pending receipts after the app scope closes', async () => {
  const leader = renderer('leader-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  const entry = await leader.memory.save('default', 'topic', 'Python')
  await leader.memory.scheduleReview('default', entry.id, 1)
  let finish: ((value: { status: string, shown: { id: string, dueAt: number }[] }) => void) | undefined
  ipc.notify.mockImplementation(() => new Promise((resolve) => {
    finish = resolve
  }))
  await leader.memory.setReviewRemindersEnabled(true)
  await expect.poll(() => ipc.notify.mock.calls.length).toBe(1)
  const receipt = [{ id: entry.id, dueAt: leader.memory.forCharacter('default')[0].review!.nextReviewAt }]
  const mark = vi.spyOn(leader.memory, 'markReviewNotified')
  contexts.splice(contexts.indexOf(leader), 1)
  leader.dispose()
  finish?.({ status: 'shown', shown: receipt })
  await nextTick()
  expect(mark).not.toHaveBeenCalled()
})

it('checks future reviews on the periodic timer without another memory edit', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const leader = renderer('leader-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  const entry = await leader.memory.save('default', 'topic', 'Python')
  const scheduled = await leader.memory.scheduleReview('default', entry.id, 1, 'after-interval')
  await leader.memory.setReviewRemindersEnabled(true)
  await nextTick()
  expect(ipc.notify).not.toHaveBeenCalled()
  const dueAt = scheduled.review!.nextReviewAt
  vi.spyOn(Date, 'now').mockReturnValue(dueAt)
  await vi.advanceTimersByTimeAsync(60000)
  await expect.poll(() => leader.memory.forCharacter('default')[0].review?.notifiedFor).toBe(dueAt)
  expect(ipc.notify).toHaveBeenCalledOnce()
})
