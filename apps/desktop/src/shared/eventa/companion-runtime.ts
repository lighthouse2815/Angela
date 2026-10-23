import type { RecordsCommand, RecordsResponse } from '@angela/cli/companion-contracts'
import type { StreamEvent } from '@angela/core-agent'
import type { Tool } from '@xsai/shared-chat'

import { defineInvokeEventa } from '@moeru/eventa'

export interface CompanionBegin {
  requestId: string
  sessionId: string
  characterId: string
  text: string
  protectedHistory?: boolean
  history: { id: string, type: 'user' | 'assistant', text: string }[]
}
export type CompanionReady = { kind: 'reply', text: string } | { kind: 'generate', context: string, tools: Pick<Tool, 'type' | 'function'>[] }

export const companionRecords = defineInvokeEventa<RecordsResponse, { characterId: string, command: RecordsCommand }>('eventa:invoke:companion:records')
export const companionBegin = defineInvokeEventa<CompanionReady, CompanionBegin>('eventa:invoke:companion:begin')
export const companionTool = defineInvokeEventa<unknown, { requestId: string, name: string, input: unknown }>('eventa:invoke:companion:tool')
export const companionObserve = defineInvokeEventa<void, { requestId: string, event: StreamEvent }>('eventa:invoke:companion:observe')
export const companionFinish = defineInvokeEventa<void, { requestId: string, cancelled: boolean, failed: boolean }>('eventa:invoke:companion:finish')

/** Acknowledgment follows presentation. The scheduler keeps its delivery lease until that acknowledgment. */
export const companionReminders = defineInvokeEventa<{ token: string, text: string } | null, {
  characterId: string
  sessionId: string
  available: boolean
  receipt?: { token: string, shown: boolean }
}>('eventa:invoke:companion:reminders')
