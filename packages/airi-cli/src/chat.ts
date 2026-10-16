import type { Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { randomUUID } from 'node:crypto'

import { streamFrom } from '@proj-airi/core-agent'

/** Owns one serial conversation. Failed generations never append an incomplete assistant turn. */
export class Chat {
  readonly conversation: Conversation = { turns: [] }

  constructor(private readonly model: string, private readonly provider: GenerationProvider, workspace: string) {
    this.conversation.turns.push({
      type: 'system',
      id: randomUUID(),
      authority: 'system',
      content: [{ type: 'text', text: `You are Angela, a coding assistant. Reply in the user's language. Report only verified tool outcomes. Ask before destructive changes. Workspace: ${JSON.stringify(workspace)}.` }],
    })
  }

  /** The caller serializes sends and owns cancellation and event rendering. */
  async send(text: string, options: StreamOptions) {
    this.conversation.turns.push({ type: 'user', id: randomUUID(), content: [{ type: 'text', text }] })
    await streamFrom({
      model: this.model,
      chatProvider: this.provider,
      conversation: this.conversation,
      options: {
        ...options,
        onGeneratedTurn: (turn) => {
          this.conversation.turns.push(turn)
        },
      },
    })
  }
}
