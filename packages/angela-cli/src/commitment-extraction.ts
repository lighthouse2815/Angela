import type { ParsedReminderTime } from './reminder-time'

import { classifyCommitmentIntent } from './commitment-intent'
import { parseReminderTime } from './reminder-time'

/** The host extracts explicit intent. Structured model tools remain responsible for unsupported phrasing and contextual references. */
export type CommitmentExtraction
  = | { isCommitment: false, confidence: number }
    | { isCommitment: true, confidence: number, title: string, type: 'reminder' | 'follow_up', time: ParsedReminderTime }

/** Does not turn predictions, negations, quotations, or hypothetical reminders into persistent commitments. */
export function extractCommitment(text: string, now: number, timezone: string): CommitmentExtraction {
  const intent = classifyCommitmentIntent(text)
  const followUp = intent === 'follow_up'
  const request = followUp
    ? /(?:nhớ\s+)?hỏi(?:\s+(?:tao|tôi|mình))?(?:\s+lại)?|check\s+xem/iu.exec(text)
    : /(?:nhớ\s+)?nhắc(?:\s+(?:tao|tôi|mình|tớ|bạn|em|anh))?|gọi\s+(?:tôi|tao|mình)/iu.exec(text)
  if (!request || (!followUp && intent !== 'create') || /[.!;]/u.test(text.slice(0, request.index)))
    return { isCommitment: false, confidence: 0 }
  const topic = /^(?:tao|tôi|mình)\s+đang\s+([^,]{1,200}),\s*/iu.exec(text)
  let source = (topic ? text.slice(topic[0].length) : text).replace(request[0], '')
  let parsed = parseReminderTime(source, now, timezone)
  if (followUp && parsed.status === 'clarify' && parsed.date) {
    // Follow-ups use a disclosed daytime window. Exact reminder alarms still require an explicit hour.
    const hour = /(?:tối|chiều|sáng)\s+(?:ngày\s+)?mai|(?:vào\s+)?(?:buổi\s+)?(?:tối|chiều|sáng)/iu.exec(source)?.[0].toLowerCase()
    const time = hour?.includes('tối') ? '19h' : hour?.includes('chiều') ? '15h' : '9h'
    source = parsed.remainder.replace(/(?:^|\s)(?:vào\s+)?(?:buổi\s+)?(?:sáng|chiều|tối)(?=\s|$)/giu, ' ')
    parsed = parseReminderTime(`${parsed.date.split('-').reverse().join('/')} ${time} ${source}`, now, timezone)
  }
  let title = parsed.remainder.replace(/^[\s,:.!?]+|[\s,.!?]+$/gu, '').trim()
  if (followUp) {
    title = title.replace(/^(?:xem\s+)?(?:(?:tôi|tao|mình)\s+(?:đã\s+)?)?/iu, '')
      .replace(/\s+(?:(?:làm\s+)?xong\s+chưa|tới đâu\s+rồi|chưa)$/iu, '')
      .replace(/\s+vào$/iu, '')
      .trim()
    if (/^(?:xong(?: chưa)?|chưa|tới đâu rồi)$/iu.test(title))
      title = topic?.[1] ?? 'việc này'
  }
  if (!title || title.length > 200 || /nhắc|gọi\s+(?:tôi|tao)|(?:^|\s)(?:và|rồi)\s/iu.test(title))
    return { isCommitment: false, confidence: 0.4 }
  return { isCommitment: true, confidence: 0.98, title, type: followUp ? 'follow_up' : 'reminder', time: parsed }
}
