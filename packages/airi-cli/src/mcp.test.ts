import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { PassThrough } from 'node:stream'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Chat } from './chat'
import { McpTools } from './mcp'
import { Output } from './output'
import { Permissions } from './permissions'

const connections: { close: () => Promise<void> }[] = []
afterEach(async () => {
  await Promise.all(connections.splice(0).map(connection => connection.close()))
})

async function connect(confirm = vi.fn(async () => true), workspace?: string) {
  const server = new Server({ name: 'test-tools', version: '1' }, { capabilities: { tools: {} } })
  const invoke = vi.fn<(name: string, args?: Record<string, unknown>) => CallToolResult>(() => ({ content: [{ type: 'text', text: 'done' }] }))
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ['terminal_exec', 'desktop_click', 'desktop_approve_pending_action', 'desktop_reject_pending_action'].map(name => ({
      name,
      inputSchema: { type: 'object' as const, properties: {} },
    })),
  }))
  server.setRequestHandler(CallToolRequestSchema, async request => invoke(request.params.name, request.params.arguments))
  const client = new Client({ name: 'test-cli', version: '1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  connections.push(client, server)
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  const tools = new McpTools(client, confirm, cliMessages.en, workspace)
  await tools.discover()
  return { tools, invoke, confirm }
}

describe('mCP host approval', () => {
  it('automatically resolves pending actions in full mode and asks again after disabling it', async () => {
    const permissions = new Permissions(cliMessages.en)
    const ask = vi.fn(async () => false)
    const confirm = vi.fn(async () => permissions.fullAccess || await ask())
    const { tools, invoke } = await connect(confirm)
    permissions.command('/permistion full')
    invoke.mockReturnValueOnce({ content: [], structuredContent: { status: 'approval_required', pendingActionId: 'pending-full' } })
    await tools.call('terminal_exec', { command: 'pwd' })
    expect(ask).not.toHaveBeenCalled()
    expect(invoke.mock.calls).toEqual([
      ['terminal_exec', { command: 'pwd' }],
      ['desktop_approve_pending_action', { id: 'pending-full' }],
    ])
    expect(await tools.call('desktop_approve_pending_action', { id: 'other' })).toMatchObject({ isError: true })
    expect(invoke).toHaveBeenCalledTimes(2)
    permissions.command('/permistion ask')
    expect(await tools.call('terminal_exec', { command: 'pwd' })).toMatchObject({ isError: true })
    expect(ask).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('does not send a denied tool call to the server', async () => {
    const { tools, invoke } = await connect(vi.fn(async () => false))
    expect(await tools.call('terminal_exec', { command: 'pwd' })).toMatchObject({ isError: true })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('confirms the effective working directory before sending the exact call', async () => {
    const { tools, invoke, confirm } = await connect(undefined, '/workspace')
    expect(await tools.call('terminal_exec', { command: 'pwd' })).toMatchObject({ content: [{ text: 'done' }] })
    expect(confirm).toHaveBeenCalledWith({ name: 'terminal_exec', arguments: { command: 'pwd', cwd: '/workspace' } }, undefined)
    expect(invoke).toHaveBeenCalledWith('terminal_exec', { command: 'pwd', cwd: '/workspace' })
  })

  it('blocks model access to approval endpoints and undiscovered tools', async () => {
    const { tools, invoke, confirm } = await connect()
    expect(await tools.call('desktop_approve_pending_action', { id: 'pending-1' })).toMatchObject({ isError: true })
    expect(await tools.call('missing', {})).toMatchObject({ isError: true })
    expect(invoke).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('limits the built-in connection to real terminal tools', async () => {
    const { tools } = await connect(undefined, '/workspace')
    const listed = await tools.definitions()[0].execute({}, { messages: [], toolCallId: 'list' })
    expect(listed).toEqual([expect.objectContaining({ name: 'terminal_exec' })])
    expect(await tools.call('desktop_click', {})).toMatchObject({ isError: true })
  })

  it.each([true, false])('resolves pending server approval only after an explicit answer: %s', async (approved) => {
    const confirm = vi.fn(async () => true).mockResolvedValueOnce(true).mockResolvedValueOnce(approved)
    const { tools, invoke } = await connect(confirm)
    invoke.mockReturnValueOnce({
      content: [],
      structuredContent: { status: 'approval_required', pendingActionId: 'pending-1', action: { command: 'pwd' } },
    })
    const result = await tools.call('terminal_exec', { command: 'pwd' })
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls[1]).toEqual([approved ? 'desktop_approve_pending_action' : 'desktop_reject_pending_action', { id: 'pending-1' }])
    expect(result.isError).toBe(approved ? undefined : true)
  })

  it('does not execute after cancellation while the user is deciding', async () => {
    const controller = new AbortController()
    const { tools, invoke } = await connect(vi.fn(async () => {
      controller.abort()
      return true
    }))
    await expect(tools.call('terminal_exec', { command: 'pwd' }, controller.signal)).rejects.toThrow()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('serializes questions from parallel model tool calls', async () => {
    let answer: ((approved: boolean) => void) | undefined
    const confirm = vi.fn(async () => await new Promise<boolean>(resolve => answer = resolve))
    const { tools } = await connect(confirm)
    const first = tools.call('terminal_exec', { command: 'first' })
    const second = tools.call('terminal_exec', { command: 'second' })
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    answer!(false)
    await first
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(2))
    answer!(false)
    await second
  })
})

it('runs a model-requested tool through the real generation and MCP protocols', async () => {
  const { tools, invoke } = await connect()
  const fullOutput = `${'Long command output\n'.repeat(100)}Final verification marker`
  invoke.mockReturnValueOnce({ content: [{ type: 'text', text: fullOutput }] })
  const toolCall = {
    index: 0,
    id: 'call-1',
    type: 'function',
    function: { name: 'builtIn_mcpCallTool', arguments: JSON.stringify({ name: 'terminal_exec', arguments: JSON.stringify({ command: 'pwd' }) }) },
  }
  const sse = (delta: object, reason: string) => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(sse({ role: 'assistant', tool_calls: [toolCall] }, 'tool_calls'))
    .mockResolvedValueOnce(sse({ role: 'assistant', content: 'Finished' }, 'stop'))
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch } }),
  }
  const chat = new Chat('test-model', provider, '/workspace')
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let progress = ''
  stderr.on('data', chunk => progress += chunk)
  const output = new Output(cliMessages.en, stdout, stderr)
  output.start()
  try {
    await chat.send('Run pwd', { tools: tools.definitions(), onStreamEvent: event => output.event(event) })
  }
  finally {
    output.stop()
  }
  expect(invoke).toHaveBeenCalledWith('terminal_exec', { command: 'pwd' })
  expect(fetch).toHaveBeenCalledTimes(2)
  const body = JSON.parse(String(fetch.mock.calls[1][1]?.body))
  const toolResult = body.messages.find((message: { role: string }) => message.role === 'tool')
  expect(JSON.parse(toolResult.content).content[0].text).toBe(fullOutput)
  expect(progress).toContain('Output shortened')
  expect(progress).not.toContain('Final verification marker')
  expect(chat.conversation.turns.at(-1)).toMatchObject({ type: 'assistant', status: 'completed' })
})

it('replaces discovery snapshots and releases schemas and executable names on close', async () => {
  const { tools } = await connect()
  const before = await tools.definitions()[0].execute({}, { messages: [], toolCallId: 'list' })
  await tools.discover()
  expect(await tools.definitions()[0].execute({}, { messages: [], toolCallId: 'list-again' })).toEqual(before)
  await tools.close()
  expect(await tools.definitions()[0].execute({}, { messages: [], toolCallId: 'closed' })).toEqual([])
  expect(await tools.call('terminal_exec', {})).toMatchObject({ isError: true })
})
