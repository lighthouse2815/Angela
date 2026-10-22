import { readFile } from 'node:fs/promises'

import * as v from 'valibot'

const text = v.pipe(v.string(), v.trim(), v.nonEmpty())
const texts = v.array(text)
const ruleId = v.picklist(['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'A01', 'A02', 'A03', 'A04', 'M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'F01', 'F02', 'F03', 'W01', 'W02', 'W03', 'S01', 'S02', 'S03', 'S04', 'V01', 'V02'])

const sourceSchema = v.strictObject({
  ref: text,
  storage: v.picklist(['personal', 'page', 'history']),
  text,
  role: v.optional(v.picklist(['user', 'assistant']), 'user'),
  owner: v.optional(v.picklist(['current', 'other']), 'current'),
  workspace: v.optional(v.picklist(['current', 'other']), 'current'),
  at: v.optional(v.pipe(v.string(), v.isoTimestamp()), '2026-10-20T08:00:00.000Z'),
  core: v.optional(v.boolean(), false),
  tier: v.optional(v.picklist(['episodic', 'semantic', 'procedural']), 'semantic'),
  authority: v.optional(v.picklist(['inference', 'episode', 'consolidated', 'project', 'verified', 'personal', 'user']), 'user'),
  key: v.optional(text),
})

/** Fixture inputs contain state and user messages only. The harness never receives expectations. */
export const inputSchema = v.strictObject({
  sources: v.array(sourceSchema),
  history: v.array(v.strictObject({ role: v.picklist(['user', 'assistant']), text })),
  query: text,
  channel: v.optional(v.picklist(['cli', 'telegram', 'discord']), 'cli'),
  memoryEnabled: v.optional(v.boolean(), true),
  invalidMemory: v.optional(v.boolean(), false),
  taskEvidence: v.optional(v.picklist(['saved', 'rejected', 'delivered', 'pending', 'completed', 'cancelled', 'date-only'])),
})

export const expectationSchema = v.strictObject({
  requiredClaims: v.pipe(texts, v.minLength(1)),
  forbiddenClaims: v.pipe(texts, v.minLength(1)),
  allowedUncertainty: text,
  expectedEvidenceType: v.picklist(['current-user', 'user-report', 'historical-source', 'inference', 'tool-result', 'delivery-record', 'none', 'mixed']),
  expectedRuleIds: v.pipe(v.array(ruleId), v.minLength(1)),
  expectedActionState: v.picklist(['none', 'planned', 'unverified', 'user-reported-completed', 'saved', 'failed', 'delivered', 'pending', 'completed', 'cancelled']),
  expectedMemoryUse: texts,
  forbiddenMemoryUse: texts,
  forbiddenDurableText: texts,
  requiredEvents: texts,
})

const caseSchema = v.pipe(v.strictObject({
  id: v.pipe(text, v.regex(/^[a-z][a-z0-9_]+$/u)),
  category: v.picklist(['plan', 'completion', 'correction', 'uncertainty', 'shared-experience', 'memory-selection', 'study', 'task', 'tool-outcome', 'continuity', 'privacy', 'vietnamese']),
  input: inputSchema,
  expected: expectationSchema,
}), v.check((item) => {
  const refs = item.input.sources.map(source => source.ref)
  return new Set(refs).size === refs.length
    && [...item.expected.expectedMemoryUse, ...item.expected.forbiddenMemoryUse].every(ref => refs.includes(ref))
    && !item.expected.expectedMemoryUse.some(ref => item.expected.forbiddenMemoryUse.includes(ref))
}, 'Invalid or conflicting source references'))

export type Case = v.InferOutput<typeof caseSchema>
export type Input = v.InferOutput<typeof inputSchema>
export type Expectation = v.InferOutput<typeof expectationSchema>

/** Rejects invalid cases and duplicate identities before a provider can receive a request. */
export async function loadCases(path: string | URL): Promise<Case[]> {
  const lines = (await readFile(path, 'utf8')).trim().split('\n')
  const cases = lines.map((line, index) => {
    try {
      return v.parse(caseSchema, JSON.parse(line))
    }
    catch (cause) {
      throw new Error(`Invalid case at line ${index + 1}`, { cause })
    }
  })
  if (new Set(cases.map(item => item.id)).size !== cases.length)
    throw new Error('Duplicate case ID')
  return cases
}
