import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { ProactivePolicy } from './proactive-policy'
import { ReminderScheduler } from './reminder-scheduler'
import { Tasks } from './tasks'

const directories: string[] = []
const schedulers: ReminderScheduler[] = []
afterEach(async () => {
  await Promise.all(schedulers.splice(0).map(scheduler => scheduler.close()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it('defers quiet-hour notifications without acknowledging or losing their occurrence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-policy-'))
  directories.push(directory)
  let now = Date.parse('2026-10-22T23:00:00+07:00')
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => now, 'Asia/Ho_Chi_Minh')
  const task = await tasks.create({ title: 'Quiet study', type: 'reminder', dueAt: new Date(now).toISOString() })
  const policy = new ProactivePolicy({ quietHours: { start: 22, end: 8 } })
  expect(policy.evaluate(task, now)).toMatchObject({ notify: false, nextAt: Date.parse('2026-10-23T08:00:00+07:00') })
  let notifications = 0
  const scheduler = new ReminderScheduler(tasks, { notify: async () => {
    notifications++
  } }, (error) => { throw error }, undefined, policy)
  schedulers.push(scheduler)
  await scheduler.start()
  expect(notifications).toBe(0)
  expect((await tasks.find(task.id)).delivery).toBeUndefined()
  now = Date.parse('2026-10-23T08:00:00+07:00')
  await scheduler.refresh()
  await scheduler.refresh()
  expect(notifications).toBe(1)
  expect((await tasks.find(task.id)).delivery?.status).toBe('delivered')
})

it('applies persisted cooldown across reload and prioritizes deadlines over follow-ups', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-cooldown-'))
  directories.push(directory)
  let now = Date.parse('2026-10-22T12:00:00Z')
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC')
  const task = await tasks.create({ title: 'Study', type: 'reminder', dueAt: new Date(now).toISOString() })
  const claim = await tasks.claim(task.id, task.dueAt!)
  if (claim?.delivery?.status !== 'claimed')
    throw new Error('Missing claim')
  await tasks.delivered(task.id, claim.delivery.token)
  now += 60_000
  await tasks.snooze(task.id, new Date(now + 60_000).toISOString())
  const reloaded = await new Tasks(directory, cliMessages.en.tasks).find(task.id)
  const policy = new ProactivePolicy({ cooldownMs: 600_000 })
  expect(policy.evaluate(reloaded, now + 60_000)).toMatchObject({ notify: false, nextAt: Date.parse(task.dueAt!) + 600_000 })
  expect(policy.evaluate({ ...reloaded, type: 'deadline' }, now).priority).toBeGreaterThan(policy.evaluate({ ...reloaded, type: 'follow_up' }, now).priority)
})

it.each([{ quietHours: { start: 25, end: 8 } }, { cooldownMs: -1 }, { cooldownMs: Number.NaN }])('rejects invalid proactive configuration: %j', (options) => {
  expect(() => new ProactivePolicy(options)).toThrow(RangeError)
})
