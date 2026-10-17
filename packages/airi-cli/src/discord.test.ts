import type { DiscordAdapterConfig } from '@proj-airi/discord-bot'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
