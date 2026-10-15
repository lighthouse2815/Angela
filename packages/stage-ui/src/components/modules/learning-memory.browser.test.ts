import en from '@proj-airi/i18n/locales/en'
import viLocale from '@proj-airi/i18n/locales/vi'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import LearningMemory from './learning-memory.vue'

import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useLearningMemoryStore } from '../../stores/modules/learning-memory'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const stores: ReturnType<typeof createPinia>[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const pinia of stores.splice(0))
    disposePinia(pinia)
  localStorage.clear()
})

it.each([
  ['en', 'Enable desktop review reminders'],
  ['vi', 'Bật thông báo nhắc ôn trên desktop'],
])('offers desktop reminder opt-in in %s', async (locale, label) => {
  vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
  localStorage.clear()
  const pinia = createPinia()
  stores.push(pinia)
  const view = render(LearningMemory, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale, messages: { en, vi: viLocale } })] },
  })
  const store = useLearningMemoryStore(pinia)
  const toggle = view.getByRole('switch', { name: new RegExp(`^${label}`) })
  await expect.element(toggle).not.toBeChecked()
  await toggle.click()
  expect(store.reviewRemindersEnabled).toBe(true)
  await store.setEnabled(false)
  await expect.element(toggle).toBeDisabled()
})

it('does not offer native reminder settings on the web', async () => {
  vi.stubEnv('RUNTIME_ENVIRONMENT', 'browser')
  localStorage.clear()
  const pinia = createPinia()
  stores.push(pinia)
  const view = render(LearningMemory, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  await expect.element(view.getByRole('switch', { name: /^Enable desktop review reminders/ })).not.toBeInTheDocument()
})

it.each([
  ['en', 'Review schedule', 'Every 7 days', 'Mark reviewed', 'Ready to review', 'Reviewed once'],
  ['vi', 'Lịch ôn tập', 'Mỗi 7 ngày', 'Đánh dấu đã ôn', 'Đến hạn ôn tập', 'Đã ôn 1 lần'],
])('schedules and records a review in %s', async (locale, scheduleLabel, intervalLabel, reviewLabel, dueLabel, countLabel) => {
  localStorage.clear()
  const pinia = createPinia()
  stores.push(pinia)
  const store = useLearningMemoryStore(pinia)
  await store.save('default', 'topic', 'Python loops')
  const view = render(LearningMemory, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale, messages: { en, vi: viLocale } })] },
  })
  await view.getByRole('combobox', { name: scheduleLabel, exact: true }).click()
  await view.getByRole('option', { name: intervalLabel, exact: true }).click()
  await expect.element(view.getByText(dueLabel, { exact: true })).toBeVisible()
  await view.getByRole('button', { name: reviewLabel, exact: true }).click()
  await expect.element(view.getByText(dueLabel, { exact: true })).not.toBeInTheDocument()
  await expect.element(view.getByText(countLabel, { exact: true })).toBeVisible()
  expect(store.forCharacter('default')[0].review?.count).toBe(1)
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
