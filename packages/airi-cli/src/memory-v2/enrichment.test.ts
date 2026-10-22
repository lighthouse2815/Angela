import type { GenerationProvider } from '@angela/provider-inference'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { Recall } from '../recall'
import { RecallIndex } from '../recall-index'

const resources: { directory: string, recall: Recall, index: RecallIndex }[] = []
afterEach(async () => {
  for (const { directory, recall, index } of resources.splice(0)) {
    await recall.close()
    index.close()
    await rm(directory, { recursive: true, force: true })
  }
})
const candidate = { tier: 'semantic', kind: 'architecture', key: 'database', title: 'Storage', body: 'Use local SQLite memory', source_quote: 'We chose SQLite for local memory' }

function completion(delta: object, finish = 'stop') {
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}
function provider(fetch: typeof globalThis.fetch): GenerationProvider {
  return { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://fixture.invalid/v1/', fetch } }) }
}
function propose(input: object = candidate) {
  return completion({ role: 'assistant', tool_calls: [{ index: 0, id: 'proposal', type: 'function', function: { name: 'propose_memory', arguments: JSON.stringify(input) } }] }, 'tool_calls')
}
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-enrichment-'))
  const index = await RecallIndex.open(directory)
  const episode = index.memory.write({ tier: 'episodic', scope: directory, key: 'session:session', kind: 'session', title: 'Storage decision', body: 'Decision: We chose SQLite for local memory', authority: 'episode', sourceSessionId: 'session' })
  const recall = new Recall(directory, directory, 'session', cliMessages.en, {}, { apiKey: '' })
  resources.push({ directory, index, recall })
  await recall.start()
  return { directory, index, recall, episode }
}

it('enriches a zero-provider episode through validated structured tool output and source edges', async () => {
  const { directory, index, recall, episode } = await setup()
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(propose()).mockResolvedValueOnce(completion({ role: 'assistant', content: 'Done' }))
  expect(await recall.enrich('fixture', provider(fetch))).toEqual({ status: 'enriched', count: 1 })
  const page = index.memory.current(directory, 'semantic', 'database')!
  expect(page.authority).toBe('consolidated')
  expect(index.memory.edges(page.id, directory)).toContainEqual({ fromId: page.id, toId: episode.id, relation: 'derived_from' })
})

it('preserves explicit knowledge and rejects invented source quotes', async () => {
  const { directory, index, recall } = await setup()
  const explicit = index.memory.write({ tier: 'semantic', kind: 'architecture', key: 'database', scope: directory, title: 'Storage', body: 'Use encrypted SQLite', authority: 'user' })
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(propose()).mockResolvedValueOnce(completion({ role: 'assistant', content: 'Done' }))
  expect(await recall.enrich('fixture', provider(fetch))).toEqual({ status: 'enriched', count: 0 })
  expect(index.memory.current(directory, 'semantic', 'database')?.id).toBe(explicit.id)
  const invalid = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(propose({ ...candidate, key: 'invented', source_quote: 'Not in this episode' })).mockResolvedValueOnce(completion({ role: 'assistant', content: 'Done' }))
  expect(await recall.enrich('fixture', provider(invalid))).toEqual({ status: 'enriched', count: 0 })
})

it('leaves basic memory searchable after a provider failure', async () => {
  const { recall, index, directory, episode } = await setup()
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('private-provider-detail', { status: 401 }))
  expect(await recall.enrich('fixture', provider(fetch))).toEqual({ status: 'unavailable', count: 0 })
  expect(index.memory.read(episode.id, directory)).toBeDefined()
  expect(await recall.search('SQLite')).toHaveLength(1)
})

it('rejects enrichment when its episode was purged while the provider was running', async () => {
  const { recall, index, directory, episode } = await setup()
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async () => {
    index.memory.purge(episode.id, directory)
    return propose()
  }).mockResolvedValueOnce(completion({ role: 'assistant', content: 'Done' }))
  expect(await recall.enrich('fixture', provider(fetch))).toEqual({ status: 'stale', count: 0 })
  expect(index.memory.current(directory, 'semantic', 'database')).toBeUndefined()
})
