import { expect, it } from 'vitest'

import { extractCommitment } from './commitment-extraction'
import { parseReminderTime } from './reminder-time'

const now = Date.parse('2026-10-22T07:00:00+07:00')
const zone = 'Asia/Ho_Chi_Minh'

it.each([
  ['Mai 9h nhắc tao học LINQ.', 'học LINQ', '2026-10-23T02:00:00.000Z'],
  ['Hai tiếng nữa gọi tôi quay lại làm auth.', 'quay lại làm auth', '2026-10-22T02:00:00.000Z'],
  ['10 phút nữa nhắc tôi gửi báo cáo', 'gửi báo cáo', '2026-10-22T00:10:00.000Z'],
  ['thứ sáu lúc 8h nhắc tao gửi báo cáo', 'gửi báo cáo', '2026-10-23T01:00:00.000Z'],
  ['nhắc tao học lúc 10h tối', 'học', '2026-10-22T15:00:00.000Z'],
])('extracts explicit intent and resolves the configured timezone: %s', (text, title, remindAt) => {
  expect(extractCommitment(text, now, zone)).toMatchObject({ isCommitment: true, title, time: { status: 'resolved', remindAt } })
})

it.each(['Ngày mai chắc tôi học LINQ.', 'Mai chắc tao học LINQ', 'Đừng nhắc tao học mai 9h', 'Nếu mai rảnh nhắc tao học', 'Ví dụ: mai 9h nhắc tôi học', '"Mai 9h nhắc tao học"', '2 tiếng nữa nhắc lại'])('does not create a commitment from weak or non-creation intent: %s', (text) => {
  expect(extractCommitment(text, now, zone).isCommitment).toBe(false)
})

it.each(['mai', 'tối nay', 'thứ sáu', 'ngày 25', '25/10', 'cuối tuần'])('asks for an alarm hour or precise date: %s', (text) => {
  expect(parseReminderTime(text, now, zone).status).toBe('clarify')
})

it.each([
  ['mai lúc 9h', '2026-10-23T02:00:00.000Z'],
  ['ngày 25 lúc 9h', '2026-10-25T02:00:00.000Z'],
  ['25/10 9:30', '2026-10-25T02:30:00.000Z'],
  ['tối nay lúc 9h', '2026-10-22T14:00:00.000Z'],
  ['2 tiếng nữa', '2026-10-22T02:00:00.000Z'],
])('parses supported expressions: %s', (text, remindAt) => {
  expect(parseReminderTime(text, now, zone)).toMatchObject({ status: 'resolved', remindAt })
})

it.each(['31/2 9h', 'mai 25h', 'mai 9:99', '0 phút nữa', '10000 tiếng nữa'])('rejects invalid dates or durations: %s', (text) => {
  expect(parseReminderTime(text, now, zone).status).toBe('invalid')
})

it('uses local dates across midnight and asks about past times or DST ambiguity', () => {
  expect(parseReminderTime('mai 9h', Date.parse('2026-10-22T18:00:00Z'), zone)).toMatchObject({ status: 'resolved', remindAt: '2026-10-24T02:00:00.000Z' })
  expect(parseReminderTime('hôm nay 6h', now, zone).status).toBe('clarify')
  expect(parseReminderTime('8/3/2026 2:30', Date.parse('2026-03-07T00:00:00Z'), 'America/New_York').status).toBe('clarify')
  expect(parseReminderTime('1/11/2026 1:30', Date.parse('2026-10-31T00:00:00Z'), 'America/New_York').status).toBe('clarify')
})
