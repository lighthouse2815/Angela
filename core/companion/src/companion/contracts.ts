import type { InferOutput } from 'valibot'

import { array, boolean, check, finite, integer, literal, maxLength, minLength, minValue, nullable, number, object, optional, picklist, pipe, string, trim, variant } from 'valibot'

export const learningCategorySchema = picklist(['topic', 'goal', 'difficulty', 'preference'])
export const reviewIntervalSchema = picklist([0, 1, 3, 7, 14, 30])
const textSchema = pipe(string(), trim(), minLength(1), maxLength(500))
export const learningMemorySchema = object({
  id: string(),
  characterId: pipe(string(), minLength(1)),
  category: learningCategorySchema,
  text: textSchema,
  createdAt: pipe(number(), finite()),
  updatedAt: pipe(number(), finite()),
  review: optional(object({
    intervalDays: picklist([1, 3, 7, 14, 30]),
    count: pipe(number(), integer(), minValue(0)),
    lastReviewedAt: optional(pipe(number(), finite())),
    nextReviewAt: pipe(number(), finite()),
    notifiedFor: optional(pipe(number(), finite())),
  })),
})

/** A learning fact owned by one character, retained across conversations on this device. */
export type LearningMemory = InferOutput<typeof learningMemorySchema>
export type LearningCategory = LearningMemory['category']
export type ReviewInterval = InferOutput<typeof reviewIntervalSchema>

export const companionKindSchema = picklist(['preference', 'thread', 'activity'])
export const companionEntrySchema = object({
  id: string(),
  characterId: pipe(string(), minLength(1)),
  kind: companionKindSchema,
  text: textSchema,
  status: picklist(['open', 'completed', 'dismissed']),
  createdAt: pipe(number(), finite()),
  updatedAt: pipe(number(), finite()),
  dueAt: nullable(pipe(number(), finite())),
  promptedAt: optional(pipe(number(), finite())),
})
export const companionStateSchema = object({ enabled: boolean(), entries: pipe(array(companionEntrySchema), check(entries => new Set(entries.map(entry => entry.id)).size === entries.length)), lastPromptAt: pipe(number(), finite()) })

export type CompanionEntry = InferOutput<typeof companionEntrySchema>
export const recordsSnapshotSchema = object({
  characterId: pipe(string(), minLength(1), maxLength(200)),
  enabled: boolean(),
  reviewRemindersEnabled: boolean(),
  memories: pipe(array(learningMemorySchema), maxLength(50), check(entries => new Set(entries.map(entry => entry.id)).size === entries.length)),
  companion: object({ ...companionStateSchema.entries, entries: pipe(array(companionEntrySchema), maxLength(50), check(entries => new Set(entries.map(entry => entry.id)).size === entries.length)) }),
})
export type RecordsSnapshot = InferOutput<typeof recordsSnapshotSchema>
const id = pipe(string(), minLength(1), maxLength(200))
const due = pipe(number(), finite())
export const recordsCommandSchema = variant('type', [
  object({ type: literal('read') }),
  object({ type: literal('import'), snapshot: recordsSnapshotSchema }),
  object({ type: literal('enabled'), value: boolean() }),
  object({ type: literal('reminders'), value: boolean() }),
  object({ type: literal('companion.enabled'), value: boolean() }),
  object({ type: literal('learning.save'), category: learningCategorySchema, text: textSchema, id: optional(id) }),
  object({ type: literal('learning.forget'), id }),
  object({ type: literal('learning.schedule'), id, interval: reviewIntervalSchema, first: picklist(['now', 'after-interval']) }),
  object({ type: literal('learning.review'), id }),
  object({ type: literal('learning.notified'), id, dueAt: due }),
  object({ type: literal('companion.save'), kind: companionKindSchema, text: textSchema, dueAt: nullable(due), id: optional(id) }),
  object({ type: literal('companion.resolve'), id, status: picklist(['completed', 'dismissed']) }),
  object({ type: literal('companion.forget'), id }),
  object({ type: literal('companion.reserve') }),
])
export type RecordsCommand = InferOutput<typeof recordsCommandSchema>
export interface RecordsResponse {
  snapshot: RecordsSnapshot
  entryId?: string
  value?: boolean
  prompt?: CompanionEntry | null
}

export { requestPrivacy } from '../privacy-policy'
