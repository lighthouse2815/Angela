import { defineInvokeEventa } from '@moeru/eventa'

/** Delivery receipts refer to an exact due date. Callers must discard receipts after a schedule changes. */
export const learningReviewsNotify = defineInvokeEventa<{
  status: 'shown' | 'failed' | 'unsupported'
  shown: { id: string, dueAt: number }[]
}, {
  characterId: string
  records: { id: string, dueAt: number }[]
}>('eventa:invoke:learning-reviews:notify')
