import type { Voice } from './voice'

/** Keeps the interrupting capture alive while the caller cancels and saves the previous turn. */
export class VoiceInterruption {
  private readonly capture = new AbortController()
  private readonly reason = new Error('Voice interruption')
  private readonly result: Promise<string | undefined>
  private readonly abort: () => void
  private detected = false

  constructor(voice: Voice, private readonly turn: AbortController, state: (value: 'ready' | 'speech' | 'transcribing') => void) {
    this.abort = () => {
      if (turn.signal.reason !== this.reason)
        this.capture.abort(turn.signal.reason)
    }
    turn.signal.addEventListener('abort', this.abort)
    this.result = voice.listen(undefined, this.capture.signal, (value) => {
      if (value === 'speech') {
        this.detected = true
        turn.abort(this.reason)
      }
      state(value)
    }).then(result => result.kind === 'transcript' ? result.text : undefined).catch(() => {
      // A failed background capture must not cancel a reply. The next foreground capture reports service failures.
      return undefined
    })
    if (turn.signal.aborted)
      this.abort()
  }

  get interrupted() {
    return this.detected
  }

  /** After the previous turn settles, waits only for an utterance that already interrupted it. */
  async finish() {
    if (!this.detected)
      this.capture.abort()
    try {
      return await this.result
    }
    finally {
      this.capture.abort()
      this.turn.signal.removeEventListener('abort', this.abort)
    }
  }

  /** Keyboard cancellation also stops a capture that previously interrupted by voice. */
  cancel() {
    this.capture.abort()
  }
}
