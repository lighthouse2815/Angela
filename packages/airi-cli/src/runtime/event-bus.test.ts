import type { AngelaEvent } from './events'

import { expect, it, vi } from 'vitest'

import { EventBus } from './event-bus'

it('delivers only to current subscribers and never replays events', () => {
  const bus = new EventBus()
  const event: AngelaEvent = { type: 'user.message', timestamp: new Date().toISOString(), correlationId: 'request' }
  bus.emit(event)
  const handler = vi.fn()
  const unsubscribe = bus.on('user.message', handler)
  bus.on('user.message', handler)
  bus.on('assistant.message', vi.fn())
  expect(handler).not.toHaveBeenCalled()
  expect(bus.listenerCount).toBe(2)
  bus.emit(event)
  expect(handler).toHaveBeenCalledExactlyOnceWith(event)
  unsubscribe()
  bus.emit(event)
  expect(handler).toHaveBeenCalledTimes(1)
  bus.close()
  expect(bus.listenerCount).toBe(0)
})

it('bounds listeners and releases repeated subscription lifecycles', () => {
  const bus = new EventBus()
  for (let index = 0; index < 1000; index++) {
    const unsubscribe = bus.on('tool.result', () => {})
    unsubscribe()
  }
  expect(bus.listenerCount).toBe(0)
  for (let index = 0; index < 32; index++)
    bus.on('tool.call', () => {})
  expect(() => bus.on('tool.call', () => {})).toThrow(RangeError)
  expect(bus.listenerCount).toBe(32)
  bus.close()
  expect(bus.listenerCount).toBe(0)
})
