import type { AwayResponder, ExternalMessage } from './away-types'

import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { AwayModeService } from './away-mode-service'
import { LocalAwayModeStore } from './away-mode-store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'angela-away-'))
  directories.push(root)
  const store = new LocalAwayModeStore(root, '111')
  const log = vi.fn()
  const reply = vi.fn<AwayResponder['reply']>(async () => 'received')
  const send = vi.fn(async () => 'reply-1')
  const service = new AwayModeService(store, cliMessages.en.away, log, { reply })
  const message: ExternalMessage = {
    channel: 'zalo',
    source: 'zalo',
    sourceType: 'external-user',
    accountId: '111',
    conversationId: '222',
    senderId: '222',
    senderName: 'Minh',
    messageId: '1',
    text: 'Ask the owner to send a file tomorrow',
    receivedAt: new Date().toISOString(),
    isSelf: false,
  }
  const receive = (overrides: Partial<ExternalMessage> = {}) => service.receive({ ...message, ...overrides }, send, new AbortController().signal)
  return { root, store, service, message, reply, send, log, receive }
}

it('persists owner on/off/status commands and returns an attributed summary without creating tasks', async () => {
  const { service, store, receive, root } = await setup()
  expect(JSON.parse(await service.command('/away status') ?? '')).toMatchObject({ enabled: false, mode: 'notify-only', allowedUsers: [] })
  await service.command('/zalo allow 222')
  await service.command('/away on')
  const firstSession = (await store.state()).sessionId
  await service.command('/away on')
  expect((await store.state()).sessionId).toBe(firstSession)
  await receive()
  const summary = await service.command('/away off')
  expect(summary).toContain('"222": 1 messages, 1 replies sent')
  expect(summary).toContain('Ask the owner to send a file tomorrow')
  expect(summary).toContain('not owner commitments')
  expect((await store.state()).enabled).toBe(false)
  expect(await store.records(firstSession)).toHaveLength(1)
  expect((await store.records())[0]?.pendingRequest).toEqual({ content: 'Ask the owner to send a file tomorrow', status: 'pending' })
  expect((await readdir(root, { recursive: true })).some(path => path.includes('tasks') || path.includes('memory'))).toBe(false)
})

it.each([
  { name: 'away disabled', enabled: false, allow: true, overrides: {}, status: 'ignored' },
  { name: 'non-whitelisted sender', enabled: true, allow: false, overrides: {}, status: 'whitelist_denied' },
  { name: 'stale replay', enabled: true, allow: true, overrides: { receivedAt: '2020-01-01T00:00:00.000Z' }, status: 'ignored' },
  { name: 'future replay', enabled: true, allow: true, overrides: { receivedAt: '2100-01-01T00:00:00.000Z' }, status: 'ignored' },
])('does not reply or call a model for $name', async ({ enabled, allow, overrides, status }) => {
  const { service, receive, store, send, reply } = await setup()
  if (enabled)
    await service.command('/away on')
  if (allow)
    await service.command('/zalo allow 222')
  await service.command('/away mode assistant-reply')
  await receive(overrides)
  expect(send).not.toHaveBeenCalled()
  expect(reply).not.toHaveBeenCalled()
  expect((await store.records())[0]?.replyStatus).toBe(status)
})

it('ignores self messages without logging message content or persisting owner speech', async () => {
  const { service, receive, store, send, log } = await setup()
  await service.command('/away on')
  await service.command('/zalo allow 222')
  await receive({ isSelf: true })
  expect(send).not.toHaveBeenCalled()
  expect(await store.records()).toEqual([])
  expect(log).toHaveBeenCalledWith('ignored', { messageId: '1', reason: 'self_message' })
})

it('sends only the notification in notify-only mode without model calls', async () => {
  const { service, receive, send, reply } = await setup()
  await service.command('/away on')
  await service.command('/zalo allow 222')
  await receive()
  expect(send).toHaveBeenCalledExactlyOnceWith(cliMessages.en.away.offline)
  expect(reply).not.toHaveBeenCalled()
})

it('routes allowed assistant replies and keeps external claims outside owner memory', async () => {
  const { service, receive, send, reply, store } = await setup()
  await service.command('/away on')
  await service.command('/zalo allow 222')
  await service.command('/away mode assistant-reply')
  await receive({ text: 'The owner likes red' })
  expect(reply).toHaveBeenCalledOnce()
  expect(reply.mock.calls[0]?.[0]).toMatchObject({ sourceType: 'external-user', senderId: '222' })
  expect(send).toHaveBeenCalledExactlyOnceWith(cliMessages.en.away.received)
  expect((await store.records())[0]).toMatchObject({ source: 'zalo', sourceType: 'external-user', text: 'The owner likes red', replyStatus: 'sent', replyMessageId: 'reply-1' })
})

it('rejects duplicates durably after service and store restart', async () => {
  const { service, receive, store, root, message, send } = await setup()
  await service.command('/away on')
  await service.command('/zalo allow 222')
  await receive()
  await receive()
  const restored = new AwayModeService(new LocalAwayModeStore(root, '111'), cliMessages.en.away, () => {})
  await restored.receive(message, send, new AbortController().signal)
  expect(send).toHaveBeenCalledOnce()
  expect(await store.records()).toHaveLength(1)
})

it('rate limits before model calls, including after host restart and a new away session', async () => {
  const { service, receive, root, message, send, reply, store } = await setup()
  await service.command('/away on')
  await service.command('/zalo allow 222')
  await service.command('/away mode assistant-reply')
  for (let index = 0; index < 4; index++)
    await receive({ messageId: String(index) })
  expect(send).toHaveBeenCalledTimes(3)
  expect(reply).toHaveBeenCalledTimes(3)
  expect((await store.records()).filter(record => record.replyStatus === 'rate_limited')).toHaveLength(1)
  await service.command('/away off')
  await service.command('/away on')
  const restored = new AwayModeService(new LocalAwayModeStore(root, '111'), cliMessages.en.away, () => {}, { reply })
  await restored.receive({ ...message, messageId: 'new' }, send, new AbortController().signal)
  expect(reply).toHaveBeenCalledTimes(3)
  expect(send).toHaveBeenCalledTimes(3)
})

it('uses a safe fallback on model failure and records send failure without retry', async () => {
  const { service, receive, reply, send, store } = await setup()
  await service.command('/away on')
  await service.command('/zalo allow 222')
  await service.command('/away mode assistant-reply')
  reply.mockRejectedValueOnce(new Error('Sensitive provider context'))
  send.mockRejectedValueOnce(new Error('Cookie=secret transport error'))
  await receive()
  await receive()
  expect(send).toHaveBeenCalledExactlyOnceWith(cliMessages.en.away.offline)
  expect((await store.records())[0]).toMatchObject({ replyStatus: 'failed', reason: 'send_failed' })
  expect(JSON.stringify(await store.records())).not.toContain('secret transport')
})

it('rechecks revoked whitelist permissions after model generation', async () => {
  const { service, receive, reply, send, store } = await setup()
  await service.command('/away on')
  await service.command('/zalo allow 222')
  await service.command('/away mode assistant-reply')
  reply.mockImplementationOnce(async () => {
    await service.command('/zalo deny 222')
    return 'received'
  })
  await receive()
  expect(send).not.toHaveBeenCalled()
  expect((await store.records())[0]).toMatchObject({ replyStatus: 'ignored', reason: 'authorization_changed' })
})

it('keeps account whitelists isolated and denies display-name authorization', async () => {
  const { service, root } = await setup()
  expect(await service.command('/zalo allow Minh')).toBe(cliMessages.en.away.invalid)
  await service.command('/zalo allow 222')
  expect(await service.command('/zalo allowed')).toBe('["222"]')
  expect((await new LocalAwayModeStore(root, '333').state()).allowedUsers).toEqual([])
  await service.command('/zalo deny 222')
  expect(await service.command('/zalo allowed')).toBe('[]')
})
