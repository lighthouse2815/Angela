import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { cliMessages } from '@angela/i18n/cli'
import { LocalZaloCredentialStore } from '@angela/zalo/adapters/zalo/zalo-credential-store'
import { LocalAwayModeStore } from '@angela/zalo/away/away-mode-store'
import { afterEach, expect, it } from 'vitest'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'angela-zalo-command-'))
  directories.push(root)
  const credentials = new LocalZaloCredentialStore(join(root, 'zalo'), () => {})
  await credentials.save({ accountId: '111', session: {
    imei: 'test-device',
    userAgent: 'test-agent',
    cookie: [{ key: 'zpsid', value: 'COOKIE_SECRET' }],
  } })
  const run = (args: string[]) => promisify(execFile)(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./bin/run.ts', import.meta.url)), ...args, '--data-dir', root, '--locale', 'en'], {
    env: { ...process.env, ANGELA_MODEL: '', ANGELA_CONFIG: join(root, 'config.json') },
    timeout: 10_000,
  })
  return { root, run, credentials }
}

it('persists away and whitelist commands through actual CLI processes without a model or network', async () => {
  const { run } = await setup()
  expect(JSON.parse((await run(['away', 'status'])).stdout)).toMatchObject({ enabled: false, allowedUsers: [] })
  expect((await run(['zalo', 'allow', '222'])).stdout.trim()).toBe('["222"]')
  expect((await run(['zalo', 'allowed'])).stdout.trim()).toBe('["222"]')
  expect(JSON.parse((await run(['away', 'on'])).stdout)).toMatchObject({ enabled: true })
  expect(JSON.parse((await run(['away', 'mode', 'assistant-reply'])).stdout)).toMatchObject({ enabled: true, mode: 'assistant-reply' })
  expect((await run(['away', 'off'])).stdout.trim()).toBe(cliMessages.en.away.empty)
  expect((await run(['zalo', 'deny', '222'])).stdout.trim()).toBe('[]')
  const status = await run(['zalo', 'status'])
  expect(JSON.parse(status.stdout)).toMatchObject({ savedSession: true, accountId: '111', connection: 'not-probed', away: { enabled: false } })
  expect(status.stdout).not.toContain('COOKIE_SECRET')
  expect(status.stderr).not.toContain('COOKIE_SECRET')
}, 60_000)

it('provides login help without authentication and erases local session secrets on logout', async () => {
  const { run, credentials } = await setup()
  expect((await run(['zalo', '--help'])).stdout).toContain('angela zalo login|logout|status|run')
  expect((await run(['zalo', 'logout'])).stdout).toContain(cliMessages.en.away.logout)
  expect(await credentials.load()).toBeNull()
  expect((await run(['away', 'on'])).stdout.trim()).toBe(cliMessages.en.away.missing)
}, 20_000)

it('shows recent contact metadata through owner CLI without exposing message content or authorizing display names', async () => {
  const { root, run } = await setup()
  await new LocalAwayModeStore(join(root, 'zalo'), '111').observeContact({
    channel: 'zalo',
    source: 'zalo',
    sourceType: 'external-user',
    accountId: '111',
    senderId: '222',
    senderName: 'Minh\u001B[31m',
    conversationId: '222',
    messageId: '1',
    text: 'PRIVATE_MESSAGE_CONTENT',
    receivedAt: new Date().toISOString(),
    isSelf: false,
  })
  const result = await run(['zalo', 'recent'])
  expect(JSON.parse(result.stdout)).toEqual([expect.objectContaining({ senderId: '222', senderName: 'Minh\u001B[31m', messageCount: 1 })])
  expect(result.stdout).not.toContain('PRIVATE_MESSAGE_CONTENT')
  expect(result.stdout).not.toContain('\u001B')
  expect((await run(['zalo', 'allowed'])).stdout.trim()).toBe('[]')
}, 20_000)
