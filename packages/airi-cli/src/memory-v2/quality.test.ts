import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
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
