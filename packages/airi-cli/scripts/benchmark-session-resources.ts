import type { GenerationProvider } from '@proj-airi/provider-inference'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { cliMessages } from '@proj-airi/i18n/cli'

import { McpTools } from '../src/mcp'
import { Recall } from '../src/recall'
import { AngelaRuntime } from '../src/runtime/runtime'

/**
 * Measures explicit runtime resource ownership through 1,000 real use and bounded eviction cycles.
 *
 * Call stack:
 * benchmark -> runtime.acquire -> RuntimeSession.send -> Memory V2 / SQLite / in-memory MCP -> release -> LRU
 */
const directory = await mkdtemp(join(tmpdir(), 'angela-session-resources-'))
const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://fixture.invalid/v1/', fetch: async () => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Understood.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }) } }) }
const runtime = new AngelaRuntime('fixture', provider, cliMessages.en, {}, { apiKey: '' }, { telegramSessions: { maxIdle: 4 } })
const liveRecalls = new Set<Recall>()
const recallMethods = { start: Recall.prototype.start, close: Recall.prototype.close }
Recall.prototype.start = async function () {
  await recallMethods.start.call(this)
  liveRecalls.add(this)
}
Recall.prototype.close = async function () {
  await recallMethods.close.call(this)
  if (Object.values(this.resourceCounts).some(count => count !== 0))
    throw new Error('Recall retained resources after close')
  liveRecalls.delete(this)
}
let clients = 0
let servers = 0
let closes = 0
const checkpoints: { cycles: number, elapsedMs: number, resources: typeof runtime.resourceCounts, mcpClients: number, mcpServers: number, mcpCloses: number, liveRecalls: number }[] = []
const started = performance.now()
try {
  for (let cycle = 1; cycle <= 1000; cycle++) {
    const dataDir = join(directory, `user-${cycle % 5}`)
    await runtime.reminders(dataDir, { notify: async () => {} }, () => {})
    const scope = await runtime.acquire({ dataDir, workspace: directory, sessionId: randomUUID(), channel: 'telegram', connectMcp: async (signal) => {
      const server = new Server({ name: 'resource-fixture', version: '1' }, { capabilities: { tools: {} } })
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }))
      const client = new Client({ name: 'resource-fixture', version: '1' })
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
      clients++
      servers++
      const tools = new McpTools(client, async () => false, cliMessages.en)
      const close = tools.close.bind(tools)
      tools.close = async () => {
        await close()
        await server.close()
        clients--
        servers--
        closes++
      }
      await tools.discover(signal)
      return tools
    } })
    const unsubscribe = runtime.events.on('user.message', () => {})
    try {
      await scope.send(await runtime.createChat(directory), `Choose SQLite architecture for cycle ${cycle}`, {})
    }
    finally {
      unsubscribe()
      await scope.close()
    }
    const resources = runtime.resourceCounts
    if (resources.states > 4 || resources.warmSessions > 4 || resources.indexes > 4 || resources.watchers > 4 || resources.recallTimers > 4 || resources.mcpClients || resources.requests || resources.listeners || resources.retiringSessions || clients || servers || liveRecalls.size > 4)
      throw new Error(`Resource ownership exceeded its bound at cycle ${cycle}`)
    if ([100, 500, 1000].includes(cycle))
      checkpoints.push({ cycles: cycle, elapsedMs: performance.now() - started, resources, mcpClients: clients, mcpServers: servers, mcpCloses: closes, liveRecalls: liveRecalls.size })
  }
  const beforeShutdown = runtime.resourceCounts
  await runtime.close()
  const afterShutdown = runtime.resourceCounts
  if (Object.values(afterShutdown).some(count => count !== 0) || clients || servers || closes !== 1000 || liveRecalls.size)
    throw new Error('Resource benchmark shutdown leaked resources')
  const report = { node: process.version, fixture: 'direct runtime acquire/send/release with real Memory V2, SQLite, in-memory MCP transports and reminder routes; deterministic SSE model; no Telegram HTTP', maxIdle: 4, ttlMs: 600000, cycles: 1000, checkpoints, beforeShutdown, afterShutdown, mcpClients: clients, mcpServers: servers, mcpCloses: closes, liveRecalls: liveRecalls.size }
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (process.argv[2])
    await writeFile(process.argv[2], output)
  process.stdout.write(output)
}
finally {
  await runtime.close()
  Recall.prototype.start = recallMethods.start
  Recall.prototype.close = recallMethods.close
  await rm(directory, { recursive: true, force: true })
}
