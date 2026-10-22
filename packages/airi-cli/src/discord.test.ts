import type { DiscordAdapterConfig } from '@proj-airi/discord-bot'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chatMessagesToTurns } from '@proj-airi/core-agent'
import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { DiscordChat } from './discord'
import { Sessions } from './sessions'

const directories: string[] = []
const hosts: DiscordChat[] = []
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.close()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function completion(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}

function input(text: string, channelId = 'room', voice = false): Parameters<NonNullable<DiscordAdapterConfig['respond']>>[0] {
  return {
    text,
    overrides: { messagePrefix: 'Alice: ' },
    discord: {
      guildId: 'guild',
      channelId,
      guildMember: { id: 'alice', displayName: 'Alice', nickname: 'Alice' },
      ...(voice ? { voiceRequestId: '8a759a69-ebd8-4842-80e3-d4d8adc98270' } : {}),
    },
  }
}

async function setup(fetch: typeof globalThis.fetch) {
  const directory = await mkdtemp(join(tmpdir(), 'angela-discord-cli-'))
  directories.push(directory)
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', apiKey: 'test-only-secret', fetch } }),
  }
  const sessions = new Sessions(directory, cliMessages.vi)
  const host = new DiscordChat(provider, 'test-model', sessions, directory, cliMessages.vi)
  hosts.push(host)
  return { host, directory, sessions, provider }
}

it('serializes a channel, restores history after restart, and isolates other channels and voice sessions', async () => {
  const bodies: string[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    bodies.push(String(init?.body))
    return completion(`Answer ${bodies.length}`)
  })
  const { host, directory, sessions, provider } = await setup(fetch)
  const signal = new AbortController().signal
  const first = host.respond(input('First'), signal)
  const second = host.respond(input('Second'), signal)
  expect(await first).toBe('Answer 1')
  expect(await second).toBe('Answer 2')
  expect(bodies[1]).toContain('Alice: First')
  expect(bodies[1]).toContain('Answer 1')
  expect(JSON.parse(bodies[0]).tools ?? []).toEqual([])
  await host.respond(input('Other channel', 'other'), signal)
  expect(bodies[2]).not.toContain('Alice: First')
  await host.respond(input('Voice', 'room', true), signal)
  expect(bodies[3]).not.toContain('Alice: First')
  await host.close()
  const restarted = new DiscordChat(provider, 'test-model', sessions, directory, cliMessages.vi)
  hosts.push(restarted)
  await restarted.respond(input('After restart'), signal)
  expect(bodies[4]).toContain('Alice: Second')
  expect(bodies[4]).not.toContain('Other channel')
  const records = await sessions.list()
  expect(records).toHaveLength(3)
  expect(records.every(record => !record.interrupted)).toBe(true)
  expect(JSON.stringify(await Promise.all(records.map(record => sessions.read(record.id))))).not.toContain('test-only-secret')
  expect((await readdir(directory)).some(file => file.endsWith('.lock'))).toBe(false)
})

it('cancels interrupted voice generations, preserves their state, and releases the channel for the next request', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    await new Promise<void>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })
    return completion('Unreachable')
  })
  const { host, sessions, directory } = await setup(fetch)
  const controller = new AbortController()
  const pending = host.respond(input('Interrupt', 'room', true), controller.signal)
  const rejected = expect(pending).rejects.toThrow()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  controller.abort()
  await rejected
  const [record] = await sessions.list()
  expect(record.interrupted).toBe(true)
  expect((await readdir(directory)).some(file => file.endsWith('.lock'))).toBe(false)
  fetch.mockResolvedValueOnce(completion('Recovered'))
  expect(await host.respond(input('Continue', 'room', true), new AbortController().signal)).toBe('Recovered')
})

it('describes Discord voice capabilities without claiming that the call is text-only', async () => {
  const bodies: string[] = []
  const { host } = await setup(async (_url, init) => {
    bodies.push(String(init?.body))
    return completion('Em nghe đây.')
  })
  const signal = new AbortController().signal
  await host.respond(input('Em có vào call được không?'), signal)
  await host.respond(input('Em nghe anh không?', 'room', true), signal)
  expect(bodies[0]).toContain('/summon')
  expect(bodies[0]).not.toContain('This is text-only chat')
  expect(bodies[1]).toContain('You are in a Discord voice call')
  expect(bodies[1]).toContain('speech recognition can contain mistakes')
  expect(bodies[1]).toContain('plain text')
  expect(bodies[1]).not.toContain('This is text-only chat')
  expect(bodies[1]).toContain('No tools or filesystem access are available')
})

// The configured gateway returned a Google service diagnostic as successful assistant text during a live Discord call.
it('rejects a gateway diagnostic without delivering or storing it as an assistant reply', async () => {
  const diagnostic = 'The prompt could not be submitted. The prompt contains sensitive words that violate Google\'s [Generative AI Prohibited Use policy](https://policies.google.com/terms/generative-ai/use-policy). Try rephrasing the prompt.'
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(completion(diagnostic))
    .mockResolvedValueOnce(completion('Em vẫn đang nghe.'))
  const { host, sessions } = await setup(fetch)
  const signal = new AbortController().signal
  await expect(host.respond(input('Cảm ơn các bạn.', 'room', true), signal)).rejects.toThrow(cliMessages.vi.discordFailed)
  const [failed] = await sessions.list()
  expect(failed.interrupted).toBe(true)
  expect((await sessions.read(failed.id)).messages.filter(message => message.role === 'assistant')).toEqual([])
  expect(await host.respond(input('Ổn chứ?', 'room', true), signal)).toBe('Em vẫn đang nghe.')
  expect(String(fetch.mock.calls[1][1]?.body)).not.toContain(diagnostic)
})

it('excludes previously saved gateway diagnostics from requests while preserving the stored history', async () => {
  const bodies: string[] = []
  const { host, directory, sessions } = await setup(async (_url, init) => {
    bodies.push(String(init?.body))
    return completion('Em nghe đây.')
  })
  const signal = new AbortController().signal
  await host.respond(input('Xin chào', 'room', true), signal)
  const [record] = await sessions.list()
  const session = await sessions.open(directory, record.id)
  const diagnostic = 'The prompt could not be submitted. https://policies.google.com/terms/generative-ai/use-policy'
  try {
    await session.save({ turns: chatMessagesToTurns([...session.record.messages, { role: 'user', content: 'Cảm ơn các bạn.' }, { role: 'assistant', content: diagnostic }]) }, false)
  }
  finally {
    await session.close()
  }
  await host.respond(input('Em nghe anh không?', 'room', true), signal)
  expect(bodies[1]).not.toContain(diagnostic)
  expect(bodies[1]).toContain('Cảm ơn các bạn.')
  expect((await sessions.read(record.id)).messages).toContainEqual({ role: 'assistant', content: diagnostic })
})

it('bounds each channel queue and cancels active and queued requests during shutdown', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    await new Promise<void>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })
    return completion('Unreachable')
  })
  const { host, directory } = await setup(fetch)
  const requests = Array.from({ length: 4 }, (_, index) => host.respond(input(`Request ${index}`), new AbortController().signal))
  const settled = Promise.allSettled(requests)
  await expect(host.respond(input('Overflow'), new AbortController().signal)).rejects.toThrow(cliMessages.vi.discordBusy)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  await host.close()
  expect((await settled).every(result => result.status === 'rejected')).toBe(true)
  expect(fetch).toHaveBeenCalledOnce()
  expect((await readdir(directory)).some(file => file.endsWith('.lock'))).toBe(false)
})

it('bounds independent channels and releases all active runtime contexts when the host closes', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    init?.signal?.throwIfAborted()
    return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
  })
  const { host, directory } = await setup(fetch)
  const requests = Array.from({ length: 8 }, (_, index) => host.respond(input('Wait', `room-${index}`), new AbortController().signal))
  const settled = Promise.allSettled(requests)
  await expect(host.respond(input('Overflow', 'room-9'), new AbortController().signal)).rejects.toThrow(cliMessages.vi.discordBusy)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(8))
  await host.close()
  expect((await settled).every(result => result.status === 'rejected')).toBe(true)
  expect((await readdir(directory)).some(file => file.endsWith('.lock'))).toBe(false)
})
