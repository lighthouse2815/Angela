import * as v from 'valibot'

export const categories = [
  'preference',
  'preference_change',
  'conversation_recall',
  'last_conversation',
  'plan_vs_completed',
  'commitment',
  'semantic_paraphrase',
  'episodic_recall',
  'workflow_recall',
  'contradiction',
  'no_shared_memory',
  'not_yet_happened',
  'isolation',
  'long_gap',
  'irrelevant_memory',
  'vietnamese_variants',
] as const

const text = v.pipe(v.string(), v.minLength(1))
const refs = v.array(text)
const tier = v.picklist(['semantic', 'episodic', 'procedural'])

export const caseSchema = v.pipe(v.strictObject({
  id: v.pipe(text, v.regex(/^[a-z_]+_\d{3}$/u)),
  category: v.picklist(categories),
  history: v.array(v.strictObject({
    id: text,
    role: v.picklist(['user', 'assistant']),
    content: text,
    storage: v.optional(v.picklist(['page', 'capture', 'history']), 'page'),
    memory: v.optional(v.strictObject({ key: text, tier, kind: text })),
    at: v.optional(v.pipe(v.string(), v.isoTimestamp()), '2026-10-20T09:00:00.000Z'),
    user_id: v.optional(text, 'self'),
    workspace: v.optional(text, 'study'),
    session_id: v.optional(text, 'previous'),
  })),
  query: text,
  target: v.optional(v.strictObject({
    user_id: text,
    workspace: text,
    session_id: text,
  }), { user_id: 'self', workspace: 'study', session_id: 'current' }),
  age_at: v.optional(v.pipe(v.string(), v.isoTimestamp())),
  expected: v.strictObject({
    must_include: v.array(text),
    must_not_include: v.array(text),
    must_not_include_as_current: v.array(text),
    recall_refs: refs,
    context_refs: refs,
    forbidden_refs: refs,
    irrelevant_refs: refs,
    superseded_refs: refs,
    memory_type: v.picklist(['semantic', 'episodic', 'procedural', 'history']),
    abstain: v.optional(v.boolean(), false),
    capture_workflow: v.optional(v.boolean(), false),
  }),
}), v.check((item) => {
  const ids = new Set(item.history.map(message => message.id))
  const expected = item.expected
  const referenced = [...expected.recall_refs, ...expected.context_refs, ...expected.forbidden_refs, ...expected.irrelevant_refs, ...expected.superseded_refs]
  return ids.size === item.history.length
    && referenced.every(id => ids.has(id))
    && item.history.every(message => message.storage !== 'page' || message.memory !== undefined)
    && !expected.recall_refs.some(id => [...expected.forbidden_refs, ...expected.superseded_refs, ...expected.irrelevant_refs].includes(id))
    && !expected.context_refs.some(id => [...expected.forbidden_refs, ...expected.superseded_refs, ...expected.irrelevant_refs].includes(id))
}, 'Duplicate identity, invalid reference, incompatible expectation, or missing page fixture'))

/** Labels describe source selection and context evidence. They never describe a generated answer. */
export type CompanionCase = v.InferOutput<typeof caseSchema>
