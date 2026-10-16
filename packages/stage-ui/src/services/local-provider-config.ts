import type { LocalConfig, LocalConfigPatch, LocalConfigSnapshot, LocalConfigTransport } from '@proj-airi/local-config'

import { emptyLocalConfig, localConfigSchema } from '@proj-airi/local-config'
import { isEqual } from 'es-toolkit'

import * as v from 'valibot'

import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useProviderConfigStore } from '../stores/providers/config'

/**
 * Connects one renderer to the shared file through host-owned I/O.
 * Only the Pinia leader persists explicit action outcomes. Remote snapshots never trigger a persistence proposal.
 * Stop releases subscriptions and polling. Flush settles writes already captured from completed actions.
 */
export async function connectLocalProviderConfig(transport: LocalConfigTransport, isOwner: () => boolean, onError: (error: unknown) => void) {
  const providers = useProviderConfigStore()
  const consciousness = useConsciousnessStore()
  const cards = useAiriCardStore()
  let baseline = emptyLocalConfig
  let revision: string | undefined
  let initialized = false
  let applying = false
  let stopped = false
  let pending: LocalConfig | undefined
  let queue: Promise<void> = Promise.resolve()

  function snapshot(): LocalConfig {
    const entries = Object.entries(providers.providers).filter(([, provider]) => provider.configuredBy === 'user')
    const selected = entries.some(([id]) => id === consciousness.activeProvider)
    // JSON is the shared file contract. Taking a detached snapshot also removes Vue proxies from provider values.
    return v.parse(localConfigSchema, JSON.parse(JSON.stringify({
      version: 1,
      providers: Object.fromEntries(entries.map(([id, provider]) => [id, { definitionId: provider.definitionId, config: provider.config, status: provider.status }])),
      chat: selected ? { provider: consciousness.activeProvider, model: consciousness.activeModel } : emptyLocalConfig.chat,
    })))
  }

  async function apply(config: LocalConfig) {
    applying = true
    try {
      const current = snapshot().chat
      for (const [id, provider] of Object.entries(providers.providers)) {
        if (provider.configuredBy === 'user' && !config.providers[id])
          await providers.removeProvider(id)
      }
      for (const [id, provider] of Object.entries(config.providers)) {
        const existing = providers.providers[id]
        if (existing?.configuredBy === 'authentication')
          throw new Error('Shared provider IDs cannot replace account-owned providers')
        if (existing && existing.definitionId !== provider.definitionId)
          await providers.removeProvider(id)
        if (!providers.providers[id])
          await providers.ensureProvider(id, provider.definitionId, provider.config)
        await providers.markProviderAdded(id)
        if (!isEqual(providers.providers[id].config, provider.config) || providers.providers[id].status !== provider.status)
          await providers.updateProviderConfig(id, provider.config, provider.status)
      }
      if (!isEqual(current, config.chat))
        await cards.updateActiveCardConsciousness(config.chat)
    }
    finally {
      applying = false
    }
  }

  function difference(previous: LocalConfig, next: LocalConfig): LocalConfigPatch | undefined {
    const changes: NonNullable<LocalConfigPatch['providers']> = {}
    for (const id of new Set([...Object.keys(previous.providers), ...Object.keys(next.providers)])) {
      if (!isEqual(previous.providers[id], next.providers[id]))
        changes[id] = next.providers[id] ?? null
    }
    const chat = isEqual(previous.chat, next.chat) ? undefined : next.chat
    return Object.keys(changes).length || chat ? { providers: changes, chat } : undefined
  }

  function enqueue(operation: () => Promise<void>) {
    const result = queue.then(operation)
    queue = result.catch(() => {})
    return result
  }

  async function save() {
    if (!pending || !initialized || !isOwner() || stopped)
      return
    const desired = pending
    pending = undefined
    const patch = difference(baseline, desired)
    if (!patch)
      return
    let saved: LocalConfigSnapshot
    try {
      saved = await transport.update(patch)
    }
    catch (error) {
      pending ??= desired
      throw error
    }
    baseline = desired
    // A completed write must not restore its older snapshot over a newer settings action.
    // Poll again when another writer contributed values that this renderer has not applied.
    revision = isEqual(saved.config, desired) ? saved.revision : undefined
  }

  async function refresh() {
    if (!isOwner() || stopped)
      return
    await save()
    let remote = await transport.read()
    if (!isOwner() || stopped || pending)
      return
    if (!initialized) {
      const marker = `settings/local-config/imported/${remote.id}`
      const current = snapshot()
      if (!remote.config || localStorage.getItem(marker) !== 'true') {
        // Each browser profile imports its existing direct providers once. Shared values win on matching IDs.
        const config = remote.config ?? emptyLocalConfig
        remote = await transport.update({
          providers: { ...current.providers, ...config.providers },
          chat: config.chat.provider ? config.chat : current.chat,
        })
        await apply(remote.config!)
        localStorage.setItem(marker, 'true')
      }
      else {
        await apply(remote.config)
      }
      initialized = true
      baseline = snapshot()
      revision = remote.revision
      return
    }
    if (remote.config && remote.revision !== revision) {
      await apply(remote.config)
      baseline = snapshot()
      revision = remote.revision
    }
  }

  await refresh()
  const capture = () => {
    if (applying || stopped || !isOwner() || !initialized)
      return
    pending = snapshot()
    void enqueue(save).catch(onError)
  }
  const stopProviders = providers.$onAction(({ name, after }) => {
    if (!['getProvider', 'getProviderConfig', 'onAfterSync', 'onRemoteWorking'].includes(name))
      after(capture)
  }, true)
  const stopCards = cards.$onAction(({ name, after }) => {
    if (['updateActiveCardConsciousness', 'activateCard', 'clearProviderSelections'].includes(name))
      after(capture)
  }, true)
  const interval = setInterval(() => void enqueue(refresh).catch(onError), 1500)

  return {
    flush: () => enqueue(save),
    refresh: () => enqueue(refresh),
    stop() {
      stopped = true
      clearInterval(interval)
      stopProviders()
      stopCards()
    },
  }
}
