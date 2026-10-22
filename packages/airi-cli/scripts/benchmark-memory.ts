import type { GenerationProvider } from '@proj-airi/provider-inference'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate, setTimeout } from 'node:timers/promises'

import { cliMessages } from '@proj-airi/i18n/cli'
import { Bot } from 'grammy'

import { Chat } from '../src/chat'
import { ReminderNotifications } from '../src/reminder-notifications'
import { AngelaRuntime } from '../src/runtime/runtime'
import { Sessions } from '../src/sessions'
import { TelegramChat } from '../src/telegram'

// The provider and Telegram API are deterministic IO boundaries. Real stores, indexing, and orchestration run unchanged.
let firstFetch = true
const provider: GenerationProvider = {
  generation: model => ({ protocol: 'chat-completions', config: {
    model,
    baseURL: 'https://benchmark.invalid/v1/',
    fetch: async () => {
      if (firstFetch && process.argv[2] === 'telegram') {
        firstFetch = false
        await sample('telegram.user.1.active')
      }
      return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'A bounded benchmark answer.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
    },
  } }),
}
const directory = await mkdtemp(join(tmpdir(), 'angela-memory-benchmark-'))
const samples: object[] = []
async function sample(label: string) {
  await setImmediate()
  globalThis.gc?.()
  await setImmediate()
  globalThis.gc?.()
  const { rss, heapUsed, heapTotal, external } = process.memoryUsage()
  samples.push({ label, rss, heapUsed, heapTotal, external, resources: process.getActiveResourcesInfo().sort() })
}

try {
  if (process.argv[2] === 'cli') {
    const sessions = new Sessions(directory, cliMessages.en)
    const session = await sessions.open(directory, randomUUID())
    const chat = new Chat('benchmark', provider, directory, session.restore())
    const runtime = new AngelaRuntime('benchmark', provider, cliMessages.en)
    const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId: session.record.id, channel: 'cli' })
    try {
      await runtime.reminders(directory, new ReminderNotifications(cliMessages.en.tasks, 'en', async () => {}), () => {})
      await sample('cli.idle')
      for (let index = 0; index < 20; index++) {
        const text = `Benchmark request ${index}: remember the previous answer.`
        await session.saveChat(chat, true)
        await scope.send(chat, text, {})
        await session.saveChat(chat, false)
        if (index === 0)
          await sample('cli.message.1')
      }
      await sample('cli.message.20')
    }
    finally {
      await runtime.close()
      await session.close()
    }
  }
  else if (process.argv[2] === 'release') {
    const runtime = new AngelaRuntime('benchmark', provider, cliMessages.en)
    const collected = { scopes: 0, recalls: 0 }
    const finalizer = new FinalizationRegistry<'scopes' | 'recalls'>((kind) => {
      collected[kind]++
    })
    const cycles = Number(process.env.ANGELA_BENCHMARK_CYCLES ?? 640)
    const cycle = async () => {
      const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId: randomUUID(), channel: 'telegram' })
      finalizer.register(scope, 'scopes')
      const unsubscribe = runtime.events.on('tool.result', () => {})
      await scope.send(new Chat('benchmark', provider, directory), 'Hello', {})
      const recall = await scope.recall()
      if (recall)
        finalizer.register(recall, 'recalls')
      await scope.close()
      unsubscribe()
    }
    try {
      for (let index = 0; index < cycles; index++) {
        await cycle()
        if ([19, 39, 79, 159, 319, 639, 1279, 2559].includes(index)) {
          await sample(`released.${index + 1}`)
          samples.push({ runtime: runtime.resourceCounts, collected: { ...collected } })
        }
      }
    }
    finally {
      await runtime.close()
    }
  }
  else {
    const users = new Set(Array.from({ length: 24 }, (_, index) => index + 100))
    const bot = new Bot('42:benchmark', { botInfo: { id: 42, is_bot: true, first_name: 'Angela', username: 'angela_benchmark_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } })
    let delivered = 0
    bot.api.config.use(async (_previous, method, payload) => {
      if (method === 'sendMessage' && 'text' in payload && payload.text === 'A bounded benchmark answer.')
        delivered++
      return { ok: true, result: method === 'sendMessage' ? { message_id: 1, date: 1, chat: { id: 'chat_id' in payload ? payload.chat_id : 100, type: 'private' }, text: 'answer' } : true } as never
    })
    const host = new TelegramChat(bot, provider, 'benchmark', new Sessions(directory, cliMessages.en), directory, cliMessages.en, users, async () => undefined, { dataDir: directory, env: {}, locale: 'en', apiKey: '' })
    try {
      await host.start()
      await sample('telegram.idle')
      let update = 0
      for (const id of users) {
        await bot.handleUpdate({ update_id: ++update, message: { message_id: update, date: 1, chat: { id, type: 'private', first_name: 'User' }, from: { id, is_bot: false, first_name: 'User' }, text: 'Hello Angela' } })
        const deadline = Date.now() + 10_000
        for (;;) {
          if (delivered >= id - 99)
            break
          if (Date.now() > deadline)
            throw new Error('Benchmark response timed out')
          await setTimeout(5)
        }
        // /cancel waits for the current request and its persistence/index cleanup before the next user.
        await bot.handleUpdate({ update_id: ++update, message: { message_id: update, date: 1, chat: { id, type: 'private', first_name: 'User' }, from: { id, is_bot: false, first_name: 'User' }, text: '/cancel', entities: [{ type: 'bot_command', offset: 0, length: 7 }] } })
        if (id === 100)
          await sample('telegram.user.1')
      }
      await sample('telegram.users.24')
    }
    finally {
      await host.close()
    }
  }
  await sample('closed')
  process.stdout.write(`${JSON.stringify({ node: process.version, mode: process.argv[2], samples }, null, 2)}\n`)
}
finally {
  await rm(directory, { recursive: true, force: true })
}
