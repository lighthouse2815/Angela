import type { Writable } from 'node:stream'

import type { StreamEvent } from '@proj-airi/core-agent'
import type { cliMessages } from '@proj-airi/i18n/cli'

import process from 'node:process'

import { clearLine, cursorTo } from 'node:readline'
import { stripVTControlCharacters } from 'node:util'

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'

import * as v from 'valibot'

const pendingSchema = v.object({ action: v.object({ kind: v.string(), input: v.record(v.string(), v.unknown()) }) })
const callSchema = v.object({ name: v.string() })
const backendSchema = v.object({
  backendResult: v.object({
    stdout: v.optional(v.string()),
    stderr: v.optional(v.string()),
    exitCode: v.optional(v.nullable(v.number())),
    timedOut: v.optional(v.boolean()),
  }),
})

/** Owns transient progress and bounded tool previews. Full tool results stay in the conversation. */
export class Output {
  hasText = false
  private textOpen = false
  private readonly calls = new Map<string, string>()
  private timer?: ReturnType<typeof setInterval>
  private label?: string
  private approvalTool?: string
  private awaitingApproval = false
  private readonly deferred: StreamEvent[] = []

  constructor(
    private readonly messages: typeof cliMessages.en,
    private readonly stdout: Writable = process.stdout,
    private readonly stderr: Writable & { isTTY?: boolean, columns?: number } = process.stderr,
  ) {}

  /** Starts one request. The caller must stop progress in its finally block. */
  start() {
    this.hasText = false
    this.calls.clear()
    this.status(this.messages.thinking)
  }

  event(event: StreamEvent) {
    // Parallel stream events wait until the current approval releases the input line.
    if (this.awaitingApproval && event.type !== 'error') {
      this.deferred.push(event)
      return
    }
    switch (event.type) {
      case 'text-delta':
        if (!event.text)
          return
        this.pause()
        this.stdout.write(event.text)
        this.hasText ||= Boolean(event.text.trim())
        this.textOpen = !event.text.endsWith('\n')
        break
      case 'reasoning-delta':
        // Reasoning tokens indicate activity. They are not an action report or a user-facing answer.
        this.status(this.messages.thinking)
        break
      case 'tool-call':
        {
          let name = event.toolName
          if (name === 'builtIn_mcpCallTool') {
            try {
              const call = v.safeParse(callSchema, JSON.parse(event.args))
              if (call.success)
                name = call.output.name
            }
            catch { /* Invalid arguments remain visible through the runtime's tool error. */ }
          }
          this.calls.set(event.toolCallId, name)
        }
        this.status(event.toolName === 'builtIn_mcpListTools' ? this.messages.discoveringTools : this.messages.preparingTool)
        break
      case 'tool-result':
      case 'tool-error':
        this.result(event)
        break
      case 'error':
        throw event.error
    }
  }

  /** Shows the complete approved action, without the server's transport and policy metadata. */
  approval(request: { name: string, arguments: Record<string, unknown> }) {
    this.pause()
    this.endText()
    this.awaitingApproval = true
    const pendingAction = request.name === 'desktop_approve_pending_action' || request.name === 'desktop_reject_pending_action'
    const pending = v.safeParse(pendingSchema, pendingAction ? request.arguments.pending : undefined)
    const name = pending.success ? pending.output.action.kind : request.name
    const args = pending.success ? pending.output.action.input : request.arguments
    this.approvalTool = name
    this.stderr.write(`◇ ${this.messages.tool}: ${name}\n`)
    for (const [key, value] of Object.entries(args)) {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      this.stderr.write(`  ${key}: ${stripVTControlCharacters(text ?? '')}\n`)
    }
  }

  decided(approved: boolean) {
    this.awaitingApproval = false
    this.status(approved ? `${this.messages.runningTool}: ${this.approvalTool ?? this.messages.tool}` : this.messages.thinking)
    for (const event of this.deferred.splice(0))
      this.event(event)
  }

  retry() {
    this.pause()
    this.endText()
    this.stderr.write(`${this.messages.retrying}\n`)
    this.status(this.messages.thinking)
  }

  stop() {
    this.pause()
    this.endText()
    this.calls.clear()
    this.awaitingApproval = false
    this.deferred.length = 0
  }

  private result(event: Extract<StreamEvent, { type: 'tool-result' | 'tool-error' }>) {
    this.pause()
    this.endText()
    const name = this.calls.get(event.toolCallId) ?? this.messages.tool
    this.calls.delete(event.toolCallId)
    if (name === 'builtIn_mcpListTools' && event.type === 'tool-result') {
      this.stderr.write(`✓ ${this.messages.discoveringTools}\n`)
    }
    else {
      let raw: unknown = event.result
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw)
        }
        catch { /* Plain text is also a supported tool result. */ }
      }
      const result = CallToolResultSchema.safeParse(raw)
      const backend = v.safeParse(backendSchema, result.success ? result.data.structuredContent : undefined)
      const failed = event.type === 'tool-error' || (result.success && result.data.isError)
        || (backend.success && (backend.output.backendResult.timedOut || (backend.output.backendResult.exitCode ?? 0) !== 0))
      this.stderr.write(`${failed ? '✗' : '✓'} ${name}: ${failed ? this.messages.toolFailed : this.messages.toolDone}\n`)
      if (backend.success) {
        const { stdout, stderr, exitCode, timedOut } = backend.output.backendResult
        if (exitCode !== undefined && exitCode !== null)
          this.stderr.write(`  ${this.messages.exitCode}: ${exitCode}\n`)
        if (timedOut)
          this.stderr.write(`  ${this.messages.toolTimedOut}\n`)
        this.preview((failed ? [stderr, stdout] : [stdout, stderr]).filter(Boolean).join('\n'))
      }
      else if (result.success) {
        this.preview(result.data.content.filter(part => part.type === 'text').map(part => part.text).join('\n'))
      }
      else if (typeof event.result === 'string') {
        // Unrecognized objects can contain protocol metadata. Only plain text gets a preview.
        if (typeof raw === 'string')
          this.preview(raw)
      }
    }
    this.status(this.calls.size ? this.messages.runningTool : this.messages.thinking)
  }

  private preview(text: string) {
    const clean = stripVTControlCharacters(text).trim()
    if (!clean)
      return
    const lines = clean.split('\n')
    const preview = lines.slice(0, 3).join('\n').slice(0, 600)
    this.stderr.write(`${preview.split('\n').map(line => `  ${line}`).join('\n')}\n`)
    if (preview.length < clean.length)
      this.stderr.write(`  ${this.messages.outputShortened}\n`)
  }

  private status(label: string) {
    if (this.awaitingApproval || this.label === label)
      return
    this.pause()
    this.endText()
    this.label = label
    if (!this.stderr.isTTY) {
      this.stderr.write(`• ${label}\n`)
      return
    }
    const started = Date.now()
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    let frame = 0
    const draw = () => {
      clearLine(this.stderr, 0)
      cursorTo(this.stderr, 0)
      const line = `${frames[frame++ % frames.length]} ${label} (${Math.floor((Date.now() - started) / 1000)}s)`
      this.stderr.write(line.slice(0, Math.max(1, (this.stderr.columns || 80) - 1)))
    }
    draw()
    this.timer = setInterval(draw, 100)
    this.timer.unref()
  }

  private pause() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
      clearLine(this.stderr, 0)
      cursorTo(this.stderr, 0)
    }
    this.label = undefined
  }

  private endText() {
    if (this.textOpen) {
      this.stdout.write('\n')
      this.textOpen = false
    }
  }
}
