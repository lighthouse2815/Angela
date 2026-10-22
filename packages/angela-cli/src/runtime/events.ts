/** Request identities isolate concurrent channels without retaining a trace or provider payload. */
export interface BaseAngelaEvent {
  id: string
  timestamp: string
  correlationId: string
  sessionId?: string
  workspace?: string
  channel?: 'cli' | 'telegram' | 'discord' | 'desktop' | 'system'
}

/** Lifecycle messages contain metadata only. Prompts, generated text, arguments, and results remain request-local. */
export type AngelaEvent = BaseAngelaEvent & (
  | { type: 'user.message' }
  | { type: 'assistant.message' }
  | { type: 'tool.call', toolCallId: string, toolName: string }
  | { type: 'tool.result', toolCallId: string, toolName: string, outcome: 'verified' | 'unverified' | 'failed' }
  | { type: 'tool.error', toolCallId: string, toolName: string }
  | { type: 'task.created', taskId: string }
  | { type: 'task.updated', taskId: string }
  | { type: 'task.completed', taskId: string }
  | { type: 'reminder.delivered', taskId: string }
  | { type: 'project.changed', revision: number }
  | { type: 'memory.changed', memoryId: string, action: 'saved' | 'deleted' }
  | { type: 'session.started' }
  | { type: 'session.ended', reason: 'completed' | 'aborted' | 'failed' }
  | { type: 'request.failed', reason: 'aborted' | 'failed' }
  | { type: 'request.completed' }
)

/** Distributes omission over event variants so producers retain discriminated payload checks. */
export type EventPayload = AngelaEvent extends infer E ? E extends BaseAngelaEvent ? Omit<E, keyof BaseAngelaEvent> : never : never
