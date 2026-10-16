import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { localDate, nextOccurrence, taskDuration } from './task-time'
import { Tasks } from './tasks'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function routine(dueAt: string, recurrence: { type: 'daily' | 'weekly', interval?: number, daysOfWeek?: number[] }, timezone = 'Asia/Ho_Chi_Minh') {
  const directory = await mkdtemp(join(tmpdir(), 'angela-recurrence-'))
  directories.push(directory)
  return await new Tasks(directory, cliMessages.en.tasks, Date.now, timezone).create({ title: 'Study', type: 'routine', dueAt, recurrence })
}

it('advances daily routines over month/year boundaries and skips offline occurrences', async () => {
  const task = await routine('2026-12-31T22:00:00+07:00', { type: 'daily' })
  expect(nextOccurrence(task, Date.parse('2026-12-31T15:00:00Z'))).toBe('2027-01-01T15:00:00.000Z')
  expect(nextOccurrence(task, Date.parse('2027-01-10T16:00:00Z'))).toBe('2027-01-11T15:00:00.000Z')
})

it('supports daily intervals and weekly intervals anchored to the original calendar', async () => {
  const daily = await routine('2026-10-17T22:00:00+07:00', { type: 'daily', interval: 3 })
  expect(nextOccurrence(daily, Date.parse(daily.dueAt!))).toBe('2026-10-20T15:00:00.000Z')
  const weekly = await routine('2026-10-17T22:00:00+07:00', { type: 'weekly', interval: 2 })
  expect(nextOccurrence(weekly, Date.parse(weekly.dueAt!))).toBe('2026-10-31T15:00:00.000Z')
})

it('supports selected weekdays and Sunday week boundaries', async () => {
  const task = await routine('2026-10-16T22:00:00+07:00', { type: 'weekly', daysOfWeek: [0, 1, 5] })
  expect(nextOccurrence(task, Date.parse(task.dueAt!))).toBe('2026-10-18T15:00:00.000Z')
  expect(nextOccurrence(task, Date.parse('2026-10-18T15:00:00Z'))).toBe('2026-10-19T15:00:00.000Z')
})

it('preserves local wall time across spring DST and resumes the anchor after a nonexistent time', async () => {
  const task = await routine('2026-03-07T02:30:00-05:00', { type: 'daily' }, 'America/New_York')
  expect(nextOccurrence(task, Date.parse(task.dueAt!))).toBe('2026-03-08T07:30:00.000Z')
  expect(nextOccurrence(task, Date.parse('2026-03-08T07:30:00Z'))).toBe('2026-03-09T06:30:00.000Z')
})

it('selects the first repeated local time and never creates a second fall DST occurrence', async () => {
  const task = await routine('2026-10-31T01:30:00-04:00', { type: 'daily' }, 'America/New_York')
  expect(nextOccurrence(task, Date.parse(task.dueAt!))).toBe('2026-11-01T05:30:00.000Z')
  expect(nextOccurrence(task, Date.parse('2026-11-01T05:30:00Z'))).toBe('2026-11-02T06:30:00.000Z')
})

it('uses local dates across UTC boundaries and validates management durations', () => {
  expect(localDate(Date.parse('2026-10-17T18:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-10-18')
  expect(taskDuration('10m')).toBe(600_000)
  expect(taskDuration('2h')).toBe(7_200_000)
  expect(taskDuration('1d')).toBe(86_400_000)
  for (const value of ['0m', '-1h', 'tomorrow', '1.5h', '999999999999d', '367d'])
    expect(taskDuration(value)).toBeUndefined()
})
