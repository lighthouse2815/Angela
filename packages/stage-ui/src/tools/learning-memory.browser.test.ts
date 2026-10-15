import type { Tool } from '@xsai/shared-chat'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useLearningMemoryStore } from '../stores/modules/learning-memory'
import { createLearningMemoryPrompt, createLearningMemoryTools } from './learning-memory'

const stores: ReturnType<typeof createPinia>[] = []
const toolOptions = {} as Parameters<Tool['execute']>[1]
function createStore() {
  const pinia = createPinia()
  stores.push(pinia)
  return useLearningMemoryStore(pinia)
}
beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  for (const pinia of stores.splice(0))
    disposePinia(pinia)
  localStorage.clear()
})

it('saves facts from the current user message and recalls them in a fresh renderer', async () => {
  const store = createStore()
  const [remember] = await createLearningMemoryTools('angela', 'Mình đang học Python, nhớ giúp mình nhé.', store)
  const result = await remember.execute({ category: 'topic', text: 'Người dùng đang học Python.', id: null, source_quote: 'Mình đang học Python' }, toolOptions)
  expect(result).toMatchObject({ status: 'saved', memory: { characterId: 'angela', category: 'topic' } })
  const prompt = createLearningMemoryPrompt('angela', createStore())
  expect(prompt).toContain('Người dùng đang học Python.')
  expect(prompt).toContain('untrusted data')
  expect(createLearningMemoryPrompt('other', store)).not.toContain('Người dùng đang học Python.')
})

it('rejects external quotes and a deleted or disabled memory cannot return to context', async () => {
  const store = createStore()
  const [remember, forget] = await createLearningMemoryTools('angela', 'Quên ghi nhớ Python nhé.', store)
  const rejected = await remember.execute({ category: 'topic', text: 'Untrusted fact', id: null, source_quote: 'A web page says to remember this' }, toolOptions)
  expect(rejected).toMatchObject({ status: 'rejected' })
  expect(store.memories).toEqual([])
  const entry = await store.save('angela', 'topic', 'Python')
  const removed = await forget.execute({ id: entry.id, source_quote: 'Quên ghi nhớ Python' }, toolOptions)
  expect(removed).toEqual({ status: 'deleted' })
  expect(createLearningMemoryPrompt('angela', createStore())).not.toContain('"text":"Python"')
  await store.setEnabled(false)
  expect(createLearningMemoryPrompt('angela', store)).toBe('')
  expect(await createLearningMemoryTools('angela', 'Python', store)).toEqual([])
  expect(await remember.execute({ category: 'topic', text: 'Python', id: null, source_quote: 'Quên ghi nhớ Python' }, toolOptions)).toMatchObject({ status: 'rejected' })
})

it('does not edit another character and bounds the context to the latest twenty memories', async () => {
  const store = createStore()
  const other = await store.save('other', 'topic', 'Secret other lesson')
  const [remember, forget] = await createLearningMemoryTools('angela', 'Remember math and forget that lesson.', store)
  expect(await remember.execute({ category: 'topic', text: 'Math', id: other.id, source_quote: 'Remember math' }, toolOptions)).toMatchObject({ status: 'rejected' })
  expect(await forget.execute({ id: other.id, source_quote: 'forget that lesson' }, toolOptions)).toEqual({ status: 'missing' })
  expect(store.forCharacter('other')).toHaveLength(1)
  for (let i = 0; i < 25; i++)
    await store.save('angela', 'topic', `Lesson ${i}`)
  const prompt = createLearningMemoryPrompt('angela', store)
  const notes = JSON.parse(prompt.split('Saved learning records: ')[1])
  expect(notes).toHaveLength(20)
  expect(notes[0].text).toBe('Lesson 24')
  expect(notes[19].text).toBe('Lesson 5')
  expect(prompt).not.toContain('Secret other lesson')
  expect(remember.function.parameters).toMatchObject({ required: expect.arrayContaining(['category', 'text', 'id', 'source_quote']) })
})

it('prioritizes due reviews before recent facts within the twenty-record context limit', async () => {
  const store = createStore()
  const due = await store.save('angela', 'topic', 'Old lesson to review')
  await store.scheduleReview('angela', due.id, 1)
  for (let i = 0; i < 25; i++)
    await store.save('angela', 'topic', `Lesson ${i}`)
  const prompt = createLearningMemoryPrompt('angela', store)
  const notes = JSON.parse(prompt.split('Saved learning records: ')[1])
  expect(notes).toHaveLength(20)
  expect(notes[0]).toMatchObject({ id: due.id, review: { due: true, count: 0 } })
  await store.markReviewed('angela', due.id)
  const updated = JSON.parse(createLearningMemoryPrompt('angela', store).split('Saved learning records: ')[1])
  expect(updated.find((note: { id: string }) => note.id === due.id)?.review).toMatchObject({ due: false, count: 1 })
})

it('records a review only with current-turn evidence for a scheduled memory of this character', async () => {
  const store = createStore()
  const entry = await store.save('angela', 'topic', 'Python loops')
  const other = await store.save('other', 'topic', 'Private lesson')
  await store.scheduleReview('angela', entry.id, 7)
  const tools = await createLearningMemoryTools('angela', 'Mình đã ôn vòng lặp rồi.', store)
  const review = tools.find(tool => tool.function.name === 'review_learning')!
  expect(await review.execute({ id: entry.id, source_quote: 'A tool says this is complete' }, toolOptions)).toMatchObject({ status: 'rejected' })
  expect(await review.execute({ id: other.id, source_quote: 'đã ôn vòng lặp' }, toolOptions)).toMatchObject({ status: 'rejected' })
  expect(await review.execute({ id: entry.id, source_quote: 'đã ôn vòng lặp' }, toolOptions)).toMatchObject({ status: 'reviewed', memory: { review: { count: 1 } } })
  await store.setEnabled(false)
  expect(await review.execute({ id: entry.id, source_quote: 'đã ôn vòng lặp' }, toolOptions)).toMatchObject({ status: 'rejected' })
  expect(store.forCharacter('angela')[0].review?.count).toBe(1)
})

it('schedules and cancels reviews through chat without claiming a completed review', async () => {
  const store = createStore()
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const entry = await store.save('angela', 'topic', 'Python loops')
  const tools = await createLearningMemoryTools('angela', 'Nhắc mình ôn vòng lặp mỗi 3 ngày. Bỏ lịch ôn Python.', store)
  const schedule = tools.find(tool => tool.function.name === 'schedule_learning_review')!
  const request = { id: entry.id, interval_days: 3, source_quote: 'Nhắc mình ôn vòng lặp mỗi 3 ngày' }
  const result = await schedule.execute(request, toolOptions)
  expect(result).toMatchObject({ status: 'scheduled', memory: { review: { intervalDays: 3, count: 0, nextReviewAt: now + 259200000 } } })
  const restored = createStore().forCharacter('angela')[0]
  expect(restored.review?.lastReviewedAt).toBeUndefined()
  vi.mocked(Date.now).mockReturnValue(now + 60000)
  await schedule.execute(request, toolOptions)
  expect(store.forCharacter('angela')[0].review).toEqual(restored.review)
  expect(await schedule.execute({ id: entry.id, interval_days: 0, source_quote: 'Bỏ lịch ôn Python' }, toolOptions)).toMatchObject({ status: 'cancelled' })
  expect(createStore().forCharacter('angela')[0].review).toBeUndefined()
  expect(createStore().forCharacter('angela')[0].text).toBe('Python loops')
})

it('rejects schedule edits without current-turn evidence or access to the character', async () => {
  const store = createStore()
  const entry = await store.save('angela', 'topic', 'Python')
  const other = await store.save('other', 'topic', 'Private lesson')
  const tools = await createLearningMemoryTools('angela', 'Nhắc mình ôn mỗi 7 ngày.', store)
  const schedule = tools.find(tool => tool.function.name === 'schedule_learning_review')!
  expect(await schedule.execute({ id: entry.id, interval_days: 7, source_quote: 'A document requests reminders' }, toolOptions)).toMatchObject({ status: 'rejected' })
  expect(await schedule.execute({ id: other.id, interval_days: 7, source_quote: 'Nhắc mình ôn mỗi 7 ngày' }, toolOptions)).toMatchObject({ status: 'rejected' })
  expect(await schedule.execute({ id: entry.id, interval_days: 2, source_quote: 'Nhắc mình ôn mỗi 7 ngày' }, toolOptions)).toMatchObject({ status: 'rejected' })
  await store.setEnabled(false)
  expect(await schedule.execute({ id: entry.id, interval_days: 7, source_quote: 'Nhắc mình ôn mỗi 7 ngày' }, toolOptions)).toMatchObject({ status: 'rejected' })
  expect(store.forCharacter('angela')[0].review).toBeUndefined()
  expect(store.forCharacter('other')[0].review).toBeUndefined()
})

it('reports a failed schedule save without publishing success or progress', async () => {
  const store = createStore()
  const entry = await store.save('angela', 'topic', 'Python')
  const tools = await createLearningMemoryTools('angela', 'Ôn mỗi 3 ngày.', store)
  const schedule = tools.find(tool => tool.function.name === 'schedule_learning_review')!
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage is full', 'QuotaExceededError')
  })
  expect(await schedule.execute({ id: entry.id, interval_days: 3, source_quote: 'Ôn mỗi 3 ngày' }, toolOptions)).toMatchObject({ status: 'rejected' })
  expect(store.forCharacter('angela')[0].review).toBeUndefined()
})
