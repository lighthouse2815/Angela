import process from 'node:process'

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { cliMessages } from '@angela/i18n/cli'
import { LocalConfigFile } from '@angela/local-config/node'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Gateway } from './gateway'
import { Startup } from './startup'
import { Terminal } from './terminal'

let directory: string
const sessions: Startup[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-startup-'))
})

afterEach(async () => {
  for (const session of sessions.splice(0))
    await session.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

function setup(answers: string[]) {
  const ask = vi.spyOn(Terminal.prototype, 'ask').mockImplementation(async () => answers.shift())
  const output = vi.spyOn(Terminal.prototype, 'notify').mockResolvedValue()
  const status = vi.spyOn(Gateway.prototype, 'status').mockResolvedValue({ configured: true, running: true })
  const start = vi.spyOn(Gateway.prototype, 'start').mockRejectedValue(new Error('Unexpected host start'))
  const login = vi.spyOn(Gateway.prototype, 'login').mockImplementation(async provider => `http://127.0.0.1:20129/dashboard/providers/${provider ?? ''}`)
  const accounts = vi.spyOn(Gateway.prototype, 'accounts').mockResolvedValue([{ id: 'account-1', provider: 'codex', name: 'Personal', isActive: true }])
  const models = vi.spyOn(Gateway.prototype, 'models').mockResolvedValue([{ id: 'cc/claude-test' }, { id: 'cx/gpt-test' }, { id: 'gc/gemini-test' }])
  const use = vi.spyOn(Gateway.prototype, 'use').mockResolvedValue()
  const endpoint = vi.spyOn(Gateway.prototype, 'endpoint').mockResolvedValue('http://127.0.0.1:20129')
  const password = vi.spyOn(Gateway.prototype, 'password').mockResolvedValue('private-dashboard-password')
  const showKey = vi.spyOn(Gateway.prototype, 'showKey').mockResolvedValue('private-shared-key')
  const keys = vi.spyOn(Gateway.prototype, 'keys').mockResolvedValue([{ id: 'key-1', name: 'angela', isActive: true }])
  const session = new Startup()
  sessions.push(session)
  const env = { ANGELA_CONFIG: join(directory, 'config.json'), ANGELA_GATEWAY_DATA_DIR: join(directory, 'gateway'), ANGELA_LOCALE: 'en' }
  return { session, env, ask, output, status, start, login, accounts, models, use, endpoint, password, showKey, keys }
}

it.each([
  ['--help'],
  ['-h'],
  ['--prompt', 'hello'],
  ['-phello'],
  ['--list-sessions'],
  ['--no-menu'],
  ['--model=m'],
  ['--provider', 'saved'],
  ['--base-url', 'http://localhost:1234/v1/'],
  ['--api=responses'],
])('preserves explicit and non-chat execution without opening a menu: %j', async (...args) => {
  const { session, env, ask, start } = setup([])
  expect(await session.open(args, env)).toEqual({ args, env })
  expect(ask).not.toHaveBeenCalled()
  expect(start).not.toHaveBeenCalled()
  expect(await readdir(directory)).toEqual([])
})

it.each([
  ['1', 'codex', 'cx/gpt-test'],
  ['2', 'gemini-cli', 'gc/gemini-test'],
  ['3', 'claude', 'cc/claude-test'],
])('connects provider %s and selects only its models', async (choice, provider, model) => {
  const { session, env, login, use, output, start, password, showKey } = setup([choice, '', '', '1'])
  const environment = { ...env, ANGELA_API_KEY: 'stale-private-key', ANGELA_MODEL: 'stale-model', ANGELA_BASE_URL: 'https://old.example/v1/', ANGELA_PROVIDER: 'old' }
  const selected = await session.open(['--menu', '--model=old'], environment)
  expect(login).toHaveBeenCalledWith(provider)
  expect(use).toHaveBeenCalledWith(model, env.ANGELA_CONFIG)
  expect(selected?.args.slice(-8)).toEqual(['--provider', 'angela-gateway', '--model', model, '--base-url', 'http://127.0.0.1:20129/v1/', '--api', 'chat-completions'])
  expect(selected?.env.ANGELA_API_KEY).toBeUndefined()
  expect(environment.ANGELA_API_KEY).toBe('stale-private-key')
  expect(output.mock.calls.flat().join('\n')).toContain(`/dashboard/providers/${provider}`)
  expect(output.mock.calls.flat().join('\n')).not.toContain('stale-private-key')
  expect(password).not.toHaveBeenCalled()
  expect(showKey).not.toHaveBeenCalled()
  await session.close()
  expect(start).not.toHaveBeenCalled()
})

it('keeps secrets hidden until an explicit reveal and exposes all custom gateway actions', async () => {
  const { session, env, showKey, password, keys, login, output, use } = setup(['4', '4', '5', '6', '7', '1', 'b', '3', 'gemini', '1'])
  const selected = await session.open([], env)
  expect(keys).toHaveBeenCalledOnce()
  expect(showKey).toHaveBeenCalledOnce()
  expect(password).toHaveBeenCalledOnce()
  expect(login).toHaveBeenCalledWith(undefined)
  expect(use).toHaveBeenCalledWith('gc/gemini-test', env.ANGELA_CONFIG)
  expect(selected?.args).toContain('gc/gemini-test')
  const text = output.mock.calls.flat().join('\n')
  expect(text).toContain('private-shared-key')
  expect(text).toContain('private-dashboard-password')
  expect(text).toContain('http://127.0.0.1:20129/dashboard')
  expect(text).toContain(cliMessages.en.startup.accounts)
})

it('tests, disables and enables accounts without printing credentials', async () => {
  const { session, env, accounts, output } = setup(['4', '2', '1', '1', '2', '1', '2', '2', '1', '2', '8', '6'])
  accounts.mockResolvedValueOnce([{ id: 'account-1', provider: 'codex', isActive: true }])
    .mockResolvedValueOnce([{ id: 'account-1', provider: 'codex', isActive: true }])
    .mockResolvedValueOnce([{ id: 'account-1', provider: 'codex', isActive: false }])
  const test = vi.spyOn(Gateway.prototype, 'testAccount').mockResolvedValue({ valid: true, refreshed: true })
  const enable = vi.spyOn(Gateway.prototype, 'setAccountEnabled').mockResolvedValue()
  expect(await session.open([], env)).toBeUndefined()
  expect(test).toHaveBeenCalledWith('account-1')
  expect(enable).toHaveBeenNthCalledWith(1, 'account-1', false)
  expect(enable).toHaveBeenNthCalledWith(2, 'account-1', true)
  expect(output.mock.calls.flat().join('\n')).toContain('"valid":true')
})

it('owns one automatically started host across chat selection and releases it only on close', async () => {
  const { session, env, start, status, output } = setup(['1', 'p', '', '', '1'])
  status.mockResolvedValue({ configured: false, running: false })
  let stopped = false
  start.mockImplementation(async (signal, ready) => {
    ready()
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => {
        stopped = true
        resolve()
      }, { once: true })
    })
  })
  expect(await session.open([], env)).toBeDefined()
  expect(start).toHaveBeenCalledOnce()
  expect(stopped).toBe(false)
  expect(output.mock.calls.flat().join('\n')).toContain('private-dashboard-password')
  await session.close()
  expect(stopped).toBe(true)
})

it('starts a saved local gateway when continuing, without changing provider configuration', async () => {
  const { session, env, start, status, use } = setup(['5'])
  const file = new LocalConfigFile(env.ANGELA_CONFIG)
  const saved = await file.update({ providers: { 'angela-gateway': { definitionId: 'openai-compatible', status: 'configured', config: { baseUrl: 'http://127.0.0.1:20129/v1/', apiKey: 'private-saved-key' } } }, chat: { provider: 'angela-gateway', model: 'cx/gpt-test' } })
  status.mockResolvedValue({ configured: true, running: false, endpoint: 'http://127.0.0.1:20129/v1', engine: 'Angela Gateway' })
  start.mockImplementation(async (signal, ready) => {
    ready()
    await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
  })
  expect(await session.open([], env)).toEqual({ args: [], env })
  expect(start).toHaveBeenCalledOnce()
  expect(use).not.toHaveBeenCalled()
  expect(await file.read()).toEqual(saved)
})

it('handles invalid choices, empty models, pagination, errors and back navigation', async () => {
  const { session, env, accounts, models, use, output } = setup(['invalid', '0', '4', '2', '3', '3', '', '16', '1'])
  accounts.mockResolvedValueOnce([]).mockResolvedValueOnce([])
  models.mockResolvedValue(Array.from({ length: 16 }, (_, index) => ({ id: `cx/model-${index}` })))
  await session.open([], env)
  expect(output.mock.calls.flat().join('\n')).toContain(cliMessages.en.startup.invalid)
  expect(output.mock.calls.flat().join('\n')).toContain(cliMessages.en.startup.empty)
  expect(use).toHaveBeenCalledWith('cx/model-15', env.ANGELA_CONFIG)
})

it('reports safe startup failures and never prints unknown provider error bodies', async () => {
  const { session, env, status, start, output } = setup(['1', '4', '6'])
  status.mockResolvedValue({ configured: false, running: false })
  start.mockRejectedValue(new Error(cliMessages.en.gateway.buildMissing))
  expect(await session.open([], env)).toBeUndefined()
  expect(output.mock.calls.flat().join('\n')).toContain(cliMessages.en.gateway.buildMissing)
  expect(start).toHaveBeenCalledOnce()
  const next = setup(['1', '6'])
  next.start.mockRejectedValue(new Error('provider private access token'))
  await next.session.open([], next.env)
  expect(next.output.mock.calls.flat().join('\n')).not.toContain('provider private access token')
})

async function prepareGateway() {
  const probe = createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  if (!address || typeof address === 'string')
    throw new Error('Expected a TCP address')
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
  const password = randomBytes(32).toString('hex')
  await writeFile(join(directory, 'gateway.json'), JSON.stringify({ version: 1, port: address.port, password, jwtSecret: randomBytes(32).toString('hex') }), { mode: 0o600 })
  return { port: address.port, password }
}

it('starts and stops the bundled engine through the custom menu without exposing its key or password', async () => {
  const { port, password } = await prepareGateway()
  const answers = ['4', '4', '8', '6']
  vi.spyOn(Terminal.prototype, 'ask').mockImplementation(async () => answers.shift())
  const output = vi.spyOn(Terminal.prototype, 'notify').mockResolvedValue()
  const session = new Startup()
  sessions.push(session)
  const env = { ...process.env, ANGELA_CONFIG: join(directory, 'config.json'), ANGELA_GATEWAY_DATA_DIR: directory, ANGELA_LOCALE: 'en' }
  expect(await session.open([], env)).toBeUndefined()
  const gateway = new Gateway(directory, env, cliMessages.en.gateway)
  expect(await gateway.status()).toMatchObject({ running: true })
  const key = await gateway.showKey()
  const text = output.mock.calls.flat().join('\n')
  expect(text).toContain(`http://127.0.0.1:${port}/v1/`)
  expect(text).not.toContain(key)
  expect(text).not.toContain(password)
  await session.close()
  expect(await gateway.status()).toMatchObject({ running: false })
  expect(await readdir(directory)).not.toContain('host.lock')
}, 90_000)

it.skipIf(process.platform === 'win32').each(['exit', 'interrupt'])('shows the real menu in a PTY and handles %s without leaving a gateway host', async (action) => {
  if (action === 'interrupt')
    await prepareGateway()
  const script = `
import os, pty, select, signal, subprocess, sys, time
master, slave = pty.openpty()
child = subprocess.Popen(sys.argv[2:], stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)
output = bytearray()
def until(marker):
    deadline = time.monotonic() + 15
    while marker not in output:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([master], [], [], remaining)[0]:
            raise RuntimeError(bytes(output).decode(errors='replace'))
        output.extend(os.read(master, 65536))
try:
    until(b'Choose a number:')
    if sys.argv[1] == 'exit':
        os.write(master, b'6\\n')
    else:
        os.write(master, b'4\\n')
        until(b'Full dashboard:')
        child.send_signal(signal.SIGINT)
    child.wait(timeout=10)
    print(bytes(output).decode(errors='replace'))
    sys.exit(child.returncode)
finally:
    if child.poll() is None:
        child.kill()
        child.wait()
    os.close(master)
`
  const { stdout } = await promisify(execFile)('python3', ['-c', script, action, process.execPath, '--import', fileURLToPath(import.meta.resolve('tsx')), fileURLToPath(new URL('./bin/run.ts', import.meta.url)), '--locale', 'en'], {
    env: { ...process.env, ANGELA_CONFIG: join(directory, 'config.json'), ANGELA_GATEWAY_DATA_DIR: directory },
    timeout: 30_000,
  })
  expect(stdout).toContain('GPT')
  expect(stdout).toContain('Gemini')
  expect(stdout).toContain('Claude')
  expect(stdout).toContain('Custom · Angela Gateway')
  if (action === 'exit') {
    expect(await readdir(directory)).toEqual([])
  }
  else {
    expect(await new Gateway(directory, process.env, cliMessages.en.gateway).status()).toMatchObject({ running: false })
    expect(await readdir(directory)).not.toContain('host.lock')
  }
}, 35_000)
