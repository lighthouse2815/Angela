import type { AngelaEvent } from './events'

type Handler = (event: AngelaEvent) => void

/** Synchronous process-local delivery. No history, promises, queue, replay, or event payload survives emit. */
export class EventBus {
  private readonly listeners = new Map<AngelaEvent['type'], Map<unknown, Handler>>()

  /** A subscriber owns its unsubscribe function. Each event type permits at most 32 distinct listeners. */
  on<T extends AngelaEvent['type']>(type: T, handler: (event: Extract<AngelaEvent, { type: T }>) => void) {
    let handlers = this.listeners.get(type)
    if (!handlers) {
      handlers = new Map()
      this.listeners.set(type, handlers)
    }
    if (!handlers.has(handler) && handlers.size >= 32)
      throw new RangeError('Too many runtime event listeners')
    handlers.set(handler, event => handler(event as Extract<AngelaEvent, { type: T }>))
    return () => this.off(type, handler)
  }

  off<T extends AngelaEvent['type']>(type: T, handler: (event: Extract<AngelaEvent, { type: T }>) => void) {
    const handlers = this.listeners.get(type)
    handlers?.delete(handler)
    if (!handlers?.size)
      this.listeners.delete(type)
  }

  emit(event: AngelaEvent) {
    for (const handler of this.listeners.get(event.type)?.values() ?? [])
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
