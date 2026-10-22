import type { Conversation, StreamEvent, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { randomUUID } from 'node:crypto'

import { streamFrom } from '@proj-airi/core-agent'
import { cliMessages } from '@proj-airi/i18n/cli'

import { Context } from './context'

/** Owns one serial conversation. Failed generations never append an incomplete assistant turn. */
export class Chat {
  private active = false
  readonly context: Context
  readonly conversation: Conversation = { turns: [] }

  constructor(private readonly model: string, private readonly provider: GenerationProvider, workspace: string, history?: Conversation, toolsAvailable = true, contextLimit = 32_000, messages = cliMessages.en) {
    this.context = new Context(contextLimit, messages)
    this.conversation.turns.push({
      type: 'system',
      id: randomUUID(),
      authority: 'system',
      content: [{ type: 'text', text: `You are Angela, an AI friend and study companion who helps with everyday tasks. Reply in the user's language. Keep a warm, direct, consistent manner and adapt your wording to the user's stated preferences. Do not invent shared experiences. Report only verified tool outcomes. Ask before destructive changes. Previous requests can stop after tool side effects. Verify the workspace before repeating actions. Workspace: ${JSON.stringify(workspace)}.${toolsAvailable ? '' : ' No tools or filesystem access are available. Do not claim to read, edit, or execute files.'}` }],
    })
    if (history) {
      for (const turn of history.turns) {
        if (turn.type !== 'system')
          this.conversation.turns.push(turn)
        else if (turn.id === 'cli-context-summary')
          this.context.restore(turn.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n'))
      }
    }
  }

  get isSending() {
    return this.active
  }

  /** The caller serializes sends and owns cancellation and event rendering. */
  async send(text: string, options: StreamOptions, memory = '') {
    this.conversation.turns.push({ type: 'user', id: randomUUID(), content: [{ type: 'text', text }] })
    let conversation = this.conversation
    if (memory) {
      const turns: Conversation['turns'] = [this.conversation.turns[0]!, {
        type: 'system' as const,
        id: randomUUID(),
        authority: 'system' as const,
        content: [{ type: 'text' as const, text: memory }],
      }]
      for (let index = 1; index < this.conversation.turns.length; index++)
        turns.push(this.conversation.turns[index]!)
      conversation = { turns }
    }
    const lifetime = new AbortController()
    const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, lifetime.signal]) : lifetime.signal
    const pending = new Set<Promise<void>>()
    let callbackError: unknown
    let callbackFailed = false
    const deliver = (event: StreamEvent): void | Promise<void> => {
      if (event.type === 'finish') {
        return (async () => {
          await Promise.all(pending)
          if (callbackFailed)
            throw callbackError
          await options.onStreamEvent?.(event)
        })()
      }
      if (pending.size >= 64) {
        const error = new Error('Too many pending stream callbacks')
        lifetime.abort(error)
        throw error
      }
      const result = options.onStreamEvent?.(event)
      if (!result)
        return
      const tracked = result.catch((error: unknown) => {
        callbackError = error
        callbackFailed = true
        lifetime.abort(error)
      }).finally(() => { pending.delete(tracked) })
      pending.add(tracked)
      return result
    }
    this.active = true
    try {
      await streamFrom({
        model: this.model,
        chatProvider: this.provider,
        conversation,
        options: {
          ...options,
          abortSignal: signal,
          onStreamEvent: deliver,
          prepareConversation: async (conversation, target) => {
            const prepared = options.prepareConversation ? await options.prepareConversation(conversation, target) : conversation
            return await this.context.prepare(prepared, this.model, this.provider, { ...options, abortSignal: signal })
          },
          onGeneratedTurn: (turn) => {
            this.conversation.turns.push(turn)
          },
        },
      })
    }
    finally {
      await Promise.all(pending)
      pending.clear()
      lifetime.abort()
      this.active = false
    }
  }
}
