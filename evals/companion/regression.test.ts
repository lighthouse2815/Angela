import type { Result } from './evaluation'

import { readFile } from 'node:fs/promises'

import { expect, it } from 'vitest'

import { evaluateCase, summarize } from './evaluation'
import { loadCases } from './schema'

const corpus = await loadCases(new URL('./cases.jsonl', import.meta.url))
const baseline = JSON.parse(await readFile(new URL('./baseline.json', import.meta.url), 'utf8')) as { results: Result[] }
const failedIds = new Set(baseline.results.filter(result => !result.passed).map(result => result.id))
const regressions = corpus.filter(item => failedIds.has(item.id))

it.each(regressions)('protects the original failure $id without changing its labels', async (item) => {
  const result = await evaluateCase(item)
  expect(result.wrongMemory).not.toBe(true)
  expect(result.supersededError).not.toBe(true)
  expect(result.falseSharedMemory).not.toBe(true)
  expect(result.irrelevantInjection).not.toBe(true)
  expect(result.forbiddenContent).not.toBe(true)
  if (item.category !== 'semantic_paraphrase') {
    expect(result.failures).toEqual([])
    expect(result.passed).toBe(true)
  }
})

it('meets recall and contamination targets across the complete unchanged corpus', async () => {
  const results: Result[] = []
  for (const item of corpus)
    results.push(await evaluateCase(item))
  const metrics = summarize(results).metrics
  expect(regressions).toHaveLength(21)
  expect(metrics['Recall hit rate'].rate).toBeGreaterThanOrEqual(0.95)
  expect(metrics['Irrelevant-memory injection rate'].rate).toBeLessThanOrEqual(0.05)
  expect(metrics['Wrong-memory rate'].count).toBe(0)
  expect(metrics['Superseded-memory error rate'].count).toBe(0)
  expect(metrics['False shared-memory rate'].count).toBe(0)
  expect(metrics['Context hit rate'].rate).toBeGreaterThanOrEqual(summarize(baseline.results).metrics['Context hit rate'].rate!)
  expect(metrics['Case pass rate'].count).toBeGreaterThanOrEqual(summarize(baseline.results).metrics['Case pass rate'].count)
}, 30_000)
