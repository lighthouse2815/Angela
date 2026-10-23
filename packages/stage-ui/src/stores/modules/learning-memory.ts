import type { LearningCategory, LearningMemory, RecordsCommand, ReviewInterval } from '@angela/cli/companion-contracts'
import type {} from 'pinia-plugin-synced'

import { learningCategorySchema, learningMemorySchema as memorySchema, reviewIntervalSchema } from '@angela/cli/companion-contracts'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { array, finite, maxLength, minLength, number, object, parse, picklist, pipe, safeParse, string, trim } from 'valibot'
import { shallowRef } from 'vue'

import { companionTransport, importCompanionRecords } from '../../services/companion-runtime'
import { useAngelaCardStore } from './angela-card'

export { learningCategorySchema, reviewIntervalSchema } from '@angela/cli/companion-contracts'
export type { LearningCategory, LearningMemory, ReviewInterval } from '@angela/cli/companion-contracts'

const textSchema = pipe(string(), trim(), minLength(1), maxLength(500))

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

  async function shared(characterId: string, command: RecordsCommand) {
    const host = companionTransport()
    if (!host)
      throw new Error('The shared companion host is unavailable')
    await importCompanionRecords(characterId)
    const result = await host.records(characterId, command)
    memories.value = [...memories.value.filter(entry => entry.characterId !== characterId), ...result.snapshot.memories]
    enabled.value = result.snapshot.enabled
    reviewRemindersEnabled.value = result.snapshot.reviewRemindersEnabled
    return result
  }

  async function refresh(characterId: string) {
    if (companionTransport())
      await shared(characterId, { type: 'read' })
  }

  function forCharacter(characterId: string) {
    return memories.value.filter(memory => memory.characterId === characterId).toReversed().toSorted((a, b) => b.updatedAt - a.updatedAt)
  }

  function persist(next: LearningMemory[]) {
    localStorage.setItem(storageKey, JSON.stringify(next))
    memories.value = next
  }

  async function save(characterId: string, category: LearningCategory, text: string, id?: string) {
    if (companionTransport()) {
      const result = await shared(characterId, { type: 'learning.save', category, text, id })
      return result.snapshot.memories.find(entry => entry.id === result.entryId)!
    }
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
    if (companionTransport())
      return (await shared(characterId, { type: 'learning.forget', id })).value ?? false
    const next = memories.value.filter(memory => memory.characterId !== characterId || memory.id !== id)
    if (next.length === memories.value.length)
      return false
    persist(next)
    return true
  }

  /** New schedules start due by default. Chat can defer the first review without recording completion. */
  async function scheduleReview(characterId: string, id: string, intervalDays: ReviewInterval, firstReview: 'now' | 'after-interval' = 'now') {
    if (companionTransport()) {
      const result = await shared(characterId, { type: 'learning.schedule', id, interval: intervalDays, first: firstReview })
      return result.snapshot.memories.find(entry => entry.id === id)!
    }
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
    if (companionTransport()) {
      const result = await shared(characterId, { type: 'learning.review', id })
      return result.snapshot.memories.find(entry => entry.id === id)!
    }
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
    if (companionTransport()) {
      await shared(useAngelaCardStore().activeCardId, { type: 'enabled', value })
      return
    }
    localStorage.setItem(enabledKey, String(value))
    enabled.value = value
  }

  async function setReviewRemindersEnabled(value: boolean) {
    if (companionTransport()) {
      await shared(useAngelaCardStore().activeCardId, { type: 'reminders', value })
      return
    }
    localStorage.setItem(remindersKey, String(value))
    reviewRemindersEnabled.value = value
  }

  /** Persists delivery only for the current due date. Delivery never changes learning progress or recency. */
  async function markReviewNotified(characterId: string, id: string, dueAt: number) {
    if (companionTransport())
      return (await shared(characterId, { type: 'learning.notified', id, dueAt })).value ?? false
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

  return { refresh, memories, enabled, reviewRemindersEnabled, forCharacter, save, forget, scheduleReview, markReviewed, markReviewNotified, setEnabled, setReviewRemindersEnabled }
}, {
  synced: {
    state: true,
    actions: ['refresh', 'save', 'forget', 'scheduleReview', 'markReviewed', 'markReviewNotified', 'setEnabled', 'setReviewRemindersEnabled'],
  },
})
