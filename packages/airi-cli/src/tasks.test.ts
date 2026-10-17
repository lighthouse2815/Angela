import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { Tasks } from './tasks'

const directories: string[] = []
const now = Date.parse('2026-10-17T10:00:00Z')
const messages = cliMessages.en.tasks

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-tasks-'))
  directories.push(directory)
  return { directory, tasks: new Tasks(directory, messages, () => now, 'Asia/Ho_Chi_Minh'), path: join(directory, 'tasks', 'tasks.json') }
}

it('persists every task type and stable IDs across sessions with private atomic storage', async () => {
  const { directory, tasks, path } = await setup()
  expect(await tasks.list()).toEqual([])
  expect(await readdir(directory)).toEqual([])
  for (const type of ['todo', 'reminder', 'deadline', 'follow_up'] as const) {
    const created = await tasks.create({ title: type, type, dueAt: '2026-10-17T22:00:00+07:00', context: 'Study session' })
    expect(await new Tasks(directory, messages).find(created.id)).toEqual(created)
    expect(created.dueAt).toBe('2026-10-17T15:00:00.000Z')
  }
  await tasks.create({ title: 'Review', type: 'routine', dueAt: '2026-10-17T22:00:00+07:00', recurrence: { type: 'daily' } })
  expect(await tasks.list()).toHaveLength(5)
  expect((await stat(path)).mode & 0o777).toBe(0o600)
  expect(await readdir(join(directory, 'tasks'))).toEqual(['tasks.json'])
})

it('updates, completes, cancels and retains history with timestamps', async () => {
  const { tasks } = await setup()
  const first = await tasks.create({ title: 'Slides', type: 'todo' })
  const updated = await tasks.update(first.id, { title: 'Research slides', dueDate: '2026-10-18', context: 'Chapter 3' })
  expect(updated.createdAt).toBe(first.createdAt)
  expect(updated.updatedAt).toBe(new Date(now).toISOString())
  expect(updated.title).toBe('Research slides')
  expect((await tasks.complete(first.id)).completedAt).toBe(new Date(now).toISOString())
  expect((await tasks.find(first.id)).status).toBe('completed')
  await expect(tasks.snooze(first.id, '2026-10-18T10:00:00Z')).rejects.toThrow(messages.inactive)
  const second = await tasks.create({ title: 'Call Minh', type: 'follow_up' })
  await tasks.cancel(second.id)
  expect(await tasks.list()).toEqual([])
  expect(await tasks.list({ status: 'all' })).toHaveLength(2)
  expect(await tasks.list({ status: 'cancelled' })).toMatchObject([{ id: second.id }])
  await expect(tasks.complete(randomUUID())).rejects.toThrow(messages.missing)
})

it('sorts effective times and filters by type and local date including date-only deadlines', async () => {
  const { tasks } = await setup()
  const later = await tasks.create({ title: 'Later', type: 'reminder', dueAt: '2026-10-18T00:00:00+07:00' })
  const earlier = await tasks.create({ title: 'Earlier', type: 'deadline', dueAt: '2026-10-17T23:00:00+07:00' })
  await tasks.create({ title: 'Tomorrow', type: 'deadline', dueDate: '2026-10-18' })
  await tasks.create({ title: 'Unscheduled', type: 'todo' })
  expect((await tasks.list())[0]!.id).toBe(earlier.id)
  expect(await tasks.list({ date: '2026-10-17' })).toMatchObject([{ id: earlier.id }])
  expect(await tasks.list({ date: '2026-10-18', type: 'reminder' })).toMatchObject([{ id: later.id }])
  expect(await tasks.list({ date: '2026-10-18', type: 'deadline' })).toMatchObject([{ title: 'Tomorrow' }])
  await tasks.snooze(earlier.id, '2026-10-18T03:00:00+07:00')
  expect((await tasks.list()).at(-1)!.title).toBe('Unscheduled')
  expect((await tasks.find(earlier.id)).dueAt).toBe(earlier.dueAt)
  expect(await tasks.list({ date: '2026-10-17' })).toEqual([])
})

it.each(['{broken', '{"version":2,"tasks":[]}', '{"version":1,"tasks":[{}]}'])('preserves invalid storage and releases write locks: %s', async (source) => {
  const { tasks, path } = await setup()
  await tasks.create({ title: 'Keep', type: 'todo' })
  await writeFile(path, source)
  await expect(tasks.list()).rejects.toThrow(messages.invalid)
  await expect(tasks.create({ title: 'New', type: 'todo' })).rejects.toThrow(messages.invalid)
  expect(await readFile(path, 'utf8')).toBe(source)
  expect(await readdir(join(path, '..'))).toEqual(['tasks.json'])
})

it('rejects duplicate IDs, invalid schedules and past snooze without changing valid storage', async () => {
  const { tasks, path } = await setup()
  const task = await tasks.create({ title: 'Keep', type: 'todo' })
  const original = await readFile(path, 'utf8')
  await expect(tasks.create({ title: ' ', type: 'todo' })).rejects.toThrow()
  await expect(tasks.create({ title: 'Routine', type: 'routine' })).rejects.toThrow()
  await expect(tasks.create({ title: 'Bad zone', type: 'todo', timezone: 'Mars/Base' })).rejects.toThrow()
  await expect(tasks.create({ title: 'Bad date', type: 'deadline', dueDate: '2026-02-30' })).rejects.toThrow()
  await expect(tasks.create({ title: 'Ambiguous', type: 'deadline', dueAt: '2026-10-18T10:00:00Z', dueDate: '2026-10-18' })).rejects.toThrow()
  await expect(tasks.snooze(task.id, new Date(now).toISOString())).rejects.toThrow(messages.future)
  expect(await readFile(path, 'utf8')).toBe(original)
  await writeFile(path, JSON.stringify({ version: 1, tasks: [task, task] }))
  await expect(tasks.list()).rejects.toThrow(messages.invalid)
})

it('serializes local mutations, respects cross-process locks and recovers after validation failures', async () => {
  const { tasks, path } = await setup()
  await Promise.all(Array.from({ length: 10 }, (_, index) => tasks.create({ title: `Task ${index}`, type: 'todo' })))
  expect(await tasks.list()).toHaveLength(10)
  await writeFile(join(path, '..', 'tasks.lock'), 'busy')
  await expect(tasks.create({ title: 'Blocked', type: 'todo' })).rejects.toThrow(messages.locked)
  await rm(join(path, '..', 'tasks.lock'))
  await expect(tasks.update((await tasks.list())[0]!.id, { title: '' })).rejects.toThrow()
  await tasks.create({ title: 'Recovered', type: 'todo' })
  expect(await tasks.list()).toHaveLength(11)
})

it('claims an occurrence once across independent services and allows explicit snooze after delivery', async () => {
  const { tasks, directory } = await setup()
  const dueAt = '2026-10-17T09:00:00.000Z'
  const task = await tasks.create({ title: 'Review', type: 'reminder', dueAt })
  const claim = await tasks.claim(task.id, dueAt)
  expect(claim).toMatchObject({ id: task.id })
  const other = new Tasks(directory, messages, () => now)
  expect(await other.claim(task.id, dueAt)).toBeUndefined()
  expect((await other.find(task.id)).lastNotifiedAt).toBeUndefined()
  if (claim?.delivery?.status !== 'claimed')
    throw new Error('Missing delivery claim')
  expect(await tasks.delivered(task.id, claim.delivery.token)).toBe(true)
  expect((await other.find(task.id)).lastNotifiedAt).toBe(new Date(now).toISOString())
  await tasks.snooze(task.id, '2026-10-17T10:15:00Z')
  expect((await tasks.find(task.id)).notifiedFor).toBeUndefined()
})

it('checks in recurring tasks without losing the recurrence or completing the series', async () => {
  const { tasks } = await setup()
  const task = await tasks.create({ title: 'Review', type: 'routine', dueAt: '2026-10-16T22:00:00+07:00', recurrence: { type: 'daily' } })
  const checked = await tasks.complete(task.id)
  expect(checked.status).toBe('pending')
  expect(checked.completedAt).toBe(new Date(now).toISOString())
  expect(checked.dueAt).toBe('2026-10-17T15:00:00.000Z')
  expect(checked.recurrenceAnchor).toBe(task.dueAt)
  await tasks.cancel(task.id)
  expect((await tasks.find(task.id)).status).toBe('cancelled')
})

it('rejects impossible timestamps and invalid recurrence settings before saving', async () => {
  const { tasks } = await setup()
  await expect(tasks.create({ title: 'Impossible date', type: 'reminder', dueAt: '2026-02-30T22:00:00Z' })).rejects.toThrow()
  await expect(tasks.create({ title: 'Duplicate weekdays', type: 'routine', dueAt: '2026-10-17T22:00:00Z', recurrence: { type: 'weekly', daysOfWeek: [1, 1] } })).rejects.toThrow()
  await expect(tasks.create({ title: 'Daily weekdays', type: 'routine', dueAt: '2026-10-17T22:00:00Z', recurrence: { type: 'daily', daysOfWeek: [1] } })).rejects.toThrow()
  expect(await tasks.list()).toEqual([])
})

it('completes an undelivered routine occurrence early and retains the next occurrence after delivery', async () => {
  const { tasks } = await setup()
  const early = await tasks.create({ title: 'Early study', type: 'routine', dueAt: '2026-10-17T22:00:00+07:00', recurrence: { type: 'daily' } })
  expect((await tasks.complete(early.id)).dueAt).toBe('2026-10-18T15:00:00.000Z')
  const delivered = await tasks.create({ title: 'Delivered study', type: 'routine', dueAt: '2026-10-17T09:00:00Z', recurrence: { type: 'daily' } })
  const claim = await tasks.claim(delivered.id, delivered.dueAt!)
  if (claim?.delivery?.status !== 'claimed')
    throw new Error('Missing delivery claim')
  await tasks.delivered(delivered.id, claim.delivery.token)
  const next = (await tasks.find(delivered.id)).dueAt
  expect((await tasks.complete(delivered.id)).dueAt).toBe(next)
})
