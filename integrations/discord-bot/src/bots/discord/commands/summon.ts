import type { AudioPlayer, AudioResource, VoiceConnection } from '@discordjs/voice'
import type { cliMessages } from '@proj-airi/i18n/cli'
import type { WebSocketEventOf } from '@proj-airi/server-shared/types'
import type { ChatInputCommandInteraction, Client as DiscordClient, VoiceChannel } from 'discord.js'

import type { Speech } from '../../../pipelines/speech'

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { pipeline, Readable } from 'node:stream'

import { AudioPlayerStatus, createAudioPlayer, createAudioResource, EndBehaviorType, entersState, joinVoiceChannel, NoSubscriberBehavior, StreamType, VoiceConnectionStatus } from '@discordjs/voice'
import { useLogg } from '@guiiai/logg'
import { ChannelType } from 'discord.js'

import * as v from 'valibot'

import { DECODE_SAMPLE_RATE } from '../../../constants/audio'
import { convertOpusToWav } from '../../../utils/audio'
import { OpusDecoder } from '../../../utils/opus'

// The original Discord context returns with the AI response. Room and request IDs fence late or duplicated responses.
const voiceContext = v.object({
  guildId: v.string(),
  channelId: v.string(),
  voiceRequestId: v.pipe(v.string(), v.uuid()),
  guildMember: v.object({ id: v.string(), displayName: v.string(), nickname: v.string() }),
})
interface Turn {
  id: string
  userId: string
  stage: 'transcribing' | 'waiting' | 'synthesizing' | 'playing'
  controller: AbortController
  finished: ReturnType<typeof Promise.withResolvers<void>>
  suppressed: boolean
}
interface Capture { stream: Readable, decoder: OpusDecoder, voiced: boolean }
interface Utterance { userId: string, displayName: string, pcm: Buffer }
interface Room {
  channel: VoiceChannel
  connection: VoiceConnection
  player: AudioPlayer
  resource?: AudioResource
  paused: boolean
  captures: Map<string, Capture>
  queue: Utterance[]
  draining: boolean
  turn?: Turn
  lastNotice: number
  onSpeaking: (userId: string) => void
}

/** Owns one call per guild. Each room has independent capture, reply correlation, cancellation, and playback. */
export class VoiceManager {
  private readonly logger = useLogg('VoiceManager').useGlobalConfig()
  private readonly rooms = new Map<string, Room>()

  constructor(
    private readonly client: DiscordClient,
    private readonly sendInput: (input: WebSocketEventOf<'input:text'>, signal: AbortSignal) => void | Promise<void>,
    private readonly speech: Speech,
    private readonly messages: typeof cliMessages.en.discordVoice,
  ) {}

  async handleJoinChannelCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply()
    if (!interaction.guild) {
      await interaction.editReply(this.messages.joinFirst)
      return
    }
    const member = await interaction.guild.members.fetch(interaction.user.id)
    const channel = member.voice.channel
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await interaction.editReply(this.messages.joinFirst)
      return
    }
    const previous = this.rooms.get(channel.guild.id)
    if (previous) {
      await interaction.editReply(previous.channel.id === channel.id ? this.messages.alreadyJoined : this.messages.otherRoom)
      return
    }
    try {
      this.speech.validate()
    }
    catch {
      await interaction.editReply(this.messages.configuration)
      return
    }
    let room: Room | undefined
    try {
      if (this.rooms.size >= 4)
        throw new Error('Discord voice room limit reached')
      if (!channel.joinable || !channel.speakable)
        throw new Error('Voice channel permissions are unavailable')
      room = this.join(channel)
      await entersState(room.connection, VoiceConnectionStatus.Ready, 20_000)
      if (this.rooms.get(channel.guild.id) !== room)
        throw new Error('Voice connection closed during startup')
      await interaction.editReply(this.messages.joined)
      if (interaction.channelId !== channel.id)
        await channel.send({ content: this.messages.joined, allowedMentions: { parse: [] } })
      room.paused = false
    }
    catch {
      if (room && this.rooms.get(channel.guild.id) === room)
        this.leave(channel.guild.id)
      await interaction.editReply(this.messages.joinFailed)
    }
  }

  async handleLeaveChannelCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply()
    const room = await this.controlledRoom(interaction)
    if (!room)
      return
    this.leave(room.channel.guild.id)
    await interaction.editReply(this.messages.left)
  }

  async handleListeningCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply()
    const room = await this.controlledRoom(interaction)
    if (!room)
      return
    room.paused = !interaction.options.getBoolean('enabled', true)
    if (room.paused)
      this.clear(room)
    await interaction.editReply(room.paused ? this.messages.paused : this.messages.listening)
  }

  /** Returns true for voice responses, including stale ones, so they cannot fall through to ordinary text delivery. */
  async handleResponse(context: unknown, text: string) {
    if (!context || typeof context !== 'object' || !('voiceRequestId' in context))
      return false
    const parsed = v.safeParse(voiceContext, context)
    if (!parsed.success)
      return true
    const data = parsed.output
    const room = this.rooms.get(data.guildId)
    const turn = room?.turn
    if (!room || room.paused || room.channel.id !== data.channelId || !turn || turn.id !== data.voiceRequestId
      || turn.userId !== data.guildMember.id || turn.stage !== 'waiting') {
      return true
    }
    if (!text.trim()) {
      this.notice(room, this.messages.failed)
      this.interrupt(room)
      return true
    }
    if (turn.suppressed || [...room.captures.values()].some(capture => capture.voiced)) {
      this.interrupt(room)
      return true
    }
    turn.stage = 'synthesizing'
    try {
      const audio = await this.speech.synthesize(text, turn.controller.signal)
      if (room.turn !== turn || turn.controller.signal.aborted || room.paused)
        return true
      turn.stage = 'playing'
      room.resource = createAudioResource(Readable.from([audio]), { inputType: StreamType.Arbitrary })
      room.player.play(room.resource)
    }
    catch {
      if (!turn.controller.signal.aborted) {
        this.notice(room, this.messages.failed)
        this.interrupt(room)
      }
    }
    return true
  }

  /** Stops every capture, pending speech request, playback stream, and voice connection before the adapter disconnects. */
  close() {
    for (const guildId of this.rooms.keys())
      this.leave(guildId)
  }

  private join(channel: VoiceChannel) {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      group: this.client.user!.id,
      selfDeaf: false,
      selfMute: false,
    })
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } })
    const onSpeaking = (userId: string) => {
      const current = this.rooms.get(channel.guild.id)
      if (current?.connection === connection)
        void this.capture(current, userId).catch(() => this.notice(current, this.messages.failed))
    }
    const room: Room = { channel, connection, player, paused: true, captures: new Map(), queue: [], draining: false, lastNotice: 0, onSpeaking }
    this.rooms.set(channel.guild.id, room)
    connection.subscribe(player)
    connection.receiver.speaking.on('start', onSpeaking)
    connection.on('error', () => this.notice(room, this.messages.failed))
    connection.on('stateChange', (_oldState, state) => {
      if (connection.joinConfig.channelId !== channel.id || state.status === VoiceConnectionStatus.Destroyed) {
        if (this.rooms.get(channel.guild.id) === room)
          this.leave(channel.guild.id)
      }
      else if (state.status === VoiceConnectionStatus.Disconnected) {
        this.clear(room)
        void Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]).catch(() => {
          if (this.rooms.get(channel.guild.id) === room)
            this.leave(channel.guild.id)
        })
      }
    })
    player.on('error', () => {
      this.notice(room, this.messages.failed)
      this.interrupt(room)
    })
    player.on(AudioPlayerStatus.Idle, () => {
      if (room.turn?.stage === 'playing')
        room.turn.finished.resolve()
      room.resource = undefined
    })
    return room
  }

  private async controlledRoom(interaction: ChatInputCommandInteraction) {
    const room = interaction.guildId ? this.rooms.get(interaction.guildId) : undefined
    if (!room || !interaction.guild) {
      await interaction.editReply(this.messages.absent)
      return undefined
    }
    const member = await interaction.guild.members.fetch(interaction.user.id)
    if (member.voice.channelId !== room.channel.id) {
      await interaction.editReply(this.messages.sameRoom)
      return undefined
    }
    return room
  }

  private async capture(room: Room, userId: string) {
    if (room.paused || room.connection.state.status !== VoiceConnectionStatus.Ready
      || this.rooms.get(room.channel.guild.id) !== room || room.captures.has(userId) || room.captures.size >= 4) {
      return
    }
    const member = room.channel.members.get(userId) ?? await room.channel.guild.members.fetch(userId).catch(() => undefined)
    // An uncached speaker must still belong to this live call before any provider receives their audio.
    if (!member || member.user.bot || member.voice.channelId !== room.channel.id || room.paused
      || room.connection.state.status !== VoiceConnectionStatus.Ready
      || this.rooms.get(room.channel.guild.id) !== room || room.captures.has(userId) || room.captures.size >= 4) {
      return
    }
    const stream = room.connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 800 } })
    const decoder = new OpusDecoder(DECODE_SAMPLE_RATE, 1)
    const capture: Capture = { stream, decoder, voiced: false }
    room.captures.set(userId, capture)
    const buffers: Buffer[] = []
    let size = 0
    let voicedSamples = 0
    let tooLong = false
    const limit = setTimeout(() => {
      tooLong = true
      stream.destroy(new Error('Voice capture limit exceeded'))
    }, 30_000)
    limit.unref()
    decoder.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > DECODE_SAMPLE_RATE * 2 * 30) {
        tooLong = true
        stream.destroy(new Error('Voice capture limit exceeded'))
        return
      }
      buffers.push(chunk)
      let energy = 0
      for (let offset = 0; offset + 1 < chunk.length; offset += 2)
        energy += (chunk.readInt16LE(offset) / 32768) ** 2
      const rms = Math.sqrt(energy / Math.max(1, chunk.length / 2))
      if (rms > 0.015)
        voicedSamples += chunk.length / 2
      if (!capture.voiced && voicedSamples >= DECODE_SAMPLE_RATE * 0.06) {
        capture.voiced = true
        if (room.turn?.stage === 'transcribing')
          room.turn.suppressed = true
        else
          this.interrupt(room)
      }
    })
    pipeline(stream, decoder, (error) => {
      clearTimeout(limit)
      // Pause, leave, and replacement remove the capture first. Their late callbacks cannot enqueue another request.
      if (room.captures.get(userId) !== capture)
        return
      room.captures.delete(userId)
      if (error) {
        this.notice(room, tooLong ? this.messages.tooLong : this.messages.failed)
        return
      }
      if (!capture.voiced || size < DECODE_SAMPLE_RATE * 2 * 0.2)
        return
      if (room.queue.length >= 4) {
        this.notice(room, this.messages.queueFull)
        return
      }
      room.queue.push({ userId, displayName: member.displayName, pcm: Buffer.concat(buffers, size) })
      void this.drain(room)
    })
  }

  private async drain(room: Room) {
    if (room.draining)
      return
    room.draining = true
    try {
      while (!room.paused && this.rooms.get(room.channel.guild.id) === room && room.queue.length) {
        const utterance = room.queue.shift()!
        const turn: Turn = {
          id: randomUUID(),
          userId: utterance.userId,
          stage: 'transcribing',
          controller: new AbortController(),
          finished: Promise.withResolvers<void>(),
          suppressed: [...room.captures.values()].some(capture => capture.voiced),
        }
        room.turn = turn
        const deadline = setTimeout(() => {
          if (room.turn === turn) {
            this.notice(room, this.messages.timeout)
            this.interrupt(room)
          }
        }, 90_000)
        deadline.unref()
        try {
          const text = await this.speech.transcribe(convertOpusToWav(utterance.pcm), turn.controller.signal)
          if (turn.controller.signal.aborted || room.turn !== turn)
            continue
          if (!text || text.includes('[BLANK_AUDIO]'))
            continue
          const discord = {
            guildId: room.channel.guild.id,
            guildName: room.channel.guild.name,
            channelId: room.channel.id,
            voiceRequestId: turn.id,
            guildMember: { id: utterance.userId, displayName: utterance.displayName, nickname: utterance.displayName },
          }
          turn.stage = 'waiting'
          await this.sendInput({
            type: 'input:text',
            data: {
              text,
              discord,
              overrides: {
                sessionId: `discord-voice-${room.channel.guild.id}-${room.channel.id}`,
                messagePrefix: `[Discord voice ${JSON.stringify({ userId: utterance.userId, displayName: utterance.displayName })}]: `,
              },
            },
          }, turn.controller.signal)
          await turn.finished.promise
        }
        catch {
          if (!turn.controller.signal.aborted)
            this.notice(room, this.messages.failed)
        }
        finally {
          clearTimeout(deadline)
          if (room.turn === turn)
            this.interrupt(room)
        }
      }
    }
    finally {
      room.draining = false
    }
  }

  private interrupt(room: Room) {
    const turn = room.turn
    room.turn = undefined
    turn?.controller.abort()
    turn?.finished.resolve()
    const resource = room.resource
    room.resource = undefined
    room.player.stop(true)
    resource?.playStream.destroy()
  }

  private clear(room: Room) {
    room.queue.length = 0
    this.interrupt(room)
    const captures = [...room.captures.values()]
    room.captures.clear()
    for (const capture of captures) {
      capture.stream.destroy()
      capture.decoder.destroy()
    }
  }

  private leave(guildId: string) {
    const room = this.rooms.get(guildId)
    if (!room)
      return
    this.rooms.delete(guildId)
    room.paused = true
    this.clear(room)
    room.connection.receiver.speaking.off('start', room.onSpeaking)
    room.player.removeAllListeners(AudioPlayerStatus.Idle)
    if (room.connection.state.status !== VoiceConnectionStatus.Destroyed)
      room.connection.destroy()
  }

  private notice(room: Room, message: string) {
    if (this.rooms.get(room.channel.guild.id) !== room || Date.now() - room.lastNotice < 10_000)
      return
    room.lastNotice = Date.now()
    this.logger.warn('Discord voice notice')
    void room.channel.send({ content: message, allowedMentions: { parse: [] } }).catch(() => {
      this.logger.warn('Discord voice notice delivery failed')
    })
  }
}
