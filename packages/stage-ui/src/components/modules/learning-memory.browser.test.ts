import en from '@proj-airi/i18n/locales/en'
import viLocale from '@proj-airi/i18n/locales/vi'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import LearningMemory from './learning-memory.vue'

import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useLearningMemoryStore } from '../../stores/modules/learning-memory'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const stores: ReturnType<typeof createPinia>[] = []
afterEach(() => {
  for (const pinia of stores.splice(0))
    disposePinia(pinia)
  localStorage.clear()
})

it.each([
  ['en', 'Memory text', 'Save memory', 'Edit', 'Delete', 'Enable learning memory'],
  ['vi', 'Nội dung ghi nhớ', 'Lưu ghi nhớ', 'Sửa', 'Xóa', 'Bật trí nhớ học tập'],
])('manages learning memories in %s and scopes the list to the selected character', async (locale, contentLabel, saveLabel, editLabel, deleteLabel, enabledLabel) => {
  localStorage.clear()
  const pinia = createPinia()
  stores.push(pinia)
  const view = render(LearningMemory, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale, messages: { en, vi: viLocale } })] },
  })
  const store = useLearningMemoryStore(pinia)
  const cards = useAiriCardStore(pinia)
  await store.save('other', 'topic', 'Another character lesson')
  await expect.element(view.getByText('Another character lesson')).not.toBeInTheDocument()
  await expect.element(view.getByRole('button', { name: saveLabel, exact: true })).toBeDisabled()
  await view.getByRole('textbox', { name: contentLabel, exact: true }).fill('Learning Python loops')
  await view.getByRole('button', { name: saveLabel, exact: true }).click()
  await expect.element(view.getByText('Learning Python loops', { exact: true })).toBeVisible()
  await view.getByRole('button', { name: editLabel, exact: true }).click()
  await view.getByRole('textbox', { name: contentLabel, exact: true }).fill('Learning Python functions')
  await view.getByRole('button', { name: saveLabel, exact: true }).click()
  await expect.element(view.getByText('Learning Python functions', { exact: true })).toBeVisible()
  expect(store.forCharacter('default')).toHaveLength(1)
  await view.getByRole('switch', { name: new RegExp(`^${enabledLabel}`) }).click()
  await expect.poll(() => store.enabled).toBe(false)
  await expect.element(view.getByText('Learning Python functions')).toBeVisible()
  await view.getByRole('button', { name: deleteLabel, exact: true }).click()
  await expect.element(view.getByText('Learning Python functions')).not.toBeInTheDocument()
  expect(store.forCharacter('default')).toEqual([])
  cards.activeCardId = 'other'
  await expect.element(view.getByText('Another character lesson')).toBeVisible()
})
