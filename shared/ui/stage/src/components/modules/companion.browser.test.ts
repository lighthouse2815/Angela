import en from '@angela/i18n/locales/en'
import viLocale from '@angela/i18n/locales/vi'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import Companion from './companion.vue'

import { useCompanionStore } from '../../stores/modules/companion'

const stores: ReturnType<typeof createPinia>[] = []
afterEach(() => {
  for (const pinia of stores.splice(0))
    disposePinia(pinia)
  localStorage.clear()
})

it.each([
  ['en', 'Enable companion memory and follow-ups', 'Your preference, subject, or activity goal', 'Save / start activity', 'I finished this', 'Delete record'],
  ['vi', 'Bật ghi nhớ đồng hành và hỏi thăm', 'Sở thích, chuyện còn dang dở hoặc mục tiêu hoạt động', 'Lưu / bắt đầu hoạt động', 'Mình đã làm xong', 'Xóa bản ghi'],
])('starts, completes, and deletes an activity in %s', async (locale, enable, subject, save, complete, remove) => {
  localStorage.clear()
  const pinia = createPinia()
  stores.push(pinia)
  const view = render(Companion, { global: { plugins: [pinia, createI18n({ legacy: false, locale, messages: { en, vi: viLocale } })] } })
  await view.getByRole('switch', { name: enable, exact: true }).click()
  await view.getByRole('textbox', { name: subject }).fill('Study Python loops')
  await view.getByRole('button', { name: save, exact: true }).click()
  const store = useCompanionStore(pinia)
  expect(store.forCharacter('default')[0]).toMatchObject({ text: 'Study Python loops', kind: 'activity', status: 'open' })
  expect(store.forCharacter('default')[0].dueAt).toBeGreaterThan(Date.now())
  await view.getByRole('button', { name: complete, exact: true }).click()
  expect(store.forCharacter('default')[0].status).toBe('completed')
  await view.getByRole('button', { name: remove, exact: true }).click()
  expect(store.forCharacter('default')).toEqual([])
})
