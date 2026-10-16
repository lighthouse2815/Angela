import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { taskCommand } from './task-commands'
import { taskContext, taskTools } from './task-tools'
import { Tasks } from './tasks'

const directories: string[] = []
const messages = cliMessages.en.tasks
const now = Date.parse('2026-10-17T16:00:00Z')
const options = { messages: [], toolCallId: 'task-test' }

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-task-tools-'))
  directories.push(directory)
  const tasks = new Tasks(directory, messages, () => now, 'Asia/Ho_Chi_Minh')
  const tools = taskTools(tasks, messages)
  const call = async (name: string, input: unknown) => await tools.find(tool => tool.function.name === name)!.execute!(input, options)
  return { tasks, tools, call }
}

it('connects all six tools to persistent service operations', async () => {
  const { tasks, tools, call } = await setup()
  expect(tools.map(tool => tool.function.name)).toEqual(['task_create', 'task_list', 'task_update', 'task_complete', 'task_cancel', 'task_snooze'])
  expect(await call('task_create', { title: 'Study Chinese', type: 'reminder', dueAt: '2026-10-18T22:00:00+07:00' })).toMatchObject({ status: 'saved', result: { title: 'Study Chinese' } })
  const task = (await tasks.list())[0]!
  expect(await call('task_list', { date: '2026-10-18' })).toMatchObject({ status: 'listed', result: [{ id: task.id }] })
  expect(await call('task_update', { id: task.id, changes: { dueAt: '2026-10-18T21:00:00+07:00' } })).toMatchObject({ status: 'saved', result: { dueAt: '2026-10-18T14:00:00.000Z' } })
  expect(await call('task_snooze', { id: task.id, duration: '15m' })).toMatchObject({ status: 'saved', result: { id: task.id, snoozedUntil: '2026-10-17T16:15:00.000Z' } })
  expect(await call('task_complete', { id: task.id })).toMatchObject({ status: 'saved', result: { status: 'completed' } })
  const other = await tasks.create({ title: 'Call Minh', type: 'follow_up' })
  expect(await call('task_cancel', { id: other.id })).toMatchObject({ status: 'saved', result: { status: 'cancelled' } })
})

it('preserves date-only intent and clears it when an explicit alarm time is selected', async () => {
  const { tasks, call } = await setup()
  await call('task_create', { title: 'Submit research', type: 'deadline', dueDate: '2026-10-18' })
  const task = (await tasks.list())[0]!
  expect(task.dueAt).toBeUndefined()
  expect(await call('task_update', { id: task.id, changes: { dueDate: null, dueAt: '2026-10-18T12:00:00+07:00' } })).toMatchObject({ status: 'saved', result: { dueAt: '2026-10-18T05:00:00.000Z' } })
  expect((await tasks.find(task.id)).dueDate).toBeUndefined()
  expect(taskContext(tasks)).toContain('2026-10-17T16:00:00.000Z')
  expect(taskContext(tasks)).toContain('Asia/Ho_Chi_Minh')
  expect(taskContext(tasks)).toContain('Never invent an alarm time')
})

it.each([
  ['task_create', { title: '', type: 'todo' }],
  ['task_create', { title: 'Bad routine', type: 'routine' }],
  ['task_create', { title: 'Timezone', type: 'todo', timezone: 'invalid' }],
  ['task_create', { title: 'Alarm', type: 'reminder', dueAt: 'tomorrow evening' }],
  ['task_create', { title: 'Extra', type: 'todo', status: 'completed' }],
  ['task_update', { id: '../../file', changes: { title: 'Invalid' } }],
  ['task_list', { date: '2026-02-30' }],
  ['task_snooze', { id: 'missing', duration: '10m' }],
])('rejects invalid input before mutation for %s', async (name, input) => {
  const { tasks, call } = await setup()
  expect(await call(name as string, input)).toMatchObject({ status: 'rejected', reason: messages.input })
  expect(await tasks.list({ status: 'all' })).toEqual([])
})

it('rejects cancelled tool calls before writes and reports invalid durations', async () => {
  const { tools, tasks, call } = await setup()
  const controller = new AbortController()
  controller.abort()
  await expect(tools[0]!.execute!({ title: 'Cancelled', type: 'todo' }, { ...options, abortSignal: controller.signal })).rejects.toThrow()
  expect(await tasks.list()).toEqual([])
  const task = await tasks.create({ title: 'Review', type: 'reminder' })
  for (const input of [{ duration: 'tomorrow' }, { duration: '0m' }, { duration: '10m', until: '2026-10-18T10:00:00Z' }, {}])
    expect(await call('task_snooze', { id: task.id, ...input })).toMatchObject({ status: 'rejected' })
  expect((await tasks.find(task.id)).snoozedUntil).toBeUndefined()
})

it('handles management commands with stable IDs and date filters without model requests', async () => {
  const { tasks } = await setup()
  const today = await tasks.create({ title: 'Today\u001B[31m', type: 'todo', dueDate: '2026-10-17' })
  const tomorrow = await tasks.create({ title: 'Tomorrow', type: 'deadline', dueDate: '2026-10-18' })
  const command = async (text: string) => await taskCommand(text, tasks, messages, 'en')
  expect(await command('/tasks')).toContain(today.id)
  expect(await command('/tasks')).not.toContain('\u001B')
  expect(await command('/today')).toContain(today.id)
  expect(await command('/today')).not.toContain(tomorrow.id)
  expect(await command(`/snooze ${today.id} 10m`)).toContain(messages.saved)
  expect((await tasks.find(today.id)).snoozedUntil).toBe('2026-10-17T16:10:00.000Z')
  expect(await command(`/done ${today.id}`)).toContain('completed')
  expect(await command(`/cancel ${tomorrow.id}`)).toContain('cancelled')
  expect(await command('/tasks')).toBe(messages.empty)
  expect(await command('/tasks all')).toContain(today.id)
  expect(await command('Remind me in ten minutes')).toBeUndefined()
})

it.each(['/done', '/cancel', '/snooze', '/snooze 1 10m', '/done 1', '/today extra', '/tasks all extra'])('reports useful selection or usage errors: %s', async (text) => {
  const { tasks } = await setup()
  expect([messages.usage, messages.missing]).toContain(await taskCommand(text, tasks, messages, 'en'))
})
