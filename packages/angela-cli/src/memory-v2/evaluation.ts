import type { RecallIndex } from '../recall-index'
import type { PageInput } from './types'

const corpus: PageInput[] = [
  { key: 'language', tier: 'semantic', kind: 'preference', title: 'Response language', body: 'User prefers Vietnamese responses', authority: 'user', scope: 'quality' },
  { key: 'milestone', tier: 'episodic', kind: 'session', title: 'Migration milestone', body: 'Completed database migration on 2026-08-12. Artifact: src/migrations/004.sql', authority: 'episode', scope: 'quality' },
  { key: 'database', tier: 'semantic', kind: 'decision', title: 'Storage decision', body: 'Architecture decision: SQLite WAL keeps memory local and native', authority: 'project', scope: 'quality' },
  { key: 'workflow', tier: 'procedural', kind: 'workflow', title: 'Commit workflow', body: 'Run targeted tests before each Git commit', authority: 'user', scope: 'quality' },
  { key: 'framework', tier: 'semantic', kind: 'preference', title: 'Preferred framework', body: 'User prefers React framework', authority: 'user', scope: 'quality' },
  { key: 'conflict-a', tier: 'semantic', kind: 'decision', title: 'Rollout proposal', body: 'Proposed rollout uses a feature flag', authority: 'verified', scope: 'quality' },
  { key: 'conflict-b', tier: 'semantic', kind: 'decision', title: 'Rollout counterproposal', body: 'Proposed rollout uses a staged release', authority: 'verified', scope: 'quality' },
  { key: 'diagnostic', tier: 'episodic', kind: 'session', title: 'Historical incident', body: 'The old incident produced ZEBRA_UNIQUE_ERROR in src/legacy.ts', authority: 'episode', scope: 'quality' },
]

/** Deterministic recall probes exercise usefulness independently of provider prose or synthetic semantic embeddings. */
export function evaluateMemory(index: RecallIndex, noiseCount = 100) {
  const ids = new Map<string, string>()
  for (const input of corpus) {
    const page = index.memory.write(input, '2020-01-01T00:00:00.000Z')
    ids.set(input.key, `memory:${page.id}`)
  }
  const framework = index.memory.write({ ...corpus[4]!, body: 'User now prefers Vue framework' })
  ids.set('framework', `memory:${framework.id}`)
  index.memory.link(ids.get('conflict-a')!.slice(7), ids.get('conflict-b')!.slice(7), 'contradicts', 'quality')
  for (let i = 0; i < noiseCount; i++)
    index.memory.write({ tier: 'episodic', scope: 'quality', key: `noise-${i}`, kind: 'casual', title: `Casual chat ${i}`, body: `We chatted about weather and lunch number ${i}`, authority: 'episode', salience: 0.25 }, '2020-01-01T00:00:00.000Z')
  const probes = [
    { name: 'fact-recall', query: 'Vietnamese responses', expected: ['language'] },
    { name: 'episodic-recall', query: '2026-08-12 migration', expected: ['milestone'] },
    { name: 'project-decision', query: 'SQLite WAL architecture', expected: ['database'] },
    { name: 'procedural-recall', query: 'targeted tests Git commit', expected: ['workflow'] },
    { name: 'current-preference', query: 'preferred framework', expected: ['framework'] },
    { name: 'contradiction', query: 'rollout', expected: ['conflict-a', 'conflict-b'] },
    { name: 'targeted-old-history', query: 'ZEBRA_UNIQUE_ERROR', expected: ['diagnostic'] },
  ]
  const run = () => probes.map((probe) => {
    const hits = index.search(probe.query, 'quality').slice(0, 5)
    const expected = probe.expected.map(key => ids.get(key)!)
    const positions = expected.map(id => hits.findIndex(hit => hit.id === id) + 1)
    return { name: probe.name, found: positions.every(position => position > 0), positions, noise: hits.filter(hit => !expected.includes(hit.id)).length, returned: hits.length }
  })
  const before = run()
  index.memory.age('quality', Date.parse('2026-10-22T00:00:00.000Z'), 128)
  const afterCompaction = run()
  const supersededAbsent = index.search('React', 'quality').length === 0
  return { probes: before, afterCompaction, recallAt5: before.filter(probe => probe.found).length / probes.length, supersededAbsent, falsePositiveNoise: before.reduce((n, probe) => n + probe.noise, 0) }
}
