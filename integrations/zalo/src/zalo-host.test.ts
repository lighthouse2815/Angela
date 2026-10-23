import type { ZaloClient } from './adapters/zalo/zalo-types'

import process from 'node:process'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { LocalZaloCredentialStore } from './adapters/zalo/zalo-credential-store'
import { LocalAwayModeStore } from './away/away-mode-store'
import { runZalo } from './zalo-command'

const transport = vi.hoisted(() => ({ connect: vi.fn<ZaloClient['connect']>(), send: vi.fn<ZaloClient['send']>(), disconnect: vi.fn<ZaloClient['disconnect']>() }))
const providers = vi.hoisted(() => ({ listProviders: vi.fn(), getGenerationProvider: vi.fn() }))
vi.mock('./adapters/zalo/zalo-client', () => ({ PersonalZaloClient: class {
  connect = transport.connect
  send = transport.send
  disconnect = transport.disconnect
} }))
vi.mock('@angela/provider-inference', () => providers)

const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup(mode: 'notify-only' | 'assistant-reply', configured = false) {
  const root = await mkdtemp(join(tmpdir(), 'angela-zalo-host-'))
  directories.push(root)
  await new LocalZaloCredentialStore(join(root, 'zalo'), () => {}).save({ accountId: '111', session: {
    imei: 'test-device',
    userAgent: 'test-agent',
    cookie: [{ key: 'zpsid', value: 'COOKIE_SECRET' }],
  } })
  const store = new LocalAwayModeStore(join(root, 'zalo'), '111')
  await store.configure((state) => {
    state.enabled = true
    state.mode = mode
    state.allowedUsers = ['222']
    state.sessionId = 'away-test'
  })
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  transport.disconnect.mockResolvedValue()
  transport.send.mockResolvedValue('reply-id')
  let receive: Parameters<ZaloClient['connect']>[0] | undefined
  transport.connect.mockImplementation(async (incoming) => {
    receive = incoming
    return '111'
  })
  const existing = new Set(process.listeners('SIGINT'))
  const done = runZalo(['run', '--data-dir', root, '--locale', 'en'], {
    ANGELA_MODEL: configured ? 'model' : '',
    ANGELA_CONFIG: join(root, 'nonexistent-config.json'),
  })
  // Record rejection immediately, then stop only this host's registered signal callback during cleanup.
  let failure: unknown
  const settled = done.catch((error: unknown) => {
    failure = error
  })
  return {
    store,
    stderr,
    stdout,
    start: async () => {
      await vi.waitFor(() => expect(transport.connect).toHaveBeenCalledOnce())
      receive!({ channel: 'zalo', source: 'zalo', sourceType: 'external-user', accountId: '111', senderId: '222', conversationId: '222', messageId: 'dm-1', text: 'Leave this message for the owner', receivedAt: new Date().toISOString(), isSelf: false })
      await vi.waitFor(() => expect(transport.send).toHaveBeenCalledOnce())
    },
    stop: async () => {
      for (const listener of process.listeners('SIGINT')) {
        if (!existing.has(listener))
          listener('SIGINT')
      }
      await settled
      expect(failure).toBeUndefined()
    },
  }
}

it('runs notify-only and replies with no model or provider configuration', async () => {
  const host = await setup('notify-only')
  try {
    await host.start()
    expect(providers.listProviders).not.toHaveBeenCalled()
    expect(providers.getGenerationProvider).not.toHaveBeenCalled()
    expect(transport.send).toHaveBeenCalledWith('222', cliMessages.en.away.offline)
    expect((await host.store.records())[0]).toMatchObject({ replyStatus: 'sent' })
  }
  finally { await host.stop() }
})

it('falls back to notify-only when assistant-reply has no model', async () => {
  const host = await setup('assistant-reply')
  try {
    await host.start()
    expect(transport.send).toHaveBeenCalledWith('222', cliMessages.en.away.offline)
    expect(JSON.stringify(host.stderr.mock.calls)).toContain('runtime_failed')
  }
  finally { await host.stop() }
})

it('keeps the listener alive when a configured provider cannot initialize', async () => {
  providers.listProviders.mockImplementation(() => {
    throw new Error('PRIVATE_PROVIDER_CONFIG')
  })
  const host = await setup('assistant-reply', true)
  try {
    await host.start()
    expect(providers.listProviders).toHaveBeenCalledOnce()
    expect(transport.send).toHaveBeenCalledWith('222', cliMessages.en.away.offline)
    expect(JSON.stringify(host.stderr.mock.calls)).not.toContain('PRIVATE_PROVIDER_CONFIG')
    expect(JSON.stringify(host.stdout.mock.calls)).not.toContain('COOKIE_SECRET')
  }
  finally { await host.stop() }
})
