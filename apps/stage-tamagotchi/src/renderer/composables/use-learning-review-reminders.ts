import { useElectronEventaInvoke } from '@angela/electron-vueuse'
import { usePiniaSynced } from '@angela/stage-ui/libs/pinia'
import { useAiriCardStore } from '@angela/stage-ui/stores/modules/airi-card'
import { useLearningMemoryStore } from '@angela/stage-ui/stores/modules/learning-memory'
import { useIntervalFn } from '@vueuse/core'
import { onScopeDispose, watch } from 'vue'

import { learningReviewsNotify } from '../../shared/eventa/learning-reviews'

/** Checks active-character reviews once per minute while this renderer owns leadership. Scope disposal stops future checks and receipts. */
export function useLearningReviewReminders() {
  const memory = useLearningMemoryStore()
  const cards = useAiriCardStore()
  const runtime = usePiniaSynced()
  const notify = useElectronEventaInvoke(learningReviewsNotify)
  let disposed = false
  let running = false

  async function check() {
    if (disposed || running || !runtime.isLeader() || !memory.enabled || !memory.reviewRemindersEnabled)
      return
    const characterId = cards.activeCardId
    const now = Date.now()
    const records = memory.forCharacter(characterId)
      .filter(entry => entry.review && entry.review.nextReviewAt <= now && entry.review.notifiedFor !== entry.review.nextReviewAt)
      .map(entry => ({ id: entry.id, dueAt: entry.review!.nextReviewAt }))
    if (!records.length)
      return
    running = true
    try {
      const receipt = await notify({ characterId, records })
      for (const record of receipt.shown) {
        if (disposed || !runtime.isLeader() || cards.activeCardId !== characterId)
          return
        await memory.markReviewNotified(characterId, record.id, record.dueAt)
      }
    }
    catch (error) {
      if (!disposed)
        console.warn('Failed to deliver learning review reminders:', error)
    }
    finally {
      running = false
    }
  }

  const interval = useIntervalFn(() => void check(), 60000)
  const stopLeadership = runtime.onLeadershipChange(() => void check())
  const stopWatch = watch(() => [memory.memories, memory.enabled, memory.reviewRemindersEnabled, cards.activeCardId], () => void check(), { immediate: true })
  onScopeDispose(() => {
    disposed = true
    interval.pause()
    stopWatch()
    stopLeadership()
  })
}
