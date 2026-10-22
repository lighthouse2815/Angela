/** External identity stays separate from the Angela owner throughout ingestion and storage. */
export interface ExternalMessage {
  channel: 'zalo'
  source: 'zalo'
  sourceType: 'external-user'
  accountId: string
  conversationId: string
  senderId: string
  senderName?: string
  messageId: string
  text: string
  receivedAt: string
  isSelf: boolean
}

export interface AwayModeState {
  enabled: boolean
  startedAt?: string
  sessionId?: string
  mode: 'notify-only' | 'assistant-reply'
  allowedUsers: string[]
  summarizeOnReturn: boolean
}

export type ReplyStatus = 'received' | 'ignored' | 'whitelist_denied' | 'rate_limited' | 'sending' | 'sent' | 'failed'

/** A claimed record is never automatically retried, including uncertain sends after a process crash. */
export interface ExternalMessageRecord extends ExternalMessage {
  id: string
  awaySessionId?: string
  processedAt?: string
  replyStatus: ReplyStatus
  replyMessageId?: string
  reason?: string
  pendingRequest?: { content: string, status: 'pending' }
}

/** Storage implementations own paths, atomic claims, and durable message identity. */
export interface AwayModeStore {
  state: () => Promise<AwayModeState>
  configure: (change: (state: AwayModeState) => void) => Promise<void>
  claim: (record: ExternalMessageRecord) => Promise<boolean>
  update: (id: string, change: Partial<ExternalMessageRecord>) => Promise<void>
  records: (sessionId?: string) => Promise<ExternalMessageRecord[]>
}

export type AwayLog = (event: string, fields?: { messageId?: string, reason?: string }) => void

/** Model output selects fixed public text. It never crosses the outbound boundary as arbitrary prose. */
export interface AwayResponder {
  reply: (message: ExternalMessage, signal: AbortSignal) => Promise<'offline' | 'received' | 'clarify' | 'private' | 'greeting'>
}
