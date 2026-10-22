import type { WebSocketEventOf } from '@angela/server-shared/types'
import type { AudioPlayer, VoiceConnection } from '@discordjs/voice'
import type { ChatInputCommandInteraction, Client, VoiceChannel } from 'discord.js'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import OpusScript from 'opusscript'

import { cliMessages } from '@angela/i18n/cli'
import { AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource, entersState, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Speech } from '../../../pipelines/speech'
import { VoiceManager } from './summon'

vi.mock('@discordjs/voice', async (original) => {
  const sdk = await original<typeof import('@discordjs/voice')>()
  return { ...sdk, joinVoiceChannel: vi.fn(), createAudioPlayer: vi.fn(), createAudioResource: vi.fn(), entersState: vi.fn() }
})

const managers: VoiceManager[] = []
beforeEach(() => {
  vi.spyOn(Speech.prototype, 'transcribe').mockResolvedValue('Xin chào Angela')
  vi.spyOn(Speech.prototype, 'synthesize').mockResolvedValue(Buffer.from('test-audio'))
})
afterEach(() => {
  for (const manager of managers.splice(0))
    manager.close()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.useRealTimers()
})

function setup() {
  const send = vi.fn<(event: WebSocketEventOf<'input:text'>, signal: AbortSignal) => void>()
  const speech = new Speech({ OPENAI_STT_API_BASE_URL: 'http://speech.test/v1/', OPENAI_STT_MODEL: 'stt', OPENAI_TTS_API_BASE_URL: 'http://speech.test/v1/', OPENAI_TTS_MODEL: 'tts', OPENAI_TTS_VOICE: 'voice' })
  const manager = new VoiceManager({ user: { id: 'bot' } } as Client, send, speech, cliMessages.vi.discordVoice)
  managers.push(manager)
  function room(guildId = 'guild-1', channelId = 'room-1') {
    const speaking = new EventEmitter()
    const streams = new Map<string, PassThrough>()
    const connection = Object.assign(new EventEmitter(), {
      state: { status: VoiceConnectionStatus.Ready },
      joinConfig: { guildId, channelId },
      subscribe: vi.fn(),
      destroy: vi.fn(),
      receiver: { speaking, subscribe: vi.fn((id: string) => {
        const stream = new PassThrough()
        streams.set(id, stream)
        return stream
      }) },
    })
    const player = Object.assign(new EventEmitter(), { play: vi.fn(), stop: vi.fn(() => true) })
    vi.mocked(joinVoiceChannel).mockReturnValueOnce(connection as unknown as VoiceConnection)
    vi.mocked(createAudioPlayer).mockReturnValueOnce(player as unknown as AudioPlayer)
    vi.mocked(entersState).mockImplementation(async target => target)
    vi.mocked(createAudioResource).mockImplementation(() => new AudioResource([], [new PassThrough()], null, 5))
    const members = new Map(['alice', 'bob'].map(id => [id, { id, displayName: id, user: { bot: false }, voice: { channelId } }]))
    const channel = { id: channelId, type: 2, joinable: true, speakable: true, members, send: vi.fn(async () => {}), guild: { id: guildId, name: guildId, voiceAdapterCreator: vi.fn() } }
    const interaction = {
      guildId,
      channelId,
      guild: { members: { fetch: vi.fn(async (id: string) => ({ ...members.get(id), voice: { channelId, channel } })) } },
      user: { id: 'alice' },
      deferReply: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
      options: { getBoolean: vi.fn(() => true) },
    }
    const command = interaction as unknown as ChatInputCommandInteraction
    Object.assign(channel.guild, { members: interaction.guild.members })
    async function say(id = 'alice', end = true, amplitude = 10000) {
      speaking.emit('start', id)
      const stream = streams.get(id)!
      const encoder = new OpusScript(48000, 2, OpusScript.Application.VOIP)
      try {
        const pcm = Buffer.alloc(3840)
        for (let sample = 0; sample < 960; sample++) {
          const value = Math.round(Math.sin(sample * Math.PI / 36) * amplitude)
          pcm.writeInt16LE(value, sample * 4)
          pcm.writeInt16LE(value, sample * 4 + 2)
        }
        for (let frame = 0; frame < 12; frame++)
          stream.write(encoder.encode(pcm, 960))
      }
      finally {
        encoder.delete()
      }
      if (end)
        stream.end()
      await Promise.resolve()
      return stream
    }
    return { connection, player, speaking, streams, channel: channel as unknown as VoiceChannel, interaction, command, say }
  }
  const context = () => send.mock.calls.at(-1)![0].data.discord
  return { manager, room, speech, send, context }
}

it('waits for Ready, decodes real Opus, identifies speakers, and plays the correlated response', async () => {
  const { manager, room, send, context } = setup()
  const call = room()
  await manager.handleJoinChannelCommand(call.command)
  expect(entersState).toHaveBeenCalledWith(call.connection, VoiceConnectionStatus.Ready, 20_000)
  expect(call.interaction.editReply).toHaveBeenCalledWith(cliMessages.vi.discordVoice.joined)
  await call.say('alice')
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  expect(send.mock.calls[0][0].data.overrides?.sessionId).toBe('discord-voice-guild-1-room-1')
  expect(context()?.guildMember?.id).toBe('alice')
  const wav = vi.mocked(Speech.prototype.transcribe).mock.calls[0][0]
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
  expect(wav.readUInt32LE(24)).toBe(16000)
  expect(wav.readUInt16LE(22)).toBe(1)
  expect(await manager.handleResponse(context(), 'Chào Alice')).toBe(true)
  expect(await manager.handleResponse(context(), 'Duplicate response')).toBe(true)
  expect(Speech.prototype.synthesize).toHaveBeenCalledOnce()
  expect(call.player.play).toHaveBeenCalledOnce()
  call.player.emit(AudioPlayerStatus.Idle)
  await call.say('bob')
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
  expect(context()?.guildMember?.id).toBe('bob')
  expect(vi.mocked(Speech.prototype.synthesize).mock.calls[0][0]).toBe('Chào Alice')
})

it('isolates capture and playback across guilds', async () => {
  const { manager, room, send } = setup()
  const first = room()
  await manager.handleJoinChannelCommand(first.command)
  const second = room('guild-2', 'room-2')
  await manager.handleJoinChannelCommand(second.command)
  await first.say('alice')
  await second.say('bob')
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
  const firstContext = send.mock.calls.find(([event]) => event.data.discord?.guildId === 'guild-1')![0].data.discord
  const secondContext = send.mock.calls.find(([event]) => event.data.discord?.guildId === 'guild-2')![0].data.discord
  await manager.handleResponse(firstContext, 'First room')
  expect(first.player.play).toHaveBeenCalledOnce()
  expect(second.player.play).not.toHaveBeenCalled()
  await manager.handleResponse(secondContext, 'Second room')
  expect(second.player.play).toHaveBeenCalledOnce()
})

it('suppresses interrupted and duplicated responses and aborts late speech synthesis', async () => {
  const { manager, room, send, context } = setup()
  const call = room()
  await manager.handleJoinChannelCommand(call.command)
  await call.say('alice')
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  const oldContext = context()
  const capture = await call.say('bob', false)
  expect(send.mock.calls[0][1].aborted).toBe(true)
  await manager.handleResponse(oldContext, 'Too late')
  expect(Speech.prototype.synthesize).not.toHaveBeenCalled()
  capture.end()
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
  const pending = Promise.withResolvers<Awaited<ReturnType<Speech['synthesize']>>>()
  vi.mocked(Speech.prototype.synthesize).mockReturnValueOnce(pending.promise)
  const response = manager.handleResponse(context(), 'Interrupted during synthesis')
  await call.say('alice', false)
  expect(vi.mocked(Speech.prototype.synthesize).mock.calls[0][1].aborted).toBe(true)
  pending.resolve(Buffer.from('late-audio'))
  await response
  expect(call.player.play).not.toHaveBeenCalled()
  expect(await manager.handleResponse(oldContext, 'Duplicate')).toBe(true)
  expect(await manager.handleResponse(undefined, 'Text-only reply')).toBe(false)
})

it('pauses capture and playback, rejects control outside the room, and resumes explicitly', async () => {
  const { manager, room, send, context } = setup()
  const call = room()
  await manager.handleJoinChannelCommand(call.command)
  await call.say()
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  await manager.handleResponse(context(), 'Playing')
  const resource = vi.mocked(createAudioResource).mock.results[0].value
  call.interaction.options.getBoolean.mockReturnValue(false)
  await manager.handleListeningCommand(call.command)
  expect(resource.playStream.destroyed).toBe(true)
  expect(send.mock.calls[0][1].aborted).toBe(true)
  call.speaking.emit('start', 'bob')
  expect(call.connection.receiver.subscribe).toHaveBeenCalledOnce()
  call.interaction.options.getBoolean.mockReturnValue(true)
  await manager.handleListeningCommand(call.command)
  await call.say('bob')
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
  call.interaction.guild.members.fetch.mockResolvedValueOnce({ voice: { channelId: 'elsewhere' } } as Awaited<ReturnType<typeof call.interaction.guild.members.fetch>>)
  await manager.handleLeaveChannelCommand(call.command)
  expect(call.connection.destroy).not.toHaveBeenCalled()
  expect(call.interaction.editReply).toHaveBeenCalledWith(cliMessages.vi.discordVoice.sameRoom)
  await manager.handleLeaveChannelCommand(call.command)
  expect(call.connection.destroy).toHaveBeenCalledOnce()
  expect(send.mock.calls[1][1].aborted).toBe(true)
  expect(call.speaking.listenerCount('start')).toBe(0)
})

it('bounds unfinished captures and times out a missing AI response', async () => {
  vi.useFakeTimers()
  const { manager, room, send } = setup()
  const call = room()
  await manager.handleJoinChannelCommand(call.command)
  const stream = await call.say('alice', false)
  await vi.advanceTimersByTimeAsync(30_000)
  expect(stream.destroyed).toBe(true)
  expect(send).not.toHaveBeenCalled()
  expect(call.channel.send).toHaveBeenCalledWith(expect.objectContaining({ content: cliMessages.vi.discordVoice.tooLong }))
  await call.say('bob')
  await vi.advanceTimersByTimeAsync(1)
  expect(send).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(90_000)
  expect(call.channel.send).toHaveBeenCalledWith(expect.objectContaining({ content: cliMessages.vi.discordVoice.timeout }))
  expect(vi.mocked(Speech.prototype.transcribe).mock.calls[0][1].aborted).toBe(true)
})

it('cleans up when joining fails and does not join without speech configuration', async () => {
  const { manager, room } = setup()
  const call = room()
  call.connection.state.status = VoiceConnectionStatus.Signalling
  vi.mocked(entersState).mockRejectedValueOnce(new Error('Connection failed'))
  await manager.handleJoinChannelCommand(call.command)
  expect(call.connection.destroy).toHaveBeenCalledOnce()
  expect(call.interaction.editReply).toHaveBeenCalledWith(cliMessages.vi.discordVoice.joinFailed)
  vi.spyOn(Speech.prototype, 'validate').mockImplementationOnce(() => {
    throw new Error('Missing configuration')
  })
  await manager.handleJoinChannelCommand(call.command)
  expect(call.interaction.editReply).toHaveBeenCalledWith(cliMessages.vi.discordVoice.configuration)
  expect(joinVoiceChannel).toHaveBeenCalledOnce()
})

it('preserves overlapping speaker transcripts while suppressing an interrupted reply', async () => {
  const { manager, room, send, context } = setup()
  const call = room()
  await manager.handleJoinChannelCommand(call.command)
  const alice = await call.say('alice', false)
  const bob = await call.say('bob', false)
  alice.end()
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  expect(context()?.guildMember?.id).toBe('alice')
  bob.end()
  await new Promise<void>(resolve => bob.once('close', resolve))
  await manager.handleResponse(context(), 'Interrupted Alice reply')
  expect(Speech.prototype.synthesize).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
  expect(context()?.guildMember?.id).toBe('bob')
  expect(Speech.prototype.transcribe).toHaveBeenCalledTimes(2)
  await manager.handleResponse(context(), 'Bob reply')
  expect(call.player.play).toHaveBeenCalledOnce()
})

it('ignores quiet captures and cancels pending transcription on shutdown', async () => {
  const { manager, room, send } = setup()
  const call = room()
  await manager.handleJoinChannelCommand(call.command)
  const quiet = await call.say('alice', true, 0)
  await new Promise<void>(resolve => quiet.once('close', resolve))
  expect(Speech.prototype.transcribe).not.toHaveBeenCalled()
  vi.mocked(Speech.prototype.transcribe).mockImplementationOnce(async (_wav, signal) => await new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  await call.say('bob')
  await vi.waitFor(() => expect(Speech.prototype.transcribe).toHaveBeenCalledOnce())
  manager.close()
  expect(vi.mocked(Speech.prototype.transcribe).mock.calls[0][1].aborted).toBe(true)
  expect(send).not.toHaveBeenCalled()
  expect(call.connection.destroy).toHaveBeenCalledOnce()
})

it('stops a call moved by the server before any previous-room response can play', async () => {
  const { manager, room, send, context } = setup()
  const call = room()
  await manager.handleJoinChannelCommand(call.command)
  await call.say()
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  call.connection.joinConfig.channelId = 'another-room'
  call.connection.emit('stateChange', { status: VoiceConnectionStatus.Ready }, { status: VoiceConnectionStatus.Signalling })
  await manager.handleResponse(context(), 'Private reply from previous room')
  expect(call.connection.destroy).toHaveBeenCalledOnce()
  expect(call.player.play).not.toHaveBeenCalled()
  expect(Speech.prototype.synthesize).not.toHaveBeenCalled()
})

it('keeps a replacement call when a previous join fails after shutdown', async () => {
  const { manager, room } = setup()
  const first = room()
  first.connection.state.status = VoiceConnectionStatus.Signalling
  const ready = Promise.withResolvers<void>()
  vi.mocked(entersState).mockImplementationOnce(async (target) => {
    await ready.promise
    return target
  })
  const joining = manager.handleJoinChannelCommand(first.command)
  await vi.waitFor(() => expect(joinVoiceChannel).toHaveBeenCalledOnce())
  manager.close()
  const second = room()
  await manager.handleJoinChannelCommand(second.command)
  ready.reject(new Error('Previous connection ended'))
  await joining
  expect(second.connection.destroy).not.toHaveBeenCalled()
  expect(second.interaction.editReply).toHaveBeenCalledWith(cliMessages.vi.discordVoice.joined)
})

it('fetches an uncached speaker and discards that result if the call ends during lookup', async () => {
  const { manager, room } = setup()
  const call = room()
  await manager.handleJoinChannelCommand(call.command)
  call.channel.members.delete('bob')
  const member = Promise.withResolvers<Awaited<ReturnType<typeof call.interaction.guild.members.fetch>>>()
  call.interaction.guild.members.fetch.mockReturnValueOnce(member.promise)
  call.speaking.emit('start', 'bob')
  expect(call.interaction.guild.members.fetch).toHaveBeenCalledWith('bob')
  manager.close()
  const known = await call.interaction.guild.members.fetch('alice')
  member.resolve({ ...known, id: 'bob', displayName: 'Bob', user: { bot: false } })
  await member.promise
  await Promise.resolve()
  expect(call.connection.receiver.subscribe).not.toHaveBeenCalled()
})
