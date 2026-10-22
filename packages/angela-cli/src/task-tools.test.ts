import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { taskCommand } from './task-commands'
import { taskContext, taskTools } from './task-tools'
import { Tasks } from './tasks'

const directories: string[] = []
const messages = cliMessages.en.tasks
const now = Date.parse('2026-10-17T16:00:00Z')
const options = { messages: [], toolCallId: 'task-test' }

it.each([
  '',
  'Create a parser for reminder syntax.',
  'Create a function that schedules jobs.',
  'Add validation for reminder timestamps.',
  'Save the task parser output to JSON.',
  'Save this parser output.',
  'Create a task parser for reminders.',
  'Add a reminder timestamp validator.',
  'Save this as a task schema.',
  'Remind me tomorrow is valid syntax.',
  'Implement create reminder command.',
  'Explain how to create a reminder.',
  'Write a test for "remind me tomorrow".',
  'Nhắc tôi học lúc 9h là một ví dụ hợp lệ.',
  'Tôi muốn parser hiểu câu "nhắc tôi học lúc 9h".',
  'Implement support for "remind me tomorrow".',
  'Câu "thêm việc học LINQ" phải map vào task_create.',
  'Hãy viết regex nhận dạng "mai 9h nhắc tôi học".',
  'Tại sao câu mai 9h nhắc tao học lại tạo reminder?',
  'Parser hiểu "mai 9h nhắc tao học" ra sao?',
  'Tôi muốn test câu mai 9h nhắc tao học.',
  '`Mai 9h nhắc tao học LINQ`',
  'Ví dụ: mai 9h nhắc tao học LINQ.',
  'Nếu mai tôi rảnh thì nhắc tôi học.',
  'Đừng nhắc tôi học.',
  'Mai chắc tôi học LINQ.',
  'Có lẽ tối nay tôi học.',
  'Mai 9h nhắc tôi học LINQ và 10h nhắc tôi làm auth.',
])('guards task_create itself against model bypass: %s', async (text) => {
  const { tasks } = await setup()
  const tools = taskTools(tasks, messages, undefined, text)
  expect(await tools[0]!.execute!({ title: 'Study', type: 'reminder', dueAt: '2026-10-18T09:00:00Z' }, options)).toMatchObject({ status: 'rejected' })
  expect(await tasks.list()).toHaveLength(0)
})

it('also prevents meta discussion from mutating an existing task through another tool', async () => {
  const { tasks } = await setup()
  const task = await tasks.create({ title: 'Study', type: 'reminder' })
  const tools = taskTools(tasks, messages, undefined, 'Parser xử lý câu xong rồi như thế nào?')
  const tool = tools.find(tool => tool.function.name === 'task_complete')!
  expect(await tool.execute!({ id: task.id }, options)).toMatchObject({ status: 'rejected' })
  expect((await tasks.find(task.id)).status).toBe('pending')
})

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-task-tools-'))
  directories.push(directory)
  const tasks = new Tasks(directory, messages, () => now, 'Asia/Ho_Chi_Minh')
  const tools = taskTools(tasks, messages, undefined, 'Create a task to study Chinese.')
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
  expect(await command(`/done ${today.id}`)).toContain(messages.statuses.completed)
  expect(await command(`/cancel ${tomorrow.id}`)).toContain(messages.statuses.cancelled)
  expect(await command('/tasks')).toBe(messages.empty)
  expect(await command('/tasks all')).toContain(today.id)
  expect(await command('Remind me in ten minutes')).toBeUndefined()
})

it.each(['/done', '/cancel', '/snooze', '/snooze 1 10m', '/done 1', '/today extra', '/tasks all extra'])('reports useful selection or usage errors: %s', async (text) => {
  const { tasks } = await setup()
  expect([messages.usage, messages.missing]).toContain(await taskCommand(text, tasks, messages, 'en'))
})

it.each([
  'Create a reminder service.',
  'Create a reminder service in TypeScript.',
  'Add a todo component to the sidebar.',
  'Create a task endpoint.',
  'Create a task endpoint for the API.',
  'Add a reminder button.',
  'Create a task repository.',
  'Create a todo repository.',
  'Add a task controller.',
  'Create a reminder hook.',
  'Create a todo page.',
  'Create a task page.',
  'Build a reminder API.',
  'Implement reminder scheduling.',
  'Create task CRUD.',
  'Create a task DTO.',
  'Add a task table to Postgres.',
  'Add a task table to the database.',
  'Schedule a reminder job in Hangfire.',
  'Add a reminder queue consumer.',
  'Create a reminder microservice.',
  'Create a task API endpoint.',
  'Add a todo React component.',
  'Schedule a reminder job in Quartz.',
])('rejects software-development requests at task_create: %s', async (text) => {
  const { tasks } = await setup()
  const tool = taskTools(tasks, messages, undefined, text)[0]!
  expect(await tool.execute!({ title: 'Coding request', type: 'todo' }, options)).toMatchObject({ status: 'rejected' })
  expect(await tasks.list({ status: 'all' })).toEqual([])
})

it.each([
  'Create a task to study LINQ.',
  'Create a task to finish the reminder service.',
  'Create a task to implement the auth endpoint.',
  'Add a todo: submit my report.',
  'Add a todo to implement auth.',
  'Add a todo to refactor the reminder scheduler.',
  'Add a reminder for tomorrow at 9.',
  'Schedule a reminder to deploy the API at 8 PM.',
  'Schedule a reminder for 9 PM to deploy the API.',
  'Save this as a task: review auth.',
  'Remind me tomorrow to finish the task endpoint.',
  'Remind me tomorrow to finish the reminder service.',
  'Mai 9h nhắc tôi chạy test parser.',
  'Mai 9h nhắc tôi code reminder service.',
])('authorizes explicit task management including coding subjects: %s', async (text) => {
  const { tasks } = await setup()
  const tool = taskTools(tasks, messages, undefined, text)[0]!
  expect(await tool.execute!({ title: 'Managed work', type: 'todo' }, options)).toMatchObject({ status: 'saved' })
  expect(await tasks.list()).toHaveLength(1)
})
