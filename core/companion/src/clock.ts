/** Scheduling uses epoch milliseconds, consistent with the existing task service clock boundary. */
export interface Clock {
  now: () => number
}

export class SystemClock implements Clock {
  now() {
    return Date.now()
  }
}
