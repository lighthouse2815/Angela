import type { EventEmitter } from 'node:events'

import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'
import type { NotificationConstructorOptions } from 'electron'

import { createContext, defineInvoke } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { learningReviewsNotify } from '../../../../shared/eventa/learning-reviews'
import { emitAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { setupLearningReviewNotifications } from './index'

const native = vi.hoisted(() => ({
  supported: true,
  event: 'show' as 'show' | 'failed' | undefined,
  instances: [] as EventEmitter[],
  options: [] as NotificationConstructorOptions[],
  shows: 0,
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class Notification extends EventEmitter {
    static isSupported = vi.fn(() => native.supported)

    constructor(options: NotificationConstructorOptions) {
      super()
      native.options.push(options)
      native.instances.push(this)
    }

    show() {
      native.shows++
      const event = native.event
      if (event)
        queueMicrotask(() => this.emit(event))
    }

    close() {
      this.emit('close')
    }
  }
  return { Notification }
})

beforeEach(() => {
  vi.clearAllMocks()
  native.supported = true
  native.event = 'show'
  native.shows = 0
  native.instances.length = 0
  native.options.length = 0
})
afterEach(async () => {
  await emitAppBeforeQuit()
  vi.useRealTimers()
})

function client() {
  const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
  const openChat = vi.fn(async () => {})
  setupLearningReviewNotifications(context, {
    getOwnerId: () => 42,
    i18n: { t: (key: string, values?: unknown) => `${key} ${JSON.stringify(values)}`, locale: () => 'en' },
    openChat,
  })
  const notify = defineInvoke(context, learningReviewsNotify)
  return {
    openChat,
    notify: (records = [{ id: 'loops', dueAt: Date.now() - 1000 }], senderId = 42) => Reflect.apply(notify, undefined, [{ characterId: 'angela', records }, { raw: { ipcMainEvent: { sender: { id: senderId } } } }]) as ReturnType<typeof notify>,
  }
}

describe('native learning reminders', () => {
  it('delivers one digest and reuses its receipts for repeated requests', async () => {
    const { notify, openChat } = client()
    const records = [{ id: 'loops', dueAt: 100 }, { id: 'functions', dueAt: 200 }]
    expect(await notify(records)).toEqual({ status: 'shown', shown: records })
    expect(await notify(records)).toEqual({ status: 'shown', shown: records })
    expect(native.shows).toBe(1)
    expect(native.options[0].body).toContain('"count":2')
    native.instances[0].emit('click')
    expect(openChat).toHaveBeenCalledOnce()
  })

  it('coalesces duplicate requests while native delivery is pending', async () => {
    native.event = undefined
    const { notify } = client()
    const records = [{ id: 'loops', dueAt: 100 }]
    const first = notify(records)
    const second = notify(records)
    await vi.waitFor(() => expect(native.shows).toBe(1))
    native.instances[0].emit('show')
    expect((await first).shown).toEqual(records)
    expect((await second).shown).toEqual(records)
    expect(native.shows).toBe(1)
  })

  it('leaves failed delivery retryable and sends a new review date once', async () => {
    const { notify } = client()
    const records = [{ id: 'loops', dueAt: 100 }]
    native.event = 'failed'
    expect(await notify(records)).toEqual({ status: 'failed', shown: [] })
    native.event = 'show'
    expect((await notify(records)).shown).toEqual(records)
    expect((await notify([{ id: 'loops', dueAt: 200 }])).shown).toEqual([{ id: 'loops', dueAt: 200 }])
    expect(native.shows).toBe(3)
  })

  it('does not claim delivery on an unsupported system', async () => {
    native.supported = false
    expect(await client().notify()).toEqual({ status: 'unsupported', shown: [] })
    expect(native.shows).toBe(0)
  })

  it('rejects another renderer and invalid or future due records', async () => {
    const { notify } = client()
    await expect(notify([{ id: 'loops', dueAt: 100 }], 7)).rejects.toThrow('main Stage window')
    await expect(notify([{ id: 'loops', dueAt: Date.now() + 60000 }])).rejects.toThrow('due now')
    await expect(notify([{ id: 'loops', dueAt: 100 }, { id: 'loops', dueAt: 200 }])).rejects.toThrow('distinct')
    await expect(notify([])).rejects.toThrow()
    expect(native.shows).toBe(0)
  })

  it('cancels pending receipts and rejects new delivery after shutdown', async () => {
    native.event = undefined
    const { notify } = client()
    const pending = notify()
    await vi.waitFor(() => expect(native.shows).toBe(1))
    await emitAppBeforeQuit()
    expect(await pending).toEqual({ status: 'failed', shown: [] })
    await expect(notify()).rejects.toThrow('stopped')
  })

  it('times out an unconfirmed delivery without blocking a later retry', async () => {
    vi.useFakeTimers()
    native.event = undefined
    const { notify } = client()
    const records = [{ id: 'loops', dueAt: 100 }]
    const pending = notify(records)
    await vi.waitFor(() => expect(native.shows).toBe(1))
    await vi.advanceTimersByTimeAsync(10000)
    expect(await pending).toEqual({ status: 'failed', shown: [] })
    native.event = 'show'
    expect((await notify(records)).shown).toEqual(records)
    expect(native.shows).toBe(2)
  })
})
