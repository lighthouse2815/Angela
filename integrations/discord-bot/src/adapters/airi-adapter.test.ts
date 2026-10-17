import type { WebSocketEventOf } from '@proj-airi/server-shared/types'

import { EventEmitter } from 'node:events'

import { ChannelManager, ChannelType, Client, DMChannel, Events, REST } from 'discord.js'
import { afterEach, expect, it, vi } from 'vitest'

import { VoiceManager } from '../bots/discord/commands'
import { DiscordAdapter } from './airi-adapter'

const bridge = vi.hoisted(() => ({ handlers: new Map<string, (event: unknown) => Promise<void>>(), close: vi.fn() }))
vi.mock('@proj-airi/server-sdk', () => ({
  Client: class {
    onEvent(name: string, handler: (event: unknown) => Promise<void>) {
      bridge.handlers.set(name, handler)
    }

    close = bridge.close
  },
}))

const adapters: DiscordAdapter[] = []
afterEach(async () => {
  await Promise.all(adapters.splice(0).map(adapter => adapter.stop()))
  vi.restoreAllMocks()
  bridge.handlers.clear()
  bridge.close.mockClear()
})

it('routes only completed voice turns to speech and keeps their intermediate messages out of text delivery', async () => {
  const fetch = vi.spyOn(ChannelManager.prototype, 'fetch').mockResolvedValue(null)
  const speech = vi.spyOn(VoiceManager.prototype, 'handleResponse')
  const adapter = new DiscordAdapter({ discordToken: 'test-token' })
  adapters.push(adapter)
  const context = { guildId: 'guild', channelId: 'room', voiceRequestId: '8a759a69-ebd8-4842-80e3-d4d8adc98270', guildMember: { id: 'alice', displayName: 'Alice', nickname: 'Alice' } }
  const input = { type: 'input:text' as const, data: { text: 'Hello', discord: context } }
  const data = { 'message': { role: 'assistant' as const, content: 'Hello Alice' }, 'gen-ai:chat': { input, message: { role: 'user' as const, content: 'Hello' }, composedMessage: [], contexts: {} } }
  const partial: WebSocketEventOf<'output:gen-ai:chat:message'> = { type: 'output:gen-ai:chat:message', data }
  await bridge.handlers.get(partial.type)!(partial)
  expect(speech).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  const completed: WebSocketEventOf<'output:gen-ai:chat:complete'> = { type: 'output:gen-ai:chat:complete', data: { ...data, toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, source: 'estimate-based' } } }
  await bridge.handlers.get(completed.type)!(completed)
  expect(speech).toHaveBeenCalledWith(context, 'Hello Alice')
})

it('closes calls before disconnecting or replacing the bot configuration', async () => {
  const close = vi.spyOn(VoiceManager.prototype, 'close')
  const login = vi.spyOn(Client.prototype, 'login').mockResolvedValue('test-token')
  const adapter = new DiscordAdapter({ discordToken: 'test-token' })
  adapters.push(adapter)
  const event: WebSocketEventOf<'module:configure'> = { type: 'module:configure', data: { config: { enabled: false } } }
  await bridge.handlers.get('module:configure')!(event)
  expect(close).toHaveBeenCalledOnce()
  await adapter.stop()
  expect(close).toHaveBeenCalledTimes(2)
  expect(bridge.close).toHaveBeenCalledOnce()
  expect(login).not.toHaveBeenCalled()
})

it('uses the local responder without opening a server channel and sends replies without mentions', async () => {
  const login = vi.spyOn(Client.prototype, 'login').mockResolvedValue('test-token')
  const send = vi.spyOn(DMChannel.prototype, 'send').mockImplementation(vi.fn())
  vi.spyOn(REST.prototype, 'get').mockResolvedValue({ id: '123', type: ChannelType.DM, recipients: [{ id: '456', username: 'Alice', discriminator: '0', avatar: null }] })
  const respond = vi.fn(async () => 'Chào bạn')
  const adapter = new DiscordAdapter({ discordToken: 'test-token', respond })
  adapters.push(adapter)
  await adapter.start()
  const client = login.mock.contexts[0] as Client
  EventEmitter.prototype.emit.call(client, Events.MessageCreate, {
    author: { id: 'alice', username: 'Alice', bot: false },
    content: 'Chào Angela',
    channelId: 'dm-alice',
  })
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  expect(bridge.handlers.size).toBe(0)
  expect(respond).toHaveBeenCalledWith(expect.objectContaining({ text: 'Chào Angela', discord: expect.objectContaining({ channelId: 'dm-alice' }) }), expect.any(AbortSignal))
  expect(send).toHaveBeenCalledWith({ content: 'Chào bạn', allowedMentions: { parse: [] } })
})

it('aborts local generations on shutdown and suppresses their late replies', async () => {
  const login = vi.spyOn(Client.prototype, 'login').mockResolvedValue('test-token')
  const fetch = vi.spyOn(ChannelManager.prototype, 'fetch').mockResolvedValue(null)
  const completed = Promise.withResolvers<string>()
  const respond = vi.fn((_input, _signal: AbortSignal) => completed.promise)
  const adapter = new DiscordAdapter({ discordToken: 'test-token', respond })
  adapters.push(adapter)
  await adapter.start()
  const client = login.mock.contexts[0] as Client
  EventEmitter.prototype.emit.call(client, Events.MessageCreate, { author: { id: 'alice', username: 'Alice', bot: false }, content: 'Wait', channelId: 'dm-alice' })
  await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce())
  await adapter.stop()
  expect(respond.mock.calls[0][1].aborted).toBe(true)
  completed.resolve('Late reply')
  await completed.promise
  expect(fetch).not.toHaveBeenCalled()
})
