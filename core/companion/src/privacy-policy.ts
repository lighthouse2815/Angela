import type { Conversation } from '@angela/core-agent'

import { sanitize } from './memory-v2/sanitize'

/** Request provenance is host-owned. A protected conversation cannot authorize later derived memory writes. */
export interface RequestPrivacy {
  readonly durableMemoryAllowed: boolean
  readonly reason?: 'user-request' | 'sensitive-content' | 'memory-disabled'
  readonly projectWritesAllowed: boolean
  readonly taskWritesAllowed: boolean
}

function policyText(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/’/gu, '\'').replace(/\s+/gu, ' ')
}

/** Detects declarations and recognizable credential formats without retaining or reporting their values. */
export function sensitiveContent(text: string) {
  const normalized = policyText(text)
  if (sanitize(text, text.length) !== text)
    return true
  return /(?:\b(?:password|passwd|passphrase|api[ _-]?key|access[ _-]?token|auth(?:entication)?[ _-]?cookie|private[ _-]?key|recovery[ _-]?code|verification[ _-]?code|otp|credential(?:s|[ -]like secret)?|client[ _-]?secret)\b|mật khẩu|khóa api|khoá api|mã (?:khôi phục|xác minh|xác thực|truy cập|otp))[^.!?\n]{0,80}(?::|=|\bis\b|\bare\b|là)\s*\S/u.test(normalized)
    || /\b(?:otp|verification[ _-]?code|recovery[ _-]?code|mã (?:xác minh|xác thực|khôi phục))\s+\d{4,10}\b/u.test(normalized)
}

/** Computes policy before capture. Disabled personal memory keeps explicitly requested project and task operations independent. */
export function requestPrivacy(text: string, memoryEnabled = true, inherited?: RequestPrivacy): RequestPrivacy {
  const normalized = policyText(text)
  const noStore = /(?:^|[\s,:;.!?])(?:đừng (?:lưu|ghi nhớ)|không (?:lưu|ghi nhớ)|đừng nhớ chuyện này|chỉ dùng trong phiên này|don'?t (?:save|store|remember) this|keep this only for this session)(?:$|[\s,:;.!?])/u.test(normalized)
  let reason: RequestPrivacy['reason']
  if (inherited?.reason && inherited.reason !== 'memory-disabled')
    reason = inherited.reason
  else if (sensitiveContent(text))
    reason = 'sensitive-content'
  else if (noStore)
    reason = 'user-request'
  else if (!memoryEnabled || inherited?.reason === 'memory-disabled')
    reason = 'memory-disabled'
  const personalFact = /(?:tôi|mình|\bi\b|\bmy\b)[^.!?]{0,60}(?:muốn|đang học|thích|bị bệnh|tên|tuổi|sống|sở thích|\b(?:want|learn|study|studying|prefer|like|name|age|live|hobby)\b)/u.test(normalized)
  const independent = !reason || reason === 'memory-disabled'
  return Object.freeze({
    durableMemoryAllowed: !reason,
    reason,
    projectWritesAllowed: independent && inherited?.projectWritesAllowed !== false && (!reason || (!personalFact && /\b(?:project|repo(?:sitory)?|backend|frontend|codebase|workspace)\b|dự án/u.test(normalized))),
    taskWritesAllowed: independent && inherited?.taskWritesAllowed !== false && (!reason || /\b(?:task|todo|remind|reminder|deadline|schedule|cancel|snooze|complete)\b|nhắc|hỏi (?:tao|tôi|mình|lại)|check xem|tạo (?:việc|lịch)|hủy (?:việc|lịch)|hoàn thành|xong(?: rồi)?[.!\s]*$/u.test(normalized)),
  })
}

/** All durable tool destinations use the same provenance check before inspecting model-selected excerpts. */
export function durableWriteRejection(privacy: RequestPrivacy, domain: 'personal' | 'project' | 'task' | 'workflow', payload: unknown) {
  if (!privacy.durableMemoryAllowed) {
    const independent = privacy.reason === 'memory-disabled'
      && ((domain === 'project' && privacy.projectWritesAllowed) || (domain === 'task' && privacy.taskWritesAllowed))
    if (!independent)
      return { status: 'rejected' as const, reason: privacy.reason }
  }
  if (sensitiveContent(JSON.stringify(payload) ?? ''))
    return { status: 'rejected' as const, reason: 'sensitive-content' as const }
}

// Only the safe prefix can reach session storage. The original conversation and summaries remain usable in RAM.
const protectedConversations = new WeakMap<Conversation, Conversation>()

/** Freezes the durable prefix before a protected turn enters working history. Repeated checkpoints cannot extend that prefix. */
export function protectConversation(conversation: Conversation) {
  if (!protectedConversations.has(conversation))
    protectedConversations.set(conversation, structuredClone(conversation))
}

/** Also checks direct session saves, which can run before RuntimeSession.send during recovery checkpoints. */
export function durableConversation(conversation: Conversation): Conversation {
  const protectedPrefix = protectedConversations.get(conversation)
  if (protectedPrefix)
    return protectedPrefix
  const index = conversation.turns.findIndex(turn => turn.type === 'user'
    && !requestPrivacy(turn.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')).durableMemoryAllowed)
  if (index < 0)
    return conversation
  const prefix = { turns: structuredClone(conversation.turns.slice(0, index)) }
  protectedConversations.set(conversation, prefix)
  return prefix
}
