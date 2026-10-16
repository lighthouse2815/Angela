import type { Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { randomUUID } from 'node:crypto'

import { streamFrom } from '@proj-airi/core-agent'

/** Owns one serial conversation. Failed generations never append an incomplete assistant turn. */
export class Chat {
  readonly conversation: Conversation = { turns: [] }

  constructor(private readonly model: string, private readonly provider: GenerationProvider, workspace: string, history?: Conversation, toolsAvailable = true) {
    this.conversation.turns.push({
      type: 'system',
      id: randomUUID(),
      authority: 'system',
      content: [{ type: 'text', text: `You are Angela, a coding assistant. Reply in the user's language. Keep a warm, direct, consistent manner and adapt your wording to the user's stated preferences. Do not invent shared experiences. Report only verified tool outcomes. Ask before destructive changes. Previous requests can stop after tool side effects. Verify the workspace before repeating actions. Workspace: ${JSON.stringify(workspace)}.${toolsAvailable ? '' : ' This is text-only chat. No tools or filesystem access are available. Do not claim to read, edit, or execute files.'}` }],
    })
    if (history)
      this.conversation.turns.push(...history.turns.filter(turn => turn.type !== 'system'))
  }

  /** The caller serializes sends and owns cancellation and event rendering. */
  async send(text: string, options: StreamOptions, memory = '') {
    this.conversation.turns.push({ type: 'user', id: randomUUID(), content: [{ type: 'text', text }] })
    await streamFrom({
      model: this.model,
      chatProvider: this.provider,
      conversation: memory
        ? { turns: [this.conversation.turns[0]!, {
            type: 'system',
            id: randomUUID(),
            authority: 'system',
            content: [{ type: 'text', text: memory }],
          }, ...this.conversation.turns.slice(1)] }
        : this.conversation,
      options: {
        ...options,
        onGeneratedTurn: (turn) => {
          this.conversation.turns.push(turn)
        },
      },
    })
  }
}
