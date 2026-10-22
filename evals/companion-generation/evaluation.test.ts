import type { GenerationProvider } from '@angela/provider-inference'

import type { Observation } from './harness'
import type { Result } from './scoring'

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { observe } from './harness'
import { loadCases } from './schema'
import { criteria, deterministicChecks, judge, parseJudgment, summarize } from './scoring'

const cases = await loadCases(new URL('./cases.jsonl', import.meta.url))
const item = cases[0]!

/** External streaming transport only. These responses test the runner and never enter a generation baseline. */
function provider(answer: string): GenerationProvider {
  return { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://transport.invalid/v1/', fetch: async () => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: answer }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }) } }) }
}

function emptyObservation(): Observation {
  return { rawAnswer: '', requests: [], httpStatuses: [], streamEvents: [], events: [], warnings: [], recalledRefs: [], contextRefs: [], usedRefs: [], sources: [], fixtureTools: [], durableText: '', prepared: false }
}

describe('dataset', () => {
  it('covers the spec rule IDs with a bounded corpus', async () => {
    const spec = await readFile(new URL('../../docs/ai/companion-behavior-spec.md', import.meta.url), 'utf8')
    const rules = [...new Set([...spec.matchAll(/\b([EAMFWSV]\d{2})\b/gu)].map(match => match[1]))].sort()
    expect(cases.length).toBeGreaterThanOrEqual(40)
    expect(cases.length).toBeLessThanOrEqual(60)
    expect([...new Set(cases.flatMap(entry => entry.expected.expectedRuleIds))].sort()).toEqual(rules)
  })

  it('rejects duplicate IDs and unknown expectation fields before execution', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'angela-dataset-test-'))
    const path = join(directory, 'cases.jsonl')
    try {
      await writeFile(path, `${JSON.stringify(item)}\n${JSON.stringify(item)}\n`)
      await expect(loadCases(path)).rejects.toThrow('Duplicate case ID')
      await writeFile(path, JSON.stringify({ ...item, expected: { ...item.expected, silentPass: true } }))
      await expect(loadCases(path)).rejects.toThrow('Invalid case at line 1')
    }
    finally { await rm(directory, { recursive: true, force: true }) }
  })

  it.each(cases)('prepares the production request without a model for $id', async (entry) => {
    const observation = await observe(entry.input)
    expect(observation.prepared).toBe(true)
    expect(observation.infrastructureError).toBeUndefined()
    expect(observation.rawAnswer).toBe('')
    expect(observation.requests).toHaveLength(1)
    expect(JSON.stringify(observation.requests)).not.toContain(entry.expected.requiredClaims[0])
  })
})

describe('production path', () => {
  it('captures actual context and streamed text through core-agent without leaking expectations', async () => {
    const observation = await observe(item.input, { model: 'transport-test', provider: provider('Tôi chưa có cập nhật hoàn thành.') })
    expect(observation.rawAnswer).toBe('Tôi chưa có cập nhật hoàn thành.')
    expect(observation.infrastructureError).toBeUndefined()
    expect(JSON.stringify(observation.requests)).toContain(item.input.query)
    expect(JSON.stringify(observation.requests)).toContain('Mai tôi sẽ làm bài PPLNCKH.')
    expect(JSON.stringify(observation.requests)).not.toContain('requiredClaims')
    expect(observation.events).toContainEqual(expect.objectContaining({ type: 'request.completed' }))
  })

  it.each([
    { name: 'project_memory', field: 'project', args: { expected_revision: 0, snapshot: { goal: 'Project backend dùng .NET.', status: 'active', decisions: [], completed: [], blockers: [], nextStep: '' }, source_quote: 'Project backend dùng .NET.' } },
    { name: 'skill_save', field: 'skills', args: { name: 'backend-build', description: 'Build the backend', instructions: 'Run the backend build and inspect its result.', verification_quote: 'Project backend dùng .NET.', expected_version: null } },
    { name: 'task_create', field: 'tasks', args: { title: 'Build the .NET backend', type: 'todo' } },
  ])('includes actual $name writes in the durable-state probe', async ({ name, field, args }) => {
    let called = false
    const transport: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: {
      model,
      baseURL: 'https://transport.invalid/v1/',
      fetch: async () => {
        const choice = called
          ? { delta: { role: 'assistant', content: 'Saved.' }, finish_reason: 'stop' }
          : { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'probe-call', type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }
        called = true
        return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, ...choice }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
      },
    } }) }
    const observation = await observe({ ...item.input, sources: [], history: [], query: 'Project backend dùng .NET. Save a build workflow and create a task to build it.' }, { model: 'transport-test', provider: transport })
    expect(observation.infrastructureError).toBeUndefined()
    expect(JSON.stringify(observation.streamEvents)).toContain('saved')
    const durable: unknown = JSON.parse(observation.durableText)
    expect(durable).toMatchObject({ [field]: field === 'project' ? expect.objectContaining({ snapshot: expect.objectContaining({ goal: 'Project backend dùng .NET.' }) }) : expect.arrayContaining([expect.any(Object)]) })
    expect(observation.durableText).toContain('.NET')
  })

  it('keeps provider failure separate from an empty or fabricated model answer', async () => {
    const broken: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://transport.invalid/', fetch: async () => {
      throw new TypeError('Network unavailable')
    } } }) }
    const observation = await observe(item.input, { model: 'transport-test', provider: broken })
    expect(observation.prepared).toBe(false)
    expect(observation.rawAnswer).toBe('')
    expect(observation.infrastructureError).toBeDefined()
    expect(observation.requests.length).toBeGreaterThan(0)
  })

  it('exposes real task rejection and verified saves as different fixture outcomes', async () => {
    const saved = await observe(cases.find(entry => entry.id === 'tool_success_001')!.input)
    const rejected = await observe(cases.find(entry => entry.id === 'tool_failure_001')!.input)
    expect(saved.fixtureTools).toContainEqual(expect.objectContaining({ observation: expect.objectContaining({ outcome: 'verified' }) }))
    expect(rejected.fixtureTools).toContainEqual(expect.objectContaining({ observation: expect.objectContaining({ outcome: 'failed' }) }))
  })

  it('records saved delivery without manufacturing a read receipt', async () => {
    const observation = await observe(cases.find(entry => entry.id === 'reminder_delivered_not_read_001')!.input)
    expect(JSON.stringify(observation.fixtureTools)).toContain('deliveredAt')
    expect(JSON.stringify(observation.fixtureTools)).not.toContain('readAt')
  })

  it('separates personal sources from foreign users and shared channels', async () => {
    const personal = await observe(cases.find(entry => entry.id === 'preference_correction_001')!.input)
    const foreign = await observe(cases.find(entry => entry.id === 'other_user_isolation_001')!.input)
    const shared = await observe(cases.find(entry => entry.id === 'shared_channel_privacy_001')!.input)
    expect(personal.contextRefs).toContain('old_evening')
    expect(foreign.usedRefs).toEqual([])
    expect(shared.usedRefs).toEqual([])
  })
})

describe('scoring', () => {
  it('rejects rewritten, missing, duplicate, and ungrounded judge results', () => {
    const checks = criteria(item.expected).map(criterion => ({ id: criterion.id, passed: true, reason: 'Supported', quote: '' }))
    expect(parseJudgment(JSON.stringify({ checks }), item.expected, 'Answer').checks).toHaveLength(checks.length)
    expect(() => parseJudgment(JSON.stringify({ checks: checks.slice(1) }), item.expected, '')).toThrow()
    expect(() => parseJudgment(JSON.stringify({ checks: [checks[0], ...checks] }), item.expected, '')).toThrow()
    expect(() => parseJudgment(JSON.stringify({ checks: checks.map(check => ({ ...check, quote: 'invented quote' })) }), item.expected, 'Answer')).toThrow()
    expect(() => parseJudgment(JSON.stringify({ checks, verdict: 'pass' }), item.expected, '')).toThrow()
  })

  it('retains raw malformed judge output as an infrastructure error', async () => {
    const result = await judge(item, { ...emptyObservation(), rawAnswer: 'Chưa biết.' }, { model: 'transport-judge', provider: provider('not-json') }, 5000)
    expect(result.raw).toBe('not-json')
    expect(result.error).toBeDefined()
    expect(result.judgment).toBeUndefined()
  })

  it('classifies retrieval, context, storage, and tool outcomes independently', () => {
    const entry = cases.find(entry => entry.id === 'source_recall_001')!
    const observation = emptyObservation()
    expect(deterministicChecks(entry, observation)).toContainEqual({ layer: 'retrieval', reason: 'Missing source: diagrams' })
    observation.recalledRefs = ['diagrams']
    expect(deterministicChecks(entry, observation)).toContainEqual({ layer: 'context', reason: 'Source never reached generation: diagrams' })
    observation.usedRefs = ['diagrams']
    expect(deterministicChecks(entry, observation)).toEqual([])
    const privacy = cases.find(entry => entry.id === 'dont_store_001')!
    observation.durableText = 'tôi đang học tiếng Ý'
    expect(deterministicChecks(privacy, observation)).toContainEqual(expect.objectContaining({ layer: 'memory-write' }))
    expect(deterministicChecks(cases.find(entry => entry.id === 'live_task_create_001')!, observation)).toContainEqual(expect.objectContaining({ layer: 'tool-outcome' }))
  })

  it('never counts preparation, infrastructure failure, or unjudged output as a behavior pass', () => {
    const result = (status: Result['status'], behaviorPassed: boolean | null): Result => ({ id: item.id, category: item.category, ruleIds: item.expected.expectedRuleIds, status, behaviorPassed, failures: [], observation: emptyObservation() })
    const summary = summarize([result('passed', true), result('failed', false), result('infrastructure-failure', null), result('unjudged', null), result('prepared', null)])
    expect(summary.total).toBe(5)
    expect(summary.evaluated).toBe(2)
    expect(summary.behaviorPassRate).toBe(0.5)
    expect(summary.completePassRate).toBe(0.5)
    expect(summary.infrastructureFailures).toBe(1)
    expect(summarize([]).behaviorPassRate).toBeNull()
  })
})
