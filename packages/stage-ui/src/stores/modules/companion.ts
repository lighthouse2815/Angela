import type { CompanionEntry, RecordsCommand } from '@angela/cli/companion-contracts'
import type {} from 'pinia-plugin-synced'
import type { InferOutput } from 'valibot'

import { companionEntrySchema as entrySchema, companionStateSchema as stateSchema } from '@angela/cli/companion-contracts'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { parse, picklist, safeParse } from 'valibot'
import { shallowRef } from 'vue'

import { companionTransport, importCompanionRecords } from '../../services/companion-runtime'
import { useAngelaCardStore } from './angela-card'

export { companionKindSchema } from '@angela/cli/companion-contracts'
export type { CompanionEntry } from '@angela/cli/companion-contracts'

const storageKey = 'angela/companion/v1'

function load() {
  try {
    const result = safeParse(stateSchema, JSON.parse(localStorage.getItem(storageKey) ?? 'null'))
    if (result.success)
      return result.output
  }
  catch {
    // Unreadable storage cannot prevent chat. Explicit edits surface storage failures to the caller.
  }
  return { enabled: false, entries: [], lastPromptAt: 0 }
}

/** The leader persists bounded, character-scoped records before publishing snapshots to other windows. */
export const useCompanionStore = defineStore('companion', () => {
  const state = shallowRef(load())

  async function shared(characterId: string, command: RecordsCommand) {
    const host = companionTransport()
    if (!host)
      throw new Error('The shared companion host is unavailable')
    await importCompanionRecords(characterId)
    const result = await host.records(characterId, command)
    state.value = { ...result.snapshot.companion, entries: [...state.value.entries.filter(entry => entry.characterId !== characterId), ...result.snapshot.companion.entries] }
    return result
  }

  async function refresh(characterId: string) {
    if (companionTransport())
      await shared(characterId, { type: 'read' })
  }

  function persist(next: InferOutput<typeof stateSchema>) {
    localStorage.setItem(storageKey, JSON.stringify(next))
    state.value = next
  }

  function forCharacter(characterId: string) {
    return state.value.entries.filter(entry => entry.characterId === characterId).toSorted((a, b) => b.updatedAt - a.updatedAt)
  }

  async function setEnabled(enabled: boolean) {
    if (companionTransport()) {
      await shared(useAngelaCardStore().activeCardId, { type: 'companion.enabled', value: enabled })
      return
    }
    persist({ ...state.value, enabled })
  }

  async function save(characterId: string, kind: CompanionEntry['kind'], text: string, dueAt: number | null = null, id?: string) {
    if (companionTransport()) {
      const result = await shared(characterId, { type: 'companion.save', kind, text, dueAt, id })
      return result.snapshot.companion.entries.find(entry => entry.id === result.entryId)!
    }
    if (!state.value.enabled)
      throw new Error('disabled')
    const now = Date.now()
    const current = id
      ? forCharacter(characterId).find(entry => entry.id === id)
      : forCharacter(characterId).find(entry => entry.kind === kind && entry.text === text.trim() && entry.status === 'open')
    if (id && !current)
      throw new Error('missing')
    if (!current && forCharacter(characterId).length >= 50)
      throw new Error('limit')
    if (kind === 'preference' && dueAt !== null)
      throw new Error('unscheduled')
    const entry = parse(entrySchema, {
      id: current?.id ?? nanoid(),
      characterId,
      kind,
      text,
      dueAt,
      status: 'open',
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      // Repeating the same save must not rearm an already presented follow-up.
      promptedAt: current?.text === text.trim() && current.dueAt === dueAt ? current.promptedAt : undefined,
    })
    persist({ ...state.value, entries: [...state.value.entries.filter(item => item.id !== entry.id), entry] })
    return structuredClone(entry)
  }

  async function resolve(characterId: string, id: string, status: 'completed' | 'dismissed') {
    if (companionTransport()) {
      const result = await shared(characterId, { type: 'companion.resolve', id, status })
      return result.snapshot.companion.entries.find(entry => entry.id === id)!
    }
    const current = forCharacter(characterId).find(entry => entry.id === id)
    if (!current)
      throw new Error('missing')
    parse(picklist(['completed', 'dismissed']), status)
    const entry = { ...current, status, updatedAt: Date.now() }
    persist({ ...state.value, entries: state.value.entries.map(item => item.id === id ? entry : item) })
    return structuredClone(entry)
  }

  async function forget(characterId: string, id: string) {
    if (companionTransport()) {
      await shared(characterId, { type: 'companion.forget', id })
      return
    }
    persist({ ...state.value, entries: state.value.entries.filter(entry => entry.characterId !== characterId || entry.id !== id) })
  }

  /** Reserves at most one attempt per record, and at most one per hour across characters, before any UI side effect. */
  async function reservePrompt(characterId: string) {
    if (companionTransport())
      return (await shared(characterId, { type: 'companion.reserve' })).prompt ?? null
    const now = Date.now()
    const hour = new Date(now).getHours()
    if (!state.value.enabled || hour < 8 || hour >= 22 || now - state.value.lastPromptAt < 3600000)
      return null
    const current = forCharacter(characterId).filter(entry => entry.kind !== 'preference' && entry.status === 'open'
      && entry.dueAt !== null && entry.dueAt <= now && entry.promptedAt === undefined).toSorted((a, b) => a.dueAt! - b.dueAt!)[0]
    if (!current)
      return null
    const entry = { ...current, promptedAt: now }
    persist({ ...state.value, lastPromptAt: now, entries: state.value.entries.map(item => item.id === entry.id ? entry : item) })
    return structuredClone(entry)
  }

  return { refresh, state, forCharacter, setEnabled, save, resolve, forget, reservePrompt }
}, {
  synced: { state: true, actions: ['refresh', 'setEnabled', 'save', 'resolve', 'forget', 'reservePrompt'] },
})
