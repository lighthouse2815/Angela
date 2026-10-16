import type { Task } from './task-schema'

function parts(instant: number, timezone: string) {
  const values = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant)
  const get = (name: Intl.DateTimeFormatPartTypes) => Number(values.find(part => part.type === name)!.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

function wallTime(instant: number, timezone: string) {
  const value = parts(instant, timezone)
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second)
}

/** Converts a calendar time with platform timezone data. Gaps move forward. Repeated times select the first occurrence. */
function localInstant(wall: number, timezone: string) {
  const candidates = [-86_400_000, 0, 86_400_000].map((offset) => {
    const sample = wall + offset
    return wall - (wallTime(sample, timezone) - sample)
  }).sort((a, b) => a - b)
  return candidates.find(candidate => wallTime(candidate, timezone) === wall)
    ?? candidates.find(candidate => wallTime(candidate, timezone) > wall)!
}

/** Returns the first future calendar occurrence. Missed occurrences collapse into one notification after an offline period. */
export function nextOccurrence(task: Task, after: number): string {
  if (!task.recurrence || !task.recurrenceAnchor)
    throw new Error('A recurrence requires a calendar anchor')
  const anchor = parts(Date.parse(task.recurrenceAnchor), task.timezone)
  const current = parts(Math.max(after, Date.parse(task.recurrenceAnchor)), task.timezone)
  const start = Date.UTC(anchor.year, anchor.month - 1, anchor.day)
  const currentDay = Date.UTC(current.year, current.month - 1, current.day)
  const startWeek = start - new Date(start).getUTCDay() * 86_400_000
  for (let day = currentDay; day <= currentDay + 371 * 86_400_000; day += 86_400_000) {
    const weekday = new Date(day).getUTCDay()
    const interval = task.recurrence.interval
    const matches = task.recurrence.type === 'daily'
      ? ((day - start) / 86_400_000) % interval === 0
      : Math.floor((day - startWeek) / (7 * 86_400_000)) % interval === 0 && (task.recurrence.daysOfWeek ?? [new Date(start).getUTCDay()]).includes(weekday)
    if (!matches)
      continue
    const instant = localInstant(day + ((anchor.hour * 60 + anchor.minute) * 60 + anchor.second) * 1000, task.timezone)
    if (instant > after && instant >= Date.parse(task.recurrenceAnchor))
      return new Date(instant).toISOString()
  }
  throw new Error('No future occurrence within the supported interval')
}

/** Effective notification time. Date-only tasks stay visible in queries without an invented alarm time. */
export function taskDue(task: Task) {
  return task.snoozedUntil ?? task.dueAt
}

/** Local calendar date for task queries, independent of the host process timezone. */
export function localDate(instant: number, timezone: string) {
  const value = parts(instant, timezone)
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

/** Management durations are bounded to one year. Natural language interpretation belongs to the model. */
export function taskDuration(value: string) {
  const match = /^(\d+)([mhd])$/u.exec(value)
  const milliseconds = match ? Number(match[1]) * ({ m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]!] ?? 0) : 0
  return Number.isSafeInteger(milliseconds) && milliseconds > 0 && milliseconds <= 366 * 86_400_000 ? milliseconds : undefined
}
