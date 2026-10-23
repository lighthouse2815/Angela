import type { RuntimeChat } from './runtime'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { expect, it, vi } from 'vitest'

import { AngelaRuntime } from './runtime'

it('runs an external generation host through shared privacy, tools, cancellation, and lifecycle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-external-'))
  const generation = vi.fn(() => {
    throw new Error('The external host owns generation')
  })
  const runtime = new AngelaRuntime('external', { generation }, cliMessages.en)
  const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId: 'desktop-session', channel: 'desktop' })
  const events: string[] = []
  runtime.events.on('request.completed', event => events.push(event.type))
  const chat: RuntimeChat = {
    conversation: { turns: [] },
    applyPrivacy: vi.fn(),
    respond: vi.fn(),
    send: vi.fn(async (_text, options, context) => {
      expect(context).toContain('Request privacy: user-request')
      expect(options.tools?.length).toBeGreaterThan(0)
      expect(options.abortSignal?.aborted).toBe(false)
      await options.onStreamEvent?.({ type: 'text-delta', text: 'Session-only answer' })
    }),
  }
  try {
    await scope.send(chat, 'Don\'t store this. Help me choose a topic', {})
    expect(chat.send).toHaveBeenCalledOnce()
    expect(chat.applyPrivacy).toHaveBeenCalledWith(expect.objectContaining({ durableMemoryAllowed: false }))
    expect(events).toEqual(['request.completed'])
    expect(generation).not.toHaveBeenCalled()
    await scope.close()
    expect(runtime.resourceCounts.requests).toBe(0)
    expect(runtime.resourceCounts.states).toBe(0)
  }
  finally {
    await runtime.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('propagates host cancellation without completing or retaining the request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-external-cancel-'))
  const generation = vi.fn(() => {
    throw new Error('The external host owns generation')
  })
  const runtime = new AngelaRuntime('external', { generation }, cliMessages.en)
  const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId: 'desktop-cancel', channel: 'desktop' })
  const abort = new AbortController()
  const events: string[] = []
  runtime.events.on('request.completed', event => events.push(event.type))
  runtime.events.on('request.failed', event => events.push(`${event.type}:${event.reason}`))
  let begin: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    begin = resolve
  })
  const chat: RuntimeChat = {
    conversation: { turns: [] },
    applyPrivacy: vi.fn(),
    respond: vi.fn(),
    send: vi.fn(async (_text, options) => {
      const signal = options.abortSignal!
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        begin()
      })
    }),
  }
  try {
    const request = scope.send(chat, 'Don\'t store this. Explain loops', { abortSignal: abort.signal })
    const failure = expect(request).rejects.toThrow('Voice interrupted')
    await started
    abort.abort(new Error('Voice interrupted'))
    await failure
    expect(events).toEqual(['request.failed:aborted'])
    expect(runtime.resourceCounts.requests).toBe(0)
    expect(generation).not.toHaveBeenCalled()
  }
  finally {
    await runtime.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('delivers authoritative task replies without invoking external generation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-external-task-'))
  const runtime = new AngelaRuntime('external', { generation: () => {
    throw new Error('No provider request is expected')
  } }, cliMessages.en)
  const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId: 'desktop-task', channel: 'desktop' })
  const chat: RuntimeChat = {
    conversation: { turns: [] },
    applyPrivacy: vi.fn(),
    respond: vi.fn(),
    send: vi.fn(),
  }
  try {
    await scope.send(chat, 'Mai 9h nhắc tôi học LINQ.', {})
    expect(chat.respond).toHaveBeenCalledOnce()
    expect(chat.send).not.toHaveBeenCalled()
    const tasks = await (await scope.tasks()).list({ status: 'all' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toContain('LINQ')
  }
  finally {
    await runtime.close()
    await rm(directory, { recursive: true, force: true })
  }
})
