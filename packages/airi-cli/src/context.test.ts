import type { Conversation } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { chatMessagesToTurns } from '@proj-airi/core-agent'
import { cliMessages } from '@proj-airi/i18n/cli'
import { expect, it, vi } from 'vitest'

import { Context } from './context'

function setup(answer = 'Historical decision: use API. Old work remains to be verified.') {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: answer }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }))
  const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://test.invalid/v1/', fetch } }) }
  const conversation: Conversation = { turns: [
    { type: 'system', authority: 'system', id: 'system', content: [{ type: 'text', text: 'System instructions' }] },
    ...Array.from({ length: 8 }, (_, index) => ({ type: 'user' as const, id: `old-${index}`, content: [{ type: 'text' as const, text: `Old ${index}: ${'long history '.repeat(130)}` }] })),
    { type: 'user', id: 'latest', content: [{ type: 'text', text: 'Current requirement: preserve me completely' }] },
  ] }
  return { fetch, provider, conversation, context: new Context(4096) }
}

it('summarizes old turns without mutating history and reuses the result on subsequent requests', async () => {
  const { context, conversation, provider, fetch } = setup()
  const original = JSON.stringify(conversation)
  const prepared = await context.prepare(conversation, 'model', provider, {})
  expect(JSON.stringify(conversation)).toBe(original)
  expect(prepared.turns[0]).toEqual(conversation.turns[0])
  expect(prepared.turns.at(-1)).toEqual(conversation.turns.at(-1))
  expect(JSON.stringify(prepared)).toContain('Historical decision: use API')
  expect(context.status.summarizedTurns).toBeGreaterThan(0)
  expect(context.status.estimatedInputTokens).toBeLessThanOrEqual(3072)
  const calls = fetch.mock.calls.length
  await context.prepare(conversation, 'model', provider, {})
  expect(fetch).toHaveBeenCalledTimes(calls)
  expect(context.status.compactions).toBe(1)
  expect(JSON.stringify(fetch.mock.calls[0]?.[1]?.body)).not.toContain('Current requirement')
})

it('does not truncate required current input or system and tool overhead when it cannot fit', async () => {
  const { provider, fetch } = setup()
  const context = new Context(4096)
  const conversation: Conversation = { turns: [{ type: 'user', id: 'current', content: [{ type: 'text', text: 'x'.repeat(30_000) }] }] }
  await expect(context.prepare(conversation, 'model', provider, {})).rejects.toThrow(cliMessages.en.contextTooLarge)
  expect(fetch).not.toHaveBeenCalled()
  expect(conversation.turns[0]).toMatchObject({ id: 'current' })
})

it('keeps cancellation and invalid summaries from committing partial compaction', async () => {
  const { conversation, provider, context } = setup('x'.repeat(3001))
  await expect(context.prepare(conversation, 'model', provider, {})).rejects.toThrow(cliMessages.en.contextSummaryFailed)
  expect(context.status.summarizedTurns).toBe(0)
  const controller = new AbortController()
  controller.abort()
  await expect(context.prepare(conversation, 'model', provider, { abortSignal: controller.signal })).rejects.toThrow()
  expect(context.status.summarizedTurns).toBe(0)
})

it('resets cached summary when the source history changes and validates the budget', async () => {
  const { context, conversation, provider } = setup()
  await context.prepare(conversation, 'model', provider, {})
  const fresh: Conversation = { turns: [{ type: 'user', id: 'new-session', content: [{ type: 'text', text: 'New conversation' }] }] }
  expect(await context.prepare(fresh, 'model', provider, {})).toEqual(fresh)
  expect(context.status.summarizedTurns).toBe(0)
  expect(() => new Context(Number.NaN)).toThrow(cliMessages.en.contextLimit)
  expect(() => new Context(100)).toThrow(cliMessages.en.contextLimit)
})

it('retains the active tool invocation and its result together after compacting older history', async () => {
  const { context, conversation, provider } = setup()
  const active = chatMessagesToTurns([
    { role: 'user', content: 'Inspect the current file' },
    { role: 'assistant', tool_calls: [{ id: 'active-call', type: 'function', function: { name: 'read_file', arguments: '{"path":"current.ts"}' } }] },
    { role: 'tool', tool_call_id: 'active-call', content: 'Current file content and result' },
  ])
  conversation.turns.splice(-1, 1, ...active)
  const prepared = await context.prepare(conversation, 'model', provider, {})
  expect(prepared.turns.slice(-active.length)).toEqual(active)
  expect(JSON.stringify(prepared)).toContain('active-call')
  expect(JSON.stringify(prepared)).toContain('Current file content and result')
})
