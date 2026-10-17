import type { GenerationProvider } from '@proj-airi/provider-inference'

import { cliMessages } from '@proj-airi/i18n/cli'
import { expect, it, vi } from 'vitest'

import { Evaluation } from './evaluation'

function completion(delta: object, finishReason = 'stop') {
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}

function provider(fetch: typeof globalThis.fetch): GenerationProvider {
  return { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://evaluation.example/v1/', fetch } }) }
}

it('passes tool selection only after reading the actual unpredictable fixture code', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { messages: { role: string, content: string }[] }
    const result = request.messages.find(message => message.role === 'tool')
    if (result)
      return completion({ role: 'assistant', content: result.content })
    return completion({ role: 'assistant', tool_calls: [{ index: 0, id: 'read-note', type: 'function', function: { name: 'read_study_note', arguments: '{}' } }] }, 'tool_calls')
  })
  const report = await new Evaluation(provider(fetch), 'fixture-model', cliMessages.en).run('tool-selection')
  expect(report.passed).toBe(true)
  expect(report.results[0]?.tools).toEqual(['read_study_note'])
  expect(report.results[0]?.checks.returned_observed_code).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('rejects a confident success answer without observed tool execution', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => completion({ role: 'assistant', content: 'I read the note successfully. Its code is study-guessed.' }))
  const report = await new Evaluation(provider(fetch), 'fixture-model', cliMessages.en).run('tool-selection')
  expect(report.passed).toBe(false)
  expect(report.results[0]?.checks.selected_note_tool).toBe(false)
  expect(report.results[0]?.checks.returned_observed_code).toBe(false)
})

it('measures actual persisted reminder time using the request clock and local timezone', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { messages: { role: string, content: string }[] }
    if (request.messages.some(message => message.role === 'tool'))
      return completion({ role: 'assistant', content: 'Đã đặt lịch.' })
    const clock = /Current clock: ([\dTZ:.+-]+)/u.exec(JSON.stringify(request.messages))?.[1]
    if (!clock)
      throw new Error('Missing fixture clock')
    const input = { title: 'Học tiếng Trung', type: 'reminder', dueAt: new Date(Date.parse(clock.replace(/\.$/u, '')) + 20 * 60_000).toISOString(), timezone: 'Asia/Ho_Chi_Minh' }
    return completion({ role: 'assistant', tool_calls: [{ index: 0, id: 'create-task', type: 'function', function: { name: 'task_create', arguments: JSON.stringify(input) } }] }, 'tool_calls')
  })
  const report = await new Evaluation(provider(fetch), 'fixture-model', cliMessages.vi).run('relative-time')
  expect(report.passed).toBe(true)
  expect(report.results[0]?.checks.correct_relative_time).toBe(true)
  expect(report.results[0]?.checks.correct_timezone).toBe(true)
})

it('keeps provider diagnostics and credentials out of failure reports', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response('private-evaluation-provider-key', { status: 401 }))
  const report = await new Evaluation(provider(fetch), 'fixture-model', cliMessages.en).run('tool-selection', 1, 1000)
  expect(report.passed).toBe(false)
  expect(report.results[0]?.checks.generation_completed).toBe(false)
  expect(JSON.stringify(report)).not.toContain('private-evaluation-provider-key')
})

it('bounds an unresponsive provider and stops the suite on explicit cancellation', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, init) => await new Promise<Response>((_done, reject) => {
    const signal = init?.signal
    if (signal?.aborted)
      reject(signal.reason)
    else
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const evaluation = new Evaluation(provider(fetch), 'fixture-model', cliMessages.en)
  expect((await evaluation.run('tool-selection', 1, 50)).passed).toBe(false)
  const controller = new AbortController()
  controller.abort()
  await expect(evaluation.run('all', 1, 1000, controller.signal)).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
})
