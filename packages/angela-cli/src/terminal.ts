import type { Key } from 'node:readline'

import process from 'node:process'

import { clearScreenDown, cursorTo, emitKeypressEvents, moveCursor } from 'node:readline'
import { createInterface } from 'node:readline/promises'
import { PassThrough } from 'node:stream'
import { styleText } from 'node:util'

/** Owns the terminal reader. EOF releases pending questions, and turn cancellation keeps the reader open. */
export class Terminal {
  private asking = false
  private redraw?: (key?: Key) => void
  private selectCommand?: (key: Key) => boolean
  private readonly interactive = Boolean(process.stdin.isTTY && process.stderr.isTTY)
  // Interactive keys reach readline only after command navigation gets first choice.
  private readonly source = this.interactive ? new PassThrough() : process.stdin

  private readonly keypress = (text: string, key: Key) => {
    const handled = this.selectCommand?.(key)
    if (!handled)
      this.input.write(text, key)
    this.redraw?.(handled ? undefined : key)
  }

  private readonly end = () => this.close()

  private readonly input = createInterface({
    input: this.source,
    output: process.stderr,
  })

  private readonly closed = new AbortController()

  constructor(interrupt: () => void) {
    this.input.on('close', () => this.closed.abort())
    this.input.on('SIGINT', interrupt)
    if (this.interactive) {
      const wasRaw = process.stdin.isRaw
      emitKeypressEvents(process.stdin)
      process.stdin.setRawMode(true)
      process.stdin.on('keypress', this.keypress)
      process.stdin.once('end', this.end)
      process.stdin.resume()
      this.input.once('close', () => {
        process.stdin.off('keypress', this.keypress)
        process.stdin.off('end', this.end)
        process.stdin.setRawMode(wasRaw)
        process.stdin.pause()
        this.source.destroy()
      })
    }
  }

  /** Returns undefined at EOF. An external signal rejects only the current question. */
  async ask(prompt: string, signal?: AbortSignal, commands = ''): Promise<string | undefined> {
    if (this.closed.signal.aborted)
      return undefined
    const combined = signal ? AbortSignal.any([signal, this.closed.signal]) : this.closed.signal
    const suggestions = commands.split('\n').filter(line => line.startsWith('/'))
    let selected = 0
    let visible = false
    let previousLine = ''
    const draw = (key: Key = {}) => {
      if (key.name === 'return' && visible) {
        process.stderr.write('\r\u001B[J')
        visible = false
        return
      }
      const line = this.input.line
      if (line !== previousLine) {
        selected = 0
        previousLine = line
      }
      const matches = line.startsWith('/') ? suggestions.filter(command => command.startsWith(line)) : []
      if (!visible && !matches.length)
        return
      // Save the editing cursor. Suggestions own only the rows below the input.
      process.stderr.write('\u001B7\r\n\u001B[J')
      for (const [index, match] of matches.entries()) {
        const active = index === selected
        const text = `${active ? '›' : ' '} ${match} ${active ? '[↑↓ Tab ↵]' : ''}`
        const clipped = Array.from(text).slice(0, Math.max(1, (process.stderr.columns || 80) - 1)).join('')
        process.stderr.write(`${styleText(active ? 'cyan' : 'dim', clipped, { stream: process.stderr })}\n`)
      }
      process.stderr.write('\u001B8')
      visible = matches.length > 0
    }
    this.selectCommand = (key) => {
      if (key.ctrl || key.meta || key.shift || !this.input.line.startsWith('/'))
        return false
      const matches = suggestions.filter(command => command.startsWith(this.input.line))
      if (!matches.length)
        return false
      if (key.name === 'up' || key.name === 'down') {
        selected = (selected + (key.name === 'up' ? -1 : 1) + matches.length) % matches.length
        return true
      }
      const command = matches[selected]!.split(' — ')[0]!
      if (key.name === 'tab' || (key.name === 'return' && this.input.line !== command)) {
        // Readline completion is asynchronous. Replace the line before another key can submit it.
        this.input.write(undefined, { ctrl: true, name: 'a' })
        this.input.write(undefined, { ctrl: true, name: 'k' })
        this.input.write(command)
        return true
      }
      return false
    }
    this.asking = true
    this.redraw = this.interactive && suggestions.length ? draw : undefined
    try {
      return await this.input.question(prompt, { signal: combined })
    }
    catch (error) {
      if (this.closed.signal.aborted)
        return undefined
      throw error
    }
    finally {
      this.asking = false
      this.redraw = undefined
      this.selectCommand = undefined
      if (visible)
        process.stderr.write('\u001B7\r\n\u001B[J\u001B8')
    }
  }

  get hasInput() {
    return this.asking && Boolean(this.input.line)
  }

  /** Writes above the complete editable prompt, then restores its line, cursor, and command suggestions. */
  async notify(text: string) {
    if (!this.asking || !process.stderr.isTTY) {
      process.stderr.write(`\n${text}\n`)
    }
    else {
      const position = this.input.getCursorPos()
      moveCursor(process.stderr, 0, -position.rows)
      cursorTo(process.stderr, 0)
      clearScreenDown(process.stderr)
      process.stderr.write(`${text}\n`)
      this.input.prompt(true)
      this.redraw?.()
    }
    await new Promise<void>((resolve, reject) => {
      process.stderr.write('', error => error ? reject(error) : resolve())
    })
  }

  close() {
    this.input.close()
  }
}
