import type { LocalConfig, LocalConfigPatch, LocalConfigTransport } from '@proj-airi/local-config'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { PiniaColada } from '@pinia/colada'
import { emptyLocalConfig } from '@proj-airi/local-config'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useProviderConfigStore } from '../stores/providers/config'
import { connectLocalProviderConfig } from './local-provider-config'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: { value: 'en' }, t: (key: string) => key }),
}))

const runtimes: SyncedPiniaRuntime[] = []
const instances: ReturnType<typeof createPinia>[] = []
const connections: Awaited<ReturnType<typeof connectLocalProviderConfig>>[] = []

function createContext(runtime?: SyncedPiniaRuntime) {
  const pinia = createPinia()
  if (runtime) {
    runtimes.push(runtime)
    pinia.use(runtime.plugin)
  }
  createApp({}).use(pinia).use(PiniaColada)
  setActivePinia(pinia)
  instances.push(pinia)
  return { pinia, cards: useAiriCardStore(pinia), providers: useProviderConfigStore(pinia), consciousness: useConsciousnessStore(pinia) }
}

// The host transport is an external boundary. Pinia, storage, and browser replication run unchanged.
function createTransport(initial: LocalConfig | null = null) {
  let config = initial
  let revision = 0
  const read = vi.fn(async () => ({ id: 'test-config-file', config: structuredClone(config), revision: String(revision) }))
  const update = vi.fn(async (patch: LocalConfigPatch) => {
    const previous = config ?? emptyLocalConfig
    const providers = { ...previous.providers }
    for (const [id, value] of Object.entries(patch.providers ?? {})) {
      if (value === null)
        delete providers[id]
      else
        providers[id] = value
    }
    config = structuredClone({ version: 1, providers, chat: patch.chat ?? previous.chat })
    revision++
    return read()
  })
  return { read, update } satisfies LocalConfigTransport
}

async function connect(transport: LocalConfigTransport, isOwner = () => true) {
  const connection = await connectLocalProviderConfig(transport, isOwner, error => expect.unreachable(String(error)))
  connections.push(connection)
  return connection
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ voices: [], recommended: {}, data: [] }))))
})

afterEach(() => {
  for (const connection of connections.splice(0))
    connection.stop()
  for (const runtime of runtimes.splice(0))
    runtime.dispose()
  for (const pinia of instances.splice(0))
    disposePinia(pinia)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('imports existing direct settings once and applies external edits and deletions without writing them back', async () => {
  const context = createContext()
  await context.cards.initialize()
  await context.providers.ensureProvider('openai-compatible', 'openai-compatible', { apiKey: 'test-key' })
  await context.cards.updateActiveCardConsciousness({ provider: 'openai-compatible', model: 'first-model' })
  const transport = createTransport()
  const connection = await connect(transport)
  expect((await transport.read()).config?.providers['openai-compatible'].config.apiKey).toBe('test-key')
  await context.providers.patchProviderConfig('openai-compatible', { apiKey: 'changed-key' })
  await context.cards.updateActiveCardConsciousness({ provider: 'openai-compatible', model: 'second-model' })
  await connection.flush()
  expect((await transport.read()).config?.chat.model).toBe('second-model')
  expect((await transport.read()).config?.providers['openai-compatible'].config.apiKey).toBe('changed-key')

  await transport.update({ providers: { 'openai-compatible': null }, chat: { provider: '', model: '' } })
  const writes = transport.update.mock.calls.length
  await connection.refresh()
  await connection.refresh()
  expect(context.providers.providers['openai-compatible']).toBeUndefined()
  expect(context.consciousness.activeProvider).toBe('')
  expect(context.consciousness.activeModel).toBe('')
  expect(transport.update).toHaveBeenCalledTimes(writes)

  connection.stop()
  await context.providers.ensureProvider('ollama', 'openai-compatible', { apiKey: 'cached-key' })
  await connect(transport)
  expect(context.providers.providers.ollama).toBeUndefined()
  expect(transport.update).toHaveBeenCalledTimes(writes)
})

it('persists a follower command once through the leader without echoing received snapshots', async () => {
  const namespace = `local-config-${crypto.randomUUID()}`
  const leaderRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' })
  const leader = createContext(leaderRuntime)
  await expect.poll(() => leaderRuntime.isLeader()).toBe(true)
  await leader.cards.initialize()
  const transport = createTransport({ version: 1, providers: { 'openai-compatible': { definitionId: 'openai-compatible', config: {}, status: 'configured' } }, chat: { provider: 'openai-compatible', model: 'original' } })
  const leaderConnection = await connect(transport, () => leaderRuntime.isLeader())

  const followerRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' })
  const follower = createContext(followerRuntime)
  await expect.poll(() => follower.consciousness.activeModel).toBe('original')
  const followerTransport = createTransport()
  await connect(followerTransport, () => followerRuntime.isLeader())
  const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
  const writes = transport.update.mock.calls.length
  await follower.cards.updateActiveCardConsciousness({ provider: 'openai-compatible', model: 'from-follower' })
  await leaderConnection.flush()
  await expect.poll(() => leader.consciousness.activeModel).toBe('from-follower')
  await expect.poll(() => follower.consciousness.activeModel).toBe('from-follower')
  expect((await transport.read()).config?.chat.model).toBe('from-follower')
  expect(transport.update).toHaveBeenCalledTimes(writes + 1)
  expect(followerTransport.read).not.toHaveBeenCalled()
  expect(followerTransport.update).not.toHaveBeenCalled()

  traffic.mockClear()
  await transport.update({ chat: { provider: 'openai-compatible', model: 'external' } })
  const afterExternal = transport.update.mock.calls.length
  await leaderConnection.refresh()
  await expect.poll(() => follower.consciousness.activeModel).toBe('external')
  await nextTick()
  expect(transport.update).toHaveBeenCalledTimes(afterExternal)
  expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
})
