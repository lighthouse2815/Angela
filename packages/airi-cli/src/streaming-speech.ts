import type { Voice } from './voice'

import { chunkTtsInput } from '@proj-airi/pipelines-audio'

/** Owns one bounded text stream and serial TTS playback. Audio failure never cancels text generation. */
export class StreamingSpeech {
  private readonly lifetime = new AbortController()
  private readonly signal: AbortSignal
  private readonly stream = new TransformStream<Uint8Array, Uint8Array>(undefined, new ByteLengthQueuingStrategy({ highWaterMark: 16_384 }), new ByteLengthQueuingStrategy({ highWaterMark: 1024 }))
  private readonly writer = this.stream.writable.getWriter()
  private readonly reader = this.stream.readable.getReader()
  private readonly drain: Promise<void>
  private failure: unknown

  constructor(voice: Voice, signal: AbortSignal, started: () => void) {
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    this.signal = combined
    const abort = () => {
      void this.reader.cancel(combined.reason).catch(() => {})
    }
    combined.addEventListener('abort', abort, { once: true })
    this.drain = (async () => {
      let speaking = false
      try {
        // Keep each sentence in one audio request so playback cannot pause between its clauses.
        for await (const chunk of chunkTtsInput(this.reader, { boost: 0, maximumWords: Number.POSITIVE_INFINITY })) {
          combined.throwIfAborted()
          if (!chunk.text.trim())
            continue
          if (!speaking) {
            speaking = true
            started()
          }
          await voice.speak(chunk.text, combined)
        }
      }
      catch (error) {
        this.failure = error
        await this.reader.cancel(error).catch(() => {})
      }
      finally {
        combined.removeEventListener('abort', abort)
      }
    })()
    if (combined.aborted)
      abort()
  }

  /** Backpressure bounds queued text while the current audio request or playback is slow. */
  async push(text: string) {
    this.signal.throwIfAborted()
    if (this.failure)
      return
    const bytes = new TextEncoder().encode(text)
    try {
      for (let offset = 0; offset < bytes.length; offset += 1024)
        await this.writer.write(bytes.subarray(offset, offset + 1024))
    }
    catch (error) {
      this.signal.throwIfAborted()
      this.failure ??= error
    }
  }

  /** Flushes the final incomplete sentence and waits for playback. The caller saves the completed chat first. */
  async finish() {
    await this.writer.close().catch((error: unknown) => {
      this.failure ??= error
    })
    await this.drain
    this.signal.throwIfAborted()
    if (this.failure)
      throw this.failure
  }

  /** Cancels pending text, synthesis, and playback, then waits for audio file cleanup. */
  async cancel() {
    this.lifetime.abort()
    await this.drain
  }
}
