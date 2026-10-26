import type { TaskCommand, TaskResponse } from '@angela/companion/task-contracts'
import type { Task } from '@angela/companion/task-schema'

import en from '@angela/i18n/locales/en'

import { useAngelaCardStore } from '@angela/stage-ui/stores/modules/angela-card'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import TasksPage from './index.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const ipc = vi.hoisted(() => ({ invoke: vi.fn<(input: { characterId: string, command: TaskCommand }) => Promise<TaskResponse>>() }))
vi.mock('@angela/electron-vueuse', () => ({ useElectronEventaInvoke: () => ipc.invoke }))
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach(stop => stop())
  vi.resetAllMocks()
  localStorage.clear()
})
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })
const label = (key: string) => i18n.global.t(`settings.pages.tasks.${key}`)
const task: Task = { id: 'd8993b28-a774-48c1-bc22-7d2f5e102ede', title: 'Review chapter', type: 'reminder', status: 'pending', dueAt: '2030-10-28T02:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh', createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' }
const response = (tasks: Task[] = []): TaskResponse => ({ tasks, timezone: 'Asia/Ho_Chi_Minh' })
async function mountPage() {
  const pinia = createPinia()
  const screen = await render(TasksPage, { global: { plugins: [pinia, i18n] } })
  cleanups.push(() => {
    screen.unmount()
    disposePinia(pinia)
  })
  return { cards: useAngelaCardStore(pinia) }
}
async function choose(field: string, value: string) {
  await page.getByRole('combobox', { name: label(field) }).click()
  await page.getByRole('option', { name: label(value), exact: true }).click()
}

it('creates weekly reminders with the selected timezone and weekdays', async () => {
  ipc.invoke.mockResolvedValue(response())
  await mountPage()
  await expect.poll(() => ipc.invoke.mock.calls.length).toBe(1)
  await page.getByLabelText(label('timezone'), { exact: false }).fill('Europe/Paris')
  await page.getByRole('button', { name: label('refresh'), exact: true }).click()
  await expect.poll(() => ipc.invoke.mock.calls.length).toBe(2)
  await expect.element(page.getByLabelText(label('timezone'), { exact: false })).toHaveValue('Europe/Paris')
  await page.getByLabelText(label('timezone'), { exact: false }).fill('Asia/Ho_Chi_Minh')
  await page.getByLabelText(label('titleLabel'), { exact: false }).fill('Study Vietnamese')
  await choose('typeLabel', 'types.routine')
  await page.getByLabelText(label('date'), { exact: true }).fill('2030-10-28')
  await page.getByLabelText(label('time'), { exact: true }).fill('09:00')
  await choose('repeat', 'repeats.weekly')
  await page.getByRole('button', { name: 'Mon', exact: true }).click()
  await page.getByRole('button', { name: label('create'), exact: true }).click()
  await expect.poll(() => ipc.invoke.mock.calls.at(-1)?.[0]).toEqual({ characterId: 'default', command: { type: 'create', input: { title: 'Study Vietnamese', type: 'routine', timezone: 'Asia/Ho_Chi_Minh', dueAt: '2030-10-28T02:00:00.000Z', recurrence: { type: 'weekly', interval: 1, daysOfWeek: [1] } } } })
  await expect.element(page.getByLabelText(label('titleLabel'), { exact: false })).toHaveValue('')
})

it('edits an existing reminder into a date-only task, then exposes snooze and history actions', async () => {
  ipc.invoke.mockResolvedValue(response([task]))
  await mountPage()
  const row = page.getByTestId(`task-${task.id}`)
  await row.getByRole('button', { name: label('edit'), exact: true }).click()
  await expect.element(page.getByLabelText(label('time'), { exact: true })).toHaveValue('09:00')
  await page.getByLabelText(label('time'), { exact: true }).fill('')
  await page.getByRole('button', { name: label('save'), exact: true }).click()
  await expect.poll(() => ipc.invoke.mock.calls.at(-1)?.[0].command).toMatchObject({ type: 'update', id: task.id, changes: { dueAt: null, dueDate: '2030-10-28' } })
  await row.getByRole('button', { name: label('snooze'), exact: true }).click()
  await expect.poll(() => ipc.invoke.mock.calls.at(-1)?.[0].command.type).toBe('snooze')
  ipc.invoke.mockResolvedValue(response([{ ...task, status: 'completed' }]))
  await row.getByRole('button', { name: label('complete'), exact: true }).click()
  await expect.element(page.getByText(task.title, { exact: true })).not.toBeInTheDocument()
  await choose('filter', 'statuses.completed')
  await expect.element(page.getByText(task.title, { exact: true })).toBeVisible()
})

it('keeps the draft and shows an error when saving fails', async () => {
  ipc.invoke.mockResolvedValue(response())
  await mountPage()
  await page.getByLabelText(label('titleLabel'), { exact: false }).fill('Keep this draft')
  ipc.invoke.mockRejectedValue(new Error('Storage is locked'))
  await page.getByRole('button', { name: label('create'), exact: true }).click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Storage is locked')
  await expect.element(page.getByLabelText(label('titleLabel'), { exact: false })).toHaveValue('Keep this draft')
})

it('ignores late snapshots from the previously selected character', async () => {
  const old = Promise.withResolvers<TaskResponse>()
  ipc.invoke.mockImplementation(async ({ characterId }) => characterId === 'default' ? old.promise : response([{ ...task, title: 'Other character task' }]))
  const { cards } = await mountPage()
  await expect.poll(() => ipc.invoke.mock.calls.length).toBe(1)
  cards.activeCardId = 'other'
  await expect.element(page.getByText('Other character task', { exact: true })).toBeVisible()
  old.resolve(response([task]))
  await expect.element(page.getByText(task.title, { exact: true })).not.toBeInTheDocument()
})

it('preserves the schedule and snooze metadata when only the title changes', async () => {
  ipc.invoke.mockResolvedValue(response([{ ...task, dueAt: '2030-10-28T02:00:17.123Z' }]))
  await mountPage()
  await page.getByTestId(`task-${task.id}`).getByRole('button', { name: label('edit'), exact: true }).click()
  await page.getByLabelText(label('titleLabel'), { exact: false }).fill('Renamed review')
  await page.getByRole('button', { name: label('save'), exact: true }).click()
  await expect.poll(() => ipc.invoke.mock.calls.at(-1)?.[0].command).toEqual({ type: 'update', id: task.id, changes: { title: 'Renamed review', type: 'reminder', context: null } })
})
