import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { I18n } from '../../../libs/i18n'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { Notification } from 'electron'
import { array, finite, maxLength, minLength, number, object, parse, pipe, string } from 'valibot'

import { learningReviewsNotify } from '../../../../shared/eventa/learning-reviews'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'

const requestSchema = object({
  characterId: pipe(string(), minLength(1), maxLength(200)),
  records: pipe(array(object({
    id: pipe(string(), minLength(1), maxLength(200)),
    dueAt: pipe(number(), finite()),
  })), minLength(1), maxLength(50)),
})

/** Native notifications stay in main. Pending and successful receipts survive renderer leadership changes within this process. */
class ReviewNotifications {
  private readonly deliveries = new Map<string, { dueAt: number, result: Promise<boolean> }>()
  private readonly active = new Set<Notification>()
  private readonly pending = new Set<(shown: boolean) => void>()
  private stopped = false

  constructor(private readonly i18n: I18n, private readonly openChat: () => Promise<unknown>) {}

  async notify(input: unknown) {
    const { characterId, records } = parse(requestSchema, input)
    if (this.stopped)
      throw new Error('Learning review notifications have stopped.')
    if (records.some(record => record.dueAt > Date.now()) || new Set(records.map(record => record.id)).size !== records.length)
      throw new Error('Send distinct learning records that are due now.')
    if (!Notification.isSupported())
      return { status: 'unsupported' as const, shown: [] }

    const key = (id: string) => JSON.stringify([characterId, id])
    const fresh = records.filter(record => this.deliveries.get(key(record.id))?.dueAt !== record.dueAt)
    if (fresh.length) {
      const result = this.show(fresh.length)
      for (const record of fresh) {
        const delivery = { dueAt: record.dueAt, result }
        this.deliveries.set(key(record.id), delivery)
        void result.then((shown) => {
          if (!shown && this.deliveries.get(key(record.id)) === delivery)
            this.deliveries.delete(key(record.id))
        })
      }
    }
    const outcomes = await Promise.all(records.map(async (record) => {
      const delivery = this.deliveries.get(key(record.id))
      return { record, shown: delivery?.dueAt === record.dueAt && await delivery.result }
    }))
    const shown = outcomes.filter(outcome => outcome.shown).map(outcome => outcome.record)
    return { status: shown.length ? 'shown' as const : 'failed' as const, shown }
  }

  private show(count: number): Promise<boolean> {
    return new Promise((resolve) => {
      let notification: Notification
      try {
        notification = new Notification({
          title: this.i18n.t('settings.pages.modules.memory-long-term.learning.review.notifications.title'),
          body: this.i18n.t('settings.pages.modules.memory-long-term.learning.review.notifications.body', { count }),
        })
      }
      catch {
        resolve(false)
        return
      }
      let settled = false
      let timeout: ReturnType<typeof setTimeout>
      const pending = this.pending
      function finish(shown: boolean) {
        if (settled)
          return
        settled = true
        clearTimeout(timeout)
        pending.delete(finish)
        resolve(shown)
      }
      const release = () => this.active.delete(notification)
      timeout = setTimeout(() => {
        finish(false)
        release()
        notification.close()
      }, 10000)
      this.active.add(notification)
      this.pending.add(finish)
      notification.once('show', () => finish(true))
      notification.once('failed', () => {
        finish(false)
        release()
      })
      notification.once('close', () => {
        finish(false)
        release()
      })
      notification.once('click', () => {
        release()
        void this.openChat().catch(error => console.warn('Failed to open chat from a learning reminder:', errorMessageFrom(error)))
      })
      try {
        notification.show()
      }
      catch {
        finish(false)
        release()
      }
    })
  }

  dispose() {
    this.stopped = true
    for (const finish of this.pending)
      finish(false)
    for (const notification of this.active)
      notification.close()
    this.active.clear()
    this.deliveries.clear()
  }
}

/** Registers delivery for the main Stage renderer. Native failures remain retryable and never produce successful receipts. */
export function setupLearningReviewNotifications(context: ReturnType<typeof createContext>['context'], options: {
  getOwnerId: () => number | undefined
  i18n: I18n
  openChat: () => Promise<unknown>
}) {
  const notifications = new ReviewNotifications(options.i18n, options.openChat)
  defineInvokeHandler(context, learningReviewsNotify, (input, invokeOptions) => {
    const senderId = invokeOptions?.raw?.ipcMainEvent.sender.id
    if (senderId === undefined || senderId !== options.getOwnerId())
      throw new Error('Only the main Stage window can deliver learning reminders.')
    return notifications.notify(input)
  })
  onAppBeforeQuit(() => notifications.dispose())
}
