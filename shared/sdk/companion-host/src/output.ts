import type { Writable } from 'node:stream'

import type { StreamEvent } from '@angela/core-agent'
import type { cliMessages } from '@angela/i18n/cli'

import process from 'node:process'

import { clearLine, clearScreenDown, cursorTo } from 'node:readline'
import { stripVTControlCharacters, styleText } from 'node:util'

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'

import * as v from 'valibot'

// Only successful storage results can produce a memory-change confirmation.
const memoryResultSchema = v.variant('status', [
  v.object({ status: v.literal('saved'), id: v.pipe(v.string(), v.uuid()), action: v.picklist(['remember', 'update']), text: v.pipe(v.string(), v.maxLength(500)) }),
  v.object({ status: v.literal('deleted'), id: v.pipe(v.string(), v.uuid()) }),
  v.object({ status: v.literal('rejected'), reason: v.string() }),
])
const recallResultSchema = v.object({ status: v.picklist(['saved', 'ok', 'rejected', 'unavailable']), reason: v.optional(v.string()), name: v.optional(v.string()), indexed: v.optional(v.boolean()) })
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

/** Shows the effective action, including server-side pending actions, before a host approves it. */
export function describeTool(request: { name: string, arguments: Record<string, unknown> }, messages: typeof cliMessages.en) {
  const pendingAction = request.name === 'desktop_approve_pending_action' || request.name === 'desktop_reject_pending_action'
  const pending = v.safeParse(pendingSchema, pendingAction ? request.arguments.pending : undefined)
  const name = pending.success ? pending.output.action.kind : request.name
  const args = pending.success ? pending.output.action.input : request.arguments
  const lines = [`◇ ${messages.tool}: ${name}`]
  for (const [key, value] of Object.entries(args)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    lines.push(`  ${key}: ${stripVTControlCharacters(text ?? '')}`)
  }
  return { name, text: `${lines.join('\n')}\n` }
}

/** Owns transient progress and bounded tool previews. Full tool results stay in the conversation. */
export class Output {
  hasText = false
  private textOpen = false
  private readonly calls = new Map<string, string>()
  private readonly memoryCalls = new Set<string>()
  private timer?: ReturnType<typeof setInterval>
  private label?: string
  private approvalTool?: string
  private awaitingApproval = false
  private readonly deferred: StreamEvent[] = []
  private interactive = false
  private answerStarted = false
  private inputWidth = 0

  constructor(
    private readonly messages: typeof cliMessages.en,
    private readonly stdout: Writable & { isTTY?: boolean } = process.stdout,
    private readonly stderr: Writable & { isTTY?: boolean, columns?: number } = process.stderr,
  ) {}

  /** Clears the interactive display once. Redirected streams keep plain output. */
  intro() {
    this.interactive = Boolean(this.stdout.isTTY && this.stderr.isTTY)
    if (!this.interactive)
      return
    // Erase saved lines as well as the viewport. Shell history stays outside this display lifecycle.
    this.stderr.write('\u001B[3J')
    cursorTo(this.stderr, 0, 0)
    clearScreenDown(this.stderr)
    const robot = '  ╭─────╮\n  │ ◕ ◕ │  ANGELA\n  ╰─┬─┬─╯\n    ╵ ╵'
    this.stderr.write(`${styleText(['bold', 'cyan'], robot, { stream: this.stderr })}\n`)
    this.stderr.write(`${styleText('dim', this.messages.description, { stream: this.stderr })}\n\n`)
  }

  prompt() {
    if (!this.interactive)
      return '> '
    this.inputWidth = Math.max(1, Math.min(this.stderr.columns || 80, 100) - 2)
    const border = styleText('dim', `╭${'─'.repeat(this.inputWidth)}╮`, { stream: this.stderr })
    return `\n${border}\n${styleText(['bold', 'green'], '│ ❯ ', { stream: this.stderr })}`
  }

  /** Closes the input area before progress or approval output takes the terminal. */
  submitted() {
    if (!this.inputWidth)
      return
    this.stderr.write(`${styleText('dim', `╰${'─'.repeat(this.inputWidth)}╯`, { stream: this.stderr })}\n\n`)
    this.inputWidth = 0
  }

  /** Starts one request. The caller must stop progress in its finally block. */
  start() {
    this.hasText = false
    this.answerStarted = false
    this.calls.clear()
    this.memoryCalls.clear()
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
        if (this.interactive && !this.answerStarted)
          this.stdout.write(`${styleText(['bold', 'cyan'], '✦ Angela', { stream: this.stdout })}\n\n`)
        this.answerStarted = true
        this.stdout.write(this.interactive ? styleText('cyan', event.text, { stream: this.stdout }) : event.text)
        this.hasText ||= Boolean(event.text.trim())
        this.textOpen = !event.text.endsWith('\n')
        break
      case 'reasoning-delta':
        // Reasoning tokens indicate activity. They are not an action report or a user-facing answer.
        this.status(this.messages.thinking)
        break
      case 'tool-call':
        {
          if (['personal_memory', 'skill_save', 'memory_search', 'memory_read'].includes(event.toolName))
            this.memoryCalls.add(event.toolCallId)
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
    const action = describeTool(request, this.messages)
    this.approvalTool = action.name
    this.stderr.write(action.text)
  }

  decided(approved: boolean) {
    this.awaitingApproval = false
    if (this.interactive)
      this.stderr.write('\n')
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
    this.memoryCalls.clear()
    this.awaitingApproval = false
    this.deferred.length = 0
  }

  private result(event: Extract<StreamEvent, { type: 'tool-result' | 'tool-error' }>) {
    this.pause()
    this.endText()
    const name = this.calls.get(event.toolCallId) ?? this.messages.tool
    const memoryCall = this.memoryCalls.delete(event.toolCallId)
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
      if (memoryCall && name === 'personal_memory' && event.type === 'tool-result') {
        const memory = v.safeParse(memoryResultSchema, raw)
        if (memory.success) {
          const change = memory.output
          if (change.status === 'rejected') {
            this.stderr.write(`✗ ${this.messages.memoryNotSaved}\n`)
            this.preview(change.reason)
          }
          else {
            const label = change.status === 'deleted'
              ? this.messages.memoryForgotten
              : change.action === 'update' ? this.messages.memoryUpdated : this.messages.memorySaved
            this.stderr.write(`✓ ${label}\n`)
            this.preview(change.status === 'saved' ? `${change.id} ${JSON.stringify(change.text)}` : change.id)
          }
          this.status(this.calls.size ? this.messages.runningTool : this.messages.thinking)
          return
        }
      }
      if (memoryCall && ['skill_save', 'memory_search', 'memory_read'].includes(name) && event.type === 'tool-result') {
        const result = v.safeParse(recallResultSchema, raw)
        if (result.success) {
          const failed = result.output.status === 'rejected' || result.output.status === 'unavailable'
          this.stderr.write(`${failed ? '✗' : '✓'} ${name}: ${failed ? this.messages.toolFailed : this.messages.toolDone}\n`)
          if (result.output.reason)
            this.preview(result.output.reason)
          if (result.output.name)
            this.preview(result.output.name)
          if (result.output.indexed === false)
            this.preview(this.messages.recallPartial)
          this.status(this.calls.size ? this.messages.runningTool : this.messages.thinking)
          return
        }
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
