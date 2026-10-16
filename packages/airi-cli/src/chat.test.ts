import type { GenerationProvider } from '@proj-airi/provider-inference'

import { describe, expect, it, vi } from 'vitest'

import { Chat } from './chat'

function completion(text: string) {
  const chunks = [
    { choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ]
  return new Response(`${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('terminal conversation', () => {
  it('streams a real generation and sends the previous answer in the next request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(completion('Xin chào'))
      .mockResolvedValueOnce(completion('Tôi nhớ'))
    const provider: GenerationProvider = {
      generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch } }),
    }
    const chat = new Chat('test-model', provider, '/workspace')
    const output: string[] = []
    await chat.send('Chào', { onStreamEvent: (event) => {
      if (event.type === 'text-delta')
        output.push(event.text)
    } })
    await chat.send('Bạn nhớ không?', {})

    expect(output.join('')).toBe('Xin chào')
    expect(chat.conversation.turns.map(turn => turn.type)).toEqual(['system', 'user', 'assistant', 'user', 'assistant'])
    const body = JSON.parse(String(fetch.mock.calls[1][1]?.body))
    expect(body.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: 'Xin chào' }),
      expect.objectContaining({ role: 'user' }),
    ]))
  })

  it('cancels provider requests without storing an incomplete assistant turn', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      init?.signal?.throwIfAborted()
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    })
    const provider: GenerationProvider = {
      generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch } }),
    }
    const chat = new Chat('test-model', provider, '/workspace')
    const controller = new AbortController()
    const sending = chat.send('Wait', { abortSignal: controller.signal })
    const rejected = expect(sending).rejects.toThrow()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    controller.abort()
    await rejected
    expect(chat.conversation.turns.map(turn => turn.type)).toEqual(['system', 'user'])
  })
})
