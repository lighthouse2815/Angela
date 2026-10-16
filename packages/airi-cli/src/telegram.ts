import type { cliMessages } from '@proj-airi/i18n/cli'
import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Context } from 'grammy'

import process from 'node:process'

import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

import { getGenerationProvider, listProviders } from '@proj-airi/provider-inference'
import { AbortController as TelegramAbortController } from 'abort-controller'
import { Bot } from 'grammy'

import { Chat } from './chat'
import { readConfig } from './config'
import { Sessions } from './sessions'

/** Owns private chat jobs. Each chat has one persisted session and at most one active generation. */
export class TelegramChat {
  private readonly jobs = new Map<number, { controller: AbortController, done: Promise<void> }>()
  private closing = false

  constructor(
    private readonly bot: Bot,
    private readonly provider: GenerationProvider,
    private readonly model: string,
    private readonly sessions: Sessions,
    private readonly workspace: string,
    private readonly messages: typeof cliMessages.en,
    private readonly allowedUsers: ReadonlySet<number>,
  ) {
    bot.use(async (ctx, next) => {
      // Check the sender before commands, typing indicators, session reads, or provider requests.
      if (!this.closing && ctx.chat?.type === 'private' && ctx.from && this.allowedUsers.has(ctx.from.id))
        await next()
    })
    bot.command('start', ctx => ctx.reply(messages.telegramWelcome))
    bot.command('help', ctx => ctx.reply(messages.telegramCommands))
    bot.command('cancel', async (ctx) => {
      const job = this.jobs.get(ctx.chat.id)
      if (!job) {
        await ctx.reply(messages.telegramIdle)
        return
      }
      job.controller.abort()
      await job.done
    })
    bot.command('status', async (ctx) => {
      await ctx.reply(`${messages.model}: ${model}\n${messages.session}: ${this.sessionId(ctx.chat.id)}\n${this.jobs.has(ctx.chat.id) ? messages.thinking : messages.telegramIdle}`)
    })
    bot.on('message:text', async (ctx) => {
      if (this.jobs.has(ctx.chat.id)) {
        await ctx.reply(messages.telegramBusy)
        return
      }
      const reset = ctx.message.text === '/new' || ctx.message.text === `/new@${bot.botInfo.username}`
      if (ctx.message.text.startsWith('/') && !reset) {
        await ctx.reply(messages.telegramCommands)
        return
      }
      const controller = new AbortController()
      // Keep polling responsive to /cancel. Job completion owns persistence and reports its own failures.
      const done = this.respond(ctx, ctx.message.text, reset, controller.signal)
        .catch(async () => {
          await ctx.reply(messages.telegramRequestFailed).catch(() => {
            process.stderr.write(`${messages.telegramDeliveryFailed}\n`)
          })
        })
        .finally(() => this.jobs.delete(ctx.chat.id))
      this.jobs.set(ctx.chat.id, { controller, done })
    })
  }

  /** Stops accepting updates, cancels generations, and waits for session locks to release. */
  async close() {
    this.closing = true
    for (const job of this.jobs.values())
      job.controller.abort()
    await Promise.all([...this.jobs.values()].map(job => job.done))
  }

  private sessionId(chatId: number) {
    // Stable bot/chat identities resume the same session without a separate index file.
    const hex = createHash('sha256').update(`angela:telegram:${this.bot.botInfo.id}:${chatId}`).digest('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
  }

  private async respond(ctx: Context, text: string, reset: boolean, signal: AbortSignal) {
    if (!ctx.chat)
      return
    const session = await this.sessions.open(this.workspace, this.sessionId(ctx.chat.id))
    let timer: ReturnType<typeof setInterval> | undefined
    let delivering = false
    try {
      const chat = new Chat(this.model, this.provider, this.workspace, reset ? undefined : session.restore(), false)
      if (reset) {
        await session.save(chat.conversation, false)
        await ctx.reply(this.messages.telegramNew)
        return
      }
      signal.throwIfAborted()
      await session.save(chat.conversation, true)
      const typing = () => {
        void ctx.replyWithChatAction('typing').catch(() => {})
      }
      typing()
      timer = setInterval(typing, 4000)
      timer.unref()
      let answer = ''
      let generated = false
      await chat.send(text, {
        abortSignal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]),
        diagnostics: { error() {}, warn() {} },
        onStreamEvent(event) {
          if (event.type === 'text-delta')
            answer += event.text
          if (event.type === 'error')
            throw event.error
        },
      }).then(() => {
        generated = Boolean(answer.trim())
      }).finally(async () => {
        await session.save(chat.conversation, signal.aborted || !generated)
      })
      signal.throwIfAborted()
      if (!answer.trim())
        throw new Error(this.messages.emptyResponse)
      clearInterval(timer)
      timer = undefined
      delivering = true
      // Telegram limits messages to 4096 characters. Code points prevent splitting surrogate pairs.
      const characters = Array.from(answer)
      for (let offset = 0; offset < characters.length; offset += 2000) {
        signal.throwIfAborted()
        await ctx.reply(characters.slice(offset, offset + 2000).join(''))
      }
    }
    catch {
      await ctx.reply(signal.aborted ? this.messages.telegramCancelled : delivering ? this.messages.telegramDeliveryFailed : this.messages.telegramRequestFailed)
    }
    finally {
      if (timer)
        clearInterval(timer)
      await session.close()
    }
  }
}

/**
 * Starts the local Telegram host with the CLI's provider and persistence boundaries.
 *
 * Call stack:
 * runTelegram -> readConfig -> TelegramChat -> Chat.send -> core-agent.streamFrom
 *                            -> Sessions -> local session files
 */
export async function runTelegram(args: string[], env: NodeJS.ProcessEnv) {
  const help = await readConfig(['--help'], env)
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${help.messages.telegramUsage}\n`)
    return
  }
  const path = env.ANGELA_TELEGRAM_ENV ?? join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'angela', 'telegram.env')
  let file: NodeJS.ProcessEnv = {}
  try {
    file = parseEnv(await readFile(path, 'utf8'))
  }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || env.ANGELA_TELEGRAM_ENV)
      throw new Error(help.messages.telegramFailed)
  }
  const merged = { ...file, ...env }
  const token = merged.ANGELA_TELEGRAM_BOT_TOKEN?.trim()
  if (!token || !/^\d+:[\w-]+$/.test(token))
    throw new Error(help.messages.telegramTokenMissing)
  const ids = merged.ANGELA_TELEGRAM_ALLOWED_USER_IDS?.split(',').map(id => id.trim())
  if (!ids?.length || ids.some(id => !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0))
    throw new Error(help.messages.telegramUsersMissing)
  const config = await readConfig(args, merged)
  if (config.help || config.list)
    throw new Error(help.messages.telegramUsage)
  const messages = config.messages
  const workspace = await realpath(config.cwd ?? process.cwd())
  if (!(await stat(workspace)).isDirectory())
    throw new Error(messages.invalidWorkspace)
  const definition = listProviders().find(provider => provider.id === config.definitionId)
  const provider = definition && getGenerationProvider(await definition.createProvider(config.providerConfig))
  if (!provider)
    throw new Error(messages.unsupportedProvider)
  const bot = new Bot(token)
  const host = new TelegramChat(bot, provider, config.model, new Sessions(join(config.dataDir, 'telegram'), messages), workspace, messages, new Set(ids.map(Number)))
  bot.catch(() => {
    process.stderr.write(`${messages.telegramFailed}\n`)
  })
  // grammY's Node API requires the signal from its own abort-controller dependency.
  const shutdown = new TelegramAbortController()
  let stopped = false
  const stop = () => {
    stopped = true
    shutdown.abort()
    void host.close()
    if (bot.isRunning())
      void bot.stop().catch(() => {})
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    // An existing webhook belongs to another deployment. Do not remove it implicitly.
    await bot.init(shutdown.signal)
    const webhook = await bot.api.getWebhookInfo(shutdown.signal)
    if (webhook.url)
      throw new Error(messages.telegramFailed)
    if (!stopped) {
      await bot.start({
        allowed_updates: ['message'],
        onStart: () => { process.stderr.write(`${messages.telegramReady}\n`) },
      })
    }
  }
  catch {
    if (!stopped)
      throw new Error(messages.telegramFailed)
  }
  finally {
    await host.close()
    if (bot.isRunning())
      await bot.stop().catch(() => {})
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
    process.stderr.write(`${messages.telegramStopped}\n`)
  }
}
