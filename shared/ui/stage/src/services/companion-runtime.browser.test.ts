import type { RecordsCommand, RecordsResponse } from '@angela/companion/companion-contracts'

import en from '@angela/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useAngelaCardStore } from '../stores/modules/angela-card'
import { useCompanionStore } from '../stores/modules/companion'
import { useLearningMemoryStore } from '../stores/modules/learning-memory'
import { importCompanionRecords, installCompanionTransport } from './companion-runtime'

const contexts: ReturnType<typeof createPinia>[] = []
let uninstall: (() => void) | undefined
afterEach(() => {
  uninstall?.()
  for (const pinia of contexts.splice(0))
    disposePinia(pinia)
  localStorage.clear()
  vi.restoreAllMocks()
})
function snapshot(): RecordsResponse {
  return { snapshot: { characterId: 'default', enabled: true, reviewRemindersEnabled: false, memories: [], companion: { enabled: true, entries: [], lastPromptAt: 0 } } }
}

it('does not mark a failed import complete and retains its exact source for retry', async () => {
  const source = JSON.stringify([{ id: 'old', characterId: 'default', text: 'Python', category: 'topic', createdAt: 1, updatedAt: 1 }])
  localStorage.setItem('angela/learning-memory/entries', source)
  const records = vi.fn().mockRejectedValueOnce(new Error('Disk unavailable')).mockResolvedValue(snapshot())
  uninstall = installCompanionTransport({ records, run: vi.fn() })
  await expect(importCompanionRecords('default')).rejects.toThrow('Disk unavailable')
  expect(localStorage.getItem('angela/companion/shared-import/default')).toBeNull()
  expect(localStorage.getItem('angela/learning-memory/entries')).toBe(source)
  await importCompanionRecords('default')
  expect(localStorage.getItem('angela/companion/shared-import/default')).toBe('complete')
  expect(records.mock.calls[1][1].type).toBe('import')
  await importCompanionRecords('default')
  expect(records.mock.calls[2][1].type).toBe('read')
})

it('routes desktop edits to the host without writing either local memory store', async () => {
  localStorage.setItem('angela/companion/shared-import/default', 'complete')
  const pinia = createPinia()
  contexts.push(pinia)
  render(defineComponent({ setup() {
    useAngelaCardStore()
    return () => h('div')
  } }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  const response = snapshot()
  const records = vi.fn(async (_characterId: string, command: RecordsCommand) => {
    if (command.type === 'learning.save') {
      response.snapshot.memories = [{ id: 'shared', characterId: 'default', text: command.text, category: command.category, createdAt: 1, updatedAt: 1 }]
      response.entryId = 'shared'
    }
    return structuredClone(response)
  })
  uninstall = installCompanionTransport({ records, run: vi.fn() })
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  const learning = useLearningMemoryStore(pinia)
  const companion = useCompanionStore(pinia)
  expect(await learning.save('default', 'preference', 'Listen first')).toMatchObject({ id: 'shared' })
  await companion.setEnabled(true)
  expect(learning.forCharacter('default')[0].text).toBe('Listen first')
  expect(records.mock.calls.some(([, command]) => command.type === 'companion.enabled')).toBe(true)
  expect(writes).not.toHaveBeenCalled()
})

it('replicates host-backed follower edits without a second persistence proposal', async () => {
  localStorage.setItem('angela/companion/shared-import/default', 'complete')
  const response = snapshot()
  const records = vi.fn(async (_character: string, command: RecordsCommand) => {
    if (command.type === 'learning.save') {
      response.snapshot.memories = [{ id: 'remote-id', characterId: 'default', text: command.text, category: command.category, createdAt: 1, updatedAt: 1 }]
      response.entryId = 'remote-id'
    }
    return structuredClone(response)
  })
  uninstall = installCompanionTransport({ records, run: vi.fn() })
  const namespace = crypto.randomUUID()
  const leader = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' })
  const follower = createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' })
  const leaderPinia = createPinia().use(leader.plugin)
  const followerPinia = createPinia().use(follower.plugin)
  contexts.push(leaderPinia, followerPinia)
  createApp({}).use(leaderPinia)
  createApp({}).use(followerPinia)
  try {
    await expect.poll(() => leader.isLeader()).toBe(true)
    await expect.poll(() => follower.getLeaderId()).toBe(leader.participantId)
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    const leaderStore = useLearningMemoryStore(leaderPinia)
    const followerStore = useLearningMemoryStore(followerPinia)
    await followerStore.save('default', 'preference', 'Use short answers')
    await expect.poll(() => leaderStore.forCharacter('default')[0]?.text).toBe('Use short answers')
    await expect.poll(() => followerStore.forCharacter('default')[0]?.text).toBe('Use short answers')
    expect(records.mock.calls.filter(([, command]) => command.type === 'learning.save')).toHaveLength(1)
    expect(writes).not.toHaveBeenCalled()
  }
  finally {
    follower.dispose()
    leader.dispose()
  }
})

it('imports only the selected character from a source containing more than fifty total companion records', async () => {
  const entries = Array.from({ length: 60 }, (_, index) => ({ id: `entry-${index}`, characterId: index < 30 ? 'default' : 'other', text: 'Review Python', kind: 'activity', status: 'open', createdAt: 1, updatedAt: 1, dueAt: null }))
  const source = JSON.stringify({ enabled: true, lastPromptAt: 0, entries })
  localStorage.setItem('angela/companion/v1', source)
  const records = vi.fn(async (_characterId: string, command: RecordsCommand) => {
    expect(command.type).toBe('import')
    if (command.type === 'import') {
      expect(command.snapshot.companion.entries).toHaveLength(30)
      expect(command.snapshot.companion.entries.every(entry => entry.characterId === 'default')).toBe(true)
    }
    return snapshot()
  })
  uninstall = installCompanionTransport({ records, run: vi.fn() })
  await importCompanionRecords('default')
  expect(records).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('angela/companion/v1')).toBe(source)
})
