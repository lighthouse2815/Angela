import { expect, it } from 'vitest'

import { extractOpenLoop, openLoopOutcome } from './open-loop-extraction'

const now = Date.parse('2026-10-23T10:00:00Z')
it.each([
  ['Tao đang bí phần refresh token.', 'refresh token', 'problem'],
  ['Tao đang làm phần refresh token mà vẫn lỗi.', 'refresh token', 'problem'],
  ['Tao chưa làm xong slide.', 'slide', 'work_in_progress'],
  ['Tao đang chờ thầy phản hồi.', 'thầy', 'waiting'],
  ['Mai tao có buổi bảo vệ, hơi lo.', 'bảo vệ', 'upcoming_event'],
  ['Tao định tối nay làm xong phần backend.', 'backend', 'goal'],
  ['Tao vẫn chưa fix được bug login.', 'bug login', 'problem'],
  ['Đợi bên kia confirm rồi tao mới làm tiếp được.', 'bên kia', 'waiting'],
  ['Auth vẫn lỗi.', 'auth', 'problem'],
])('extracts current unresolved work: %s', (text, subject, kind) => {
  expect(extractOpenLoop(text, now, 'UTC')).toMatchObject({ subject, kind, confidence: 0.98 })
})
it.each([
  'Tao thích C#.',
  'Hôm nay trời nóng.',
  'Java có JVM.',
  'Tao vừa ăn cơm.',
  'Hồi trước tao từng bị bug auth.',
  'Ví dụ user có thể nói "tao chưa fix được auth".',
  'Ví dụ user nói "tao đang bí auth".',
  'Nếu tao bị lỗi auth thì sao?',
  'Tôi từng bị lỗi auth hồi năm ngoái.',
  'Parser nên detect câu "tao chưa fix được auth".',
  'Tôi thích backend.',
  'Tôi đang đọc về refresh token.',
  'Tao mệt.',
  'Tao buồn.',
  'Tao đói.',
  'Tao thích cafe.',
  'Mai 9h nhắc tao fix auth.',
  'Auth vẫn lỗi là một ví dụ hợp lệ.',
  'Auth vẫn lỗi?',
  'Có lẽ auth vẫn lỗi.',
  'Mai có buổi bảo vệ.',
])('refuses unsafe or casual extraction: %s', (text) => {
  expect(extractOpenLoop(text, now, 'UTC')).toBeUndefined()
})
it.each([
  ['Fix được auth rồi.', 'resolved', 'auth'],
  ['Xong phần slide rồi.', 'resolved', 'slide'],
  ['Thầy trả lời rồi.', 'resolved', 'thầy'],
  ['Không cần quan tâm chuyện đó nữa.', 'dismissed', undefined],
  ['Bỏ vụ auth đi.', 'dismissed', 'auth'],
  ['Đừng hỏi vụ này nữa.', 'dismissed', undefined],
  ['Xong rồi.', 'resolved', undefined],
])('recognizes explicit outcomes: %s', (text, state, key) => {
  expect(openLoopOutcome(text)).toEqual({ state, ...(key ? { key } : {}) })
})
it('uses longer waiting timing and waits until the event date has ended', () => {
  expect(extractOpenLoop('Tao đang chờ thầy phản hồi.', now, 'UTC')).toMatchObject({ earliestFollowUpAt: '2026-10-23T22:00:00.000Z', expiresAt: '2026-10-30T10:00:00.000Z' })
  expect(extractOpenLoop('Mai tao có buổi bảo vệ.', now, 'UTC')?.earliestFollowUpAt).toBe('2026-10-25T09:00:00.000Z')
})
