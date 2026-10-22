import type { StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Update } from 'grammy/types'

import process from 'node:process'

import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'

import { cliMessages } from '@proj-airi/i18n/cli'
import { Bot } from 'grammy'

import { Chat } from '../src/chat'
import { MemoryCapture } from '../src/memory-v2/consolidator'
import { Recall } from '../src/recall'
import { RecallIndex } from '../src/recall-index'
import { AngelaRuntime, RuntimeSession } from '../src/runtime/runtime'
import { Sessions } from '../src/sessions'
import { TelegramChat } from '../src/telegram'

interface Sample { request: number, firstText: number, context: number, recall: number, sqlite: number, consolidation: number }
const directory = await mkdtemp(join(tmpdir(), 'angela-telegram-lifecycle-'))
let current: Sample | undefined
let requestStarted = 0
let contextStarted = 0
let sqliteOpens = 0
let recallStarts = 0
const liveRecalls = new Set<Recall>()
const methods = { index: RecallIndex.open, recall: Recall.prototype.start, recallClose: Recall.prototype.close, capture: MemoryCapture.prototype.finish, chat: Chat.prototype.send, send: RuntimeSession.prototype.send }

// Instrumentation wraps real boundaries. No provider delay or memory implementation is replaced.
RecallIndex.open = async function (...args) {
  const started = performance.now()
  const index = await methods.index.apply(this, args)
  sqliteOpens++
  if (current)
    current.sqlite += performance.now() - started
  return index
}
Recall.prototype.start = async function () {
  const started = performance.now()
  await methods.recall.call(this)
  liveRecalls.add(this)
  recallStarts++
  if (current)
    current.recall += performance.now() - started
}
Recall.prototype.close = async function () {
  await methods.recallClose.call(this)
  liveRecalls.delete(this)
}
MemoryCapture.prototype.finish = function (text) {
  const started = performance.now()
  const episode = methods.capture.call(this, text)
  if (current)
    current.consolidation += performance.now() - started
  return episode
}
RuntimeSession.prototype.send = function (...args) {
  contextStarted = performance.now()
  return methods.send.apply(this, args)
}
Chat.prototype.send = function (text, options, extra) {
  if (current)
    current.context = performance.now() - contextStarted
  const wrapped: StreamOptions = { ...options, onStreamEvent: async (event) => {
    if (current && event.type === 'text-delta' && !current.firstText)
      current.firstText = performance.now() - requestStarted
    await options.onStreamEvent?.(event)
  } }
  return methods.chat.call(this, text, wrapped, extra)
}

function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return { p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] }
}
function summarize(samples: Sample[]) {
  return Object.fromEntries((Object.keys(samples[0]) as (keyof Sample)[]).map(key => [key, distribution(samples.map(sample => sample[key]))]))
}

/**
 * Exercises Telegram's actual adapter, persistence, runtime, and local HTTP delivery.
 *
 * Call stack:
 * benchmark -> Bot.handleUpdate -> TelegramChat.respond -> runtime.open -> send -> close
 */
async function run(mode: 'cold' | 'retained') {
  const root = join(directory, mode)
  const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://fixture.invalid/v1/', fetch: async () => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Understood.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }) } }) }
  const runtime = new AngelaRuntime('fixture', provider, cliMessages.en)
  // Before the fix, this reference reproduces the old warm benchmark for comparison with the real adapter.
  const open = runtime.open.bind(runtime)
  const retained = new Set<RuntimeSession>()
  if (mode === 'retained') {
    runtime.open = (options) => {
      const scope = open(options)
      if (!retained.has(scope)) {
        retained.add(scope)
        scope.retain()
      }
      return scope
    }
  }
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request)
      body += String(chunk)
    const payload = JSON.parse(body || '{}')
    const method = request.url?.split('/').at(-1)
    const result = method === 'getMe'
      ? { id: 42, is_bot: true, first_name: 'Angela', username: 'angela_fixture_bot' }
      : method === 'sendMessage' ? { message_id: 1, date: 1, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } : true
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ ok: true, result }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing local Telegram API address')
  const bot = new Bot('42:fixture-only', { client: { apiRoot: `http://127.0.0.1:${address.port}` } })
  await bot.init()
  const host = new TelegramChat(bot, provider, 'fixture', new Sessions(root, cliMessages.en), root, cliMessages.en, new Set([100, 200, 300, 400]), async () => undefined, { dataDir: root, env: {}, locale: 'en', apiKey: '' }, runtime)
  const opensBefore = sqliteOpens
  const startsBefore = recallStarts
  let updateId = 0
  async function message(id = 100) {
    const sample: Sample = { request: 0, firstText: 0, context: 0, recall: 0, sqlite: 0, consolidation: 0 }
    current = sample
    requestStarted = performance.now()
    const update: Update = { update_id: ++updateId, message: { message_id: updateId, date: 1, chat: { id, type: 'private', first_name: 'Fixture' }, from: { id, is_bot: false, first_name: 'Fixture' }, text: `Choose SQLite for companion memory request ${updateId}` } }
    await bot.handleUpdate(update)
    while (host.stateCounts.jobs) {
      if (performance.now() - requestStarted > 30_000)
        throw new Error('Telegram fixture request timed out')
      await setImmediate()
    }
    sample.request = performance.now() - requestStarted
    current = undefined
    if (!sample.firstText)
      throw new Error('Telegram fixture produced no text')
    return sample
  }
  try {
    const samples: Sample[] = []
    for (let i = 0; i < 31; i++)
      samples.push(await message())
    const multi: Sample[] = []
    for (let i = 0; i < 5; i++) {
      for (const user of [100, 200, 300, 400])
        multi.push(await message(user))
    }
    const beforeShutdown = { ...runtime.resourceCounts, liveRecalls: liveRecalls.size }
    await host.close()
    await runtime.close()
    return { mode, first: samples[0], second: samples[1], sequential10: summarize(samples.slice(1, 11)), subsequent30: summarize(samples.slice(1)), multipleUsers: summarize(multi), sqliteOpens: sqliteOpens - opensBefore, recallStarts: recallStarts - startsBefore, beforeShutdown, afterShutdown: { ...runtime.resourceCounts, liveRecalls: liveRecalls.size } }
  }
  finally {
    current = undefined
    await host.close()
    await runtime.close()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
try {
  const report = { node: process.version, fixture: 'deterministic SSE model and local Telegram HTTP API; real Bot/TelegramChat/Sessions/Memory V2/SQLite', units: 'milliseconds; context includes stores, Recall and tool preparation; SQLite includes mkdir/chmod/open/schema; consolidation includes session end', results: [await run('cold'), await run('retained')] }
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (process.argv[2])
    await writeFile(process.argv[2], output)
  process.stdout.write(output)
}
finally {
  RecallIndex.open = methods.index
  Recall.prototype.start = methods.recall
  Recall.prototype.close = methods.recallClose
  MemoryCapture.prototype.finish = methods.capture
  Chat.prototype.send = methods.chat
  RuntimeSession.prototype.send = methods.send
  await rm(directory, { recursive: true, force: true })
}
