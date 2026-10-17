import type { DiscordAdapterConfig } from '@proj-airi/discord-bot'
import type { cliMessages } from '@proj-airi/i18n/cli'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import process from 'node:process'

import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

import { conversationToChatMessages } from '@proj-airi/core-agent'
import { DiscordAdapter } from '@proj-airi/discord-bot'
import { getGenerationProvider, listProviders } from '@proj-airi/provider-inference'

import { Chat } from './chat'
import { readConfig } from './config'
import { Sessions } from './sessions'

type Input = Parameters<NonNullable<DiscordAdapterConfig['respond']>>[0]

function isGatewayDiagnostic(text: string) {
  // NOTICE:
  // The gateway returns this service failure as completion text instead of a structured error.
  // Discord voice history and discord.test.ts reproduce the resulting spoken diagnostic.
  // Remove this check when the gateway reports this failure through the provider error contract.
  return text.trimStart().startsWith('The prompt could not be submitted.')
    && text.includes('https://policies.google.com/terms/generative-ai/use-policy')
}

/** Owns persisted Discord conversations. Each channel serializes requests, while different channels run independently. */
export class DiscordChat {
  private readonly pending = new Map<string, Set<Promise<string>>>()
  private readonly shutdown = new AbortController()

  constructor(
    private readonly provider: GenerationProvider,
    private readonly model: string,
    private readonly sessions: Sessions,
    private readonly workspace: string,
    private readonly messages: typeof cliMessages.en,
  ) {}

  /** Keeps voice and text histories separate. Shutdown and call interruption cancel active and queued requests. */
  respond(input: Input, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    this.shutdown.signal.throwIfAborted()
    if (!input.discord?.channelId)
      return Promise.reject(new Error(this.messages.discordFailed))
    const context = input.discord
    const kind = 'voiceRequestId' in context ? 'voice' : 'text'
    const key = JSON.stringify([kind, context.guildId, context.channelId])
    const queue = this.pending.get(key) ?? new Set<Promise<string>>()
    if (queue.size >= 4)
      return Promise.reject(new Error(this.messages.discordBusy))
    this.pending.set(key, queue)
    const previous = [...queue].at(-1)
    const requestSignal = AbortSignal.any([signal, this.shutdown.signal])
    const result = (async () => {
      await previous?.catch(() => {})
      requestSignal.throwIfAborted()
      const hex = createHash('sha256').update(`angela:discord:${key}`).digest('hex')
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
      const session = await this.sessions.open(this.workspace, id, { recoverAbandoned: true })
      try {
        const chat = new Chat(this.model, this.provider, this.workspace, session.restore(), false, 32_000, this.messages)
        let answer = ''
        await session.save(chat.conversation, true)
        try {
          await chat.send(`${input.overrides?.messagePrefix ?? ''}${input.text}`, {
            abortSignal: requestSignal,
            // Keep historical service failures on disk, but exclude them from model context before compaction.
            prepareConversation: async conversation => ({
              turns: conversation.turns.filter(turn => turn.type !== 'assistant'
                || !conversationToChatMessages({ turns: [turn] }, false).some(message => typeof message.content === 'string' && isGatewayDiagnostic(message.content))),
            }),
            onStreamEvent: (event) => {
              if (event.type === 'text-delta')
                answer += event.text
            },
          }, kind === 'voice'
            ? 'You are in a Discord voice call. Incoming text is a transcript, and speech recognition can contain mistakes. Your reply is spoken aloud. Reply briefly in natural sentences and plain text. Avoid Markdown, URLs, and speaker metadata. If a transcript is unclear, ask one short clarification question. Do not guess missing words or claim a microphone fault. Do not treat a farewell as a command to leave the call. Call controls are managed by the host.'
            : 'You are chatting on Discord. Voice calls are supported. To invite you, the user joins a server voice channel and uses /summon. Use /listen to pause or resume listening and /leave to disconnect. You cannot join a call from a text request alone.')
          requestSignal.throwIfAborted()
          if (!answer.trim())
            throw new Error(this.messages.emptyResponse)
          if (isGatewayDiagnostic(answer)) {
            chat.conversation.turns.pop()
            throw new Error(this.messages.discordFailed)
          }
          await session.save(chat.conversation, false)
          return answer
        }
        catch (error) {
          await session.save(chat.conversation, true)
          throw error
        }
      }
      finally {
        await session.close()
      }
    })()
    queue.add(result)
    void result.finally(() => {
      queue.delete(result)
      if (!queue.size)
        this.pending.delete(key)
    }).catch(() => {})
    return result
  }

  /** Releases session locks after cancellation. No new provider requests start after shutdown. */
  async close() {
    this.shutdown.abort()
    await Promise.allSettled([...this.pending.values()].flatMap(queue => [...queue]))
  }
}

/**
 * Runs Discord with the CLI's saved provider, without a desktop client or server-channel process.
 *
 * Call stack:
 * runDiscord -> DiscordAdapter -> DiscordChat.respond -> Chat.send -> core-agent.streamFrom
 *                                                     -> Sessions -> local session files
 */
export async function runDiscord(args: string[], env: NodeJS.ProcessEnv) {
  const help = await readConfig(['--help'], env)
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${help.messages.discordUsage}\n`)
    return
  }
  const path = env.ANGELA_DISCORD_ENV ?? join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'angela', 'discord.env')
  let file: NodeJS.ProcessEnv = {}
  try {
    file = parseEnv(await readFile(path, 'utf8'))
  }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || env.ANGELA_DISCORD_ENV)
      throw new Error(help.messages.discordEnvFailed)
  }
  const merged = { ...file, ...env }
  const token = merged.DISCORD_TOKEN?.trim()
  if (!token)
    throw new Error(help.messages.discordTokenMissing)
  const config = await readConfig(args, merged)
  if (config.help || config.list || config.prompt || config.resume)
    throw new Error(help.messages.discordUsage)
  const workspace = await realpath(config.cwd ?? process.cwd())
  if (!(await stat(workspace)).isDirectory())
    throw new Error(config.messages.invalidWorkspace)
  const definition = listProviders().find(provider => provider.id === config.definitionId)
  const provider = definition && getGenerationProvider(await definition.createProvider(config.providerConfig))
  if (!provider)
    throw new Error(config.messages.unsupportedProvider)
  const host = new DiscordChat(provider, config.model, new Sessions(join(config.dataDir, 'discord'), config.messages), workspace, config.messages)
  const adapter = new DiscordAdapter({
    discordToken: token,
    locale: config.locale,
    speechEnv: merged,
    respond: (input, signal) => host.respond(input, signal),
  })
  const shutdown = Promise.withResolvers<void>()
  const stop = () => shutdown.resolve()
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    await adapter.start()
    process.stdout.write(`${config.messages.discordStarted}\n${config.messages.model}: ${config.model}\n`)
    await shutdown.promise
  }
  catch {
    // Discord and provider errors can contain request headers. Keep credentials out of terminal output.
    throw new Error(config.messages.discordFailed)
  }
  finally {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
    try {
      await adapter.stop()
    }
    finally {
      await host.close()
    }
  }
}
