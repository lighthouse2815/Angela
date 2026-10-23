import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { proactiveCandidate } from './proactive-candidate'
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

it.each([{ quietHours: { start: 25, end: 8 } }, { cooldownMs: -1 }, { cooldownMs: Number.NaN }, { recentActivityMs: -1 }, { followUpCooldownMs: Number.NaN }])('rejects invalid proactive configuration: %j', (options) => {
  expect(() => new ProactivePolicy(options)).toThrow(RangeError)
})

it('explains relevance, confidence, duplicate suppression, expiry, and recent activity decisions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-candidate-policy-'))
  directories.push(directory)
  const now = Date.parse('2026-10-23T09:00:00Z')
  const task = await new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC').create({ title: 'Auth', type: 'follow_up', dueAt: new Date(now).toISOString() })
  const candidate = proactiveCandidate(task, now)!
  const policy = new ProactivePolicy()
  expect(policy.evaluateCandidate({ ...candidate, relevant: false }, now, 'UTC').reason).toBe('irrelevant')
  expect(policy.evaluateCandidate({ ...candidate, confidence: 0.5 }, now, 'UTC').reason).toBe('low_confidence')
  expect(policy.evaluateCandidate({ ...candidate, alreadyPrompted: true }, now, 'UTC').reason).toBe('already_prompted')
  expect(policy.evaluateCandidate({ ...candidate, expiresAt: now }, now, 'UTC').reason).toBe('expired')
  expect(policy.evaluate(task, now, { lastActivityAt: now })).toMatchObject({ notify: false, reason: 'deferred', nextAt: now + 120_000 })
  expect(policy.evaluate(task, now)).toMatchObject({ notify: true, reason: 'ready' })
})

it('limits offline follow-up bursts across restarts and persists skipped stale candidates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-follow-up-burst-'))
  directories.push(directory)
  let now = Date.parse('2026-10-23T10:30:00Z')
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC')
  const stale = await tasks.create({ title: 'Stale auth', type: 'follow_up', dueAt: '2026-10-20T09:00:00Z' })
  for (const title of ['Auth', 'Report', 'LINQ'])
    await tasks.create({ title, type: 'follow_up', dueAt: '2026-10-23T09:00:00Z' })
  const presented: string[] = []
  const create = () => {
    const scheduler = new ReminderScheduler(new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC'), { notify: async (batch) => {
      presented.push(...batch.map(task => task.id))
    } }, (error) => { throw error })
    schedulers.push(scheduler)
    return scheduler
  }
  let scheduler = create()
  await scheduler.start()
  expect(presented).toHaveLength(1)
  expect((await tasks.find(stale.id)).delivery).toMatchObject({ status: 'skipped', reason: 'expired' })
  await scheduler.close()
  scheduler = create()
  await scheduler.start()
  expect(presented).toHaveLength(1)
  now += 30 * 60_000
  await scheduler.refresh()
  expect(presented).toHaveLength(2)
  expect(new Set(presented).size).toBe(2)
  expect(presented).not.toContain(stale.id)
})

it('keeps failed follow-ups retryable without advancing prompt count and recovers an expired lease', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-follow-up-failure-'))
  directories.push(directory)
  let now = Date.parse('2026-10-23T09:00:00Z')
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC')
  const task = await tasks.create({ title: 'Refresh token', type: 'follow_up', dueAt: new Date(now).toISOString() })
  const claim = await tasks.claim(task.id, task.dueAt!)
  expect(claim?.delivery?.status).toBe('claimed')
  let fail = true
  const errors: unknown[] = []
  let count = 0
  const scheduler = new ReminderScheduler(tasks, { notify: async () => {
    if (fail)
      throw new Error('Notification unavailable')
    count++
  } }, error => errors.push(error))
  schedulers.push(scheduler)
  await scheduler.start()
  expect(count).toBe(0)
  now += 31_000
  await scheduler.refresh()
  expect(errors).toHaveLength(1)
  expect((await tasks.find(task.id)).followUp?.promptCount).toBe(0)
  fail = false
  now += 31_000
  await scheduler.refresh()
  await scheduler.refresh()
  expect(count).toBe(1)
  expect((await tasks.find(task.id)).followUp?.promptCount).toBe(1)
})

it('fences distinct follow-ups across hosts and refuses expired work without consuming a live lease', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-follow-up-fencing-'))
  directories.push(directory)
  let now = Date.parse('2026-10-23T09:00:00Z')
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC')
  const first = await tasks.create({ title: 'Auth', type: 'follow_up', dueAt: new Date(now).toISOString() })
  const second = await tasks.create({ title: 'Report', type: 'follow_up', dueAt: new Date(now).toISOString() })
  const other = new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC')
  const claim = await tasks.claim(first.id, first.dueAt!)
  if (claim?.delivery?.status !== 'claimed')
    throw new Error('Missing follow-up claim')
  expect(await other.claim(second.id, second.dueAt!)).toBeUndefined()
  expect(await tasks.delivered(first.id, claim.delivery.token)).toBe(true)
  expect(await other.claim(second.id, second.dueAt!)).toBeUndefined()
  now += 30 * 60_000
  expect((await other.claim(second.id, second.dueAt!))?.delivery?.status).toBe('claimed')

  now += 48 * 3_600_000
  await tasks.skipExpired(second.id, second.dueAt!)
  expect((await tasks.find(second.id)).delivery?.status).toBe('skipped')
  expect(await other.claim(second.id, second.dueAt!)).toBeUndefined()
  const nearExpiry = await tasks.create({ title: 'Almost stale', type: 'follow_up', dueAt: new Date(now - 48 * 3_600_000 + 1000).toISOString() })
  const live = await tasks.claim(nearExpiry.id, nearExpiry.dueAt!)
  expect(live?.delivery?.status).toBe('claimed')
  now += 2000
  await tasks.skipExpired(nearExpiry.id, nearExpiry.dueAt!)
  expect((await tasks.find(nearExpiry.id)).delivery?.status).toBe('claimed')
  now += 30_000
  await tasks.skipExpired(nearExpiry.id, nearExpiry.dueAt!)
  expect((await tasks.find(nearExpiry.id)).delivery?.status).toBe('skipped')
})

it('skips an expired recurring follow-up and retains its next calendar occurrence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-recurring-follow-up-'))
  directories.push(directory)
  const now = Date.parse('2026-10-23T10:00:00Z')
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC')
  const task = await tasks.create({ title: 'Weekly progress', type: 'follow_up', dueAt: '2026-10-16T09:00:00Z', recurrence: { type: 'weekly' } })
  await tasks.skipExpired(task.id, task.dueAt!)
  const updated = await tasks.find(task.id)
  expect(updated.delivery?.status).toBe('skipped')
  expect(updated.dueAt).toBe('2026-10-30T09:00:00.000Z')
  expect(new ProactivePolicy().evaluate(updated, now)).toMatchObject({ notify: false, nextAt: Date.parse(updated.dueAt!) })
})
