import type { AngelaEvent } from './events'

/** Error messages and event payloads never enter diagnostics. */
export interface ObserverDiagnostic {
  eventType: AngelaEvent['type']
  failures: number
}

type Handler = (event: AngelaEvent) => void

/** Synchronous process-local delivery. Only bounded error metadata survives emit. No event history, promises, queue, or replay. */
export class EventBus {
  private readonly listeners = new Map<AngelaEvent['type'], Map<unknown, Handler>>()

  private readonly recent: ObserverDiagnostic[] = []
  private failures = 0
  private reported = 0

  constructor(private onDiagnostic?: (diagnostic: ObserverDiagnostic) => void) {}

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
    const errors: unknown[] = []
    for (const handler of [...(this.listeners.get(event.type)?.values() ?? [])]) {
      try {
        handler(event)
      }
      catch (error) {
        errors.push(error)
      }
    }
    if (errors.length) {
      const diagnostic: ObserverDiagnostic = { eventType: event.type, failures: errors.length }
      this.failures = Math.min(Number.MAX_SAFE_INTEGER, this.failures + errors.length)
      if (this.recent.length === 16)
        this.recent.shift()
      this.recent.push(diagnostic)
      // Bound callback delivery as well as history. The snapshot keeps the latest failures after warning delivery stops.
      if (this.reported < 16) {
        this.reported++
        try {
          this.onDiagnostic?.({ ...diagnostic })
        }
        catch {
          // Diagnostics cannot turn observer failure into request failure.
        }
      }
    }
    return errors
  }

  get diagnostics() {
    return { failures: this.failures, recent: this.recent.map(item => ({ ...item })) }
  }

  get listenerCount() {
    let count = 0
    for (const handlers of this.listeners.values())
      count += handlers.size
    return count
  }

  close() {
    this.listeners.clear()
    this.recent.length = 0
    this.failures = 0
    this.reported = 0
    this.onDiagnostic = undefined
  }
}
