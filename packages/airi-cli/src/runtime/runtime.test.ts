import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { Memory } from '../memory'
import type { AngelaEvent } from './events'

import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { Chat } from '../chat'
import { McpTools } from '../mcp'
import { Recall } from '../recall'
import { RecallIndex } from '../recall-index'
import { AngelaRuntime } from './runtime'

const directories: string[] = []
const runtimes: AngelaRuntime[] = []
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.close()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
  vi.restoreAllMocks()
})

function completion(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}

it('captures successful task commands without model calls or cross-user observations', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => completion('Unused'))
  const { runtime, options, directory } = await setup(fetch)
  const scope = runtime.open(options)
  const events: AngelaEvent[] = []
  runtime.events.on('task.completed', event => events.push(event))
  runtime.events.on('task.updated', event => events.push(event))
  const task = await (await scope.tasks()).create({ title: 'Ship the copper release', type: 'todo' })
  await scope.command('/done invalid-id')
  expect(events).toEqual([])
  await scope.command(`/done ${task.id}`)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ type: 'task.completed', taskId: task.id, channel: 'telegram', sessionId: options.sessionId })
  expect(events[0]?.correlationId).toBeTruthy()
  expect(JSON.stringify(events)).not.toContain(task.title)
  const index = await RecallIndex.open(directory)
  try {
    const episode = index.memory.current(directory, 'episodic', `session:${options.sessionId}`)
    expect(episode?.body).toContain('Completed:')
    expect(episode?.body).toContain(task.title)
    expect(index.memory.observations(directory, 'another-session')).toEqual([])
  }
  finally { index.close() }
  expect(fetch).not.toHaveBeenCalled()
  await scope.close()
})

it('stops durable observations when automatic memory is disabled during a request', async () => {
  let personal: Memory
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    await personal.setAutomatic(false)
    return completion('I will keep this disabled-memory commitment')
  })
  const { runtime, options, provider, directory } = await setup(fetch)
  const scope = runtime.open(options)
  personal = await scope.memory()
  await scope.send(new Chat('model', provider, directory), 'Choose the copper release', {})
  const index = await RecallIndex.open(directory)
  try {
    const observations = index.memory.observations(directory, options.sessionId)
    expect(observations.some(item => item.type === 'user.message')).toBe(true)
    expect(observations.some(item => item.type === 'assistant.message')).toBe(false)
    expect(index.memory.current(directory, 'episodic', `session:${options.sessionId}`)).toBeUndefined()
  }
  finally { index.close() }
  await scope.close()
})

async function setup(fetch: typeof globalThis.fetch = async () => completion('Hello')) {
  const directory = await mkdtemp(join(tmpdir(), 'angela-runtime-'))
  directories.push(directory)
  const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch } }) }
  const runtime = new AngelaRuntime('model', provider, cliMessages.en)
  runtimes.push(runtime)
  const options = { dataDir: directory, workspace: directory, sessionId: randomUUID(), channel: 'telegram' as const }
  return { runtime, directory, provider, options }
}

it('initializes stores only on use and shares a logical context until its last owner releases it', async () => {
  const { runtime, directory, options } = await setup()
  expect(await readdir(directory)).toEqual([])
  const first = runtime.open(options)
  const second = runtime.open(options)
  expect(first).toBe(second)
  expect(runtime.activeStateCount).toBe(1)
  expect(await first.command('ordinary text')).toBeUndefined()
  expect(await readdir(directory)).toEqual([])
  expect(await first.memory()).toBe(await second.memory())
  expect(await readdir(directory)).toEqual([])
  expect(await first.mcp()).toBeUndefined()
  await first.close()
  expect(runtime.activeStateCount).toBe(1)
  await second.close()
  expect(runtime.activeStateCount).toBe(0)
})

it('does not enable companion stores or tools for Discord and correlates lifecycle metadata', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => completion('Discord answer'))
  const { runtime, directory, options, provider } = await setup(fetch)
  const scope = runtime.open({ ...options, channel: 'discord' })
  const events: object[] = []
  runtime.events.on('user.message', event => events.push(event))
  runtime.events.on('assistant.message', event => events.push(event))
  const chat = new Chat('model', provider, directory, undefined, false)
  await scope.send(chat, 'Hi', {})
  expect(events).toHaveLength(2)
  expect(events[0]).toMatchObject({ type: 'user.message', channel: 'discord', sessionId: options.sessionId })
  expect(events[1]).toMatchObject({ type: 'assistant.message', correlationId: (events[0] as { correlationId: string }).correlationId })
  expect(JSON.stringify(events)).not.toContain('Discord answer')
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).tools ?? []).toEqual([])
  expect(await readdir(directory)).toEqual([])
  await scope.close()
  await runtime.close()
  expect(runtime.events.listenerCount).toBe(0)
})

it('closes every recall lifecycle after repeated request/release cycles without retaining sessions or listeners', async () => {
  const { runtime, options, directory, provider } = await setup()
  const start = vi.spyOn(Recall.prototype, 'start')
  const close = vi.spyOn(Recall.prototype, 'close')
  const resources = process.getActiveResourcesInfo().filter(type => ['Timeout', 'FSEventWrap'].includes(type))
  for (let index = 0; index < 40; index++) {
    const scope = runtime.open({ ...options, sessionId: randomUUID() })
    const unsubscribe = runtime.events.on('user.message', () => {})
    await scope.send(new Chat('model', provider, directory), 'Hello', {})
    await scope.close()
    unsubscribe()
    expect(runtime.activeStateCount).toBe(0)
    expect(runtime.events.listenerCount).toBe(0)
  }
  expect(start).toHaveBeenCalledTimes(40)
  expect(close).toHaveBeenCalledTimes(40)
  for (const recall of start.mock.contexts) {
    if (!(recall instanceof Recall))
      throw new Error('Unexpected recall lifecycle owner')
    expect(recall.resourceCounts).toEqual({ indexes: 0, watchers: 0, timers: 0, embeddings: 0 })
  }
  expect(process.getActiveResourcesInfo().filter(type => ['Timeout', 'FSEventWrap'].includes(type)).length).toBeLessThanOrEqual(resources.length)
})

it('bounds simultaneous contexts and cancels active generation before shutdown completes', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    init?.signal?.throwIfAborted()
    return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
  })
  const { runtime, options, directory, provider } = await setup(fetch)
  const scope = runtime.open({ ...options, channel: 'discord' })
  for (let index = 0; index < 7; index++)
    runtime.open({ ...options, sessionId: randomUUID() })
  expect(() => runtime.open({ ...options, sessionId: randomUUID() })).toThrow('limit')
  const sending = scope.send(new Chat('model', provider, directory), 'Wait', {})
  const rejected = expect(sending).rejects.toThrow()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  await runtime.close()
  await rejected
  expect(runtime.activeStateCount).toBe(0)
  expect(() => runtime.open(options)).toThrow('closed')
})

it('shares one reminder timer and one store scheduler across channels and releases adapter destinations separately', async () => {
  vi.useFakeTimers()
  const { runtime, directory } = await setup()
  try {
    const firstOwner = {}
    const secondOwner = {}
    const first = await runtime.reminders(directory, { notify: async () => {} }, () => {}, firstOwner)
    const second = await runtime.reminders(directory, { notify: async () => {} }, () => {}, secondOwner)
    expect(first).toBe(second)
    for (let index = 0; index < 20; index++)
      await runtime.reminders(join(directory, String(index)), { notify: async () => {} }, () => {})
    expect(runtime.reminderRouteCount).toBe(21)
    expect(vi.getTimerCount()).toBe(1)
    await runtime.releaseReminders(directory, firstOwner)
    expect(runtime.reminderRouteCount).toBe(21)
    await runtime.releaseReminders(directory, secondOwner)
    expect(runtime.reminderRouteCount).toBe(20)
    await runtime.close()
    expect(vi.getTimerCount()).toBe(0)
    expect(runtime.resourceCounts).toEqual({ states: 0, listeners: 0, reminderRoutes: 0, reminderTimers: 0 })
  }
  finally {
    vi.useRealTimers()
  }
})

it('emits correlated tool lifecycle metadata without copying arguments or tool results into events', async () => {
  const tool = { id: 'memory-call', type: 'function', function: { name: 'personal_memory', arguments: JSON.stringify({ action: 'remember', id: null, text: 'My name is Lan', source_quote: 'My name is Lan', core: true }) } }
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, ...tool }] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }))
    .mockResolvedValueOnce(completion('Saved'))
  const { runtime, options, directory, provider } = await setup(fetch)
  const scope = runtime.open(options)
  const events: AngelaEvent[] = []
  for (const type of ['user.message', 'assistant.message', 'tool.call', 'tool.result', 'tool.error'] as const)
    runtime.events.on(type, event => events.push(event))
  await scope.send(new Chat('model', provider, directory), 'My name is Lan', {})
  expect(events.map(event => event.type)).toEqual(['user.message', 'tool.call', 'tool.result', 'assistant.message'])
  expect(new Set(events.map(event => event.correlationId)).size).toBe(1)
  expect(events[1]).toMatchObject({ toolCallId: 'memory-call', toolName: 'personal_memory' })
  expect(JSON.stringify(events)).not.toContain('My name is Lan')
  expect((await (await scope.memory()).read()).entries[0]?.text).toBe('My name is Lan')
  await scope.close()
})

it('reports a tool error using metadata and closes the enabled MCP client on release', async () => {
  const tool = { id: 'failed-call', type: 'function', function: { name: 'builtIn_mcpCallTool', arguments: JSON.stringify({ name: 'terminal_exec', arguments: 'invalid JSON payload' }) } }
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, ...tool }] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }))
    .mockResolvedValueOnce(completion('The tool failed'))
  const { runtime, options, directory, provider } = await setup(fetch)
  const client = new Client({ name: 'test', version: '1' })
  const close = vi.spyOn(client, 'close')
  const scope = runtime.open({ ...options, connectMcp: async () => new McpTools(client, async () => false, cliMessages.en) })
  const errors: AngelaEvent[] = []
  runtime.events.on('tool.error', event => errors.push(event))
  await scope.send(new Chat('model', provider, directory), 'Try the tool', {})
  expect(errors).toHaveLength(1)
  expect(errors[0]).toMatchObject({ type: 'tool.error', toolCallId: 'failed-call', sessionId: options.sessionId })
  expect(JSON.stringify(errors)).not.toContain('invalid JSON payload')
  await scope.close()
  expect(close).toHaveBeenCalledOnce()
  expect(scope.options.connectMcp).toBeUndefined()
})
