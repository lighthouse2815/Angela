import type {} from 'pinia-plugin-synced'
import type { InferOutput } from 'valibot'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { array, finite, integer, maxLength, minLength, minValue, number, object, optional, parse, picklist, pipe, safeParse, string, trim } from 'valibot'
import { shallowRef } from 'vue'

export const learningCategorySchema = picklist(['topic', 'goal', 'difficulty', 'preference'])
export const reviewIntervalSchema = picklist([0, 1, 3, 7, 14, 30])
const textSchema = pipe(string(), trim(), minLength(1), maxLength(500))
const memorySchema = object({
  id: string(),
  characterId: pipe(string(), minLength(1)),
  category: learningCategorySchema,
  text: textSchema,
  createdAt: number(),
  updatedAt: number(),
  review: optional(object({
    intervalDays: picklist([1, 3, 7, 14, 30]),
    count: pipe(number(), integer(), minValue(0)),
    lastReviewedAt: optional(number()),
    nextReviewAt: number(),
    notifiedFor: optional(number()),
  })),
})

/** A learning fact owned by one character, retained across conversations on this device. */
export type LearningMemory = InferOutput<typeof memorySchema>
export type LearningCategory = LearningMemory['category']
export type ReviewInterval = InferOutput<typeof reviewIntervalSchema>

const storageKey = 'angela/learning-memory/entries'
const enabledKey = 'angela/learning-memory/enabled'
const remindersKey = 'angela/learning-memory/review-reminders'

function loadMemories(): LearningMemory[] {
  if (typeof localStorage === 'undefined')
    return []
  try {
    const result = safeParse(array(memorySchema), JSON.parse(localStorage.getItem(storageKey) ?? '[]'))
    if (result.success)
      return result.output
  }
  catch {
    // Unreadable memory cannot prevent chat startup. Leave the original storage untouched until an explicit edit.
  }
  return []
}

/**
 * Leader-owned edits persist before publishing a snapshot. Followers never write replicated memory back to storage.
 * Queries and edits use the session's character id, independent of the card selected in another window.
 */
export const useLearningMemoryStore = defineStore('learning-memory', () => {
  const memories = shallowRef<LearningMemory[]>(loadMemories())
  const enabled = shallowRef(typeof localStorage === 'undefined' || localStorage.getItem(enabledKey) !== 'false')
  const reviewRemindersEnabled = shallowRef(typeof localStorage !== 'undefined' && localStorage.getItem(remindersKey) === 'true')

  function forCharacter(characterId: string) {
    return memories.value.filter(memory => memory.characterId === characterId).toReversed().toSorted((a, b) => b.updatedAt - a.updatedAt)
  }

  function persist(next: LearningMemory[]) {
    localStorage.setItem(storageKey, JSON.stringify(next))
    memories.value = next
  }

  async function save(characterId: string, category: LearningCategory, text: string, id?: string) {
    const input = parse(object({ characterId: pipe(string(), minLength(1)), category: learningCategorySchema, text: textSchema }), { characterId, category, text })
    const current = id
      ? memories.value.find(memory => memory.id === id && memory.characterId === characterId)
      : memories.value.find(memory => memory.characterId === characterId && memory.category === category && memory.text.toLowerCase() === input.text.toLowerCase())
    if (id && !current)
      throw new Error('missing')
    if (!current && forCharacter(characterId).length >= 50)
      throw new Error('limit')
    const now = Date.now()
    const entry: LearningMemory = {
      id: current?.id ?? nanoid(),
      ...input,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      review: current?.review,
    }
    const next = memories.value.filter(memory => memory.id !== entry.id)
    persist([...next, entry])
    return { ...entry }
  }

  async function forget(characterId: string, id: string) {
    const next = memories.value.filter(memory => memory.characterId !== characterId || memory.id !== id)
    if (next.length === memories.value.length)
      return false
    persist(next)
    return true
  }

  /** New schedules start due by default. Chat can defer the first review without recording completion. */
  async function scheduleReview(characterId: string, id: string, intervalDays: ReviewInterval, firstReview: 'now' | 'after-interval' = 'now') {
    const interval = parse(reviewIntervalSchema, intervalDays)
    const start = parse(picklist(['now', 'after-interval']), firstReview)
    const current = memories.value.find(memory => memory.id === id && memory.characterId === characterId)
    if (!current)
      throw new Error('missing')
    if ((current.review?.intervalDays ?? 0) === interval)
      return structuredClone(current)
    const now = Date.now()
    const firstDueAt = start === 'after-interval' ? now + interval * 86400000 : now
    const review = interval === 0
      ? undefined
      : {
          intervalDays: interval,
          count: current.review?.count ?? 0,
          lastReviewedAt: current.review?.lastReviewedAt,
          // A changed interval runs from the last completed review, when one exists.
          nextReviewAt: current.review?.lastReviewedAt === undefined ? firstDueAt : current.review.lastReviewedAt + interval * 86400000,
        }
    const entry: LearningMemory = { ...current, review, updatedAt: now }
    persist(memories.value.map(memory => memory.id === id ? entry : memory))
    return structuredClone(entry)
  }

  async function markReviewed(characterId: string, id: string) {
    const current = memories.value.find(memory => memory.id === id && memory.characterId === characterId)
    if (!current)
      throw new Error('missing')
    if (!current.review)
      throw new Error('unscheduled')
    const now = Date.now()
    const entry: LearningMemory = {
      ...current,
      updatedAt: now,
      review: {
        ...current.review,
        count: current.review.count + 1,
        lastReviewedAt: now,
        nextReviewAt: now + current.review.intervalDays * 86400000,
      },
    }
    persist(memories.value.map(memory => memory.id === id ? entry : memory))
    return structuredClone(entry)
  }

  async function setEnabled(value: boolean) {
    localStorage.setItem(enabledKey, String(value))
    enabled.value = value
  }

  async function setReviewRemindersEnabled(value: boolean) {
    localStorage.setItem(remindersKey, String(value))
    reviewRemindersEnabled.value = value
  }

  /** Persists delivery only for the current due date. Delivery never changes learning progress or recency. */
  async function markReviewNotified(characterId: string, id: string, dueAt: number) {
    parse(pipe(number(), finite()), dueAt)
    const current = memories.value.find(memory => memory.id === id && memory.characterId === characterId)
    if (!enabled.value || !reviewRemindersEnabled.value || dueAt > Date.now() || !current?.review || current.review.nextReviewAt !== dueAt)
      return false
    if (current.review.notifiedFor === dueAt)
      return true
    const entry: LearningMemory = { ...current, review: { ...current.review, notifiedFor: dueAt } }
    persist(memories.value.map(memory => memory.id === id ? entry : memory))
    return true
  }

  return { memories, enabled, reviewRemindersEnabled, forCharacter, save, forget, scheduleReview, markReviewed, markReviewNotified, setEnabled, setReviewRemindersEnabled }
}, {
  synced: {
    state: true,
    actions: ['save', 'forget', 'scheduleReview', 'markReviewed', 'markReviewNotified', 'setEnabled', 'setReviewRemindersEnabled'],
  },
})
