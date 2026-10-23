import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ReminderScheduler } from './reminder-scheduler'
import { Tasks } from './tasks'

const directories: string[] = []
const schedulers: ReminderScheduler[] = []
const now = Date.parse('2026-10-17T10:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(now)
})
afterEach(async () => {
  await Promise.all(schedulers.splice(0).map(scheduler => scheduler.close()))
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-scheduler-'))
  directories.push(directory)
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => Date.now(), 'Asia/Ho_Chi_Minh')
  const notify = vi.fn().mockResolvedValue(undefined)
  const onError = vi.fn()
  const scheduler = new ReminderScheduler(tasks, { notify }, onError)
  schedulers.push(scheduler)
  return { directory, tasks, notify, scheduler, onError }
}

it('selects the nearest deadline, fires once, and ignores unscheduled tasks', async () => {
  const { tasks, notify, scheduler } = await setup()
  const later = await tasks.create({ title: 'Later', type: 'reminder', dueAt: new Date(now + 50_000).toISOString() })
  const first = await tasks.create({ title: 'First', type: 'deadline', dueAt: new Date(now + 10_000).toISOString() })
  await tasks.create({ title: 'Date only', type: 'todo', dueDate: '2026-10-17' })
  const fired = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
  notify.mockImplementation(async () => {
    fired[notify.mock.calls.length - 1]?.resolve()
  })
  await scheduler.start()
  await scheduler.start()
  expect(vi.getTimerCount()).toBe(1)
  await vi.advanceTimersByTimeAsync(10_000)
  await fired[0]!.promise
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify.mock.calls[0]![0]).toMatchObject([{ id: first.id }])
  expect(notify.mock.calls[0]![1]).toBe(false)
  await vi.advanceTimersByTimeAsync(40_000)
  await fired[1]!.promise
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(2)
  expect(notify.mock.calls[1]![0]).toMatchObject([{ id: later.id }])
  await vi.advanceTimersByTimeAsync(120_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(2)
})

it('coalesces overdue startup recovery and prevents replay after a normal restart', async () => {
  const { tasks, directory, notify, scheduler } = await setup()
  for (const title of ['Overdue one', 'Overdue two'])
    await tasks.create({ title, type: 'reminder', dueAt: '2026-10-16T22:00:00+07:00' })
  await scheduler.start()
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify.mock.calls[0]![0]).toHaveLength(2)
  expect(notify.mock.calls[0]![1]).toBe(true)
  await scheduler.close()
  const next = new ReminderScheduler(new Tasks(directory, cliMessages.en.tasks), { notify }, vi.fn())
  schedulers.push(next)
  await next.start()
  expect(notify).toHaveBeenCalledTimes(1)
})

it('reschedules immediately after create, update, snooze, complete and cancel', async () => {
  const { tasks, notify, scheduler } = await setup()
  await scheduler.start()
  const task = await tasks.create({ title: 'Changed', type: 'reminder', dueAt: new Date(now + 50_000).toISOString() })
  await scheduler.refresh()
  await tasks.update(task.id, { dueAt: new Date(now + 10_000).toISOString() })
  await scheduler.refresh()
  await tasks.snooze(task.id, new Date(now + 20_000).toISOString())
  await scheduler.refresh()
  await vi.advanceTimersByTimeAsync(10_000)
  await scheduler.refresh()
  expect(notify).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(10_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(1)
  const cancelled = await tasks.create({ title: 'Cancelled', type: 'todo', dueAt: new Date(now + 30_000).toISOString() })
  const completed = await tasks.create({ title: 'Completed', type: 'todo', dueAt: new Date(now + 30_000).toISOString() })
  await tasks.cancel(cancelled.id)
  await tasks.complete(completed.id)
  await scheduler.refresh()
  await vi.advanceTimersByTimeAsync(60_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(1)
})

it('advances recurring overdue tasks, retains their anchor and does not repeat after restart', async () => {
  const { tasks, notify, scheduler, directory } = await setup()
  const task = await tasks.create({ title: 'Daily review', type: 'routine', dueAt: '2026-10-14T22:00:00+07:00', recurrence: { type: 'daily' } })
  await scheduler.start()
  expect(notify).toHaveBeenCalledTimes(1)
  const advanced = await tasks.find(task.id)
  expect(advanced.dueAt).toBe('2026-10-17T15:00:00.000Z')
  expect(advanced.recurrenceAnchor).toBe(task.dueAt)
  expect(advanced.status).toBe('pending')
  await scheduler.close()
  const restarted = new ReminderScheduler(new Tasks(directory, cliMessages.en.tasks, () => Date.now()), { notify }, vi.fn())
  schedulers.push(restarted)
  await restarted.start()
  expect(notify).toHaveBeenCalledTimes(1)
  vi.setSystemTime(Date.parse(advanced.dueAt!))
  await restarted.refresh()
  expect(notify).toHaveBeenCalledTimes(2)
})

it('reconciles clock jumps and cross-process task changes without busy polling', async () => {
  const { tasks, notify, scheduler, directory } = await setup()
  await scheduler.start()
  const other = new Tasks(directory, cliMessages.en.tasks, () => Date.now())
  await other.create({ title: 'Other process', type: 'reminder', dueAt: new Date(now + 1000).toISOString() })
  await vi.advanceTimersByTimeAsync(60_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(1)
  const future = await tasks.create({ title: 'Clock jump', type: 'reminder', dueAt: new Date(now + 3_600_000).toISOString() })
  await scheduler.refresh()
  vi.setSystemTime(now + 7_200_000)
  await vi.advanceTimersByTimeAsync(60_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(2)
  expect(notify.mock.calls[1]![0]).toMatchObject([{ id: future.id }])
})

it('keeps failed delivery pending and retries after the backoff', async () => {
  const { tasks, notify, scheduler, onError } = await setup()
  const task = await tasks.create({ title: 'Claim first', type: 'reminder', dueAt: new Date(now).toISOString() })
  notify.mockImplementation(async () => {
    expect((await tasks.find(task.id)).lastNotifiedAt).toBeUndefined()
    throw new Error('Delivery failed')
  })
  await scheduler.start()
  expect(onError).toHaveBeenCalledTimes(1)
  notify.mockResolvedValue(undefined)
  await vi.advanceTimersByTimeAsync(60_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(2)
})

it('preserves corrupt data and recovers scheduling after storage repair', async () => {
  const { tasks, directory, scheduler, onError, notify } = await setup()
  await tasks.create({ title: 'Keep', type: 'reminder', dueAt: new Date(now).toISOString() })
  const path = join(directory, 'tasks', 'tasks.json')
  const original = await readFile(path, 'utf8')
  await writeFile(path, '{broken')
  await scheduler.start()
  expect(onError).toHaveBeenCalledTimes(1)
  expect(await readFile(path, 'utf8')).toBe('{broken')
  await writeFile(path, original)
  await vi.advanceTimersByTimeAsync(60_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(1)
})

it('cancels in-flight notification, drains shutdown and clears subscriptions and timers', async () => {
  const { tasks, notify, scheduler } = await setup()
  const task = await tasks.create({ title: 'Pending', type: 'reminder', dueAt: new Date(now).toISOString() })
  const entered = Promise.withResolvers<void>()
  notify.mockImplementation(async (_tasks, _overdue, signal: AbortSignal) => {
    entered.resolve()
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
    })
  })
  const starting = scheduler.start()
  await entered.promise
  await scheduler.close()
  await starting
  expect((await tasks.find(task.id)).lastNotifiedAt).toBeUndefined()
  expect((await tasks.find(task.id)).delivery?.status).toBe('pending')
  expect(vi.getTimerCount()).toBe(0)
  await tasks.create({ title: 'After close', type: 'reminder', dueAt: new Date(now).toISOString() })
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(1)
})

it('retains the next regular occurrence after snoozing an already delivered routine', async () => {
  const { tasks, scheduler, notify } = await setup()
  const task = await tasks.create({ title: 'Review', type: 'routine', dueAt: new Date(now).toISOString(), recurrence: { type: 'daily' } })
  await scheduler.start()
  const nextDue = (await tasks.find(task.id)).dueAt
  await tasks.snooze(task.id, new Date(now + 600_000).toISOString())
  await scheduler.refresh()
  await vi.advanceTimersByTimeAsync(600_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(2)
  expect((await tasks.find(task.id)).dueAt).toBe(nextDue)
})

it('waits after a backward clock jump and delivers the occurrence only at its actual deadline', async () => {
  const { tasks, scheduler, notify } = await setup()
  await tasks.create({ title: 'Clock', type: 'reminder', dueAt: new Date(now + 10_000).toISOString() })
  await scheduler.start()
  vi.setSystemTime(now - 60_000)
  await vi.advanceTimersByTimeAsync(10_000)
  await scheduler.refresh()
  expect(notify).not.toHaveBeenCalled()
  vi.setSystemTime(now + 10_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(1)
})
