import type { AngelaEvent } from './events'

import { expect, it, vi } from 'vitest'

import { EventBus } from './event-bus'

it('delivers only to current subscribers and never replays events', () => {
  const bus = new EventBus()
  const event: AngelaEvent = { id: 'event', type: 'user.message', timestamp: new Date().toISOString(), correlationId: 'request' }
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

it('isolates a failing observer and reports its error without preventing later listeners', () => {
  const bus = new EventBus()
  const error = new Error('observer failed')
  const handler = vi.fn()
  bus.on('user.message', () => {
    throw error
  })
  bus.on('user.message', handler)
  const event: AngelaEvent = { id: 'event', type: 'user.message', timestamp: new Date().toISOString(), correlationId: 'request' }
  expect(bus.emit(event)).toEqual([error])
  expect(handler).toHaveBeenCalledExactlyOnceWith(event)
})

it('bounds metadata diagnostics and warning delivery even when diagnostics itself fails', () => {
  const diagnostic = vi.fn(() => {
    throw new Error('sensitive-diagnostic-secret')
  })
  const bus = new EventBus(diagnostic)
  const observer = vi.fn()
  bus.on('user.message', () => {
    throw new Error('sensitive-observer-secret')
  })
  bus.on('user.message', observer)
  const event: AngelaEvent = { id: 'event', type: 'user.message', timestamp: new Date().toISOString(), correlationId: 'request', workspace: 'sensitive-workspace' }
  for (let i = 0; i < 1000; i++)
    expect(bus.emit(event)).toHaveLength(1)
  expect(observer).toHaveBeenCalledTimes(1000)
  expect(diagnostic).toHaveBeenCalledTimes(16)
  expect(bus.diagnostics.failures).toBe(1000)
  expect(bus.diagnostics.recent).toHaveLength(16)
  expect(bus.diagnostics.recent[0]).toEqual({ eventType: 'user.message', failures: 1 })
  expect(JSON.stringify(bus.diagnostics)).not.toContain('sensitive')
  const snapshot = bus.diagnostics
  snapshot.recent.length = 0
  expect(bus.diagnostics.recent).toHaveLength(16)
  bus.close()
  expect(bus.diagnostics).toEqual({ failures: 0, recent: [] })
})

it('takes a delivery snapshot when an observer replaces subscriptions', () => {
  const bus = new EventBus()
  const event: AngelaEvent = { id: 'event', type: 'user.message', timestamp: new Date().toISOString(), correlationId: 'request' }
  let unsubscribe = () => {}
  const observer = vi.fn(() => {
    unsubscribe()
    unsubscribe = bus.on('user.message', observer)
  })
  unsubscribe = bus.on('user.message', observer)
  bus.emit(event)
  expect(observer).toHaveBeenCalledTimes(1)
  expect(bus.listenerCount).toBe(1)
  bus.close()
})
