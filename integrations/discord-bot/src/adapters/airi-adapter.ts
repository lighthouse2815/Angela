import type { Discord, WebSocketEventOf } from '@proj-airi/server-shared/types'
import type { Interaction } from 'discord.js'

import type { VoiceManager } from '../bots/discord/commands/summon'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { cliMessages } from '@proj-airi/i18n/cli'
import { Client as ServerChannel } from '@proj-airi/server-sdk'
import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'
import { Client, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js'

import * as v from 'valibot'

import { handlePing } from '../bots/discord/commands/ping'
import { registerCommands } from '../bots/discord/commands/register'

const log = useLogg('DiscordAdapter').useGlobalConfig()

/** Selects server-channel routing or an in-process CLI responder. Credentials remain runtime configuration. */
export interface DiscordAdapterConfig {
  discordToken?: string
  airiToken?: string
  airiUrl?: string
  respond?: (input: WebSocketEventOf<'input:text'>['data'], signal: AbortSignal) => Promise<string>
  speechEnv?: NodeJS.ProcessEnv
  locale?: 'en' | 'vi'
}

const configuration = v.object({ token: v.optional(v.string()), enabled: v.optional(v.boolean()) })

function normalizeDiscordMetadata(discord?: Discord): Discord | undefined {
  if (!discord)
    return undefined

  if (!discord.guildMember)
    return discord

  const { guildMember } = discord

  return {
    ...discord,
    guildMember: {
      id: guildMember.id ?? guildMember.displayName ?? guildMember.nickname ?? '',
      nickname: guildMember.nickname ?? guildMember.displayName ?? '',
      displayName: guildMember.displayName ?? guildMember.nickname ?? '',
    },
  }
}

export class DiscordAdapter {
  private airiClient?: ServerChannel
  private discordClient: Client
  private discordToken: string
  private voiceManager?: VoiceManager
  private voiceLoading?: Promise<VoiceManager>
  private voiceEpoch = 0
  private readonly voiceMessages: typeof cliMessages.en.discordVoice
  private isReconnecting = false
  private readonly requests = new Set<AbortController>()
  private closing = false

  constructor(private readonly config: DiscordAdapterConfig) {
    this.discordToken = config.discordToken || env.DISCORD_TOKEN || ''
    this.voiceMessages = cliMessages[config.locale ?? (env.ANGELA_LOCALE === 'en' ? 'en' : 'vi')].discordVoice

    // Initialize Discord client
    this.discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    })

    // Initialize AIRI client
    this.airiClient = config.respond
      ? undefined
      : new ServerChannel({
          name: 'discord',
          possibleEvents: [
            'input:text',
            'input:text:voice',
            'input:voice',
            'module:configure',
            'output:gen-ai:chat:message',
            'output:gen-ai:chat:complete',
          ],
          token: config.airiToken,
          url: config.airiUrl,
        })

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // Handle configuration from UI
    this.airiClient?.onEvent('module:configure', async (event) => {
      if (this.isReconnecting) {
        log.warn('A reconnect is already in progress, skipping this configuration event.')
        return
      }
      this.isReconnecting = true
      try {
        log.log('Received Discord configuration')

        const parsed = v.safeParse(configuration, event.data.config)
        if (parsed.success) {
          const { token, enabled } = parsed.output

          if (enabled === false) {
            this.releaseVoice()
            if (this.discordClient.isReady()) {
              log.log('Disabling Discord bot as per configuration...')
              await this.discordClient.destroy()
            }
            return
          }

          // If enabled, but no token is provided, stop the bot if it's running.
          if (!token) {
            log.warn('Discord bot enabled, but no token provided. Stopping bot.')
            this.releaseVoice()
            if (this.discordClient.isReady()) {
              await this.discordClient.destroy()
            }
            return
          }

          // Connect or reconnect if token changed or client is not ready.
          if (this.discordToken !== token || !this.discordClient.isReady()) {
            this.discordToken = token
            this.releaseVoice()
            if (this.discordClient.isReady()) {
              log.log('Reconnecting Discord client with new token...')
              await this.discordClient.destroy()
            }
            log.log('Connecting Discord client...')
            await this.discordClient.login(this.discordToken)
            log.log('Discord client connected.')
          }
        }
        else {
          log.warn('Invalid Discord configuration received, skipping...')
        }
      }
      catch (error) {
        log.withError(error).error('Failed to apply Discord configuration.')
      }
      finally {
        this.isReconnecting = false
      }
    })

    // Handle input from AIRI system
    this.airiClient?.onEvent('input:text', async (event) => {
      log.log('Received input from AIRI system:', event.data.text)
      // Process Discord-related commands
      // For now, we'll just log the input
    })

    // Handle output from AIRI system (IA response)
    this.airiClient?.onEvent('output:gen-ai:chat:message', async (event) => {
      try {
        const message = event.data.message
        const discordContext = event.data['gen-ai:chat']?.input?.data.discord

        // Voice playback waits for the completed turn. Intermediate messages never reach the call or its text channel.
        if (discordContext && 'voiceRequestId' in discordContext)
          return

        if (typeof message?.content === 'string' && message.content && discordContext?.channelId) {
          await this.sendText(discordContext.channelId, message.content)
        }
      }
      catch (error) {
        log.withError(error).error('Failed to send response to Discord')
      }
    })

    this.airiClient?.onEvent('output:gen-ai:chat:complete', async (event) => {
      const context = event.data['gen-ai:chat']?.input?.data.discord
      const content = event.data.message.content
      await this.voiceManager?.handleResponse(context, typeof content === 'string' ? content : '')
    })

    // Set up Discord event handlers
    this.discordClient.on(Events.ClientReady, async (readyClient) => {
      log.log(`Discord bot ready! User: ${readyClient.user.tag}`)
      // Register commands dynamically using the authenticated client's ID and token
      await registerCommands(this.discordToken, readyClient.user.id, this.voiceMessages).catch(() => {
        log.error('Discord command registration failed')
      })
    })

    // Handle text messages from Discord
    this.discordClient.on(Events.MessageCreate, async (message) => {
      if (message.author.bot)
        return

      const isDM = !message.guild
      const isMentioned = this.discordClient.user && message.mentions.has(this.discordClient.user)

      // Respond if the bot is mentioned OR if it's a DM
      if (isMentioned || isDM) {
        const rawContent = message.content
        const content = isMentioned
          ? rawContent.replace(/<@!?\d+>/g, '').trim()
          : rawContent.trim()

        if (!content)
          return

        log.log(`Received text message from ${message.author.tag} in ${isDM ? 'DM' : message.channelId}`)

        const discordContext: Discord = {
          channelId: message.channelId,
          guildId: message.guildId ?? undefined,
          guildName: message.guild?.name ?? undefined,
          guildMember: {
            id: message.author.id,
            displayName: message.member?.displayName ?? message.author.username,
            nickname: message.member?.nickname ?? message.author.username,
          },
        }
        const normalizedDiscord = normalizeDiscordMetadata(discordContext)
        const displayName = normalizedDiscord?.guildMember?.displayName

        // Enrich context and segment memory (moved from frontend)
        const serverName = normalizedDiscord?.guildName
        const contextPrefix = serverName
          ? `on server '${serverName}'`
          : 'in Direct Message'

        // Calculate sessionId based on guild or DM
        let targetSessionId = 'discord'
        if (normalizedDiscord?.guildId) {
          targetSessionId = `discord-guild-${normalizedDiscord.guildId}`
        }
        else {
          targetSessionId = `discord-dm-${normalizedDiscord?.guildMember?.id || 'unknown'}`
        }

        const discordNotice = normalizedDiscord
          ? `The input is coming from Discord channel ${normalizedDiscord.channelId} (Guild: ${normalizedDiscord.guildId ?? 'unknown'}).`
          : undefined

        await this.sendInput({
          type: 'input:text',
          data: {
            text: content,
            textRaw: rawContent,
            overrides: {
              messagePrefix: displayName
                ? `(From Discord user ${displayName} ${contextPrefix}): `
                : `(From Discord user ${contextPrefix}): `,
              sessionId: targetSessionId,
            },
            contextUpdates: discordNotice
              ? [{
                  strategy: ContextUpdateStrategy.AppendSelf,
                  text: discordNotice,
                  content: discordNotice,
                  metadata: {
                    discord: normalizedDiscord,
                  },
                }]
              : undefined,
            discord: normalizedDiscord,
          },
        })
      }
    })

    this.discordClient.on(Events.InteractionCreate, async (interaction: Interaction) => {
      if (!interaction.isChatInputCommand())
        return

      log.log(`Interaction received: /${interaction.commandName} from ${interaction.user.tag}`)

      try {
        switch (interaction.commandName) {
          case 'ping':
            await handlePing(interaction)
            break
          case 'summon':
            await (await this.voice()).handleJoinChannelCommand(interaction)
            break
          case 'leave':
            await (await this.voice()).handleLeaveChannelCommand(interaction)
            break
          case 'listen':
            await (await this.voice()).handleListeningCommand(interaction)
            break
        }
      }
      catch {
        log.error('Discord command failed')
        if (interaction.deferred || interaction.replied)
          await interaction.editReply(this.voiceMessages.failed).catch(() => {})
        else
          await interaction.reply({ content: this.voiceMessages.failed, flags: MessageFlags.Ephemeral }).catch(() => {})
      }
    })
  }

  /** Text chat never initializes speech, Opus, or voice transport. Concurrent voice commands share one import. */
  private voice() {
    if (this.voiceManager)
      return Promise.resolve(this.voiceManager)
    const epoch = this.voiceEpoch
    this.voiceLoading ??= Promise.all([import('../bots/discord/commands/summon'), import('../pipelines/speech')]).then(([{ VoiceManager }, { Speech }]) => {
      if (this.closing || epoch !== this.voiceEpoch)
        throw new Error('Discord voice startup was cancelled')
      this.voiceManager = new VoiceManager(this.discordClient, (input, signal) => this.sendInput(input, signal), new Speech(this.config.speechEnv), this.voiceMessages)
      return this.voiceManager
    }).finally(() => { this.voiceLoading = undefined })
    return this.voiceLoading
  }

  private releaseVoice() {
    this.voiceEpoch++
    this.voiceManager?.close()
    this.voiceManager = undefined
  }

  private async sendText(channelId: string, content: string) {
    const channel = await this.discordClient.channels.fetch(channelId)
    if (!channel?.isTextBased() || !('send' in channel) || typeof channel.send !== 'function')
      return
    let remaining = content
    while (remaining.length) {
      let size = 2000
      if (remaining.length > size) {
        const boundary = Math.max(remaining.lastIndexOf('\n', size), remaining.lastIndexOf(' ', size))
        if (boundary > 0)
          size = boundary
      }
      await channel.send({ content: remaining.slice(0, size), allowedMentions: { parse: [] } })
      remaining = remaining.slice(size).trim()
    }
  }

  private async sendInput(input: WebSocketEventOf<'input:text'>, signal?: AbortSignal) {
    if (this.closing)
      return
    if (this.airiClient) {
      this.airiClient.send(input)
      return
    }
    const controller = new AbortController()
    const requestSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(75_000), ...(signal ? [signal] : [])])
    this.requests.add(controller)
    try {
      const reply = await this.config.respond!(input.data, requestSignal)
      requestSignal.throwIfAborted()
      // The original room and request IDs let VoiceManager reject responses from interrupted or departed calls.
      if (input.data.discord && 'voiceRequestId' in input.data.discord)
        await this.voiceManager?.handleResponse(input.data.discord, reply)
      else if (input.data.discord?.channelId)
        await this.sendText(input.data.discord.channelId, reply)
    }
    catch {
      if (!requestSignal.aborted) {
        log.error('Discord reply failed')
        if (input.data.discord && 'voiceRequestId' in input.data.discord)
          await this.voiceManager?.handleResponse(input.data.discord, '')
        else if (input.data.discord?.channelId)
          await this.sendText(input.data.discord.channelId, cliMessages[this.config.locale ?? 'vi'].discordFailed).catch(() => {})
      }
    }
    finally {
      controller.abort()
      this.requests.delete(controller)
    }
  }

  async start(): Promise<void> {
    log.log('Starting Discord adapter...')

    try {
      // Log in to Discord if token is available
      if (this.discordToken) {
        await this.discordClient.login(this.discordToken)
        log.log('Discord adapter started successfully')
      }
      else {
        log.warn('Discord token not provided. Waiting for configuration from UI.')
      }
    }
    catch (error) {
      log.withError(error).error('Failed to start Discord adapter')
      throw error
    }
  }

  async stop(): Promise<void> {
    log.log('Stopping Discord adapter...')
    try {
      this.closing = true
      for (const request of this.requests)
        request.abort()
      this.releaseVoice()
      await this.voiceLoading?.catch(() => {})
      await this.discordClient.destroy()
      this.airiClient?.close()
      log.log('Discord adapter stopped')
    }
    catch (error) {
      log.withError(error).error('Error stopping Discord adapter')
      throw error
    }
  }
}
