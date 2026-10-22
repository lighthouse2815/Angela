/** Request identities isolate concurrent channels without retaining a trace or provider payload. */
export interface BaseAngelaEvent {
  timestamp: string
  correlationId: string
  sessionId?: string
  channel?: 'cli' | 'telegram' | 'discord' | 'system'
}

/** Lifecycle messages contain metadata only. Prompts, generated text, arguments, and results remain request-local. */
export type AngelaEvent = BaseAngelaEvent & (
  | { type: 'user.message' }
  | { type: 'assistant.message' }
  | { type: 'tool.call', toolCallId: string, toolName: string }
  | { type: 'tool.result', toolCallId: string }
  | { type: 'tool.error', toolCallId: string }
)
