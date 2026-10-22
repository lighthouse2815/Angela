import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  const directory = await mkdtemp(join(tmpdir(), 'angela-delivery-'))
  directories.push(directory)
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => Date.now(), 'Asia/Ho_Chi_Minh')
  const notify = vi.fn().mockResolvedValue(undefined)
  const onError = vi.fn()
  const scheduler = new ReminderScheduler(tasks, { notify }, onError)
  schedulers.push(scheduler)
  return { directory, tasks, notify, scheduler, onError }
}

it('keeps a claimed routine due until successful delivery', async () => {
  const { tasks } = await setup()
  const task = await tasks.create({ title: 'Review', type: 'routine', dueAt: new Date(now).toISOString(), recurrence: { type: 'daily' } })
  await tasks.claim(task.id, task.dueAt!)
  const claimed = await tasks.find(task.id)
  expect(claimed.lastNotifiedAt).toBeUndefined()
  expect(claimed.notifiedFor).toBeUndefined()
  expect(claimed.dueAt).toBe(task.dueAt)
})

it('recovers a claim after a crashed owner lease expires', async () => {
  const { tasks, directory, notify } = await setup()
  const task = await tasks.create({ title: 'Recover', type: 'reminder', dueAt: new Date(now).toISOString() })
  await tasks.claim(task.id, task.dueAt!)
  const restarted = new ReminderScheduler(new Tasks(directory, cliMessages.en.tasks, () => Date.now()), { notify }, vi.fn())
  schedulers.push(restarted)
  await restarted.start()
  expect(notify).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(60_000)
  await restarted.refresh()
  expect(notify).toHaveBeenCalledOnce()
})

it('retries a notifier failure without skipping a recurring occurrence', async () => {
  const { tasks, notify, scheduler } = await setup()
  const task = await tasks.create({ title: 'Retry', type: 'routine', dueAt: new Date(now).toISOString(), recurrence: { type: 'daily' } })
  notify.mockRejectedValueOnce(new Error('Temporary failure'))
  await scheduler.start()
  expect((await tasks.find(task.id)).dueAt).toBe(task.dueAt)
  await vi.advanceTimersByTimeAsync(60_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(2)
  expect(notify.mock.calls[1]![0]).toMatchObject([{ id: task.id, dueAt: task.dueAt }])
})

it('fences an expired owner after another process reclaims the same occurrence', async () => {
  const { tasks, directory } = await setup()
  const task = await tasks.create({ title: 'Lease', type: 'reminder', dueAt: new Date(now).toISOString() })
  const first = await tasks.claim(task.id, task.dueAt!)
  if (first?.delivery?.status !== 'claimed')
    throw new Error('Missing claim')
  const other = new Tasks(directory, cliMessages.en.tasks, () => Date.now())
  expect(await other.claim(task.id, task.dueAt!)).toBeUndefined()
  vi.setSystemTime(now + 30_000)
  expect(await tasks.renew(task.id, first.delivery.token)).toBe(false)
  const second = await other.claim(task.id, task.dueAt!)
  if (second?.delivery?.status !== 'claimed')
    throw new Error('Missing replacement claim')
  expect(second.delivery.token).not.toBe(first.delivery.token)
  expect(await tasks.delivered(task.id, first.delivery.token)).toBe(false)
  await tasks.retry(task.id, first.delivery.token)
  expect((await other.find(task.id)).delivery).toEqual(second.delivery)
  expect(await other.delivered(task.id, second.delivery.token)).toBe(true)
  expect(await tasks.claim(task.id, task.dueAt!)).toBeUndefined()
})

it('lets only one of two simultaneous hosts deliver an occurrence', async () => {
  const { tasks, directory, scheduler, notify } = await setup()
  await tasks.create({ title: 'One owner', type: 'reminder', dueAt: new Date(now).toISOString() })
  const other = new ReminderScheduler(new Tasks(directory, cliMessages.en.tasks, () => Date.now()), { notify }, vi.fn())
  schedulers.push(other)
  await Promise.all([scheduler.start(), other.start()])
  expect(notify).toHaveBeenCalledOnce()
  await other.refresh()
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledOnce()
})

it('renews a live lease while presentation waits and excludes another host beyond the original timeout', async () => {
  const { tasks, directory, scheduler, notify } = await setup()
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  let verify: (() => Promise<void>) | undefined
  let deliverySignal: AbortSignal | undefined
  notify.mockImplementation(async (_tasks, _overdue, signal: AbortSignal, check: () => Promise<void>) => {
    verify = check
    deliverySignal = signal
    entered.resolve()
    await gate.promise
    await check()
  })
  const task = await tasks.create({ title: 'Queued', type: 'reminder', dueAt: new Date(now).toISOString() })
  const starting = scheduler.start()
  await entered.promise
  for (let step = 0; step < 9; step++) {
    await vi.advanceTimersByTimeAsync(10_000)
    await verify!()
  }
  expect(deliverySignal?.aborted).toBe(false)
  const other = new Tasks(directory, cliMessages.en.tasks, () => Date.now())
  expect(await other.claim(task.id, task.dueAt!)).toBeUndefined()
  gate.resolve()
  await starting
  expect((await tasks.find(task.id)).notifiedFor).toBe(task.dueAt)
})

it('releases shutdown claims immediately and recovers them in a new host without advancing the routine', async () => {
  const { tasks, scheduler, notify, directory } = await setup()
  const entered = Promise.withResolvers<void>()
  notify.mockImplementationOnce(async (_tasks, _overdue, signal: AbortSignal) => {
    entered.resolve()
    await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  })
  const task = await tasks.create({ title: 'Interrupted', type: 'routine', dueAt: new Date(now).toISOString(), recurrence: { type: 'daily' } })
  const starting = scheduler.start()
  await entered.promise
  await scheduler.close()
  await starting
  expect((await tasks.find(task.id)).dueAt).toBe(task.dueAt)
  expect((await tasks.find(task.id)).notifiedFor).toBeUndefined()
  const next = new ReminderScheduler(new Tasks(directory, cliMessages.en.tasks, () => Date.now()), { notify }, vi.fn())
  schedulers.push(next)
  await next.start()
  expect(notify).toHaveBeenCalledTimes(2)
  expect((await tasks.find(task.id)).dueAt).toBe('2026-10-18T10:00:00.000Z')
  await next.refresh()
  expect(notify).toHaveBeenCalledTimes(2)
})

it('does not acknowledge or advance after a task is snoozed while its notification waits', async () => {
  const { tasks, scheduler, notify } = await setup()
  const task = await tasks.create({ title: 'Changed during delivery', type: 'routine', dueAt: new Date(now).toISOString(), recurrence: { type: 'daily' } })
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  notify.mockImplementationOnce(async (_tasks, _overdue, _signal, verify: () => Promise<void>) => {
    entered.resolve()
    await release.promise
    await verify()
  })
  const starting = scheduler.start()
  await entered.promise
  await tasks.snooze(task.id, new Date(now + 900_000).toISOString())
  release.resolve()
  await starting
  expect((await tasks.find(task.id)).dueAt).toBe(task.dueAt)
  expect((await tasks.find(task.id)).snoozedUntil).toBe(new Date(now + 900_000).toISOString())
  expect((await tasks.find(task.id)).notifiedFor).toBeUndefined()
  vi.setSystemTime(now + 900_000)
  await scheduler.refresh()
  expect((await tasks.find(task.id)).delivery?.status).toBe('delivered')
  expect(notify).toHaveBeenCalledTimes(2)
})

it('retries after an acknowledgment write fails instead of recording delivery early', async () => {
  const { tasks, scheduler, notify, directory, onError } = await setup()
  const task = await tasks.create({ title: 'Ack failed', type: 'reminder', dueAt: new Date(now).toISOString() })
  notify.mockImplementationOnce(async () => {
    await writeFile(join(directory, 'tasks', 'tasks.lock'), 'competing writer')
  })
  await scheduler.start()
  expect(onError).toHaveBeenCalledOnce()
  expect((await tasks.find(task.id)).notifiedFor).toBeUndefined()
  await rm(join(directory, 'tasks', 'tasks.lock'))
  vi.setSystemTime(now + 60_000)
  await scheduler.refresh()
  expect(notify).toHaveBeenCalledTimes(2)
  expect((await tasks.find(task.id)).delivery?.status).toBe('delivered')
})
