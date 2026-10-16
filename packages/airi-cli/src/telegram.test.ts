import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Update } from 'grammy/types'

import { once } from 'node:events'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
import { Bot } from 'grammy'
import { afterEach, expect, it, vi } from 'vitest'

import { Sessions } from './sessions'
import { TelegramChat } from './telegram'

const hosts: TelegramChat[] = []
const directories: string[] = []
const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.close()))
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function completion(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}

async function connect(fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => completion('Xin chào')), existingDirectory?: string) {
  const directory = existingDirectory ?? await mkdtemp(join(tmpdir(), 'angela-telegram-test-'))
  if (!existingDirectory)
    directories.push(directory)
  const calls: { method: string, payload: object }[] = []
  const reply = vi.fn(async (text: string) => text)
  // A local API server exercises grammY's actual HTTP, command, and authorization boundaries.
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request)
      body += chunk
    const method = request.url?.split('/').at(-1) ?? ''
    const payload = JSON.parse(body || '{}')
    if (method !== 'getMe')
      calls.push({ method, payload })
    if (method === 'sendMessage' && 'text' in payload)
      await reply(String(payload.text))
    const result = method === 'getMe'
      ? { id: 42, is_bot: true, first_name: 'Angela', username: 'angela_test_bot' }
      : method === 'sendMessage' ? { message_id: calls.length, date: 1, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } : true
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ ok: true, result }))
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing Telegram API port')
  const bot = new Bot('42:test-only-token', { client: { apiRoot: `http://127.0.0.1:${address.port}` } })
  await bot.init()
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch } }),
  }
  const host = new TelegramChat(bot, provider, 'test-model', new Sessions(directory, cliMessages.vi), directory, cliMessages.vi, new Set([100, 200]))
  hosts.push(host)
  let updateId = 0
  async function message(text: string, id = 100, group = false) {
    const command = text.startsWith('/') ? text.split(' ')[0] : undefined
    const update: Update = {
      update_id: ++updateId,
      message: {
        message_id: updateId,
        date: 1,
        chat: group ? { id: -1, type: 'group', title: 'Group' } : { id, type: 'private', first_name: 'User' },
        from: { id, is_bot: false, first_name: 'User' },
        text,
        ...(command ? { entities: [{ type: 'bot_command' as const, offset: 0, length: command.length }] } : {}),
      },
    }
    await bot.handleUpdate(update)
  }
  return { host, message, fetch, directory, calls, reply }
}

it('ignores unauthorized senders and groups before any API call or session write', async () => {
  const { message, calls, fetch, directory } = await connect()
  await message('/start', 999)
  await message('Read my files', 999)
  await message('/start', 100, true)
  expect(calls).toEqual([])
  expect(fetch).not.toHaveBeenCalled()
  expect(await readdir(directory)).toEqual([])
})

it('restores each private chat separately after restart and never exposes terminal tools', async () => {
  const first = await connect()
  await first.message('Remember my name')
  await vi.waitFor(() => expect(first.reply).toHaveBeenCalledWith('Xin chào'))
  await first.host.close()
  const next = await connect(undefined, first.directory)
  await next.message('What did I say?')
  await vi.waitFor(() => expect(next.reply).toHaveBeenCalledWith('Xin chào'))
  const request = JSON.parse(String(next.fetch.mock.calls[0][1]?.body))
  expect(request.messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'Remember my name' })]))
  expect(request.tools ?? []).toEqual([])
  expect(JSON.stringify(request.messages[0])).toContain('No tools or filesystem access')
  await next.message('Another private chat', 200)
  await vi.waitFor(() => expect(next.fetch).toHaveBeenCalledTimes(2))
  expect(String(next.fetch.mock.calls[1][1]?.body)).not.toContain('Remember my name')
  await next.host.close()
  const files = await readdir(first.directory)
  expect(files.filter(file => file.endsWith('.json'))).toHaveLength(2)
  expect(files.some(file => file.endsWith('.lock'))).toBe(false)
})

it('allows local help and status without a model request, and resets only the selected chat', async () => {
  const { message, reply, fetch, host } = await connect()
  await message('/start')
  await message('/status')
  await message('/permistion full')
  expect(fetch).not.toHaveBeenCalled()
  expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramWelcome)
  await message('Old conversation')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith('Xin chào'))
  await message('/new')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramNew))
  await message('Fresh question')
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(String(fetch.mock.calls[1][1]?.body)).not.toContain('Old conversation')
  await host.close()
})

it('keeps polling responsive to busy and cancel commands, and releases the session lock', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => await new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
  }))
  const { message, reply, host, directory } = await connect(fetch)
  await message('Wait forever')
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  await message('Second request')
  expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramBusy)
  await message('/cancel')
  expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramCancelled)
  await host.close()
  const files = await readdir(directory)
  expect(files.some(file => file.endsWith('.lock'))).toBe(false)
  const record = JSON.parse(await readFile(join(directory, files.find(file => file.endsWith('.json'))!), 'utf8'))
  expect(record.interrupted).toBe(true)
})

it('splits long Unicode replies without corrupting characters or enabling Telegram formatting', async () => {
  const text = '😀'.repeat(4500)
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(completion(text))
  const { message, reply, calls, host } = await connect(fetch)
  await message('Long answer')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(3))
  expect(reply.mock.calls.map(call => call[0]).join('')).toBe(text)
  expect(reply.mock.calls.every(call => call[0].length <= 4096)).toBe(true)
  expect(calls.filter(call => call.method === 'sendMessage').every(call => !('parse_mode' in call.payload))).toBe(true)
  await host.close()
})

it('returns a readable failure without exposing provider diagnostics', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'private-provider-secret' } }), { status: 401 }))
  const { message, reply, host } = await connect(fetch)
  await message('Hello')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramRequestFailed))
  expect(JSON.stringify(reply.mock.calls)).not.toContain('private-provider-secret')
  await host.close()
})
