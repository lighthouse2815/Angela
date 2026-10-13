import type { Tool } from '@xsai/shared-chat'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, expect, it } from 'vitest'

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
