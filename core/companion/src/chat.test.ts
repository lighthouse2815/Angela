import type { GenerationProvider } from '@angela/provider-inference'

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
  // ROOT CAUSE: The old prompt named Angela without separating companion identity from the provider. Every request now carries that distinction.
  it('sends the current companion identity after resuming with another model and personal memory disabled', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => completion('Mình là Angela'))
    const provider: GenerationProvider = {
      generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch } }),
    }
    const original = new Chat('old-model', provider, '/workspace')
    await original.send('Bạn là ai?', {})
    const resumed = new Chat('new-model', provider, '/workspace', original.conversation, false)
    await resumed.send('Bạn vẫn nhớ mình là ai chứ?', {}, 'Personal memory is disabled.')

    for (const [, init] of fetch.mock.calls) {
      const body = JSON.parse(String(init?.body))
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[0].content).toContain('Your name is "Angela".')
      expect(body.messages[0].content).toContain('The underlying model and provider supply capabilities, not your conversational identity.')
      expect(body.messages[0].content).toContain('If the user asks about the underlying model, distinguish it from your companion identity.')
    }
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body)).model).toBe('new-model')
  })

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

it('uses fresh request-local memory without retaining removed facts in persisted system context', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(completion('Đã hiểu'))
    .mockResolvedValueOnce(completion('Tiếp tục'))
    .mockResolvedValueOnce(completion('Memory đã tắt'))
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch } }),
  }
  const chat = new Chat('test-model', provider, '/workspace')
  await chat.send('Chào', {}, 'Personal records: old-preference')
  await chat.send('Tiếp', {}, 'Personal records: new-preference')
  await chat.send('Tiếp nữa', {})
  const requests = fetch.mock.calls.map(([, init]) => String(init?.body))
  expect(requests[0]).toContain('old-preference')
  expect(requests[1]).not.toContain('old-preference')
  expect(requests[1]).toContain('new-preference')
  expect(requests[2]).not.toContain('Personal records')
  expect(JSON.stringify(chat.conversation)).not.toContain('old-preference')
  expect(JSON.stringify(chat.conversation)).not.toContain('new-preference')
  expect(chat.conversation.turns.map(turn => turn.type)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant'])
})

it('compacts the outgoing request while retaining full history for session persistence', async () => {
  const requests: string[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const body = String(init?.body)
    requests.push(body)
    return completion(body.includes('Summarize historical conversation data') ? 'Old requirement: preserve the API design and check tests.' : 'Current answer')
  })
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch } }),
  }
  const chat = new Chat('model', provider, '/workspace', undefined, true, 4096)
  for (let index = 0; index < 8; index++)
    chat.conversation.turns.push({ type: 'user', id: `history-${index}`, content: [{ type: 'text', text: `Unique historical detail ${index}: ${'old content '.repeat(150)}` }] })
  const original = JSON.stringify(chat.conversation)
  await chat.send('Keep this latest requirement', {}, 'Fresh memory context')
  expect(chat.context.status.summarizedTurns).toBeGreaterThan(0)
  expect(requests.at(-1)).toContain('Keep this latest requirement')
  expect(requests.at(-1)).toContain('Fresh memory context')
  expect(requests.at(-1)).toContain('The underlying model and provider supply capabilities, not your conversational identity.')
  expect(requests.at(-1)).toContain('Old requirement: preserve the API design')
  expect(requests.at(-1)).not.toContain('Unique historical detail 0')
  expect(JSON.stringify({ turns: chat.conversation.turns.slice(0, -2) })).toBe(original)
  expect(JSON.stringify(chat.conversation)).not.toContain('Old requirement: preserve the API design')
})

it('waits for asynchronous stream consumers before storing the assistant turn or releasing the request', async () => {
  const delivered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch: async () => completion('Answer') } }) }
  const chat = new Chat('model', provider, '/workspace')
  const sending = chat.send('Hi', { onStreamEvent: async (event) => {
    if (event.type === 'text-delta') {
      delivered.resolve()
      await release.promise
    }
  } })
  await delivered.promise
  expect(chat.isSending).toBe(true)
  expect(chat.conversation.turns.some(turn => turn.type === 'assistant')).toBe(false)
  release.resolve()
  await sending
  expect(chat.isSending).toBe(false)
  expect(chat.conversation.turns.at(-1)?.type).toBe('assistant')
})
