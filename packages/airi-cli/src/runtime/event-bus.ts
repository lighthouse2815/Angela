import type { AngelaEvent } from './events'

type Handler = (event: AngelaEvent) => void

/** Synchronous process-local delivery. No history, promises, queue, replay, or event payload survives emit. */
export class EventBus {
  private readonly listeners = new Map<AngelaEvent['type'], Set<Handler>>()

  /** A subscriber owns its unsubscribe function. Each event type permits at most 32 distinct listeners. */
  on(type: AngelaEvent['type'], handler: Handler) {
    let handlers = this.listeners.get(type)
    if (!handlers) {
      handlers = new Set()
      this.listeners.set(type, handlers)
    }
    if (!handlers.has(handler) && handlers.size >= 32)
      throw new RangeError('Too many runtime event listeners')
    handlers.add(handler)
    return () => this.off(type, handler)
  }

  off(type: AngelaEvent['type'], handler: Handler) {
    const handlers = this.listeners.get(type)
    handlers?.delete(handler)
    if (!handlers?.size)
      this.listeners.delete(type)
  }

  emit(event: AngelaEvent) {
    for (const handler of this.listeners.get(event.type) ?? [])
      handler(event)
  }

  get listenerCount() {
    let count = 0
    for (const handlers of this.listeners.values())
      count += handlers.size
    return count
  }

  close() {
    this.listeners.clear()
  }
}
