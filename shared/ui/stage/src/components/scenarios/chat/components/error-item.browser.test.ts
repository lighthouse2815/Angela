import en from '@angela/i18n/locales/en'
import viLocale from '@angela/i18n/locales/vi'

import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ErrorItem from './error-item.vue'

// HTTP errors were truncated to their status, hiding quota and recovery guidance.
it.each([
  ['en', 'Remote sent 429 response: {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for generativelanguage.googleapis.com"}}', 'Gemini reached its rate or usage limit. Check your quota in Google AI Studio before retrying.'],
  ['vi', 'Remote sent 429 response: {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for generativelanguage.googleapis.com"}}', 'Gemini đã đạt giới hạn tốc độ hoặc hạn mức sử dụng. Kiểm tra quota trong Google AI Studio trước khi thử lại.'],
  ['en', 'Remote sent 429 response: {"error":"rate limited"}', 'The AI provider reached its rate or usage limit. Wait before retrying, or choose another model.'],
  ['en', 'Remote sent 503 response: {"error":"overloaded"}', 'The AI provider is temporarily unavailable. Retry shortly or choose another model.'],
  ['en', 'Remote sent 502 response: {"error":"bad gateway"}', 'The AI provider is temporarily unavailable. Retry shortly or choose another model.'],
  ['en', 'Remote sent 504 response: {"error":"gateway timeout"}', 'The AI provider is temporarily unavailable. Retry shortly or choose another model.'],
])('shows recovery guidance for %s: %s and preserves the original error', async (locale, content, summary) => {
  const onRetry = vi.fn()
  const view = render(ErrorItem, {
    props: { label: 'Core System', message: { role: 'error', content }, canRetry: true, retryLabel: 'Retry', onRetry },
    global: { plugins: [createI18n({ legacy: false, locale, messages: { en, vi: viLocale } })] },
  })

  await expect.element(view.getByText(summary, { exact: true })).toBeVisible()
  expect(view.container.querySelector('pre')).toBeNull()
  await view.getByRole('button', { name: locale === 'vi' ? 'Hiện chi tiết' : 'Show details', exact: true }).click()
  await expect.poll(() => view.container.querySelector('pre')?.textContent).toBe(content)
  await expect.element(view.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await view.getByRole('button', { name: 'Retry', exact: true }).click()
  expect(onRetry).toHaveBeenCalledOnce()
})

it.each([
  'No chat provider or model configured for this character',
  'A tool reported Remote sent 429 response: rate limited',
])('keeps unrelated short errors visible without a details toggle: %s', async (content) => {
  const view = render(ErrorItem, {
    props: { label: 'Core System', message: { role: 'error', content } },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  await expect.element(view.getByText(content)).toBeVisible()
  await expect.element(view.getByRole('button', { name: 'Show details', exact: true })).not.toBeInTheDocument()
})
