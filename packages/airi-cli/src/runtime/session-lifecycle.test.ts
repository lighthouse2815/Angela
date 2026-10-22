import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { RuntimeOptions } from './runtime'

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { McpTools } from '../mcp'
import { Recall } from '../recall'
import { AngelaRuntime } from './runtime'

const runtimes: AngelaRuntime[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.close()))
  vi.useRealTimers()
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function completion() {
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Understood.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}
async function setup(options: RuntimeOptions = {}, fetch: typeof globalThis.fetch = async () => completion()) {
  const directory = await mkdtemp(join(tmpdir(), 'angela-warm-session-'))
  directories.push(directory)
  const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://fixture.invalid/v1/', fetch } }) }
  const runtime = new AngelaRuntime('fixture', provider, cliMessages.en, {}, { apiKey: '' }, options)
  runtimes.push(runtime)
  const session = { dataDir: directory, workspace: directory, sessionId: randomUUID(), channel: 'telegram' as const }
  return { runtime, directory, provider, session }
}

it('reuses Recall across messages and emits one logical start until reset or shutdown', async () => {
  const { runtime, session } = await setup()
  const started = vi.fn()
  const ended = vi.fn()
  runtime.events.on('session.started', started)
  runtime.events.on('session.ended', ended)
  const first = await runtime.acquire(session)
  const recall = await first.recall()
  await first.send(await runtime.createChat(session.workspace), 'Choose SQLite for copper release', {})
  await first.close()
  expect(runtime.resourceCounts.warmSessions).toBe(1)
  expect(runtime.resourceCounts.indexes).toBe(1)
  const second = await runtime.acquire(session)
  expect(second).toBe(first)
  expect(await second.recall()).toBe(recall)
  expect((await recall!.search('copper release')).some(hit => hit.kind === 'episodic' && hit.text.includes('copper release'))).toBe(true)
  await second.send(await runtime.createChat(session.workspace), 'Review copper release', {})
  await second.close()
  expect(started).toHaveBeenCalledTimes(1)
  expect(ended).not.toHaveBeenCalled()
  await runtime.reset(session)
  expect(ended).toHaveBeenCalledTimes(1)
  expect(recall?.resourceCounts).toEqual({ indexes: 0, watchers: 0, timers: 0, embeddings: 0 })
  const third = await runtime.acquire(session)
  expect(third).not.toBe(first)
  await third.send(await runtime.createChat(session.workspace), 'Start another release', {})
  await third.close()
  expect(started).toHaveBeenCalledTimes(2)
  await runtime.close()
  expect(ended).toHaveBeenCalledTimes(2)
  expect(Object.values(runtime.resourceCounts).every(count => count === 0)).toBe(true)
})

it('evicts idle sessions on TTL without another acquire and reopens durable episodes', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => completion())
  const { runtime, session, directory } = await setup({ telegramSessions: { idleTtlMs: 1000 } }, fetch)
  const ended = vi.fn()
  runtime.events.on('session.ended', ended)
  const first = await runtime.acquire(session)
  await first.send(await runtime.createChat(directory), 'Choose quartz-lantern architecture for release', {})
  const recall = await first.recall()
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  await first.close()
  expect(runtime.resourceCounts.warmSessions).toBe(1)
  await vi.advanceTimersByTimeAsync(1001)
  expect(runtime.resourceCounts.states).toBe(0)
  expect(runtime.resourceCounts.warmSessions).toBe(0)
  const second = await runtime.acquire(session)
  expect(second).not.toBe(first)
  expect(ended).toHaveBeenCalledTimes(1)
  expect(recall?.resourceCounts.indexes).toBe(0)
  await second.send(await runtime.createChat(directory), 'What was the quartz-lantern architecture?', {})
  expect((await (await second.recall())!.search('quartz lantern architecture')).some(hit => hit.kind === 'episodic' && hit.text.includes('quartz-lantern'))).toBe(true)
  await second.close()
  await runtime.close()
  const restarted = new AngelaRuntime('fixture', runtime.provider, cliMessages.en)
  runtimes.push(restarted)
  const third = await restarted.acquire(session)
  await third.send(await restarted.createChat(directory), 'Recall quartz-lantern architecture', {})
  expect((await (await third.recall())!.search('quartz lantern architecture')).some(hit => hit.kind === 'episodic' && hit.text.includes('quartz-lantern'))).toBe(true)
  await third.close()
})

it('keeps a hard idle bound and evicts the least recently released identity', async () => {
  const { runtime, session } = await setup({ telegramSessions: { maxIdle: 2 } })
  const first = await runtime.acquire(session)
  await first.close()
  const other = { ...session, sessionId: randomUUID() }
  const second = await runtime.acquire(other)
  await second.close()
  const reused = await runtime.acquire(session)
  expect(reused).toBe(first)
  await reused.close()
  const third = await runtime.acquire({ ...session, sessionId: randomUUID() })
  await third.close()
  expect(runtime.resourceCounts.warmSessions).toBe(2)
  expect(runtime.resourceCounts.states).toBe(2)
  expect(() => second.retain()).toThrow()
  expect((await runtime.acquire(session))).toBe(first)
})

it('does not evict an active request on TTL or LRU and permits another user concurrently', async () => {
  const gates: (() => void)[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    await new Promise<void>(resolve => gates.push(resolve))
    return completion()
  })
  const { runtime, session, directory } = await setup({ telegramSessions: { maxIdle: 1, idleTtlMs: 1000 } }, fetch)
  const first = await runtime.acquire(session)
  const second = await runtime.acquire({ ...session, dataDir: join(directory, 'second'), sessionId: randomUUID() })
  const sending = first.send(await runtime.createChat(directory), 'First user request', {})
  const otherSending = second.send(await runtime.createChat(directory), 'Second user request', {})
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  const released = first.close()
  await vi.advanceTimersByTimeAsync(5000)
  const third = await runtime.acquire({ ...session, sessionId: randomUUID() })
  await third.close()
  expect(runtime.activeStateCount).toBe(2)
  expect(runtime.resourceCounts.requests).toBe(2)
  gates[0]!()
  gates[1]!()
  await Promise.all([sending, otherSending, released])
  expect(runtime.resourceCounts.warmSessions).toBe(1)
  await second.close()
  expect(runtime.resourceCounts.warmSessions).toBe(1)
})

it('isolates every cache key dimension and keeps Discord immediate release policy', async () => {
  const { runtime, session, directory } = await setup()
  const first = await runtime.acquire(session)
  await (await first.memory()).remember('User A prefers copper tea', undefined, undefined, { core: true })
  await first.send(await runtime.createChat(directory), 'Choose copper tea architecture for user A', {})
  await first.close()
  for (const options of [
    { ...session, dataDir: join(directory, 'user-b') },
    { ...session, workspace: join(directory, 'workspace-b') },
    { ...session, sessionId: randomUUID() },
    { ...session, channel: 'discord' as const },
  ]) {
    const other = await runtime.acquire(options)
    expect(other).not.toBe(first)
    if (options.dataDir !== directory) {
      expect((await (await other.memory()).read()).entries).toEqual([])
      expect(await (await other.recall())!.search('copper tea architecture')).toEqual([])
    }
    await other.close()
    if (options.channel === 'discord')
      expect(() => other.retain()).toThrow()
  }
  expect((await runtime.acquire(session))).toBe(first)
})

it('closes request MCP and callbacks before warm reuse, including cancellation', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    init?.signal?.throwIfAborted()
    return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
  })
  const { runtime, session, directory } = await setup({}, fetch)
  const client = new Client({ name: 'lifecycle-test', version: '1' })
  const closed = vi.spyOn(client, 'close')
  const connector = vi.fn(async () => new McpTools(client, async () => false, cliMessages.en))
  const first = await runtime.acquire({ ...session, connectMcp: connector, warn: vi.fn() })
  const recall = await first.recall()
  const controller = new AbortController()
  const sending = first.send(await runtime.createChat(directory), 'Wait for cancellation', { abortSignal: controller.signal })
  const rejection = expect(sending).rejects.toThrow()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  controller.abort()
  await rejection
  await first.close()
  expect(closed).toHaveBeenCalledTimes(1)
  expect(first.options.connectMcp).toBeUndefined()
  expect(first.options.warn).toBeUndefined()
  const nextConnector = vi.fn(async () => undefined)
  const next = await runtime.acquire({ ...session, connectMcp: nextConnector })
  expect(next).toBe(first)
  expect(await next.recall()).toBe(recall)
  await next.mcp()
  expect(nextConnector).toHaveBeenCalledTimes(1)
  await next.close()
  expect(runtime.resourceCounts.mcpClients).toBe(0)
})

it('cancels an active request and closes idle and active resources on host shutdown', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    init?.signal?.throwIfAborted()
    return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
  })
  const { runtime, session, directory } = await setup({}, fetch)
  const idle = await runtime.acquire(session)
  const recall = await idle.recall()
  await idle.close()
  const active = await runtime.acquire({ ...session, sessionId: randomUUID() })
  const sending = active.send(await runtime.createChat(directory), 'Wait for shutdown', {})
  const rejection = expect(sending).rejects.toThrow()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  await runtime.close()
  await rejection
  expect(recall?.resourceCounts).toEqual({ indexes: 0, watchers: 0, timers: 0, embeddings: 0 })
  expect(Object.values(runtime.resourceCounts).every(count => count === 0)).toBe(true)
  await active.close()
  expect(Object.values(runtime.resourceCounts).every(count => count === 0)).toBe(true)
})

it('closes every Recall after 100 release and LRU cycles', async () => {
  const { runtime, session } = await setup({ telegramSessions: { maxIdle: 2 } })
  const closed = vi.spyOn(Recall.prototype, 'close')
  for (let i = 0; i < 100; i++) {
    const scope = await runtime.acquire({ ...session, sessionId: randomUUID() })
    await scope.recall()
    await scope.close()
    expect(runtime.resourceCounts.warmSessions).toBeLessThanOrEqual(2)
  }
  expect(closed).toHaveBeenCalledTimes(98)
  await runtime.close()
  expect(closed).toHaveBeenCalledTimes(100)
  expect(Object.values(runtime.resourceCounts).every(count => count === 0)).toBe(true)
})

it('reports observer failures through bounded runtime diagnostics without failing requests', async () => {
  const diagnostic = vi.fn()
  const { runtime, session, directory } = await setup({ observerError: diagnostic })
  runtime.events.on('user.message', () => {
    throw new Error('private-payload-in-observer-error')
  })
  const scope = await runtime.acquire(session)
  await expect(scope.send(await runtime.createChat(directory), 'Choose copper release', {})).resolves.toBeUndefined()
  expect(diagnostic).toHaveBeenCalledExactlyOnceWith({ eventType: 'user.message', failures: 1 })
  expect(runtime.events.diagnostics.failures).toBe(1)
  expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private')
  await scope.close()
})

it('keeps the eight active-context limit independent of a full idle cache', async () => {
  const { runtime, session } = await setup({ telegramSessions: { maxIdle: 16 } })
  for (let i = 0; i < 16; i++) {
    const scope = await runtime.acquire({ ...session, sessionId: randomUUID() })
    await scope.close()
  }
  expect(runtime.resourceCounts.warmSessions).toBe(16)
  expect(runtime.activeStateCount).toBe(0)
  for (let i = 0; i < 8; i++)
    await runtime.acquire({ ...session, sessionId: randomUUID() })
  expect(runtime.activeStateCount).toBe(8)
  expect(runtime.resourceCounts.states).toBe(24)
  await expect(runtime.acquire({ ...session, sessionId: randomUUID() })).rejects.toThrow('limit')
  await runtime.close()
  expect(Object.values(runtime.resourceCounts).every(count => count === 0)).toBe(true)
})

it('awaits retirement of the same key while another user can acquire concurrently', async () => {
  const { runtime, session } = await setup()
  const first = await runtime.acquire(session)
  await first.recall()
  await first.close()
  const gate = Promise.withResolvers<void>()
  const original = Recall.prototype.close
  const close = vi.spyOn(Recall.prototype, 'close').mockImplementation(async function (this: Recall) {
    await gate.promise
    await original.call(this)
  })
  const resetting = runtime.reset(session)
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  let resolved = false
  const acquiring = runtime.acquire(session).then((scope) => {
    resolved = true
    return scope
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(resolved).toBe(false)
  expect(runtime.resourceCounts.retiringSessions).toBe(1)
  const other = await runtime.acquire({ ...session, sessionId: randomUUID() })
  await other.close()
  gate.resolve()
  await resetting
  const second = await acquiring
  expect(second).not.toBe(first)
  expect(runtime.resourceCounts.retiringSessions).toBe(0)
  await second.close()
})

it('does not start an already cancelled first request and starts the next request exactly once', async () => {
  const { runtime, session, directory } = await setup()
  const started = vi.fn()
  const ended = vi.fn()
  runtime.events.on('session.started', started)
  runtime.events.on('session.ended', ended)
  const scope = await runtime.acquire(session)
  await expect(scope.send(await runtime.createChat(directory), 'Already cancelled', { abortSignal: AbortSignal.abort() })).rejects.toThrow()
  expect(started).not.toHaveBeenCalled()
  await scope.close()
  const next = await runtime.acquire(session)
  await next.send(await runtime.createChat(directory), 'Choose copper release', {})
  await next.close()
  expect(started).toHaveBeenCalledTimes(1)
  expect(ended).not.toHaveBeenCalled()
  await runtime.close()
  expect(ended).toHaveBeenCalledTimes(1)
})
