import type { Tool } from '@xsai/shared-chat'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it } from 'vitest'

import { useCompanionStore } from '../stores/modules/companion'
import { companionBehavior, createCompanionPrompt, createCompanionTools } from './companion'

const contexts: ReturnType<typeof createPinia>[] = []
const options = {} as Parameters<Tool['execute']>[1]
async function setup() {
  localStorage.clear()
  const pinia = createPinia()
  contexts.push(pinia)
  const store = useCompanionStore(pinia)
  await store.setEnabled(true)
  return store
}
afterEach(() => {
  for (const pinia of contexts.splice(0))
    disposePinia(pinia)
  localStorage.clear()
})

it('stores sourced preferences, applies corrections, and excludes other characters', async () => {
  const store = await setup()
  const text = 'Lúc buồn chỉ cần nghe mình kể'
  const [record] = await createCompanionTools('a', text, store, () => true)
  expect(await record.execute({ kind: 'preference', text, source_quote: text, id: null, due_at: null }, options)).toMatchObject({ status: 'saved' })
  const id = store.forCharacter('a')[0].id
  const correction = 'Hỏi mình trước khi đưa lời khuyên'
  const [update] = await createCompanionTools('a', correction, store, () => true)
  await update.execute({ kind: 'preference', text: correction, source_quote: correction, id, due_at: null }, options)
  expect(createCompanionPrompt('a', store, true)).toContain(correction)
  expect(createCompanionPrompt('a', store, true)).not.toContain(text)
  expect(createCompanionPrompt('b', store, true)).not.toContain(correction)
  expect(createCompanionPrompt('a', store, false)).toBe('')
})

it('rejects fabricated memories and stale tools after disablement', async () => {
  const store = await setup()
  const [record] = await createCompanionTools('a', 'Hello', store, () => true)
  expect(await record.execute({ kind: 'activity', text: 'We went on a trip', source_quote: 'Hello', id: null, due_at: null }, options)).toMatchObject({ status: 'rejected' })
  await store.setEnabled(false)
  expect(await record.execute({ kind: 'thread', text: 'Hello', source_quote: 'Hello', id: null, due_at: null }, options)).toMatchObject({ status: 'rejected' })
  expect(store.forCharacter('a')).toEqual([])
})

it('does not expose writes for no-store, credentials, or disabled personal memory', async () => {
  const store = await setup()
  for (const text of ['Đừng lưu chuyện này nhé', 'password: abc123', 'api_key=secret'])
    expect(await createCompanionTools('a', text, store, () => true)).toEqual([])
  expect(await createCompanionTools('a', 'Remember me', store, () => false)).toEqual([])
})

it('deletes dismissed records and gives spoken corrections priority', async () => {
  const store = await setup()
  const entry = await store.save('a', 'activity', 'Study together')
  const [, resolve, forget] = await createCompanionTools('a', 'Done, forget this', store, () => true)
  await resolve.execute({ id: entry.id, status: 'completed', source_quote: 'Done' }, options)
  expect(store.forCharacter('a')[0].status).toBe('completed')
  await forget.execute({ id: entry.id, source_quote: 'forget this' }, options)
  expect(createCompanionPrompt('a', store, true)).not.toContain('Study together')
  expect(companionBehavior(true)).toContain('latest correction')
})
