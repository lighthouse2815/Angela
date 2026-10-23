import type { Credentials, LoginQRCallback } from 'zca-js'

import type { ZaloCredentials, ZaloCredentialStore } from './zalo-types'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'
import { LoginQRCallbackEventType, ThreadType } from 'zca-js'

import { PersonalZaloClient } from './zalo-client'
import { LocalZaloCredentialStore } from './zalo-credential-store'

const sdk = vi.hoisted(() => ({ login: vi.fn(), loginQR: vi.fn(), options: vi.fn() }))
vi.mock('zca-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zca-js')>()
  return { ...actual, Zalo: class {
    constructor(options: unknown) { sdk.options(options) }
    login = sdk.login
    loginQR = sdk.loginQR
  } }
})

const directories: string[] = []
afterEach(async () => {
  vi.clearAllMocks()
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

const session: Credentials = {
  imei: 'test-device',
  userAgent: 'test-agent',
  cookie: [{ key: 'zpsid', value: 'COOKIE_SECRET', domain: 'zalo.me' }],
}

function setup() {
  const listener = Object.assign(new EventEmitter(), {
    start: vi.fn(() => { listener.emit('connected') }),
    stop: vi.fn(),
  })
  const api = {
    listener,
    getOwnId: () => '111',
    getContext: () => ({ imei: session.imei, userAgent: session.userAgent }),
    getCookie: () => ({ toJSON: () => ({ cookies: session.cookie }) }),
    sendMessage: vi.fn(async () => ({ message: { msgId: 123 }, attachment: [] })),
  }
  let saved: ZaloCredentials | null = { accountId: '111', session }
  const credentials: ZaloCredentialStore = {
    load: vi.fn(async () => saved),
    save: vi.fn(async (value) => { saved = value }),
    clear: vi.fn(async () => { saved = null }),
  }
  sdk.login.mockResolvedValue(api)
  const client = new PersonalZaloClient(credentials)
  const log = vi.fn()
  const receive = vi.fn()
  const disconnected = vi.fn()
  const signal = new AbortController().signal
  return { api, client, credentials, log, receive, disconnected, signal }
}

it('restores a saved session, refreshes cookies, normalizes text DMs, and sends through real SDK method names', async () => {
  const { client, api, credentials, receive, log, disconnected, signal } = setup()
  expect(await client.connect(receive, log, disconnected, signal)).toBe('111')
  expect(sdk.login).toHaveBeenCalledWith(session)
  expect(sdk.loginQR).not.toHaveBeenCalled()
  expect(credentials.save).toHaveBeenCalledWith({ accountId: '111', session })
  expect(sdk.options).toHaveBeenCalledWith(expect.objectContaining({ selfListen: false, logging: false, checkUpdate: false }))
  expect(api.listener.start).toHaveBeenCalledWith({ retryOnClose: false })
  api.listener.emit('message', {
    type: ThreadType.User,
    threadId: '222',
    isSelf: false,
    data: { msgId: 'inbound', content: 'Hello', uidFrom: '222', dName: 'Minh', ts: String(Date.now()) },
  })
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({ source: 'zalo', sourceType: 'external-user', accountId: '111', senderId: '222', conversationId: '222', messageId: 'inbound', text: 'Hello' }))
  expect(await client.send('222', 'I am Angela')).toBe('123')
  expect(api.sendMessage).toHaveBeenCalledWith('I am Angela', '222', ThreadType.User)
  await client.disconnect()
  api.listener.emit('error', new Error('Late cookie=SECRET'))
  expect(disconnected).not.toHaveBeenCalled()
  expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET')
})

it('ignores groups and attachments and does not expose raw SDK errors', async () => {
  const { client, api, receive, log, disconnected, signal } = setup()
  await client.connect(receive, log, disconnected, signal)
  api.listener.emit('message', { type: ThreadType.Group, data: { content: 'group' } })
  api.listener.emit('message', { type: ThreadType.User, data: { content: { href: 'private-attachment' } } })
  api.listener.emit('error', new Error('cookie=COOKIE_SECRET token=TOKEN_SECRET'))
  expect(receive).not.toHaveBeenCalled()
  expect(disconnected).toHaveBeenCalledOnce()
  expect(JSON.stringify(log.mock.calls)).not.toContain('COOKIE_SECRET')
  expect(JSON.stringify(log.mock.calls)).not.toContain('TOKEN_SECRET')
  await client.disconnect()
})

it('redacts authentication and send failures and rejects locally revoked credentials', async () => {
  const { client, api, credentials, receive, log, disconnected, signal } = setup()
  sdk.login.mockRejectedValueOnce(new Error('COOKIE_SECRET'))
  await expect(client.connect(receive, log, disconnected, signal)).rejects.toThrow('Zalo connection failed')
  await client.connect(receive, log, disconnected, signal)
  api.sendMessage.mockRejectedValueOnce(new Error('COOKIE_SECRET'))
  await expect(client.send('222', 'Hello')).rejects.toThrow('Zalo send failed')
  await credentials.clear()
  await expect(client.send('222', 'Hello')).rejects.toThrow('Zalo send failed')
  expect(api.sendMessage).toHaveBeenCalledOnce()
  await client.disconnect()
})

it('persists QR login credentials privately and removes temporary QR material', async () => {
  const { api, signal } = setup()
  const directory = await mkdtemp(join(tmpdir(), 'angela-zalo-credentials-'))
  directories.push(directory)
  const paths: string[] = []
  const credentials = new LocalZaloCredentialStore(directory, path => paths.push(path))
  sdk.loginQR.mockImplementationOnce(async (_options: unknown, callback: LoginQRCallback) => {
    await callback({ type: LoginQRCallbackEventType.QRCodeGenerated, data: { code: 'sensitive-qr', image: Buffer.from('test-qr').toString('base64'), options: { enabledCheckOCR: false, enabledMultiLayer: false }, token: 'SECRET_QR_TOKEN' }, actions: { abort: vi.fn(), retry: vi.fn(), saveToFile: vi.fn() } })
    return api
  })
  expect(await new PersonalZaloClient(credentials).login(credentials, () => {}, signal)).toBe('111')
  expect(paths).toEqual([join(directory, 'zalo-login-qr.png')])
  expect(await readdir(directory)).toEqual(['zalo-credentials.json'])
  const restored = new LocalZaloCredentialStore(directory, () => {})
  expect(await restored.load()).toEqual({ accountId: '111', session })
  expect((await stat(join(directory, 'zalo-credentials.json'))).mode & 0o777).toBe(0o600)
  expect((await stat(directory)).mode & 0o777).toBe(0o700)
  await restored.clear()
  expect(await restored.load()).toBeNull()
  expect(await readFile(join(directory, 'zalo-credentials.json'), 'utf8')).not.toContain('COOKIE_SECRET')
})

it('prevents competing local hosts and keeps the lease until the owner releases it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-zalo-lease-'))
  directories.push(directory)
  const store = new LocalZaloCredentialStore(directory, () => {})
  const release = await store.acquireHost()
  await expect(store.acquireHost()).rejects.toThrow('Zalo host is active')
  await release()
  const next = await store.acquireHost()
  await next()
})

it('aborts expired QR login without retry or secret output', async () => {
  const { client, log, signal, credentials } = setup()
  const abort = vi.fn()
  const retry = vi.fn()
  const display = { show: vi.fn(), clearQr: vi.fn() }
  sdk.loginQR.mockImplementationOnce(async (_options: unknown, callback: LoginQRCallback) => {
    await callback({ type: LoginQRCallbackEventType.QRCodeExpired, data: null, actions: { abort, retry } })
    throw new Error('SECRET_QR_TOKEN')
  })
  await expect(client.login(display, log, signal)).rejects.toThrow('Zalo authentication failed')
  expect(abort).toHaveBeenCalledOnce()
  expect(retry).not.toHaveBeenCalled()
  expect(credentials.save).not.toHaveBeenCalled()
  expect(display.clearQr).toHaveBeenCalledOnce()
  expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET_QR_TOKEN')
})
