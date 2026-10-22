import type { Server } from 'node:http'

import process from 'node:process'

import { execFile, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { cliMessages } from '@angela/i18n/cli'
import { LocalConfigFile } from '@angela/local-config/node'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import * as v from 'valibot'

import { Gateway } from './gateway'
import { runGateway } from './gateway-command'

const messages = cliMessages.en.gateway
let directory: string
const servers: Server[] = []
const hosts: { controller: AbortController, running: Promise<void> }[] = []

async function listen(server: Server) {
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Expected a TCP address')
  return address.port
}

async function freePort() {
  const server = createServer()
  const port = await listen(server)
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-gateway-'))
})

afterEach(async () => {
  for (const host of hosts.splice(0)) {
    host.controller.abort()
    await host.running.catch(() => {})
  }
  for (const server of servers.splice(0)) {
    if (server.listening)
      await new Promise<void>(resolve => server.close(() => resolve()))
  }
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('inspects an absent gateway without creating configuration or printing secrets', async () => {
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await runGateway(['status', '--data-dir', directory, '--locale', 'en'], {})
  expect(output).toHaveBeenCalledWith(`${JSON.stringify({ configured: false, running: false }, null, 2)}\n`)
  expect(await readdir(directory)).toEqual([])
  await expect(runGateway(['password', '--data-dir', directory, '--locale', 'en'], {})).rejects.toThrow(messages.show)
  await expect(runGateway(['key', '--data-dir', directory, '--locale', 'en'], {})).rejects.toThrow(messages.show)
})

it('rejects invalid commands and ports without starting a host', async () => {
  for (const args of [['stop'], ['use'], ['add'], ['enable'], ['accounts', 'unexpected'], ['status', '--port', '0'], ['status', '--port', '65536']])
    await expect(runGateway([...args, '--data-dir', directory], {})).rejects.toThrow()
  expect(await readdir(directory)).toEqual([])
})

it('refuses an occupied port without stopping or changing its existing service', async () => {
  const server = createServer((_request, response) => response.end('unrelated service'))
  const port = await listen(server)
  const gateway = new Gateway(directory, process.env, messages, port)
  await expect(gateway.start(new AbortController().signal, () => {})).rejects.toThrow(messages.portBusy)
  expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe('unrelated service')
  expect(await readdir(directory)).not.toContain('host.lock')
})

it('keeps malformed private configuration out of error messages', async () => {
  await writeFile(join(directory, 'gateway.json'), '{private-secret-not-json', { mode: 0o600 })
  const gateway = new Gateway(directory, {}, messages)
  await expect(gateway.password()).rejects.toThrow(messages.invalid)
  await expect(gateway.status()).rejects.toThrow(messages.invalid)
})

it('starts the packed gateway outside the checkout without package-manager links or external modules', async () => {
  const execute = promisify(execFile)
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  await execute(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['-F', '@angela/gateway', 'pack', '--pack-destination', directory], {
    cwd: root,
    env: { ...process.env, pnpm_config_verify_deps_before_run: 'false' },
    maxBuffer: 10 * 1024 * 1024,
  })
  const archive = (await readdir(directory)).find(file => file.endsWith('.tgz'))
  expect(archive).toBeDefined()
  if (!archive)
    throw new Error('Gateway archive is absent')
  await execute('tar', ['-xzf', join(directory, archive), '-C', directory])
  expect(await readFile(join(directory, 'package', 'UPSTREAM.md'), 'utf8')).toContain('decolua')
  const port = await freePort()
  const child = spawn(process.execPath, [join(directory, 'package', 'dist', 'custom-server.js')], {
    cwd: directory,
    stdio: 'ignore',
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      JWT_SECRET: randomBytes(32).toString('hex'),
      INITIAL_PASSWORD: randomBytes(32).toString('hex'),
      DATA_DIR: join(directory, 'state'),
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  })
  const closed = new Promise<void>((resolve) => {
    child.once('close', () => resolve())
  })
  try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null)
        break
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok
      }
      catch {
        ready = false
      }
      if (ready)
        break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    expect(ready).toBe(true)
    expect(await (await fetch(`http://127.0.0.1:${port}/login`)).text()).toContain('Angela Gateway')
  }
  finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      const timeout = setTimeout(() => child.kill('SIGKILL'), 5000)
      await closed
      clearTimeout(timeout)
    }
  }
}, 60_000)

it('runs the actual bundled engine, isolates management auth, shares one key and cleans up its child', async () => {
  const port = await freePort()
  const gateway = new Gateway(directory, process.env, messages, port)
  const controller = new AbortController()
  const ready = Promise.withResolvers<void>()
  const running = gateway.start(controller.signal, ready.resolve)
  hosts.push({ controller, running })
  void running.catch(ready.reject)
  await ready.promise

  const endpoint = await gateway.endpoint()
  expect(await gateway.status()).toMatchObject({ configured: true, running: true, endpoint: `${endpoint}/v1` })
  expect(await gateway.accounts()).toEqual([])
  const key = await gateway.showKey()
  expect(await gateway.showKey()).toBe(key)
  expect(await gateway.keys()).toEqual([expect.objectContaining({ name: 'angela' })])
  expect(JSON.stringify(await gateway.keys())).not.toContain(key)
  expect(JSON.stringify(await gateway.status())).not.toContain(await gateway.password())
  expect((await fetch(`${endpoint}/api/providers`)).status).toBe(401)
  expect((await fetch(`${endpoint}/api/gateway/start`, { method: 'POST' })).status).toBe(401)
  expect((await fetch(`${endpoint}/api/providers`, { headers: { Authorization: `Bearer ${key}` } })).status).toBe(401)
  const loginPage = await fetch(`${endpoint}/login`)
  expect(loginPage.status).toBe(200)
  const loginHtml = await loginPage.text()
  expect(loginHtml).toContain('Angela Gateway')
  expect(loginHtml).not.toContain('9Router')
  expect(loginHtml).not.toContain('googletagmanager.com')
  expect(await (await fetch(`${endpoint}/api/version`)).json()).toMatchObject({ hasUpdate: false })
  expect((await fetch(`${endpoint}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'unknown', messages: [{ role: 'user', content: 'test' }] }) })).status).toBe(401)
  expect(await gateway.login('codex')).toBe(`${endpoint}/dashboard/providers/codex`)
  expect(await gateway.login('gemini-cli')).toBe(`${endpoint}/dashboard/providers/gemini-cli`)
  expect(await gateway.login()).toBe(`${endpoint}/dashboard/providers`)
  await expect(gateway.login('../keys')).rejects.toThrow(messages.usage)
  await expect(gateway.start(new AbortController().signal, () => {})).rejects.toThrow(messages.locked)
  if (process.platform !== 'win32') {
    expect((await stat(directory)).mode & 0o777).toBe(0o700)
    expect((await stat(join(directory, 'gateway.json'))).mode & 0o777).toBe(0o600)
  }

  // The fixture is an external HTTP provider. Routing, key validation and persistence run in the real engine.
  const received: { authorization?: string, model?: unknown, stream?: unknown }[] = []
  const upstream = createServer(async (request, response) => {
    if (request.url === '/v1/models') {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ data: [{ id: 'fixture-model' }] }))
      return
    }
    let body = ''
    for await (const chunk of request)
      body += String(chunk)
    const parsed = v.parse(v.object({ model: v.string(), stream: v.optional(v.boolean()) }), JSON.parse(body))
    received.push({ authorization: request.headers.authorization, model: parsed.model, stream: parsed.stream })
    if (parsed.stream) {
      response.setHeader('Content-Type', 'text/event-stream')
      response.end(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'gateway works' }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
      return
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ id: 'fixture', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'gateway works' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }))
  })
  const upstreamPort = await listen(upstream)
  const machine = (await readFile(join(directory, 'machine-id'), 'utf8')).trim()
  const secret = (await readFile(join(directory, 'auth', 'cli-secret'), 'utf8')).trim()
  const token = createHash('sha256').update(`${machine}9r-cli-auth${secret}`).digest('hex').slice(0, 16)
  const nodeResponse = await fetch(`${endpoint}/api/provider-nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-9r-cli-token': token },
    body: JSON.stringify({ name: 'Fixture', prefix: 'fixture', apiType: 'chat', baseUrl: `http://127.0.0.1:${upstreamPort}/v1` }),
  })
  expect(nodeResponse.status).toBe(201)
  const { node } = v.parse(v.object({ node: v.object({ id: v.string() }) }), await nodeResponse.json())
  const account = await gateway.addAccount(node.id, 'Fixture account', { apiKey: 'private-provider-key' })
  expect(account.provider).toBe(node.id)
  expect(JSON.stringify(account)).not.toContain('private-provider-key')
  await gateway.setAccountEnabled(account.id, false)
  expect(await gateway.accounts()).toEqual([expect.objectContaining({ id: account.id, isActive: false })])
  await gateway.setAccountEnabled(account.id, true)

  const configPath = join(directory, 'shared-config.json')
  const config = new LocalConfigFile(configPath)
  await config.update({ providers: { existing: { definitionId: 'openai-compatible', status: 'configured', config: { apiKey: 'other-secret' } } }, chat: { provider: 'existing', model: 'original' } })
  const models = await gateway.models()
  expect(models).toContainEqual({ id: 'fixture/fixture-model' })
  await gateway.use('fixture/fixture-model', configPath)
  expect((await config.read()).config).toMatchObject({
    providers: {
      'existing': { config: { apiKey: 'other-secret' } },
      'angela-gateway': { definitionId: 'openai-compatible', config: { apiKey: key, baseUrl: `${endpoint}/v1/` } },
    },
    chat: { provider: 'angela-gateway', model: 'fixture/fixture-model' },
  })
  await expect(gateway.use('not-a-model', configPath)).rejects.toThrow(messages.modelMissing)
  for (const stream of [false, true]) {
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'fixture/fixture-model', messages: [{ role: 'user', content: 'test' }], stream }),
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('gateway works')
  }
  expect(received).toHaveLength(2)
  expect(received.every(request => request.authorization === 'Bearer private-provider-key')).toBe(true)
  expect(received.every(request => request.model === 'fixture-model')).toBe(true)
  expect(received.every(request => request.authorization !== `Bearer ${key}`)).toBe(true)

  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await runGateway(['accounts', '--data-dir', directory, '--locale', 'en'], process.env)
  expect(output.mock.calls.map(([value]) => String(value)).join('')).not.toContain('private-provider-key')
  output.mockClear()
  await runGateway(['keys', '--data-dir', directory, '--locale', 'en'], process.env)
  expect(output.mock.calls.map(([value]) => String(value)).join('')).not.toContain(key)
  output.mockClear()
  await runGateway(['use', '--model', 'fixture/fixture-model', '--config', configPath, '--data-dir', directory, '--locale', 'en'], process.env)
  expect(output).toHaveBeenCalledWith(`${messages.saved}\n`)
  expect(output.mock.calls.map(([value]) => String(value)).join('')).not.toContain(key)

  controller.abort()
  await running
  expect(await gateway.status()).toMatchObject({ configured: true, running: false })
  expect(await readdir(directory)).not.toContain('host.lock')
  const restarted = Promise.withResolvers<void>()
  const secondController = new AbortController()
  const secondRun = gateway.start(secondController.signal, restarted.resolve)
  hosts.push({ controller: secondController, running: secondRun })
  void secondRun.catch(restarted.reject)
  await restarted.promise
  expect(await gateway.showKey()).toBe(key)
  expect(await gateway.accounts()).toContainEqual(expect.objectContaining({ id: account.id, isActive: true }))
  secondController.abort()
  await secondRun
}, 90_000)
