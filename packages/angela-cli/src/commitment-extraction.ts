import type { ParsedReminderTime } from './reminder-time'

import { parseReminderTime } from './reminder-time'

/** The host extracts explicit intent. Structured model tools remain responsible for unsupported phrasing and contextual references. */
export type CommitmentExtraction
  = | { isCommitment: false, confidence: number }
    | { isCommitment: true, confidence: number, title: string, time: ParsedReminderTime }

/** Does not turn predictions, negations, quotations, or hypothetical reminders into persistent commitments. */
export function extractCommitment(text: string, now: number, timezone: string): CommitmentExtraction {
  const request = /(?:nhớ\s+)?nhắc(?:\s+(?:tao|tôi|mình|tớ|bạn|em|anh))?|gọi\s+(?:tôi|tao|mình)/iu.exec(text)
  if (!request || /không|đừng|chắc|có lẽ|nếu|ví dụ|["“”\n]|\b(?:maybe|perhaps)\b/iu.test(text) || /nhắc lại/iu.test(text))
    return { isCommitment: false, confidence: 0 }
  const parsed = parseReminderTime(text.replace(request[0], ''), now, timezone)
  const title = parsed.remainder.replace(/^[\s,:.!?]+|[\s,.!?]+$/gu, '').trim()
  if (!title || title.length > 200 || /nhắc|gọi\s+(?:tôi|tao)|(?:^|\s)(?:và|rồi)\s/iu.test(title))
    return { isCommitment: false, confidence: 0.4 }
  return { isCommitment: true, confidence: 0.98, title, time: parsed }
}
