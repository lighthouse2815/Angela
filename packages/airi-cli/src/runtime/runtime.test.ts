import type { GenerationProvider } from '@proj-airi/provider-inference'

import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { Chat } from '../chat'
import { Recall } from '../recall'
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
