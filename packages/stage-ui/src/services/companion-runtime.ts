import type { RecordsCommand, RecordsResponse, RecordsSnapshot } from '@angela/cli/companion-contracts'
import type { Conversation, StreamOptions } from '@angela/core-agent'

import { companionStateSchema, learningMemorySchema } from '@angela/cli/companion-contracts'
import { array, parse } from 'valibot'

/** A Node host owns records and request orchestration. Browser mode has no transport and retains its local stores. */
export interface CompanionTransport {
  records: (characterId: string, command: RecordsCommand) => Promise<RecordsResponse>
  run: (characterId: string, sessionId: string, context: Conversation, options: StreamOptions, generate: (context: Conversation, options: StreamOptions) => Promise<void>) => Promise<void>
}
let transport: CompanionTransport | undefined

/** Installs the desktop boundary before any desktop chat or edit. Disposal removes only this host registration. */
export function installCompanionTransport(value: CompanionTransport) {
  transport = value
  return () => {
    if (transport === value)
      transport = undefined
  }
}

export function companionTransport() {
  return transport
}

/** Imports one character once in the authoritative store. Old data stays on disk as an inert recovery source. */
export async function importCompanionRecords(characterId: string) {
  if (!transport)
    return undefined
  const marker = `angela/companion/shared-import/${characterId}`
  if (localStorage.getItem(marker) === 'complete')
    return transport.records(characterId, { type: 'read' })
  const learning = parse(array(learningMemorySchema), JSON.parse(localStorage.getItem('angela/learning-memory/entries') ?? '[]'))
  const companion = parse(companionStateSchema, JSON.parse(localStorage.getItem('angela/companion/v1') ?? '{"enabled":false,"entries":[],"lastPromptAt":0}'))
  const snapshot: RecordsSnapshot = {
    characterId,
    enabled: localStorage.getItem('angela/learning-memory/enabled') !== 'false',
    reviewRemindersEnabled: localStorage.getItem('angela/learning-memory/review-reminders') === 'true',
    memories: learning.filter(entry => entry.characterId === characterId),
    companion: { ...companion, entries: companion.entries.filter(entry => entry.characterId === characterId) },
  }
  const response = await transport.records(characterId, { type: 'import', snapshot })
  localStorage.setItem(marker, 'complete')
  return response
}
