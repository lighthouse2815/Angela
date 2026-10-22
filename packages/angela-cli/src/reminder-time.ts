import { localDate, localInstant, taskDuration } from './task-time'

/** Ambiguous calendar dates retain their date, but never acquire an invented alarm hour. */
export type ParsedReminderTime
  = | { status: 'resolved', remindAt: string, remainder: string }
    | { status: 'clarify' | 'invalid' | 'missing', date?: string, remainder: string }

const numbers: Record<string, number> = { một: 1, hai: 2, ba: 3, bốn: 4, năm: 5, sáu: 6, bảy: 7, tám: 8, chín: 9, mười: 10 }
const weekdays = ['chủ nhật', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy']

/**
 * Parses bounded Vietnamese reminder expressions with the existing calendar conversion boundary.
 * Date-only, past, DST gaps, and repeated local hours require clarification. Relative durations use elapsed time.
 */
export function parseReminderTime(text: string, now: number, timezone: string): ParsedReminderTime {
  new Intl.DateTimeFormat('en', { timeZone: timezone }).format(now)
  let remainder = text.trim()
  const relative = /(?<![\p{L}\d.-])(\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*(phút|tiếng|giờ)\s+nữa/iu.exec(remainder)
  if (relative) {
    remainder = remainder.replace(relative[0], '').trim()
    const count = numbers[relative[1]!.toLowerCase()] ?? Number(relative[1])
    const delay = taskDuration(`${count}${relative[2]!.toLowerCase() === 'phút' ? 'm' : 'h'}`)
    if (!delay || /\d\s*(?:phút|tiếng|giờ)|\b(?:mai|thứ)\b|cuối tuần/iu.test(remainder))
      return { status: 'invalid', remainder }
    return { status: 'resolved', remindAt: new Date(now + delay).toISOString(), remainder }
  }
  const calendar = /(?<![\p{L}\d/])(?:ngày mai|mai|hôm nay|tối nay|thứ (?:hai|ba|tư|năm|sáu|bảy)|chủ nhật|cuối tuần|ngày\s+\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{4})?)(?![\p{L}\d/])/iu.exec(remainder)
  const hour = /(?<![\d.])(\d{1,2})(?:h(\d{1,2})?|:(\d{2})|\s*giờ)(?:\s*(sáng|chiều|tối))?(?![\p{L}\d])/iu.exec(remainder)
  if (!calendar && !hour)
    return { status: 'missing', remainder }
  const today = localDate(now, timezone)
  const [year, month, day] = today.split('-').map(Number)
  let wallDay = Date.UTC(year!, month! - 1, day!)
  if (calendar) {
    remainder = remainder.replace(calendar[0], '')
    const dateText = calendar[0].toLowerCase().replace(/\s+/gu, ' ')
    if (dateText === 'cuối tuần')
      return { status: 'clarify', remainder: remainder.trim() }
    if (dateText === 'mai' || dateText === 'ngày mai') {
      wallDay += 86_400_000
    }
    else if (weekdays.includes(dateText)) {
      wallDay += ((weekdays.indexOf(dateText) - new Date(wallDay).getUTCDay() + 7) % 7 || 7) * 86_400_000
    }
    else if (/^ngày \d/u.test(dateText) || dateText.includes('/')) {
      const values = dateText.replace('ngày ', '').split('/').map(Number)
      const targetDay = values[0]!
      let targetMonth = values[1] ?? month!
      let targetYear = values[2] ?? year!
      if (values.length === 1 && targetDay < day!) {
        targetMonth++
        if (targetMonth > 12) {
          targetMonth = 1
          targetYear++
        }
      }
      wallDay = Date.UTC(targetYear, targetMonth - 1, targetDay)
      const date = new Date(wallDay)
      if (date.getUTCFullYear() !== targetYear || date.getUTCMonth() !== targetMonth - 1 || date.getUTCDate() !== targetDay)
        return { status: 'invalid', remainder: remainder.trim() }
      if (values.length === 2 && wallDay < Date.UTC(year!, month! - 1, day!)) {
        targetYear++
        wallDay = Date.UTC(targetYear, targetMonth - 1, targetDay)
        if (new Date(wallDay).getUTCDate() !== targetDay)
          return { status: 'invalid', remainder: remainder.trim() }
      }
    }
  }
  const date = new Date(wallDay).toISOString().slice(0, 10)
  if (!hour)
    return { status: 'clarify', date, remainder: remainder.trim() }
  remainder = remainder.replace(hour[0], '').replace(/(?:^|\s)lúc(?=\s|$)/iu, ' ').trim()
  let hours = Number(hour[1])
  const minutes = Number(hour[2] ?? hour[3] ?? 0)
  const period = hour[4]?.toLowerCase()
  if (hours > 23 || minutes > 59 || (period && hours > 12))
    return { status: 'invalid', remainder }
  if (period === 'sáng' && hours === 12)
    hours = 0
  else if ((period === 'chiều' || period === 'tối' || calendar?.[0].toLowerCase() === 'tối nay') && hours < 12)
    hours += 12
  const wall = wallDay + (hours * 60 + minutes) * 60_000
  const instant = localInstant(wall, timezone)
  // Both DST folds and gaps need an explicit user choice instead of silently moving the alarm.
  const expected = `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  const formatted = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const matches = (value: number) => formatted.format(value).replace(' ', 'T') === expected
  if (instant <= now || !matches(instant) || matches(instant + 3_600_000) || matches(instant + 1_800_000)
    || /\d\s*(?:h|giờ)|\d{1,2}\/\d{1,2}|(?:^|\s)(?:mai|thứ)\s|hoặc/iu.test(remainder)) {
    return { status: 'clarify', date, remainder }
  }
  return { status: 'resolved', remindAt: new Date(instant).toISOString(), remainder }
}
