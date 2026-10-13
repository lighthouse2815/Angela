import type {} from 'pinia-plugin-synced'
import type { InferOutput } from 'valibot'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { array, maxLength, minLength, number, object, parse, picklist, pipe, safeParse, string, trim } from 'valibot'
import { shallowRef } from 'vue'

export const learningCategorySchema = picklist(['topic', 'goal', 'difficulty', 'preference'])
const textSchema = pipe(string(), trim(), minLength(1), maxLength(500))
const memorySchema = object({
  id: string(),
  characterId: pipe(string(), minLength(1)),
  category: learningCategorySchema,
  text: textSchema,
  createdAt: number(),
  updatedAt: number(),
})

/** A learning fact owned by one character, retained across conversations on this device. */
export type LearningMemory = InferOutput<typeof memorySchema>
export type LearningCategory = LearningMemory['category']

const storageKey = 'angela/learning-memory/entries'
const enabledKey = 'angela/learning-memory/enabled'

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

  async function setEnabled(value: boolean) {
    localStorage.setItem(enabledKey, String(value))
    enabled.value = value
  }

  return { memories, enabled, forCharacter, save, forget, setEnabled }
}, {
  synced: {
    state: true,
    actions: ['save', 'forget', 'setEnabled'],
  },
})
