import { classifyCommitmentIntent } from './commitment-intent'
import { parseReminderTime } from './reminder-time'

export type OpenLoopKind = 'work_in_progress' | 'problem' | 'waiting' | 'upcoming_event' | 'goal'
export interface OpenLoopExtraction { subject: string, key: string, kind: OpenLoopKind, confidence: number, salience: number, earliestFollowUpAt?: string, expiresAt: string }

/** Excludes examples, speculation, and historical accounts before extraction or resolution. */
export function isOpenLoopDiscussion(text: string) {
  return ['meta', 'hypothetical', 'quoted', 'uncertain'].includes(classifyCommitmentIntent(text))
    || /hồi (?:trước|năm)|năm ngoái|từng|giả sử|có thể nói|\b(?:used to|last year|hypothetical)\b/iu.test(text)
}

/**
 * Groups explicit authentication aliases. Other subjects require equal normalized text, without semantic-memory matching.
 * @example
 * openLoopKey('fix refresh token')
 * // => 'auth'
 */
export function openLoopKey(subject: string) {
  const value = subject.normalize('NFKC').toLowerCase().replace(/[.!?,]+$/gu, '').trim()
  if (/\b(?:auth|login|refresh token)\b/u.test(value))
    return 'auth'
  return value.replace(/^(?:(?:phần|vụ|việc|chuyện|fix|làm|bug|bài|buổi)\s+)+/u, '').replace(/\s+/gu, ' ')
}

/** Literal current unresolved statements only. No model can grant persistence authority or invent timing. */
export function extractOpenLoop(text: string, now: number, timezone: string): OpenLoopExtraction | undefined {
  if (text.length > 1000 || isOpenLoopDiscussion(text) || classifyCommitmentIntent(text) !== 'none')
    return undefined
  const value = text.normalize('NFKC').toLowerCase().trim().replace(/[.!]+$/u, '')
  if (/đừng|không cần|đọc về|thích|đã xong|xong rồi|(?:^|\s)(?:và|hoặc)(?:\s|$)/u.test(value))
    return undefined
  let subject: string | undefined
  let kind: OpenLoopKind = 'problem'
  const personal = value.replace(/^(?:tao|tôi|mình|tớ)\s+/u, '')
  const stuck = /^(?:(?:lại|vẫn)\s+)?(?:đang\s+)?(?:bí|bị lỗi)\s+(?:phần\s+)?(\S.{0,119})$/u.exec(personal)
  const failed = /^(?:(?:vẫn|lại)\s+)?chưa\s+(?:fix|sửa)(?:\s+được)?\s+(\S.{0,119})$/u.exec(personal)
  const doing = /^đang\s+làm\s+(?:phần\s+)?(\S.{0,119}?)\s+mà\s+(?:vẫn\s+)?(?:lỗi|chưa (?:chạy|xong))$/u.exec(personal)
  const broken = /^(\S.{0,119}?)\s+vẫn\s+(?:lỗi|chưa chạy)$/u.exec(personal)
  subject = stuck?.[1] ?? failed?.[1] ?? doing?.[1] ?? broken?.[1]
  let delayHours = 4
  let lifetimeHours = 48
  if (!subject) {
    const work = /^chưa\s+làm\s+xong\s+(\S.{0,119})$/u.exec(personal)
    const waiting = /^đang\s+chờ\s+(\S.{0,100}?)\s+(?:phản hồi|trả lời|confirm)$/u.exec(personal)
      ?? /^đợi\s+(\S.{0,100}?)\s+confirm\s+rồi\s+(?:tao|tôi|mình)\s+mới\s+làm\s+tiếp\s+được$/u.exec(value)
    const goal = /^định\s+tối nay\s+làm\s+xong\s+(?:phần\s+)?(\S.{0,119})$/u.exec(personal)
    const event = /^(?:ngày\s+)?mai\s+(?:tao|tôi|mình)\s+có\s+(?:buổi\s+)?([^,]{1,120})(?:,.*)?$/u.exec(value)
    if (work) {
      subject = work[1]
      kind = 'work_in_progress'
    }
    else if (waiting) {
      subject = waiting[1]
      kind = 'waiting'
      delayHours = 12
      lifetimeHours = 168
    }
    else if (goal) {
      subject = goal[1]
      kind = 'goal'
      delayHours = 12
    }
    else if (event) {
      subject = event[1]
      kind = 'upcoming_event'
      // Only a recognized date grants timing. Wait until the event's entire local day has elapsed.
      const time = parseReminderTime('mai 9h', now, timezone)
      if (time.status !== 'resolved')
        return undefined
      delayHours = (Date.parse(time.remindAt) - now) / 3_600_000 + 24
      lifetimeHours = delayHours + 48
    }
  }
  if (!subject || !/^[\p{L}\p{N}][\p{L}\p{N}\s+#.-]{0,119}$/u.test(subject))
    return undefined
  const key = openLoopKey(subject)
  if (!key || /^(?:này|đó|nó|cái này|việc này)$/u.test(key))
    return undefined
  return { subject, key, kind, confidence: 0.98, salience: kind === 'problem' || kind === 'upcoming_event' ? 0.9 : 0.8, earliestFollowUpAt: new Date(now + delayHours * 3_600_000).toISOString(), expiresAt: new Date(now + lifetimeHours * 3_600_000).toISOString() }
}

/** Named outcomes use subject identity. Unqualified outcomes need the exact conversation focus. */
export function openLoopOutcome(text: string): { state: 'resolved' | 'dismissed', key?: string } | undefined {
  if (isOpenLoopDiscussion(text))
    return undefined
  const value = text.normalize('NFKC').toLowerCase().trim().replace(/[.!]+$/u, '').replace(/^(?:tao|tôi|mình)\s+/u, '')
  if (/^(?:đã\s+)?(?:làm\s+)?xong(?: rồi)?$/u.test(value))
    return { state: 'resolved' }
  if (/^(?:đừng hỏi (?:vụ|việc|chuyện) này nữa|không cần quan tâm chuyện đó nữa)$/u.test(value))
    return { state: 'dismissed' }
  const dismissed = /^bỏ\s+(?:vụ|chuyện|phần)\s+(\S.{0,119}?)\s+đi$/u.exec(value)
  if (dismissed)
    return { state: 'dismissed', key: openLoopKey(dismissed[1]!) }
  const fixed = /^(?:đã\s+)?(?:fix|sửa)\s+được\s+(\S.{0,119}?)\s+rồi$/u.exec(value)
    ?? /^xong\s+(?:phần\s+)?(\S.{0,119}?)\s+rồi$/u.exec(value)
    ?? /^(\S.{0,100}?)\s+(?:đã\s+)?(?:trả lời|phản hồi|confirm)\s+rồi$/u.exec(value)
  return fixed ? { state: 'resolved', key: openLoopKey(fixed[1]!) } : undefined
}
