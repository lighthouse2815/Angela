import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { expect, it } from 'vitest'

import { Memory } from '../memory'
import { Recall } from '../recall'
import { RecallIndex } from '../recall-index'
import { evaluateMemory } from './evaluation'

it('retrieves durable facts, episodes, workflows, current preferences and contradictions through cold compaction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-quality-'))
  const index = await RecallIndex.open(directory)
  try {
    const result = evaluateMemory(index)
    expect(result.recallAt5).toBe(1)
    expect(result.supersededAbsent).toBe(true)
    expect(result.falsePositiveNoise).toBeLessThanOrEqual(3)
    expect(result.afterCompaction.every(probe => probe.found)).toBe(true)
    expect(result.probes.find(probe => probe.name === 'current-preference')?.positions).toEqual([1])
  }
  finally {
    index.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)

it('preserves page projections during file reconciliation and enforces exact-read workspace scope', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-quality-scope-'))
  const index = await RecallIndex.open(directory)
  const page = index.memory.write({ tier: 'semantic', scope: 'secret-workspace', key: 'private', kind: 'architecture', title: 'Private design', body: 'Hidden pineapple design', authority: 'user' })
  index.close()
  const recall = new Recall(directory, 'current-workspace', 'session', cliMessages.en, {}, { apiKey: '' })
  try {
    await recall.start()
    await recall.changed()
    expect(await recall.search('pineapple')).toEqual([])
    const read = recall.tools().find(tool => tool.function.name === 'memory_read')!
    expect(await read.execute?.({ id: `memory:${page.id}`, offset: 0 }, { messages: [], toolCallId: 'test-call' })).toMatchObject({ status: 'unavailable' })
    expect(await recall.search('pineapple', true)).toHaveLength(1)
    await recall.command('/memory search-all pineapple')
    expect(await read.execute?.({ id: `memory:${page.id}`, offset: 0 }, { messages: [], toolCallId: 'test-call' })).toMatchObject({ status: 'ok' })
    await new Memory(directory, cliMessages.en).setEnabled(false)
    expect(await recall.search('pineapple', true)).toEqual([])
  }
  finally {
    await recall.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('keeps the current episode available to explicit recall without duplicating working memory in automatic context', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-working-memory-'))
  const index = await RecallIndex.open(directory)
  const episode = index.memory.write({ tier: 'episodic', kind: 'session', scope: directory, key: 'session:session', title: 'Working episode', body: 'UniqueCurrentEpisodeMarker', authority: 'episode', sourceSessionId: 'session' })
  const recall = new Recall(directory, directory, 'session', cliMessages.en, {}, { apiKey: '' })
  try {
    await recall.start()
    const prepared = await recall.prepare('UniqueCurrentEpisodeMarker')
    expect(prepared.context).not.toContain('UniqueCurrentEpisodeMarker')
    expect(index.memory.read(episode.id, directory)?.accessCount).toBe(0)
    expect(await recall.search('UniqueCurrentEpisodeMarker')).toHaveLength(1)
    expect(index.memory.read(episode.id, directory)?.accessCount).toBe(1)
  }
  finally {
    await recall.close()
    index.close()
    await rm(directory, { recursive: true, force: true })
  }
})
