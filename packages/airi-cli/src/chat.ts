import type { Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { randomUUID } from 'node:crypto'

import { streamFrom } from '@proj-airi/core-agent'
import { cliMessages } from '@proj-airi/i18n/cli'

import { Context } from './context'

/** Owns one serial conversation. Failed generations never append an incomplete assistant turn. */
export class Chat {
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
    await streamFrom({
      model: this.model,
      chatProvider: this.provider,
      conversation,
      options: {
        ...options,
        prepareConversation: async (conversation, target) => {
          const prepared = options.prepareConversation ? await options.prepareConversation(conversation, target) : conversation
          return await this.context.prepare(prepared, this.model, this.provider, options)
        },
        onGeneratedTurn: (turn) => {
          this.conversation.turns.push(turn)
        },
      },
    })
  }
}
