import type { Observation } from './evaluation'

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as v from 'valibot'

import { evaluateCase, score, summarize } from './evaluation'
import { caseSchema, categories, loadCases } from './schema'

const corpus = await loadCases(new URL('./cases.jsonl', import.meta.url))

function fixture(id: string) {
  const item = corpus.find(item => item.id === id)
  if (!item)
    throw new Error(`Missing case ${id}`)
  return structuredClone(item)
}

function emptyObservation(): Observation {
  return { recall: [], context: '', contextRefs: [], contextKinds: [], supersededRefs: [], warnings: [] }
}

describe('dataset contract', () => {
  it('contains 100 to 150 unique cases and every required category', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(100)
    expect(corpus.length).toBeLessThanOrEqual(150)
    expect(new Set(corpus.map(item => item.id)).size).toBe(corpus.length)
    expect([...new Set(corpus.map(item => item.category))].sort()).toEqual([...categories].sort())
    for (const category of categories)
      expect(corpus.filter(item => item.category === category).length).toBeGreaterThanOrEqual(8)
  })

  it('rejects dangling references, duplicate messages, unknown fields and missing page fixtures', () => {
    const dangling = fixture('preference_001')
    dangling.expected.recall_refs = ['missing']
    expect(() => v.parse(caseSchema, dangling)).toThrow('invalid reference')
    const duplicate = fixture('preference_001')
    duplicate.history[1].id = duplicate.history[0].id
    expect(() => v.parse(caseSchema, duplicate)).toThrow('Duplicate identity')
    const missingPage = fixture('preference_001')
    delete missingPage.history[0].memory
    expect(() => v.parse(caseSchema, missingPage)).toThrow('missing page fixture')
    expect(() => v.parse(caseSchema, { ...fixture('preference_001'), typo: true })).toThrow()
  })

  it('rejects malformed JSONL and duplicate case IDs before execution', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'angela-eval-schema-'))
    const path = join(directory, 'cases.jsonl')
    try {
      await writeFile(path, '{invalid json}\n')
      await expect(loadCases(path)).rejects.toThrow('line 1')
      await writeFile(path, `${JSON.stringify(corpus[0])}\n${JSON.stringify(corpus[0])}\n`)
      await expect(loadCases(path)).rejects.toThrow('Duplicate case ID')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('scoring controls', () => {
  it('does not count answer words as recall and rejects a wrong source tier', () => {
    const item = fixture('preference_001')
    const observation = emptyObservation()
    observation.context = 'TRÀ SEN'
    expect(score(item, observation).recallHit).toBe(false)
    observation.recall = [{ refs: ['m1'], kind: 'episodic', text: 'trà sen' }]
    expect(score(item, observation).recallHit).toBe(false)
    observation.recall[0].kind = 'semantic'
    expect(score(item, observation).recallHit).toBe(true)
    expect(score(item, observation).contextHit).toBe(false)
    observation.contextRefs = ['m1']
    observation.contextKinds = [{ refs: ['m1'], kind: 'semantic' }]
    expect(score(item, observation).passed).toBe(true)
  })

  it('requires all expected references within top 5', () => {
    const observation = emptyObservation()
    observation.recall = Array.from({ length: 5 }, () => ({ refs: [], kind: 'semantic', text: 'noise' }))
    observation.recall.push({ refs: ['m1'], kind: 'semantic', text: 'trà sen' })
    expect(score(fixture('preference_001'), observation).recallHit).toBe(false)
    const item = fixture('plan_vs_completed_001')
    observation.recall = [{ refs: ['m1'], kind: 'episodic', text: 'plan only' }]
    expect(score(item, observation).recallHit).toBe(false)
  })

  it('detects wrong-user evidence in recall or context', () => {
    const item = fixture('isolation_001')
    const observation = emptyObservation()
    observation.recall = [{ refs: ['m1'], kind: 'semantic', text: 'HoaSen' }]
    expect(score(item, observation).wrongMemory).toBe(true)
    observation.recall = []
    observation.contextRefs = ['m1']
    expect(score(item, observation).wrongMemory).toBe(true)
    observation.contextRefs = []
    expect(score(item, observation).wrongMemory).toBe(false)
  })

  it('detects a superseded source and an unretired store record independently', () => {
    const item = fixture('preference_change_001')
    const observation = emptyObservation()
    expect(score(item, observation).supersededError).toBe(true)
    observation.supersededRefs = ['m1']
    expect(score(item, observation).supersededError).toBe(false)
    observation.contextRefs = ['m1']
    expect(score(item, observation).supersededError).toBe(true)
  })

  it('allows an old value quoted in the current correction', () => {
    const item = fixture('preference_change_001')
    const observation = emptyObservation()
    observation.context = 'Giờ mình thích Vue hơn React.'
    observation.recall = [{ refs: ['m2'], kind: 'semantic', text: observation.context }]
    observation.contextRefs = ['m2']
    observation.contextKinds = [{ refs: ['m2'], kind: 'semantic' }]
    observation.supersededRefs = ['m1']
    expect(score(item, observation).passed).toBe(true)
  })

  it('detects false shared evidence, false completion and irrelevant injection', () => {
    const shared = fixture('no_shared_memory_001')
    const observation = emptyObservation()
    observation.context = 'Chúng ta CUNG DI DA LAT.'
    expect(score(shared, observation).falseSharedMemory).toBe(true)
    observation.context = 'Completed: đã gửi bài dự thi'
    expect(score(fixture('not_yet_happened_005'), observation).forbiddenContent).toBe(true)
    observation.context = ''
    observation.contextRefs = ['m1']
    expect(score(fixture('irrelevant_memory_001'), observation).irrelevantInjection).toBe(true)
  })

  it('keeps unavailable denominators null and counts only eligible cases', () => {
    expect(summarize([]).metrics['Recall hit rate']).toEqual({ count: 0, total: 0, rate: null })
    const rows = [score(fixture('preference_001'), emptyObservation()), score(fixture('isolation_001'), emptyObservation())]
    expect(summarize(rows).metrics['Recall hit rate']).toEqual({ count: 0, total: 1, rate: 0 })
    expect(summarize(rows).metrics['Wrong-memory rate']).toEqual({ count: 0, total: 1, rate: 0 })
    expect(summarize(rows).metrics['False shared-memory rate'].rate).toBeNull()
  })
})

describe('real memory and context boundaries', () => {
  it.each([
    'preference_001',
    'preference_change_001',
    'conversation_recall_001',
    'plan_vs_completed_001',
    'commitment_001',
    'workflow_recall_001',
    'isolation_001',
    'isolation_003',
    'isolation_005',
    'isolation_007',
    'long_gap_001',
  ])('runs %s through production APIs after database reopen', async (id) => {
    const result = await evaluateCase(fixture(id))
    expect(result.failures).toEqual([])
    expect(result.passed).toBe(true)
  })

  it('keeps an active capture episode searchable but out of automatic context', async () => {
    const item = fixture('not_yet_happened_001')
    item.history[0].session_id = 'current'
    const result = await evaluateCase(item)
    expect(result.recallHit).toBe(true)
    expect(result.contextHit).toBe(false)
    expect(result.observation.contextRefs).toEqual([])
  })

  it('reports a deliberate retrieval miss without changing expectations', async () => {
    const item = fixture('preference_001')
    item.query = 'UNSEEN_EVAL_TERM_QXZ_873'
    const result = await evaluateCase(item)
    expect(result.recallHit).toBe(false)
    expect(result.passed).toBe(false)
    expect(result.failures).toContain('recall-miss-or-wrong-tier')
  })
})
