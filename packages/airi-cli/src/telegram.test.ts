import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Update } from 'grammy/types'

import { once } from 'node:events'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { cliMessages } from '@proj-airi/i18n/cli'
import { Bot } from 'grammy'
import { afterEach, expect, it, vi } from 'vitest'

import { McpTools } from './mcp'
import { Memory } from './memory'
import { AngelaRuntime } from './runtime/runtime'
import { Sessions } from './sessions'
import { Tasks } from './tasks'
import { TelegramChat } from './telegram'

const hosts: TelegramChat[] = []
const directories: string[] = []
const toolServers: Server[] = []
const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.close()))
  await Promise.all(toolServers.splice(0).map(server => server.close()))
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function completion(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}

async function connect(fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => completion('Xin chào')), existingDirectory?: string, sharedUserId?: number, users: ReadonlySet<number> = new Set([100, 200]), runtime?: AngelaRuntime) {
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
    if (method === 'sendMessage' && 'text' in payload) {
      try {
        await reply(String(payload.text))
      }
      catch {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error_code: 400, description: 'Test delivery failed' }))
        return
      }
    }
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
  const invoke = vi.fn<(name: string, args?: Record<string, unknown>) => CallToolResult>(() => ({ content: [{ type: 'text', text: 'tool-result-marker' }] }))
  const connectTools = vi.fn(async (_id: string, confirm: ConstructorParameters<typeof McpTools>[1], signal: AbortSignal) => {
    const server = new Server({ name: 'test-tools', version: '1' }, { capabilities: { tools: {} } })
    toolServers.push(server)
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'terminal_exec', inputSchema: { type: 'object' as const, properties: { command: { type: 'string' } } } }] }))
    server.setRequestHandler(CallToolRequestSchema, async request => invoke(request.params.name, request.params.arguments))
    const client = new Client({ name: 'test-telegram', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
    const tools = new McpTools(client, confirm, cliMessages.vi, directory)
    await tools.discover(signal)
    return tools
  })
  const host = new TelegramChat(bot, provider, 'test-model', new Sessions(directory, cliMessages.vi), directory, cliMessages.vi, users, connectTools, { dataDir: directory, env: {}, locale: 'vi', apiKey: '', sharedUserId }, runtime)
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
  async function callback(data: string, id = 100) {
    await bot.handleUpdate({
      update_id: ++updateId,
      callback_query: {
        id: `callback-${updateId}`,
        chat_instance: 'test-instance',
        data,
        from: { id, is_bot: false, first_name: 'User' },
        message: { message_id: 10, date: 1, chat: { id, type: 'private', first_name: 'User' }, text: 'Approval' },
      },
    })
  }
  function approval() {
    const request = calls.findLast(call => call.method === 'sendMessage' && 'reply_markup' in call.payload)
    if (!request)
      throw new Error('Missing approval request')
    const payload = request.payload as { reply_markup: { inline_keyboard: { callback_data: string }[][] } }
    return payload.reply_markup.inline_keyboard[0][0].callback_data
  }
  const idle = async () => await vi.waitFor(async () => {
    expect((await readdir(directory)).some(file => file.endsWith('.lock'))).toBe(false)
  })
  return { host, message, callback, approval, fetch, directory, calls, reply, invoke, connectTools, idle }
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

it('restores each private chat separately after restart and connects isolated terminal tools', async () => {
  const first = await connect()
  await first.message('Remember my name')
  await vi.waitFor(() => expect(first.reply).toHaveBeenCalledWith('Xin chào'))
  await first.message('/permission full')
  await first.host.close()
  const next = await connect(undefined, first.directory)
  await next.message('/permission')
  expect(next.reply.mock.calls.at(-1)?.[0]).toContain(cliMessages.vi.permissionAsk)
  await next.message('What did I say?')
  await vi.waitFor(() => expect(next.reply).toHaveBeenCalledWith('Xin chào'), { timeout: 5000 })
  const request = JSON.parse(String(next.fetch.mock.calls[0][1]?.body))
  expect(request.messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'Remember my name' })]))
  expect(request.tools).toEqual(expect.arrayContaining([expect.objectContaining({ function: expect.objectContaining({ name: 'builtIn_mcpCallTool' }) })]))
  expect(JSON.stringify(request.messages[0])).not.toContain('No tools or filesystem access')
  await next.message('Another private chat', 200)
  await vi.waitFor(() => expect(next.fetch).toHaveBeenCalledTimes(2))
  expect(String(next.fetch.mock.calls[1][1]?.body)).not.toContain('Remember my name')
  await next.host.close()
  const files = await readdir(first.directory)
  expect(files.filter(file => file.endsWith('.json'))).toHaveLength(2)
  expect(files.some(file => file.endsWith('.lock'))).toBe(false)
})

it('allows local help and status without a model request, and resets only the selected chat', async () => {
  const { message, reply, fetch, host, idle } = await connect()
  await message('/start')
  await message('/help')
  await message('/status')
  await message('/permistion full')
  expect(fetch).not.toHaveBeenCalled()
  expect(reply).toHaveBeenCalledWith(expect.stringContaining(cliMessages.vi.telegramWelcome))
  expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramCommands)
  await message('Old conversation')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith('Xin chào'))
  await idle()
  await idle()
  await message('/new')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramNew))
  await idle()
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
  expect(host.stateCounts.deadlineTimers).toBe(0)
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
  await vi.waitFor(() => expect(reply.mock.calls.filter(call => call[0].startsWith('😀'))).toHaveLength(3))
  expect(reply.mock.calls.filter(call => call[0].startsWith('😀')).map(call => call[0]).join('')).toBe(text)
  expect(reply.mock.calls.every(call => call[0].length <= 4096)).toBe(true)
  expect(calls.filter(call => call.method === 'sendMessage').every(call => !('parse_mode' in call.payload))).toBe(true)
  await host.close()
})

it('returns a readable failure without exposing provider diagnostics', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'private-provider-secret' } }), { status: 401 }))
  const { message, reply, host } = await connect(fetch)
  await message('Hello')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(expect.stringContaining('HTTP 401')))
  expect(JSON.stringify(reply.mock.calls)).not.toContain('private-provider-secret')
  await host.close()
})

function toolCompletion(command = 'pwd') {
  const call = {
    index: 0,
    id: 'call-terminal',
    type: 'function',
    function: { name: 'builtIn_mcpCallTool', arguments: JSON.stringify({ name: 'terminal_exec', arguments: JSON.stringify({ command }) }) },
  }
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}

it.each([true, false])('runs a tool only after the matching Telegram approval: %s', async (approved) => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(toolCompletion())
    .mockResolvedValueOnce(completion('Finished'))
  const { message, callback, approval, reply, invoke, directory, calls, host } = await connect(fetch)
  const fullResult = `${'output line\n'.repeat(100)}full-result-marker`
  invoke.mockReturnValue({ content: [{ type: 'text', text: fullResult }] })
  await message('Run pwd')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramApproval))
  expect(invoke).not.toHaveBeenCalled()
  expect(reply).toHaveBeenCalledWith(expect.stringContaining(`cwd: ${directory}`))
  const data = approval()
  await callback(data, 999)
  await callback(data, 200)
  expect(invoke).not.toHaveBeenCalled()
  await callback(data.replace(':yes', approved ? ':yes' : ':no'))
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith('Finished'))
  expect(invoke).toHaveBeenCalledTimes(approved ? 1 : 0)
  const body = JSON.parse(String(fetch.mock.calls[1][1]?.body))
  expect(JSON.stringify(body)).toContain(approved ? 'full-result-marker' : cliMessages.vi.approvalDenied)
  if (approved) {
    expect(invoke).toHaveBeenCalledWith('terminal_exec', { command: 'pwd', cwd: directory })
    await vi.waitFor(() => expect(JSON.stringify(calls)).toContain(cliMessages.vi.outputShortened))
    expect(JSON.stringify(calls)).not.toContain('full-result-marker')
  }
  await callback(data)
  expect(invoke).toHaveBeenCalledTimes(approved ? 1 : 0)
  expect(calls.some(call => call.method === 'editMessageReplyMarkup')).toBe(true)
  await host.close()
})

it('requires a fresh confirmation for a pending server action and rejects replayed buttons', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(toolCompletion()).mockResolvedValueOnce(completion('Finished'))
  const { message, callback, approval, reply, invoke, host } = await connect(fetch)
  invoke.mockReturnValueOnce({ content: [], structuredContent: { status: 'approval_required', pendingActionId: 'server-pending', action: { kind: 'terminal_exec', input: { command: 'pwd' } } } })
  await message('Run pwd')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramApproval))
  const first = approval()
  await callback(first)
  await vi.waitFor(() => expect(approval()).not.toBe(first))
  const second = approval()
  await callback(first)
  expect(invoke).toHaveBeenCalledOnce()
  await callback(second.replace(':yes', ':no'))
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith('Finished'))
  expect(invoke.mock.calls[1]).toEqual(['desktop_reject_pending_action', { id: 'server-pending' }])
  await host.close()
})

it('isolates full access by chat, resolves a waiting approval, and resets access with a new conversation', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => completion('Finished'))
  const { message, reply, invoke, host, connectTools, idle } = await connect(fetch)
  fetch.mockResolvedValueOnce(toolCompletion())
  await message('Run pwd')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramApproval))
  await message('/permistion full', 999)
  expect(invoke).not.toHaveBeenCalled()
  await message('/permission full')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith('Finished'))
  expect(invoke).toHaveBeenCalledOnce()
  fetch.mockResolvedValueOnce(toolCompletion())
  invoke.mockReturnValueOnce({ content: [], structuredContent: { status: 'approval_required', pendingActionId: 'full-pending' } })
  await message('Run it again')
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(3))
  expect(invoke.mock.calls[2]).toEqual(['desktop_approve_pending_action', { id: 'full-pending' }])
  await vi.waitFor(() => expect(reply.mock.calls.filter(call => call[0] === 'Finished')).toHaveLength(2))
  expect(connectTools).toHaveBeenCalledTimes(2)
  await message('/permistion', 200)
  expect(reply.mock.calls.at(-1)?.[0]).toContain(cliMessages.vi.permissionAsk)
  await idle()
  await message('/new')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramNew))
  await message('/permistion')
  expect(reply.mock.calls.at(-1)?.[0]).toContain(cliMessages.vi.permissionAsk)
  await host.close()
})

it('cancels approval waits without executing and ignores their buttons after cancellation', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(toolCompletion())
  const { message, callback, approval, reply, invoke, host, directory } = await connect(fetch)
  await message('Run pwd')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramApproval))
  const data = approval()
  await message('/cancel')
  await callback(data)
  expect(invoke).not.toHaveBeenCalled()
  expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramCancelled)
  expect((await readdir(directory)).some(file => file.endsWith('.lock'))).toBe(false)
  await host.close()
})

it('runs a Telegram-requested command through the built-in stdio service in the selected workspace', async () => {
  const command = 'test -z "$ANGELA_API_KEY" && test -z "$ANGELA_TELEGRAM_BOT_TOKEN" && printf "provider= bot=\\n" && pwd && printf "created-by-telegram" > tool-proof.txt'
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(toolCompletion(command)).mockResolvedValueOnce(completion('Verified'))
  const { message, reply, directory, host, connectTools } = await connect(fetch)
  connectTools.mockImplementation(async (id, confirm, signal) => await McpTools.connect(
    { computerUse: true, mcpArgs: [] },
    directory,
    join(directory, 'audit', id),
    confirm,
    cliMessages.vi,
    { ANGELA_API_KEY: 'test-provider-secret', ANGELA_TELEGRAM_BOT_TOKEN: 'test-bot-secret' },
    signal,
  ))
  await message('/permission full')
  await message('Run pwd')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith('Verified'), { timeout: 15_000 })
  expect(String(fetch.mock.calls[1][1]?.body)).toContain(directory)
  expect(String(fetch.mock.calls[1][1]?.body)).toContain('provider= bot=')
  expect(await readFile(join(directory, 'tool-proof.txt'), 'utf8')).toBe('created-by-telegram')
  expect(JSON.stringify(reply.mock.calls)).not.toContain('test-provider-secret')
  await host.close()
}, 20_000)

it('reports saved progress during approval without another generation and keeps chats isolated', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(toolCompletion()).mockResolvedValueOnce(completion('Finished'))
  const { message, reply, callback, approval, invoke, host } = await connect(fetch)
  await message('Run pwd')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramApproval))
  await message('việc lúc nãy đến đâu rồi?')
  expect(reply.mock.calls.at(-1)?.[0]).toContain(cliMessages.vi.telegramJobStates.awaiting_approval)
  expect(reply.mock.calls.at(-1)?.[0]).toContain('Run pwd')
  expect(reply.mock.calls.at(-1)?.[0]).toContain('terminal_exec')
  expect(fetch).toHaveBeenCalledOnce()
  expect(invoke).not.toHaveBeenCalled()
  await message('/status', 200)
  expect(reply.mock.calls.at(-1)?.[0]).not.toContain('Run pwd')
  await callback(approval())
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith('Finished'))
  await host.close()
})

it('restores the latest reply after restart without a model or tool call and clears it on /new', async () => {
  const first = await connect()
  await first.message('Remember this request')
  await vi.waitFor(() => expect(first.reply).toHaveBeenCalledWith('Xin chào'))
  await first.host.close()
  const next = await connect(undefined, first.directory)
  await next.message('/status')
  expect(next.reply.mock.calls.at(-1)?.[0]).toContain('Remember this request')
  expect(next.reply.mock.calls.at(-1)?.[0]).toContain(cliMessages.vi.telegramJobStates.delivered)
  await next.message('/result')
  expect(next.reply.mock.calls.at(-1)?.[0]).toBe('Xin chào')
  await next.message('/result', 200)
  expect(next.reply.mock.calls.at(-1)?.[0]).toBe(cliMessages.vi.telegramNoResult)
  expect(next.fetch).not.toHaveBeenCalled()
  expect(next.connectTools).not.toHaveBeenCalled()
  await next.message('/new')
  await vi.waitFor(() => expect(next.reply).toHaveBeenCalledWith(cliMessages.vi.telegramNew))
  await next.host.close()
  const cleared = await connect(undefined, first.directory)
  await cleared.message('/result')
  expect(cleared.reply.mock.calls.at(-1)?.[0]).toBe(cliMessages.vi.telegramNoResult)
})

it('retains a failed Telegram delivery for /result without repeating the tool action', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(toolCompletion()).mockResolvedValueOnce(completion('Saved result'))
  const { message, reply, callback, approval, invoke, host } = await connect(fetch)
  reply.mockImplementation(async (text) => {
    if (text === 'Saved result')
      throw new Error('Offline')
    return text
  })
  await message('Run pwd once')
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramApproval))
  await callback(approval())
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(cliMessages.vi.telegramDeliveryFailed))
  await message('/status')
  expect(reply.mock.calls.at(-1)?.[0]).toContain(cliMessages.vi.telegramJobStates.delivery_failed)
  reply.mockImplementation(async text => text)
  await message('/result')
  expect(reply.mock.calls.at(-1)?.[0]).toBe('Saved result')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(invoke).toHaveBeenCalledOnce()
  await host.close()
})

it('continues an interrupted request after inspecting a real side effect and requires fresh approval', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(toolCompletion('printf "effect" >> recovery-proof.txt'))
    .mockImplementation(async (_url, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
  const first = await connect(fetch)
  const attach = (connection: Awaited<ReturnType<typeof connect>>) => {
    connection.connectTools.mockImplementation(async (id, confirm, signal) => await McpTools.connect(
      { computerUse: true, mcpArgs: [] },
      connection.directory,
      join(connection.directory, 'audit', id),
      confirm,
      cliMessages.vi,
      {},
      signal,
    ))
  }
  attach(first)
  await first.message('/permission full')
  await first.message('Write the proof once and report its contents')
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), { timeout: 15_000 })
  expect(await readFile(join(first.directory, 'recovery-proof.txt'), 'utf8')).toBe('effect')
  await first.host.close()
  const nextFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(toolCompletion('cat recovery-proof.txt')).mockResolvedValueOnce(completion('Recovered: effect'))
  const next = await connect(nextFetch, first.directory)
  attach(next)
  await next.message('/status')
  expect(next.reply.mock.calls.at(-1)?.[0]).toContain(cliMessages.vi.telegramJobStates.interrupted)
  expect(next.reply.mock.calls.at(-1)?.[0]).toContain(cliMessages.vi.telegramResumeHint)
  expect(nextFetch).not.toHaveBeenCalled()
  await next.message('/permission full')
  await next.message('tiếp tục việc lúc nãy')
  await vi.waitFor(() => expect(next.reply).toHaveBeenCalledWith(cliMessages.vi.telegramApproval), { timeout: 15_000 })
  await next.message('/permission')
  expect(next.reply.mock.calls.at(-1)?.[0]).toContain(cliMessages.vi.permissionAsk)
  await next.message('/resume')
  expect(next.reply.mock.calls.at(-1)?.[0]).toBe(cliMessages.vi.telegramBusy)
  expect(nextFetch).toHaveBeenCalledOnce()
  const request = String(nextFetch.mock.calls[0][1]?.body)
  expect(request).toContain('Write the proof once and report its contents')
  expect(request).toContain('Before repeating an action, inspect the current workspace')
  expect(request).toContain('printf')
  const approval = next.approval()
  await next.callback(approval)
  await vi.waitFor(() => expect(next.approval()).not.toBe(approval))
  await next.callback(next.approval())
  await vi.waitFor(() => expect(next.reply).toHaveBeenCalledWith('Recovered: effect'), { timeout: 15_000 })
  expect(await readFile(join(first.directory, 'recovery-proof.txt'), 'utf8')).toBe('effect')
  expect(String(nextFetch.mock.calls[1][1]?.body)).toContain('effect')
  await next.host.close()
}, 40_000)

it('does not resume empty, completed, or other-chat requests', async () => {
  const first = await connect()
  await first.message('/resume', 999)
  await first.message('/resume')
  await vi.waitFor(() => expect(first.reply).toHaveBeenCalledWith(cliMessages.vi.telegramCannotResume))
  expect(first.fetch).not.toHaveBeenCalled()
  await first.host.close()
  const active = await connect(undefined, first.directory)
  await active.message('Answer once')
  await vi.waitFor(() => expect(active.reply).toHaveBeenCalledWith('Xin chào'), { timeout: 5000 })
  await active.host.close()
  const restarted = await connect(undefined, first.directory)
  await restarted.message('/resume')
  await vi.waitFor(() => expect(restarted.reply).toHaveBeenCalledWith(cliMessages.vi.telegramCannotResume))
  await restarted.message('/resume', 200)
  expect(restarted.fetch).not.toHaveBeenCalled()
  expect(restarted.connectTools).not.toHaveBeenCalled()
}, 15_000)

function companionCompletion(name: string, input: object) {
  const delta = { role: 'assistant', tool_calls: [{ index: 0, id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(input) } }] }
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}

it('saves conversational tasks and facts through Telegram tools and recalls facts after restart without crossing users', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(companionCompletion('personal_memory', { action: 'remember', id: null, text: 'Tôi tên là Lan', source_quote: 'Tôi tên là Lan', core: true }))
    .mockResolvedValueOnce(companionCompletion('task_create', { title: 'Học tiếng Trung', type: 'todo' }))
    .mockResolvedValueOnce(completion('Đã lưu'))
  const first = await connect(fetch)
  await first.message('Tôi tên là Lan. Thêm việc học tiếng Trung vào danh sách.')
  await vi.waitFor(() => expect(first.reply).toHaveBeenCalledWith('Đã lưu'), { timeout: 5000 })
  await first.idle()
  const data = join(first.directory, 'telegram', 'companions', '42', '100')
  expect((await new Memory(data, cliMessages.vi).read()).entries[0]?.text).toBe('Tôi tên là Lan')
  expect((await new Tasks(data, cliMessages.vi.tasks).list())[0]?.title).toBe('Học tiếng Trung')
  expect(String(fetch.mock.calls[0][1]?.body)).toContain('task_create')
  expect(String(fetch.mock.calls[0][1]?.body)).toContain('memory_search')
  expect(first.invoke).not.toHaveBeenCalled()
  await first.host.close()
  const next = await connect(undefined, first.directory)
  await next.message('Bạn nhớ gì về tôi?')
  await vi.waitFor(() => expect(next.reply).toHaveBeenCalledWith('Xin chào'), { timeout: 5000 })
  await next.idle()
  expect(String(next.fetch.mock.calls[0][1]?.body)).toContain('Tôi tên là Lan')
  await next.message('Bạn nhớ gì về tôi?', 200)
  await vi.waitFor(() => expect(next.fetch).toHaveBeenCalledTimes(2))
  expect(String(next.fetch.mock.calls[1][1]?.body)).not.toContain('Tôi tên là Lan')
  await next.host.close()
}, 15_000)

it('delivers overdue Telegram reminders after restart without another message and preserves task commands and job cancellation', async () => {
  const first = await connect()
  const data = join(first.directory, 'telegram', 'companions', '42', '100')
  const tasks = new Tasks(data, cliMessages.vi.tasks)
  const task = await tasks.create({ title: 'Nhắc sau khi khởi động', type: 'reminder', dueAt: new Date(Date.now() - 1000).toISOString() })
  await first.host.start()
  expect(first.reply).toHaveBeenCalledWith(expect.stringContaining(task.title))
  expect((await tasks.find(task.id)).delivery?.status).toBe('delivered')
  await first.message('/tasks')
  expect(first.reply.mock.calls.at(-1)?.[0]).toContain(task.id)
  await first.message(`/cancel ${task.id}`)
  expect((await tasks.find(task.id)).status).toBe('cancelled')
  await first.message('/cancel')
  expect(first.reply.mock.calls.at(-1)?.[0]).toBe(cliMessages.vi.telegramIdle)
  await first.message('/skills import /private/host-file')
  expect(first.reply.mock.calls.at(-1)?.[0]).toBe(cliMessages.vi.telegramLocalSkills)
  expect(first.fetch).not.toHaveBeenCalled()
  await first.host.close()
  const next = await connect(undefined, first.directory)
  await next.host.start()
  expect(next.reply).not.toHaveBeenCalled()
})

it('shares terminal tasks and memory with only the explicitly selected Telegram owner', async () => {
  const host = await connect(undefined, undefined, 100)
  await new Memory(host.directory, cliMessages.vi).remember('Chủ máy thích trà', undefined, undefined, { core: true })
  const task = await new Tasks(host.directory, cliMessages.vi.tasks).create({ title: 'Việc riêng của chủ máy', type: 'todo' })
  await host.message('/tasks')
  expect(host.reply.mock.calls.at(-1)?.[0]).toContain(task.id)
  await host.message('/tasks', 200)
  expect(host.reply.mock.calls.at(-1)?.[0]).not.toContain(task.id)
  await host.message('Bạn nhớ sở thích của tôi không?')
  await vi.waitFor(() => expect(host.fetch).toHaveBeenCalledTimes(1))
  expect(String(host.fetch.mock.calls[0][1]?.body)).toContain('Chủ máy thích trà')
  await host.idle()
  await host.message('Bạn nhớ sở thích của tôi không?', 200)
  await vi.waitFor(() => expect(host.fetch).toHaveBeenCalledTimes(2))
  expect(String(host.fetch.mock.calls[1][1]?.body)).not.toContain('Chủ máy thích trà')
})

it('evicts inactive chat state and closes request clients after many sequential users', async () => {
  const users = new Set(Array.from({ length: 40 }, (_, index) => index + 100))
  const close = vi.spyOn(McpTools.prototype, 'close')
  const { host, message, idle, fetch } = await connect(undefined, undefined, undefined, users)
  await host.start()
  for (const user of users) {
    await message('Hi Angela', user)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(user - 99))
    await idle()
    await vi.waitFor(() => expect(host.stateCounts.jobs).toBe(0))
    expect(host.stateCounts.runtime).toBe(0)
    expect(host.stateCounts.deadlineTimers).toBe(0)
    expect(host.stateCounts.chats).toBeLessThanOrEqual(32)
  }
  expect(close).toHaveBeenCalledTimes(40)
  await host.close()
  expect(host.stateCounts).toEqual({ jobs: 0, chats: 0, runtime: 0, deadlineTimers: 0 })
  close.mockRestore()
}, 15_000)

it('maps repeated Telegram messages, two users and reset to logical session boundaries', async () => {
  const runtime = new AngelaRuntime('test-model', { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://fixture.invalid/v1/', fetch: async () => completion('Xin chào') } }) }, cliMessages.vi)
  const started = vi.fn()
  const ended = vi.fn()
  runtime.events.on('session.started', started)
  runtime.events.on('session.ended', ended)
  try {
    const { host, message, idle } = await connect(undefined, undefined, undefined, undefined, runtime)
    await message('Choose copper release for user A')
    await vi.waitFor(() => expect(host.stateCounts.jobs).toBe(0))
    await idle()
    await message('Continue copper release for user A')
    await vi.waitFor(() => expect(host.stateCounts.jobs).toBe(0))
    expect(started).toHaveBeenCalledTimes(1)
    expect(ended).not.toHaveBeenCalled()
    expect(runtime.resourceCounts.indexes).toBe(1)
    await message('Choose quartz release for user B', 200)
    await vi.waitFor(() => expect(host.stateCounts.jobs).toBe(0))
    expect(started).toHaveBeenCalledTimes(2)
    expect(runtime.resourceCounts.indexes).toBe(2)
    const userA = started.mock.calls[0]![0]
    const userB = started.mock.calls[1]![0]
    expect(userA.sessionId).not.toBe(userB.sessionId)
    await message('/new')
    await vi.waitFor(() => expect(host.stateCounts.jobs).toBe(0))
    expect(ended).toHaveBeenCalledTimes(1)
    expect(ended.mock.calls[0]![0].sessionId).toBe(userA.sessionId)
    expect(runtime.resourceCounts.indexes).toBe(1)
    await message('Fresh copper request for A')
    await vi.waitFor(() => expect(host.stateCounts.jobs).toBe(0))
    expect(started).toHaveBeenCalledTimes(3)
    await host.close()
    expect(ended).toHaveBeenCalledTimes(3)
    // A shared runtime stays open, but this adapter releases all its sessions and reminder destinations.
    expect(runtime.resourceCounts.states).toBe(0)
    expect(runtime.resourceCounts.reminderRoutes).toBe(0)
  }
  finally {
    await runtime.close()
  }
})
