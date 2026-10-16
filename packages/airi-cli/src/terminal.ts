import process from 'node:process'

import { createInterface } from 'node:readline/promises'

/** Owns the terminal reader. EOF releases pending questions, and turn cancellation keeps the reader open. */
export class Terminal {
  private readonly input = createInterface({ input: process.stdin, output: process.stderr })
  private readonly closed = new AbortController()

  constructor(interrupt: () => void) {
    this.input.on('close', () => this.closed.abort())
    this.input.on('SIGINT', interrupt)
  }

  /** Returns undefined at EOF. An external signal rejects only the current question. */
  async ask(prompt: string, signal?: AbortSignal): Promise<string | undefined> {
    if (this.closed.signal.aborted)
      return undefined
    const combined = signal ? AbortSignal.any([signal, this.closed.signal]) : this.closed.signal
    try {
      return await this.input.question(prompt, { signal: combined })
    }
    catch (error) {
      if (this.closed.signal.aborted)
        return undefined
      throw error
    }
  }

  close() {
    this.input.close()
  }
}
