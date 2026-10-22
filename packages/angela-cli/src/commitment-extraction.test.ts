import { expect, it } from 'vitest'

import { extractCommitment } from './commitment-extraction'
import { classifyCommitmentIntent } from './commitment-intent'
import { parseReminderTime } from './reminder-time'

const now = Date.parse('2026-10-22T07:00:00+07:00')
const zone = 'Asia/Ho_Chi_Minh'

it.each([
  ['Mai hỏi tao xem phần auth làm xong chưa.', 'phần auth', '2026-10-23T02:00:00.000Z'],
  ['Chiều mai hỏi lại xem báo cáo tới đâu rồi.', 'báo cáo', '2026-10-23T08:00:00.000Z'],
  ['Ngày mai check xem tôi đã học LINQ chưa.', 'học LINQ', '2026-10-23T02:00:00.000Z'],
  ['Nhớ hỏi tôi lại chuyện này vào tối mai.', 'chuyện này', '2026-10-23T12:00:00.000Z'],
  ['Tao đang làm auth, mai hỏi tao xem xong chưa.', 'làm auth', '2026-10-23T02:00:00.000Z'],
])('extracts explicit follow-ups with a deterministic local window: %s', (text, title, remindAt) => {
  expect(classifyCommitmentIntent(text)).toBe('follow_up')
  expect(extractCommitment(text, now, zone)).toMatchObject({ isCommitment: true, type: 'follow_up', title, time: { status: 'resolved', remindAt } })
})

it('authorizes a direct task clause after a separate statement without consuming the whole request locally', () => {
  expect(classifyCommitmentIntent('Tôi tên là Lan. Thêm việc học tiếng Trung vào danh sách.')).toBe('create')
  expect(extractCommitment('Tôi tên là Lan. Mai 9h nhắc tôi học.', now, zone).isCommitment).toBe(false)
})

it.each([
  ['Tại sao câu "mai 9h nhắc tao học LINQ" lại tạo reminder?', 'meta'],
  ['Parser xử lý câu mai 9h nhắc tao học LINQ thế nào?', 'meta'],
  ['Nếu user nói mai 9h nhắc tôi học thì hệ thống làm gì?', 'hypothetical'],
  ['Ví dụ người dùng có thể nói mai 9h nhắc tôi học.', 'meta'],
  ['Câu `mai 9h nhắc tao học` có hợp lệ không?', 'meta'],
  ['Tôi đang test câu mai 9h nhắc tôi học LINQ.', 'meta'],
  ['Tôi muốn test câu mai 9h nhắc tao học.', 'meta'],
  ['Đừng tạo reminder khi tôi nói "mai 9h nhắc tao học".', 'negative'],
  ['Không cần nhắc tôi việc đó.', 'negative'],
  ['Nếu mai tôi rảnh thì nhắc tôi học.', 'hypothetical'],
  ['`Mai 9h nhắc tao học LINQ`', 'quoted'],
  ['"Mai 9h nhắc tao học LINQ"', 'quoted'],
  ['Mai chắc tôi học LINQ.', 'uncertain'],
  ['Có lẽ tối nay tôi học.', 'uncertain'],
  ['Mai 9h nhắc tôi học LINQ và 10h nhắc tôi làm auth.', 'uncertain'],
])('classifies and refuses non-action intent: %s', (text, intent) => {
  expect(classifyCommitmentIntent(text)).toBe(intent)
  expect(extractCommitment(text, now, zone).isCommitment).toBe(false)
})

it.each(['Nhắc tôi họp lúc 14h.', 'Ngày 25 lúc 9h nhắc tôi đóng học phí.', 'Nhắc tôi gửi báo cáo lúc 8h tối nay.', '10 phút nữa nhắc tôi uống nước.', 'Mai 9h nhắc tôi chạy test parser.', 'Mai 9h nhắc tôi kiểm tra hệ thống.'])('accepts direct requests: %s', (text) => {
  expect(classifyCommitmentIntent(text)).toBe('create')
  expect(extractCommitment(text, now, zone)).toMatchObject({ isCommitment: true, time: { status: 'resolved' } })
})

it.each([
  ['Mai 9h nhắc tao học LINQ.', 'học LINQ', '2026-10-23T02:00:00.000Z'],
  ['Tao đang làm auth, mai 9h nhắc tôi học LINQ.', 'học LINQ', '2026-10-23T02:00:00.000Z'],
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

it.each(['Create a task to study LINQ.', 'Create a task for studying LINQ.', 'Add a reminder for tomorrow at 9.', 'Save this as a task.', 'Schedule a reminder to call Minh at 8.', 'Add a todo: submit my report.', 'Create a task to implement the auth endpoint.', 'Add a todo to refactor the reminder scheduler.'])('authorizes semantic task phrases: %s', (text) => {
  expect(classifyCommitmentIntent(text)).toBe('create')
})
it.each(['Create a parser for reminder syntax.', 'Add validation for reminder timestamps.', 'Nhắc tôi học lúc 9h là một ví dụ hợp lệ.'])('rejects technical objects and suffix meta framing: %s', (text) => {
  expect(extractCommitment(text, now, zone).isCommitment).toBe(false)
  expect(classifyCommitmentIntent(text)).not.toBe('create')
})

it.each(['Create a task.', 'Schedule a reminder.', 'Add a todo.', 'Create a task endpoint.', 'Schedule a reminder job in Quartz.'])('requires task-management syntax after an English object: %s', (text) => {
  expect(classifyCommitmentIntent(text)).not.toBe('create')
  expect(extractCommitment(text, now, zone).isCommitment).toBe(false)
})
