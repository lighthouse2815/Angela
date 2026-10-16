import type { CompleterResult } from 'node:readline'

import process from 'node:process'

import { createInterface } from 'node:readline/promises'
import { styleText } from 'node:util'

/** Owns the terminal reader. EOF releases pending questions, and turn cancellation keeps the reader open. */
export class Terminal {
  private commands: string[] = []

  private readonly input = createInterface({
    input: process.stdin,
    output: process.stderr,
    completer: (line: string): CompleterResult => {
      const match = line.startsWith('/') ? this.commands.find(command => command.startsWith(line)) : undefined
      return [match ? [match.split(' — ')[0]!] : [], line]
    },
  })

  private readonly closed = new AbortController()

  constructor(interrupt: () => void) {
    this.input.on('close', () => this.closed.abort())
    this.input.on('SIGINT', interrupt)
  }

  /** Returns undefined at EOF. An external signal rejects only the current question. */
  async ask(prompt: string, signal?: AbortSignal, commands = ''): Promise<string | undefined> {
    if (this.closed.signal.aborted)
      return undefined
    const combined = signal ? AbortSignal.any([signal, this.closed.signal]) : this.closed.signal
    this.commands = commands.split('\n').filter(line => line.startsWith('/'))
    let visible = false
    const draw = (_text: string, key: { name?: string }) => {
      if (key.name === 'return' && visible) {
        process.stderr.write('\r\u001B[J')
        visible = false
        return
      }
      const line = this.input.line
      const matches = line.startsWith('/') ? this.commands.filter(command => command.startsWith(line)) : []
      if (!visible && !matches.length)
        return
      // Save the editing cursor. Suggestions own only the rows below the input.
      process.stderr.write('\u001B7\r\n\u001B[J')
      for (const [index, match] of matches.entries()) {
        const text = `${index === 0 ? '›' : ' '} ${match} ${index === 0 ? '[Tab]' : ''}`
        const clipped = Array.from(text).slice(0, Math.max(1, (process.stderr.columns || 80) - 1)).join('')
        process.stderr.write(`${styleText(index === 0 ? 'cyan' : 'dim', clipped, { stream: process.stderr })}\n`)
      }
      process.stderr.write('\u001B8')
      visible = matches.length > 0
    }
    if (process.stderr.isTTY && this.commands.length)
      process.stdin.on('keypress', draw)
    try {
      return await this.input.question(prompt, { signal: combined })
    }
    catch (error) {
      if (this.closed.signal.aborted)
        return undefined
      throw error
    }
    finally {
      process.stdin.off('keypress', draw)
      this.commands = []
      if (visible)
        process.stderr.write('\u001B7\r\n\u001B[J\u001B8')
    }
  }

  close() {
    this.input.close()
  }
}
